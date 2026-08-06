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
     STARTUP
     ------------------------------------------------------------------------ */
  // Expose the router so quiz.js can switch to the results screen.
  window.showScreen = showScreen;

  // Land on home.
  showScreen("home");
})();
