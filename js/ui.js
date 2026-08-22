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
    });
  });

  // Landing → the chat
  document.getElementById("landing-start").addEventListener("click", function () {
    showScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
    // Put the cursor in the box, so you can paste straight away.
    const box = document.getElementById("chat-input");
    if (box) box.focus();
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
  const countSelect = document.getElementById("chat-count");
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

  /* Turn the last assistant bubble into one that offers to start the quiz. */
  function addStartButton(container, questionCount) {
    const button = document.createElement("button");
    button.className = "btn btn--primary chat-start";
    button.type = "button";
    button.textContent = "Start quiz \u00b7 " + questionCount + " questions";
    button.addEventListener("click", function () {
      const quiz = Generate.currentQuiz();
      if (quiz && QuizEngine.start(quiz)) {
        showScreen("quiz");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    container.appendChild(button);
  }

  let busy = false;

  function setBusy(state) {
    busy = state;
    chatSend.disabled = state;
    chatInput.disabled = state;
  }

  chatForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy) return;

    const message = chatInput.value.trim();
    if (!message) return;

    addMessage("user", message);
    chatInput.value = "";
    chatInput.style.height = "auto";

    setBusy(true);
    const thinking = addMessage(
      "assistant",
      !forceNewNext && Generate.classify(message) === "refine"
        ? "Revising your questions\u2026"
        : "Reading that and writing questions\u2026"
    );

    try {
      const count = countSelect ? Number(countSelect.value) : 10;
      const result = await Generate.send(message, count, forceNewNext ? "new" : null);
      forceNewNext = false;

      // Replace the placeholder text with the real outcome.
      thinking.innerHTML = "";
      const summary = document.createElement("p");
      const n = result.quiz.questions.length;
      if (result.mode === "refine") {
        summary.textContent = "Revised \u2014 " + n + " questions on " + result.quiz.subject + ".";
      } else {
        const kind =
          result.detectedInputType === "existing_questions"
            ? "Read that as an existing quiz, so these are new questions in the same style"
            : "Read that as study notes";
        summary.textContent = kind + " \u2014 " + n + " questions on " + result.quiz.subject + ".";
      }
      thinking.appendChild(summary);

      // Be honest when the server discarded malformed questions.
      if (result.dropped > 0) {
        const note = document.createElement("p");
        note.className = "chat-note";
        note.textContent =
          result.dropped +
          (result.dropped === 1 ? " question came" : " questions came") +
          " back malformed and was left out.";
        thinking.appendChild(note);
      }

      addStartButton(thinking, n);
      renderChatContext();

      const hint = document.createElement("p");
      hint.className = "chat-note";
      hint.textContent =
        "Not right? Tell me what to change \u2014 for example \u201cmake them harder\u201d or \u201cno true/false\u201d.";
      thinking.appendChild(hint);
    } catch (error) {
      thinking.innerHTML = "";
      const p = document.createElement("p");
      p.className = "chat-error";
      p.textContent = error.message;
      thinking.appendChild(p);
    } finally {
      setBusy(false);
      chatInput.focus();
    }
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

  // Quiz → next question (or the results screen on the last one)
  document.getElementById("next-question").addEventListener("click", function () {
    QuizEngine.next();
  });

  // Results → replay the same quiz
  document.getElementById("retry-quiz").addEventListener("click", function () {
    // getQuiz() returns whatever was last played, so "Try Again" will work
    // for AI-generated quizzes too without any change here.
    const lastQuiz = QuizEngine.getQuiz();
    if (lastQuiz && QuizEngine.start(lastQuiz)) {
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

    const result =
      authMode === "signup"
        ? await Auth.signUp(email, password)
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
  document.getElementById("auth-guest").addEventListener("click", function () {
    Auth.continueAsGuest();
    showScreen("home");
  });

  // The various "create an account" prompts scattered around the app
  ["banner-create-account", "files-create-account", "account-create"].forEach(function (id) {
    document.getElementById(id).addEventListener("click", function () {
      openAuth("signup");
    });
  });

  document.getElementById("account-login").addEventListener("click", function () {
    openAuth("login");
  });

  document.getElementById("account-signout").addEventListener("click", async function () {
    await Auth.signOut();
    showScreen("home");
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

    // --- Guest reminder banner ---
    document.getElementById("guest-banner").hidden = !guest;

    // --- My Files ---
    document.getElementById("files-guest").hidden = !guest;
    // Signed in with nothing saved yet. (Real saved quizzes arrive with the
    // database work; until then an empty list is the honest state.)
    document.getElementById("files-empty").hidden = !signedIn;

    // --- Account ---
    document.getElementById("account-signed-in").hidden = !signedIn;
    document.getElementById("account-guest").hidden = signedIn;
    document.getElementById("account-email").textContent = Auth.getEmail() || "";
    document.getElementById("account-subtitle").textContent = signedIn
      ? "Manage how you're signed in."
      : "Sign in to keep your study chats on every device.";

    // --- Menu ---
    // "Account" reads oddly when you aren't one; call it what it does.
    const accountMenuItem = document.querySelector('.menu__item[data-screen="account"]');
    if (accountMenuItem) {
      accountMenuItem.textContent = signedIn ? "Account" : "Sign In";
    }
  }

  /* ------------------------------------------------------------------------
     STARTUP
     ------------------------------------------------------------------------ */
  // Expose the router so quiz.js can switch to the results screen.
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
