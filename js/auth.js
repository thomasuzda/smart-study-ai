/* ==========================================================================
   auth.js — accounts and guest mode
   --------------------------------------------------------------------------
   Three ways to use the app:

     1. Signed in  — quizzes save to your account and follow you to any device
     2. Guest      — everything works, but nothing is saved anywhere
     3. Not chosen — the home screen asks which you want

   This file owns that state and tells the rest of the app when it changes.
   It never touches the DOM; ui.js does all the drawing. Keeping the "what is
   true" separate from the "what is on screen" is what stops this kind of code
   from turning into spaghetti.
   ========================================================================== */

const Auth = (function () {
  "use strict";

  // The Supabase client, created on first use. Stays null until a project is
  // connected in config.js.
  let client = null;

  // The signed-in user, or null. Supabase gives us this object after login.
  let currentUser = null;

  // Guest mode is a deliberate choice the user makes, so we remember it —
  // otherwise every page refresh would throw them back to the "who are you?"
  // screen, which gets old fast.
  const GUEST_KEY = "smartstudy.guest";

  // Functions to call whenever the signed-in state changes, so the UI can
  // redraw. This is the observer pattern: auth.js announces what happened and
  // doesn't need to know who is listening.
  const listeners = [];

  /* ------------------------------------------------------------------------
     SETUP
     ------------------------------------------------------------------------ */

  /**
   * Connect to Supabase and restore any existing session.
   *
   * Returns a promise because checking for an existing session means asking
   * Supabase, which takes a moment. Callers await it before drawing the UI so
   * a returning user never sees a flash of the logged-out screen.
   */
  async function init() {
    if (!CONFIG.isConfigured()) {
      // No project connected yet. Guest mode still works fine.
      notify();
      return;
    }

    // `supabase` is the global provided by the library loaded in index.html.
    // Guarding on it means a blocked or failed CDN load produces a clear
    // message instead of "supabase is not defined" from somewhere deeper.
    if (typeof supabase === "undefined") {
      console.error("Supabase library failed to load — check your connection.");
      notify();
      return;
    }

    client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

    // Restore a previous session. Supabase keeps a token in this browser, so
    // closing the tab and coming back does not log you out.
    const { data } = await client.auth.getSession();
    currentUser = data.session ? data.session.user : null;

    // Supabase also tells us about later changes — a token refreshing, a
    // logout in another tab, an email confirmation completing.
    client.auth.onAuthStateChange(function (_event, session) {
      currentUser = session ? session.user : null;
      // Signing in supersedes guest mode.
      if (currentUser) clearGuest();
      notify();
    });

    notify();
  }

  /* ------------------------------------------------------------------------
     ACCOUNT ACTIONS
     Each returns { ok: true } or { ok: false, message: "..." } rather than
     throwing. The caller is a form handler that needs to show a message
     either way, so a plain result object is easier to work with than
     try/catch at every call site.
     ------------------------------------------------------------------------ */

  async function signUp(email, password) {
    const problem = validate(email, password);
    if (problem) return { ok: false, message: problem };
    if (!client) return { ok: false, message: notConnectedMessage() };

    const { data, error } = await client.auth.signUp({ email: email, password: password });
    if (error) return { ok: false, message: friendlyError(error) };

    // Supabase can be set to require email confirmation. When it is, the user
    // exists but has no session yet — so we say so instead of pretending
    // they're logged in and then failing to save anything.
    if (data.user && !data.session) {
      return {
        ok: true,
        needsConfirmation: true,
        message: "Check your email for a confirmation link, then log in.",
      };
    }

    clearGuest();
    return { ok: true };
  }

  async function signIn(email, password) {
    const problem = validate(email, password);
    if (problem) return { ok: false, message: problem };
    if (!client) return { ok: false, message: notConnectedMessage() };

    const { error } = await client.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (error) return { ok: false, message: friendlyError(error) };

    clearGuest();
    return { ok: true };
  }

  async function signOut() {
    if (client) await client.auth.signOut();
    currentUser = null;
    clearGuest();
    notify();
  }

  async function resetPassword(email) {
    if (!email) return { ok: false, message: "Enter your email address first." };
    if (!client) return { ok: false, message: notConnectedMessage() };

    const { error } = await client.auth.resetPasswordForEmail(email, {
      // Send them back to this app after they click the emailed link.
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) return { ok: false, message: friendlyError(error) };
    return { ok: true, message: "Password reset link sent. Check your email." };
  }

  /* ------------------------------------------------------------------------
     GUEST MODE
     ------------------------------------------------------------------------ */

  function continueAsGuest() {
    try {
      localStorage.setItem(GUEST_KEY, "1");
    } catch (e) {
      // Private browsing can block storage. Guest mode should still work for
      // this visit even if we can't remember the choice for the next one.
      console.warn("Could not remember guest mode:", e);
    }
    notify();
  }

  function clearGuest() {
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch (e) {
      /* nothing useful to do here */
    }
  }

  function isGuest() {
    // Signing in always wins over a leftover guest flag.
    if (currentUser) return false;
    try {
      return localStorage.getItem(GUEST_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  /** Has the user made any choice yet (signed in OR chose guest)? */
  function hasChosen() {
    return Boolean(currentUser) || isGuest();
  }

  /* ------------------------------------------------------------------------
     VALIDATION AND ERROR MESSAGES
     ------------------------------------------------------------------------ */

  /** Returns an error message string, or null when the input is fine. */
  function validate(email, password) {
    if (!email || !email.trim()) return "Enter your email address.";
    // Deliberately loose: something, an @, something, a dot, something. Strict
    // email regexes reject real addresses, and the confirmation email is the
    // real test of whether an address works.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "That doesn't look like an email address.";
    }
    if (!password) return "Enter a password.";
    // Supabase's own minimum is 6. Matching it here means the user finds out
    // instantly instead of after a round trip to the server.
    if (password.length < 6) return "Password must be at least 6 characters.";
    return null;
  }

  function notConnectedMessage() {
    return (
      "Accounts aren't switched on yet — the app still needs to be connected " +
      "to its database. You can use it as a guest in the meantime."
    );
  }

  /** Turn Supabase's technical errors into something a person can act on. */
  function friendlyError(error) {
    const raw = (error && error.message ? error.message : "").toLowerCase();

    if (raw.includes("invalid login credentials")) {
      return "That email and password don't match an account.";
    }
    if (raw.includes("already registered") || raw.includes("already been registered")) {
      return "There's already an account with that email. Try logging in.";
    }
    if (raw.includes("email not confirmed")) {
      return "Confirm your email first — check your inbox for the link.";
    }
    if (raw.includes("rate limit") || raw.includes("too many")) {
      return "Too many tries. Wait a minute and try again.";
    }
    if (raw.includes("failed to fetch") || raw.includes("network")) {
      return "Couldn't reach the server. Check your internet connection.";
    }
    // Anything unexpected: show the real message rather than a vague
    // "something went wrong" that gives the user nothing to work with.
    return error && error.message ? error.message : "Something went wrong. Try again.";
  }

  /* ------------------------------------------------------------------------
     CHANGE NOTIFICATIONS
     ------------------------------------------------------------------------ */

  function onChange(callback) {
    listeners.push(callback);
  }

  function notify() {
    listeners.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        // One broken listener shouldn't stop the others from running.
        console.error("Auth listener failed:", e);
      }
    });
  }

  /* ------------------------------------------------------------------------
     PUBLIC API
     ------------------------------------------------------------------------ */
  return {
    init: init,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    resetPassword: resetPassword,
    continueAsGuest: continueAsGuest,
    isGuest: isGuest,
    hasChosen: hasChosen,
    isConfigured: function () {
      return CONFIG.isConfigured();
    },
    getUser: function () {
      return currentUser;
    },
    getEmail: function () {
      return currentUser ? currentUser.email : null;
    },
    onChange: onChange,
  };
})();
