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

    // The home screen's demo card animates on a loop. Let it know the screen
    // changed so it can stop when it's off-screen and pick back up on return
    // — no sense burning battery animating something nobody can see.
    if (window.HeroDemo) HeroDemo.syncToScreen();
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

  /* ------------------------------------------------------------------------
     QUIZ FLOW BUTTONS
     ------------------------------------------------------------------------ */

  // Home → start the sample quiz
  document.getElementById("start-quiz").addEventListener("click", function () {
    // SAMPLE_QUIZ comes from js/sample-quiz.js, loaded before this file.
    // Later this is whatever quiz the user picked or the AI just generated.
    if (QuizEngine.start(SAMPLE_QUIZ)) {
      showScreen("quiz");
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
      ? "Free, and your quizzes follow you everywhere."
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

  /* ------------------------------------------------------------------------
     HOME SCREEN CHOICES
     ------------------------------------------------------------------------ */
  document.getElementById("go-signup").addEventListener("click", function () {
    openAuth("signup");
  });

  document.getElementById("go-login").addEventListener("click", function () {
    openAuth("login");
  });

  document.getElementById("go-guest").addEventListener("click", function () {
    Auth.continueAsGuest();
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
    const chosen = Auth.hasChosen();

    // --- Home: ask who they are, or let them start ---
    document.getElementById("home-welcome").hidden = chosen;
    document.getElementById("home-start").hidden = !chosen;

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
      : "Sign in to keep your quizzes on every device.";

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
  showScreen("home");
  renderAuthState();
  HeroDemo.init();
  Auth.init();
})();
