/* ==========================================================================
   ui.js — screen routing, menu, and the text size control
   --------------------------------------------------------------------------
   The app is a single HTML page with several <section class="screen"> blocks.
   This file's whole job is deciding which one is visible and wiring up the
   buttons in the top menu. It runs last, after the HTML and the quiz engine
   are already loaded.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     SCREENS
     Mapping a short name to the element's id keeps every other part of the
     app from having to know about "screen-" prefixes.
     ------------------------------------------------------------------------ */
  const SCREENS = {
    landing: "screen-landing",
    home: "screen-home",
    auth: "screen-auth",
    quiz: "screen-quiz",
    results: "screen-results",
    files: "screen-files",
    account: "screen-account",
  };

  /**
   * Show one screen and hide the rest.
   *
   * Attached to `window` at the bottom of this file so quiz.js can call it
   * when a quiz finishes. That's the only cross-file connection between them:
   * the engine says "show results", and this file works out how.
   */
  function showScreen(name) {
    const targetId = SCREENS[name];
    if (!targetId) {
      console.error("showScreen: unknown screen", name);
      return;
    }

    // Hide everything, then reveal the one we want. Simpler and less
    // error-prone than tracking which screen was previously visible.
    Object.values(SCREENS).forEach(function (id) {
      const section = document.getElementById(id);
      if (section) section.hidden = id !== targetId;
    });

    // The landing is dark whatever the system theme is, so the header has to
    // follow it there — otherwise a white bar sits above a black page.
    document.body.classList.toggle("on-landing", name === "landing");

    // The landing background animates, so stop it whenever we leave the
    // landing. sync() reads the screen's visibility and starts or pauses to
    // match, so it doesn't need telling which way to go.
    if (window.Constellation) window.Constellation.sync();

    // Update the menu so the current screen is visibly highlighted.
    // aria-current is a real accessibility attribute (it tells a screen
    // reader "this is the page you're on"), and the CSS styles it directly —
    // so the visual state and the announced state can't fall out of sync.
    document.querySelectorAll(".menu__item").forEach(function (item) {
      if (item.dataset.screen === name) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

  }

  /* ------------------------------------------------------------------------
     TEXT SIZE
     Your menu request. It works by changing one CSS variable, --font-scale,
     which every font-size in style.css is multiplied by. So one number
     resizes the entire app — no per-element work.
     ------------------------------------------------------------------------ */
  const FONT_STEPS = [0.875, 1, 1.125, 1.25, 1.375, 1.5];
  const STORAGE_KEY = "smartstudy.fontScale";
  const DEFAULT_STEP = 1; // index into FONT_STEPS, so 1 = normal size

  // Work out which step we're starting on. The <head> already applied the
  // saved value to avoid a flash of wrong-size text; here we just need to
  // know WHICH step it was so the buttons step from the right place.
  let currentStep = (function () {
    const saved = parseFloat(localStorage.getItem(STORAGE_KEY));
    const index = FONT_STEPS.indexOf(saved);
    // indexOf returns -1 when not found (nothing saved, or a stale value
    // from an older version of the app) — fall back to normal.
    return index === -1 ? DEFAULT_STEP : index;
  })();

  const smallerButton = document.getElementById("text-smaller");
  const largerButton = document.getElementById("text-larger");

  function applyFontScale() {
    const scale = FONT_STEPS[currentStep];
    document.documentElement.style.setProperty("--font-scale", String(scale));

    // Remember the choice. localStorage persists across reloads and browser
    // restarts, unlike a plain variable which resets every visit.
    try {
      localStorage.setItem(STORAGE_KEY, String(scale));
    } catch (e) {
      // Private browsing mode can block localStorage. Not being able to save
      // the preference shouldn't break the app, so we note it and move on.
      console.warn("Could not save text size preference:", e);
    }

    // Grey out whichever button can't do anything, so the limit is visible
    // rather than a button that silently stops responding.
    smallerButton.disabled = currentStep === 0;
    largerButton.disabled = currentStep === FONT_STEPS.length - 1;
  }

  smallerButton.addEventListener("click", function () {
    if (currentStep > 0) {
      currentStep--;
      applyFontScale();
    }
  });

  largerButton.addEventListener("click", function () {
    if (currentStep < FONT_STEPS.length - 1) {
      currentStep++;
      applyFontScale();
    }
  });

  // Run once at startup, mainly to set the disabled states correctly.
  applyFontScale();

  /* ------------------------------------------------------------------------
     MENU NAVIGATION
     One listener for all menu buttons, driven by the data-screen attribute in
     the HTML. Adding a new screen needs no change to this file.
     ------------------------------------------------------------------------ */
  document.querySelectorAll(".menu__item").forEach(function (item) {
    item.addEventListener("click", function () {
      showScreen(item.dataset.screen);
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (item.dataset.screen === "files") loadFiles();
    });
  });

  /* ------------------------------------------------------------------------
     STUDY CHAT
     Paste notes or an existing quiz and this turns them into questions. A
     short follow-up ("make them harder") revises the last set instead of
     starting over; a long paste is treated as new material. The reply always
     says which of the two it did, so a wrong guess is visible rather than
     quietly confusing.
     ------------------------------------------------------------------------ */
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const chatMessages = document.getElementById("chat-messages");
  const chatSend = document.querySelector(".chat-send");
  const chatContext = document.getElementById("chat-context");
  const chatContextLabel = document.getElementById("chat-context-label");
  const chatNewButton = document.getElementById("chat-new");

  /* Keep the chip in sync with whether a quiz is loaded. When one is, a short
     follow-up revises it — and this is what tells the user that. */
  let forceNewNext = false;

  function renderChatContext() {
    if (Generate.hasQuiz() && !forceNewNext) {
      chatContextLabel.textContent =
        "Follow-ups will revise your " + (Generate.subject() || "quiz") + " questions";
      chatContext.hidden = false;
    } else {
      chatContext.hidden = true;
    }
  }

  chatNewButton.addEventListener("click", function () {
    // Explicit beats inferred: the next message starts a fresh quiz whatever
    // its length, and the count picker applies again.
    forceNewNext = true;
    Generate.reset();
    renderChatContext();
    chatInput.focus();
  });

  /* Add a message bubble. Text is set with textContent, never innerHTML, so
     pasted material containing < or & can't break the page or inject markup. */
  function addMessage(role, text) {
    const article = document.createElement("article");
    article.className = "chat-message chat-message--" + role;
    if (role === "assistant") {
      const avatar = document.createElement("span");
      avatar.className = "chat-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = "\u2726";
      article.appendChild(avatar);
    }
    const body = document.createElement("div");
    body.className = "chat-message__body";
    const p = document.createElement("p");
    p.textContent = text;
    body.appendChild(p);
    article.appendChild(body);
    chatMessages.appendChild(article);
    article.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return body;
  }

  let busy = false;

  function setBusy(state) {
    busy = state;
    chatSend.disabled = state;
    chatInput.disabled = state;
  }

  /* Offer buttons inside an assistant bubble. Each is a plain label plus the
     function to run — no strings spliced into onclick handlers, which is what
     breaks the moment a question contains a quote. */
  function addChoices(container, choices) {
    const row = document.createElement("div");
    row.className = "chat-choices";
    choices.forEach(function (choice, i) {
      const button = document.createElement("button");
      button.type = "button";
      // Usually the first option is the recommended one, but a choice can say
      // so itself — the count row highlights whatever was picked last.
      const isPrimary = choice.primary === undefined ? i === 0 : choice.primary;
      button.className = "btn " + (isPrimary ? "btn--primary" : "btn--secondary") + " chat-choice";
      button.textContent = choice.label;
      button.addEventListener("click", function () {
        // Once a path is chosen the others are meaningless — replace the row
        // with what was picked, so the transcript reads back sensibly.
        row.remove();
        const echo = document.createElement("p");
        echo.className = "chat-note";
        echo.textContent = "\u2192 " + choice.label;
        container.appendChild(echo);
        choice.run();
      });
      row.appendChild(button);
    });
    container.appendChild(row);
  }

  function launchQuiz(quiz, feedbackMode) {
    if (QuizEngine.start(quiz, feedbackMode)) {
      showScreen("quiz");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  /* Offer the quiz, and ask how feedback should work before starting. The two
     modes suit different situations — learning material you don't know yet
     versus testing whether you actually know it — so this is a real choice
     rather than a setting to bury. */
  function addStartButton(container, quiz) {
    const row = document.createElement("div");
    row.className = "chat-choices";

    const button = document.createElement("button");
    button.className = "btn btn--primary chat-start";
    button.type = "button";
    button.textContent = "Start quiz \u00b7 " + quiz.questions.length + " questions";
    button.addEventListener("click", function () {
      row.remove();
      const ask = document.createElement("p");
      ask.className = "chat-note";
      ask.textContent = "When should I show you the answers?";
      container.appendChild(ask);
      addChoices(container, [
        {
          label: "As I answer",
          // quiz.id (set below, if Save was clicked first) rides along here \u2014
          // QuizEngine keeps whatever's on the object it's handed, so it
          // reaches showResults without either file needing to know why.
          run: function () { launchQuiz(quiz, "instant"); },
        },
        {
          label: "After I submit",
          run: function () { launchQuiz(quiz, "after"); },
        },
      ]);
    });
    row.appendChild(button);
    row.appendChild(makeSaveButton(quiz));
    container.appendChild(row);
  }

  /**
   * A quiz is saved only when this is clicked \u2014 never automatically. The
   * refine loop ("make it harder", "no true/false") can produce several
   * drafts of one quiz in a single conversation; auto-saving every draft
   * would fill My Files with near-duplicates. Only the version someone
   * actually keeps gets a row in the database.
   */
  function makeSaveButton(quiz) {
    if (!Auth.getUser()) {
      // Guests can play a quiz but have nowhere to save it to. Saying so
      // beats a button that fails the moment it's pressed.
      const note = document.createElement("p");
      note.className = "chat-note";
      note.textContent = "Sign in to save this quiz for later.";
      return note;
    }

    const button = document.createElement("button");
    button.className = "btn btn--secondary chat-save";
    button.type = "button";
    button.textContent = "Save quiz";
    button.addEventListener("click", async function () {
      button.disabled = true;
      button.textContent = "Saving\u2026";
      try {
        const sourceKind = Generate.mode(); // 'extract' | 'mirror' | 'generate'
        const saved = await Store.saveQuiz(quiz, sourceKind);
        // Mutating the SAME quiz object addStartButton's Start button closes
        // over \u2014 from here on, starting this quiz carries the saved id with
        // it, which is what lets the eventual score be recorded.
        quiz.id = saved.id;
        button.textContent = "Saved \u2713";
      } catch (error) {
        button.disabled = false;
        button.textContent = "Save quiz";
        const note = document.createElement("p");
        note.className = "chat-error";
        note.textContent = error.message;
        button.insertAdjacentElement("afterend", note);
      }
    });
    return button;
  }

  /* Present a finished quiz: what happened, a start button, and a reminder
     that it can be revised. */
  function presentQuiz(container, result) {
    container.innerHTML = "";
    const summary = document.createElement("p");
    const n = result.quiz.questions.length;
    const what =
      result.mode === "extract"
        ? "Your professor's questions, ready to answer"
        : result.mode === "mirror"
        ? "New questions in the same style"
        : result.mode === "refine"
        ? "Revised"
        : "Questions from your notes";
    summary.textContent = what + " \u2014 " + n + " on " + result.quiz.subject + ".";
    container.appendChild(summary);

    if (result.dropped > 0) {
      const note = document.createElement("p");
      note.className = "chat-note";
      note.textContent =
        result.dropped + (result.dropped === 1 ? " question was" : " questions were") +
        " left out because the answer couldn't be worked out.";
      container.appendChild(note);
    }

    addStartButton(container, result.quiz);

    const hint = document.createElement("p");
    hint.className = "chat-note";
    hint.textContent = "Want it different? Say so \u2014 \u201cmake them harder\u201d, \u201cno true/false\u201d.";
    container.appendChild(hint);
    renderChatContext();
  }

  /* Run an async job with a placeholder bubble, replacing it on success and
     showing the reason on failure. */
  async function withThinking(text, job) {
    setBusy(true);
    const bubble = addMessage("assistant", text);
    try {
      await job(bubble);
    } catch (error) {
      bubble.innerHTML = "";
      const p = document.createElement("p");
      p.className = "chat-error";
      p.textContent = error.message;
      bubble.appendChild(p);
    } finally {
      setBusy(false);
      chatInput.focus();
    }
  }

  /* The last count the user picked. Used when they follow up with "make them
     harder" — a revision should keep the length they already chose rather
     than silently snapping back to a default. */
  let lastCount = 10;

  const COUNT_CHOICES = [5, 10, 15, 20, 30];

  /**
   * Ask how many questions, then run `then(count)`.
   *
   * This used to be a dropdown sitting in the composer, which asked before
   * there was anything to count — you had to answer it on the way in, without
   * knowing yet whether you'd even be generating questions. Asking here means
   * it only ever comes up once a quiz is genuinely being written.
   */
  function askCount(then) {
    const bubble = addMessage("assistant", "How many questions?");
    addChoices(bubble, COUNT_CHOICES.map(function (n) {
      return {
        label: String(n),
        primary: n === lastCount,
        run: function () {
          lastCount = n;
          then(n);
        },
      };
    }));
  }

  chatForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy) return;

    const message = chatInput.value.trim();
    if (!message) return;

    addMessage("user", message);
    chatInput.value = "";
    chatInput.style.height = "auto";

    const intent = forceNewNext ? (Generate.looksLikeQuiz(message) ? "choose" : "plan")
                                : Generate.classify(message);
    forceNewNext = false;

    // ---- A pasted quiz: ask which of the two very different things they want
    if (intent === "choose") {
      const approx = Generate.countQuestions(message);
      const bubble = addMessage(
        "assistant",
        "That looks like a quiz" +
          (approx ? " with about " + approx + " questions" : "") +
          ". What would you like?"
      );
      addChoices(bubble, [
        {
          label: "Use these exact questions",
          run: function () {
            withThinking("Setting up your professor's questions\u2026", async function (b) {
              presentQuiz(b, await Generate.buildQuiz(message, "extract"));
            });
          },
        },
        {
          label: "New questions in this style",
          run: function () {
            askCount(function (count) {
              withThinking("Writing new questions in that style\u2026", async function (b) {
                presentQuiz(b, await Generate.buildQuiz(message, "mirror", count));
              });
            });
          },
        },
        {
          label: "Help me plan first",
          run: function () {
            withThinking("Thinking\u2026", async function (b) {
              b.innerHTML = "";
              const p = document.createElement("p");
              p.textContent = await Generate.chat(
                "I pasted a quiz from my class. Help me decide how to study it. Here it is:\n\n" +
                  message.slice(0, 2000)
              );
              b.appendChild(p);
            });
          },
        },
      ]);
      return;
    }

    // ---- Pasted study material: planning is the default, as you asked
    if (intent === "plan") {
      const bubble = addMessage(
        "assistant",
        "That looks like study material. What kind of quiz would you like?"
      );
      const make = function (label, extra) {
        return {
          label: label,
          run: function () {
            askCount(function (count) {
              withThinking("Writing your questions\u2026", async function (b) {
                const material = extra ? message + "\n\nPreference: " + extra : message;
                presentQuiz(b, await Generate.buildQuiz(material, "generate", count));
              });
            });
          },
        };
      };
      addChoices(bubble, [
        make("Mixed", null),
        make("Multiple choice only", "Use multiple_choice for every question."),
        make("Make it hard", "Favour questions that require reasoning, not recall."),
        {
          label: "Talk it through",
          run: function () {
            withThinking("Thinking\u2026", async function (b) {
              b.innerHTML = "";
              const p = document.createElement("p");
              p.textContent = await Generate.chat(
                "Here are my study notes. What should I focus on, and what kind of quiz would suit them?\n\n" +
                  message.slice(0, 2000)
              );
              b.appendChild(p);
            });
          },
        },
      ]);
      return;
    }

    // ---- A note about the quiz already on screen
    if (intent === "refine") {
      withThinking("Revising your questions\u2026", async function (b) {
        presentQuiz(b, await Generate.refine(message, lastCount));
      });
      return;
    }

    // ---- Otherwise: talking
    withThinking("Thinking\u2026", async function (b) {
      b.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = await Generate.chat(message);
      b.appendChild(p);
    });
  });

  chatInput.addEventListener("input", function () {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
  });

  // Enter sends; Shift+Enter makes a new line, as in any chat app.
  chatInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });

  // Quiz → reshuffle and restart
  document.getElementById("shuffle-quiz").addEventListener("click", function () {
    if (QuizEngine.shuffle()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  /* Quiz → back to the chat. If the quiz is underway, this warns first: the
     engine keeps its state in memory, but the only route back in is the Start
     button in the chat, which begins the quiz again from scratch. Losing
     answers silently would be worse than an extra tap. */
  document.getElementById("quiz-back").addEventListener("click", function () {
    const quiz = QuizEngine.getQuiz();
    const started = quiz && !QuizEngine.isSubmitted() && QuizEngine.answeredCount() > 0;
    if (started) {
      const ok = window.confirm(
        "Leave this quiz? Your answers so far won't be kept."
      );
      if (!ok) return;
    }
    showScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
    const box = document.getElementById("chat-input");
    if (box) box.focus();
  });

  // Quiz → submit. Two buttons (sticky bar and end of list) do the same thing.
  ["submit-quiz", "submit-quiz-bottom"].forEach(function (id) {
    const button = document.getElementById(id);
    if (button) button.addEventListener("click", function () { QuizEngine.submit(); });
  });

  // Results → replay the same quiz
  document.getElementById("retry-quiz").addEventListener("click", function () {
    // getQuiz() returns whatever was last played, so "Try Again" will work
    // for AI-generated quizzes too without any change here.
    const lastQuiz = QuizEngine.getQuiz();
    if (lastQuiz && QuizEngine.start(lastQuiz, QuizEngine.getMode())) {
      showScreen("quiz");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // Results → home
  document.getElementById("results-home").addEventListener("click", function () {
    showScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ------------------------------------------------------------------------
     LOG IN / CREATE ACCOUNT
     One screen serving two modes. `authMode` decides which.
     ------------------------------------------------------------------------ */
  let authMode = "login"; // "login" or "signup"

  const authForm = document.getElementById("auth-form");
  const authEmail = document.getElementById("auth-email");
  const authPassword = document.getElementById("auth-password");
  const authPasswordConfirm = document.getElementById("auth-password-confirm");
  const authConfirmWrap = document.getElementById("auth-confirm-wrap");
  const authPhone = document.getElementById("auth-phone");
  const authPhoneWrap = document.getElementById("auth-phone-wrap");
  const authSubmit = document.getElementById("auth-submit");
  const authMessage = document.getElementById("auth-message");

  /** Show a message under the form. `kind` is "error", "success", or "info". */
  function setAuthMessage(text, kind) {
    if (!text) {
      authMessage.hidden = true;
      return;
    }
    authMessage.textContent = text; // textContent, so a server message can
                                    // never inject markup into our page
    authMessage.className = "auth-message auth-message--" + (kind || "error");
    authMessage.hidden = false;
  }

  /** Switch the auth screen between logging in and signing up. */
  function setAuthMode(mode) {
    const modeChanged = authMode !== mode;
    authMode = mode;
    const isSignup = mode === "signup";

    document.getElementById("auth-title").textContent = isSignup
      ? "Create Account"
      : "Log In";
    document.getElementById("auth-subtitle").textContent = isSignup
      ? "Free, and your study chats follow you everywhere."
      : "Welcome back.";
    authSubmit.textContent = isSignup ? "Create Account" : "Log In";
    document.getElementById("auth-switch-text").textContent = isSignup
      ? "Already have an account?"
      : "Don't have an account?";
    document.getElementById("auth-switch-btn").textContent = isSignup
      ? "Log in"
      : "Create one";

    // Tell the browser's password manager which job this is, so it offers to
    // suggest a strong new password rather than autofilling an old one.
    authPassword.setAttribute(
      "autocomplete",
      isSignup ? "new-password" : "current-password"
    );

    // "Forgot password" only makes sense when logging in.
    document.getElementById("auth-forgot").hidden = isSignup;

    // Confirming a password, and the optional phone number, only make sense
    // when creating an account — logging in has neither to offer.
    authConfirmWrap.hidden = !isSignup;
    authPasswordConfirm.required = isSignup;
    authPhoneWrap.hidden = !isSignup;

    // Only clear on an actual login<->signup switch. setAuthMode also runs
    // after a failed submit to reset the button — same mode, so whatever the
    // user typed (including a phone number they may have already filled in)
    // needs to survive that so they can just fix the one wrong field.
    if (modeChanged) {
      authPasswordConfirm.value = "";
      authPhone.value = "";
    }

    setAuthMessage(null);
  }

  /** Open the auth screen in a given mode. */
  function openAuth(mode) {
    setAuthMode(mode);

    // If the app hasn't been connected to its database yet, say so up front
    // rather than letting someone fill in a form that cannot possibly work.
    if (!Auth.isConfigured()) {
      setAuthMessage(
        "Accounts aren't switched on yet — this app still needs to be " +
          "connected to its database. Everything else works as a guest.",
        "info"
      );
    }

    showScreen("auth");
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Put the cursor in the email box so a keyboard user can start typing.
    authEmail.focus();
  }

  // Submitting the form — works for both Enter and the button.
  authForm.addEventListener("submit", async function (event) {
    // Stop the browser's default behavior of reloading the page on submit.
    event.preventDefault();

    // Lock the button so an impatient double-click can't fire two signups.
    authSubmit.disabled = true;
    authSubmit.textContent = authMode === "signup" ? "Creating…" : "Logging in…";
    setAuthMessage(null);

    const email = authEmail.value.trim();
    const password = authPassword.value;

    // Checked here, before any network call: a mismatch is something the
    // user can fix instantly, and there's no reason to make Supabase's own
    // signup rate limit absorb a retry for a typo we can already see.
    if (authMode === "signup" && password !== authPasswordConfirm.value) {
      authSubmit.disabled = false;
      setAuthMode(authMode);
      setAuthMessage("Those passwords don't match.", "error");
      return;
    }

    const result =
      authMode === "signup"
        ? await Auth.signUp(email, password, authPhone.value)
        : await Auth.signIn(email, password);

    // Restore the button whatever happened.
    authSubmit.disabled = false;
    setAuthMode(authMode);

    if (!result.ok) {
      setAuthMessage(result.message, "error");
      return;
    }

    if (result.needsConfirmation) {
      // Account created but not usable until they click the emailed link.
      setAuthMessage(result.message, "success");
      setAuthMode("login");
      return;
    }

    // Signed in. Auth.onChange redraws everything; we just move them along.
    authForm.reset();
    showScreen("home");
  });

  // Toggle between the two modes
  document.getElementById("auth-switch-btn").addEventListener("click", function () {
    setAuthMode(authMode === "login" ? "signup" : "login");
  });

  // Forgot password
  document.getElementById("auth-forgot").addEventListener("click", async function () {
    const result = await Auth.resetPassword(authEmail.value.trim());
    setAuthMessage(result.message, result.ok ? "success" : "error");
  });

  // "Skip — use as guest" from inside the auth screen
  /* Two ways to skip the account: from the landing, and from the auth screen
     itself once you're already there. Same behaviour either way. */
  ["auth-guest", "landing-guest"].forEach(function (id) {
    document.getElementById(id).addEventListener("click", function () {
      Auth.continueAsGuest();
      showScreen("home");
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Put the cursor in the box, so you can paste straight away.
      const box = document.getElementById("chat-input");
      if (box) box.focus();
    });
  });

  // The various "create an account" prompts scattered around the app
  ["files-create-account", "account-create", "landing-signup"].forEach(function (id) {
    document.getElementById(id).addEventListener("click", function () {
      openAuth("signup");
    });
  });

  document.getElementById("landing-signin-button").addEventListener("click", function () {
    openAuth("login");
  });

  document.getElementById("account-login").addEventListener("click", function () {
    openAuth("login");
  });

  document.getElementById("account-signout").addEventListener("click", async function () {
    await Auth.signOut();
    showScreen("home");
  });

  /* A contact detail only, never a login step — see auth.js's updatePhone
     for why it's kept out of Supabase's actual phone-auth column. */
  const accountPhoneForm = document.getElementById("account-phone-form");
  const accountPhoneInput = document.getElementById("account-phone");
  const accountPhoneMessage = document.getElementById("account-phone-message");

  accountPhoneForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const submitButton = accountPhoneForm.querySelector("button[type=submit]");
    submitButton.disabled = true;
    accountPhoneMessage.hidden = true;

    const result = await Auth.updatePhone(accountPhoneInput.value);

    submitButton.disabled = false;
    accountPhoneMessage.hidden = false;
    accountPhoneMessage.textContent = result.ok
      ? "Saved."
      : result.message;
    accountPhoneMessage.className =
      "auth-message auth-message--" + (result.ok ? "info" : "error");
  });

  /* ------------------------------------------------------------------------
     REDRAW ON SIGN-IN STATE CHANGE
     Called at startup and again every time the user logs in, logs out, or
     picks guest mode. Everything that depends on "who is this?" is updated
     here in one place, so no screen can be left showing stale state.
     ------------------------------------------------------------------------ */
  function renderAuthState() {
    const signedIn = Boolean(Auth.getUser());
    const guest = Auth.isGuest();

    /* The guest reminder banner used to sit under the menu here. It was taking
       two lines plus a button on a phone, directly above the content, to say
       something the user had just chosen on the previous screen. My Files
       still explains it in the one place where it actually bites. */

    // --- My Files ---
    document.getElementById("files-guest").hidden = !guest;
    // Whether it's actually empty, or has quizzes, is decided by loadFiles()
    // below — it needs a database round trip, which this function (called on
    // every sign-in/out) can't wait on. If My Files happens to already be
    // open when auth state changes, kick off a fresh load rather than
    // leaving stale content on screen.
    if (!document.getElementById("screen-files").hidden) loadFiles();

    // --- Account ---
    document.getElementById("account-signed-in").hidden = !signedIn;
    document.getElementById("account-guest").hidden = signedIn;
    document.getElementById("account-email").textContent = Auth.getEmail() || "";
    // Only overwrite the field from the account record if it isn't focused —
    // an in-progress edit shouldn't be clobbered by a redraw from some other
    // auth event firing in the background (a token refresh, another tab).
    if (signedIn && document.activeElement !== accountPhoneInput) {
      accountPhoneInput.value = Auth.getPhone();
    }
    document.getElementById("account-subtitle").textContent = signedIn
      ? "Manage how you're signed in."
      : "Sign in to keep your study chats on every device.";

    // --- Landing sign-in ---
    // The prompt under "Start studying" is only for people who aren't signed
    // in; leaving it up afterwards would offer something already done.
    const landingSignin = document.getElementById("landing-signin");
    if (landingSignin) landingSignin.hidden = signedIn;

    // --- Menu ---
    // Signing in now lives under the "Start studying" button, so the menu item
    // is only useful once there's an account to manage. Guests still have two
    // ways in: that landing prompt, and the guest banner's "Create a free
    // account" — so hiding it here doesn't strand anyone.
    const accountMenuItem = document.querySelector('.menu__item[data-screen="account"]');
    if (accountMenuItem) {
      accountMenuItem.textContent = "Account";
      accountMenuItem.hidden = !signedIn;
    }
  }

  /* ------------------------------------------------------------------------
     MY FILES
     Fetches on every visit rather than caching — the list can change from
     elsewhere (a quiz saved just now, one deleted from another tab), and a
     handful of rows is cheap enough to just ask for again.
     ------------------------------------------------------------------------ */
  const filesList = document.getElementById("files-list");
  const filesEmpty = document.getElementById("files-empty");

  async function loadFiles() {
    if (!Auth.getUser()) {
      // Guest, or nobody's chosen yet — files-guest (or nothing) is already
      // showing the right message; there's no account to query.
      filesEmpty.hidden = true;
      filesList.hidden = true;
      return;
    }

    filesList.innerHTML = "";

    let quizzes;
    try {
      quizzes = await Store.listQuizzes();
    } catch (error) {
      filesEmpty.hidden = true;
      filesList.hidden = false;
      const li = document.createElement("li");
      li.className = "chat-error";
      li.textContent = error.message;
      filesList.appendChild(li);
      return;
    }

    if (!quizzes.length) {
      filesEmpty.hidden = false;
      filesList.hidden = true;
      return;
    }
    filesEmpty.hidden = true;

    // A second query rather than a join: keeps store.js's two tables
    // independent, and a failed score lookup (network hiccup) shouldn't
    // block the quiz list itself from showing.
    const scores = await Store.latestScores(quizzes.map(function (q) { return q.id; }));
    quizzes.forEach(function (quiz) {
      filesList.appendChild(renderFileCard(quiz, scores[quiz.id]));
    });
    filesList.hidden = false;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function renderFileCard(quiz, latestAttempt) {
    const li = document.createElement("li");
    li.className = "file-card";

    const info = document.createElement("div");
    info.className = "file-card__info";

    const title = document.createElement("h3");
    title.textContent = quiz.title;
    info.appendChild(title);

    const parts = [];
    if (quiz.subject) parts.push(quiz.subject);
    parts.push(quiz.question_count + (quiz.question_count === 1 ? " question" : " questions"));
    if (latestAttempt) {
      parts.push(latestAttempt.score + "/" + latestAttempt.total + " · " + formatDate(latestAttempt.created_at));
    }
    const meta = document.createElement("p");
    meta.className = "text-muted";
    meta.textContent = parts.join(" · ");
    info.appendChild(meta);

    li.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "file-card__actions";

    const play = document.createElement("button");
    play.className = "btn btn--secondary btn--small";
    play.type = "button";
    play.textContent = "Play";
    play.addEventListener("click", function () {
      // A fresh object each click — quiz.js is free to mutate what it's
      // handed (shuffle does), and that shouldn't touch this card's own copy.
      // Replaying always starts in instant-feedback mode rather than asking
      // again; the chooser lives in the chat flow, and a file card isn't one.
      launchQuiz(
        { id: quiz.id, title: quiz.title, subject: quiz.subject, questions: quiz.questions },
        "instant"
      );
    });
    actions.appendChild(play);

    const del = document.createElement("button");
    del.className = "btn btn--secondary btn--small btn--danger";
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", async function () {
      if (!window.confirm('Delete "' + quiz.title + '"? This can\'t be undone.')) return;
      del.disabled = true;
      try {
        await Store.deleteQuiz(quiz.id);
        li.remove();
        if (!filesList.children.length) {
          filesEmpty.hidden = false;
          filesList.hidden = true;
        }
      } catch (error) {
        del.disabled = false;
        window.alert(error.message);
      }
    });
    actions.appendChild(del);

    li.appendChild(actions);
    return li;
  }

  /* ------------------------------------------------------------------------
     STARTUP
     ------------------------------------------------------------------------ */
  // Expose the router so quiz.js can switch to the results screen.
  /* ------------------------------------------------------------------------
     RESULTS
     Called by quiz.js when a quiz is submitted. Kept here rather than in the
     engine so the engine only knows about questions and answers, and this file
     stays the only place that decides what's on screen.
     ------------------------------------------------------------------------ */
  window.showResults = function (outcome) {
    const score = outcome.score;
    const total = outcome.total;
    const percent = Math.round((score / total) * 100);

    // outcome.quiz.id only exists if "Save quiz" was clicked before starting
    // — see makeSaveButton, which sets it on this same quiz object. Nothing
    // to record for a quiz that was never saved; the results still show.
    if (outcome.quiz.id) {
      Store.recordAttempt(outcome.quiz.id, score, total, outcome.answers).catch(
        function (error) {
          console.warn("Could not record attempt:", error);
        }
      );
    }

    document.getElementById("final-score").textContent = score + "/" + total;

    const headline =
      percent === 100 ? "Every one right" :
      percent >= 80  ? "Strong" :
      percent >= 60  ? "Getting there" :
      percent >= 40  ? "Worth another pass" :
                       "Time to review";
    document.getElementById("results-headline").textContent = headline;

    const missed = total - score;
    document.getElementById("results-detail").textContent =
      missed === 0
        ? "You answered everything correctly."
        : missed + (missed === 1 ? " question to look at again." : " questions to look at again.") +
          " They're listed below with explanations.";

    /* Only the ones they got wrong. A full transcript makes people scroll past
       what they already know to find what they don't. */
    const review = document.getElementById("review");
    review.innerHTML = "";
    outcome.quiz.questions.forEach(function (question, i) {
      const chosen = outcome.answers[i];
      if (chosen === question.correctIndex) return;

      const item = document.createElement("div");
      item.className = "review__item";

      const q = document.createElement("p");
      q.className = "review__question";
      q.textContent = i + 1 + ". " + question.question;
      item.appendChild(q);

      const yours = document.createElement("p");
      yours.className = "review__yours";
      yours.textContent =
        chosen === null || chosen === undefined
          ? "You skipped this."
          : "You chose: " + question.options[chosen];
      item.appendChild(yours);

      const right = document.createElement("p");
      right.className = "review__correct";
      right.textContent = "Answer: " + question.options[question.correctIndex];
      item.appendChild(right);

      if (question.explanation) {
        const why = document.createElement("p");
        why.className = "review__why";
        why.textContent = question.explanation;
        item.appendChild(why);
      }
      review.appendChild(item);
    });

    showScreen("results");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.showScreen = showScreen;

  // Redraw whenever the sign-in state changes.
  Auth.onChange(renderAuthState);

  // Land on home, then connect to the account system. init() is async because
  // restoring a session means asking the server — doing it after the first
  // paint means the app appears instantly instead of waiting on the network.
  showScreen("landing");
  renderAuthState();
  Auth.init();
})();
