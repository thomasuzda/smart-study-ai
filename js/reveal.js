/* ===========================================================================
   reveal.js — reveal elements as they scroll into view

   The .rise animations this replaces ran on page load, all of them, whether
   the element was on screen or not. Anything below the fold finished
   animating before you ever scrolled to it, so the effect was invisible
   exactly where it would have been worth having.

   An IntersectionObserver fires when an element actually enters the viewport,
   which is what makes the feature cards animate as you reach them.

   Deliberately small: one observer, no scroll listener, no library. A scroll
   listener would run on every frame of every scroll; the observer only runs
   when something crosses the threshold, so it costs nothing while idle.
   =========================================================================== */

(function () {
  "use strict";

  const els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;

  /* Someone who has asked their OS to reduce motion should get the content,
     not the animation. Show everything immediately and don't observe at all. */
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    els.forEach(function (el) { el.classList.add("is-revealed"); });
    return;
  }

  /* No IntersectionObserver (very old browser): show everything rather than
     leaving the page permanently blank. Failing visible beats failing hidden. */
  if (typeof IntersectionObserver !== "function") {
    els.forEach(function (el) { el.classList.add("is-revealed"); });
    return;
  }

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        /* Stagger by position within the group, so a row of cards arrives as a
           sequence rather than all at once. Read off the element instead of a
           counter, so it doesn't depend on observation order. */
        const delay = Number(entry.target.dataset.revealDelay || 0);
        setTimeout(function () {
          entry.target.classList.add("is-revealed");
        }, delay);
        /* Once revealed, stop watching. Re-animating on every scroll past is
           the thing that makes these effects feel cheap. */
        observer.unobserve(entry.target);
      });
    },
    {
      /* Start slightly before the element is fully on screen, so it finishes
         arriving as it reaches a comfortable reading position. */
      rootMargin: "0px 0px -10% 0px",
      threshold: 0.05,
    }
  );

  els.forEach(function (el) { observer.observe(el); });

  /* Safety net, and the most important few lines in this file.
     [data-reveal] starts at opacity 0, so anything the observer never reports
     on stays invisible FOREVER — a far worse outcome than the missing
     animation this was meant to add. After a grace period, reveal whatever is
     still waiting. The animation is a nicety; the text is the point.

     Scope, stated accurately: this covers a *visible* page where the observer
     somehow didn't fire. It does NOT rescue a page sitting in a background
     tab — timers are throttled there just as observer callbacks are, which I
     confirmed rather than assumed. That case needs no rescue though: when the
     tab is brought forward, rendering steps resume and the observer fires for
     anything on screen. Nobody is looking at a background tab anyway. */
  setTimeout(function () {
    els.forEach(function (el) { el.classList.add("is-revealed"); });
  }, 2500);
})();
