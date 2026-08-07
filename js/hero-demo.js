/* ===========================================================================
   HERO DEMO — the little quiz card on the home screen that answers itself

   This is decoration, not a feature. It exists so somebody landing on the
   page for the first time understands what the app does without reading a
   word of explanation.

   Everything here is deliberately slow. Roughly 7 seconds per question, with
   a real pause before the answer resolves. A fast loop reads as a flashing
   advertisement; a slow one reads as somebody calmly using the app. When in
   doubt, slower.
   =========================================================================== */

const HeroDemo = (function () {
  // Short questions on purpose — long ones wrap and make the card jump height.
  const DEMO_QUESTIONS = [
    {
      question: 'Which organelle produces most of a cell’s energy?',
      options: ['Nucleus', 'Mitochondria', 'Ribosome'],
      correctIndex: 1,
    },
    {
      question: 'What year did the Berlin Wall come down?',
      options: ['1989', '1991', '1975'],
      correctIndex: 0,
    },
    {
      question: 'What is the derivative of x²?',
      options: ['x', '2x', 'x³/3'],
      correctIndex: 1,
    },
  ];

  // All timings in milliseconds, gathered here so the pacing is easy to tune
  // in one place instead of hunting through the code.
  const TIMING = {
    optionStagger: 120,   // gap between each option fading in
    beforeConsider: 1900, // reading time before the answer starts resolving
    considerHold: 650,    // the "thinking about it" pause on the right answer
    afterAnswer: 2400,    // how long the green answer stays up
    betweenCards: 450,    // blank moment while the next question loads
  };

  let index = 0;
  let timers = [];        // every pending setTimeout, so we can cancel cleanly
  let running = false;

  const els = {};

  /* Schedule work, remembering the timer so stop() can cancel it. Without
     this bookkeeping, a paused loop keeps firing callbacks against elements
     that may already have been rewritten by the next cycle. */
  function later(fn, delay) {
    const id = setTimeout(fn, delay);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  /* Build the option rows for one question. Returns the <li> elements so the
     caller can animate them without re-querying the DOM. */
  function renderOptions(q, animate) {
    els.options.innerHTML = '';
    return q.options.map(function (text, i) {
      const li = document.createElement('li');
      li.className = 'demo__option';

      const bullet = document.createElement('span');
      bullet.className = 'demo__bullet';
      bullet.textContent = '✓'; // checkmark, transparent until correct

      const label = document.createElement('span');
      label.textContent = text;

      li.appendChild(bullet);
      li.appendChild(label);

      if (animate) {
        li.classList.add('is-entering');
        li.style.animationDelay = i * TIMING.optionStagger + 'ms';

        /* Drop the class the moment the entrance finishes.
           This matters more than it looks. `is-entering` uses
           `animation-fill-mode: both`, which makes the finished animation keep
           applying its end value — opacity: 1 — and animation values outrank
           ordinary CSS rules. Leave the class on and `.is-dimmed { opacity: .4 }`
           is silently ignored, so the wrong answers never actually fade.
           Removing it hands control back to the stylesheet. */
        li.addEventListener(
          'animationend',
          function () {
            li.classList.remove('is-entering');
            li.style.animationDelay = '';
          },
          { once: true }
        );
      }

      els.options.appendChild(li);
      return li;
    });
  }

  /* Send the progress bar back to empty without animating the trip.
     The bar has a 0.6s CSS transition, so simply setting it to 0% would show
     it visibly sliding backwards from full — the exact stutter we're trying
     to avoid. Turning transitions off for this one change makes it snap
     during the blank moment between cards, where nobody can see it. */
  function resetProgress() {
    els.fill.style.transition = 'none';
    els.fill.style.width = '0%';
    // Reading a layout property forces the browser to apply that change right
    // now. Without it, both style writes get batched and the "none" never
    // takes effect — the bar would slide backwards anyway.
    void els.fill.offsetWidth;
    els.fill.style.transition = '';
  }

  /* One full cycle: show a question, pause, resolve it, pause, move on. */
  function showQuestion() {
    if (!running) return;

    const q = DEMO_QUESTIONS[index];
    const rows = renderOptions(q, true);

    els.counter.textContent =
      'Question ' + (index + 1) + ' of ' + DEMO_QUESTIONS.length;
    els.question.textContent = q.question;

    // Progress bar fills as if you were working through a real quiz.
    els.fill.style.width =
      ((index + 1) / DEMO_QUESTIONS.length) * 100 + '%';

    const correct = rows[q.correctIndex];

    // Beat 1 — hesitate on the right answer, as though deciding.
    later(function () {
      if (!running) return;
      correct.classList.add('is-considering');
    }, TIMING.beforeConsider);

    // Beat 2 — commit. Green, checkmark, and the wrong answers recede.
    later(function () {
      if (!running) return;
      correct.classList.remove('is-considering');
      correct.classList.add('is-correct');
      rows.forEach(function (row) {
        if (row !== correct) row.classList.add('is-dimmed');
      });
    }, TIMING.beforeConsider + TIMING.considerHold);

    // Beat 3 — clear out and queue the next question.
    later(function () {
      if (!running) return;
      els.question.textContent = '';
      els.options.innerHTML = '';
      index = (index + 1) % DEMO_QUESTIONS.length;
      if (index === 0) resetProgress();
      later(showQuestion, TIMING.betweenCards);
    }, TIMING.beforeConsider + TIMING.considerHold + TIMING.afterAnswer);
  }

  /* The still version, for people who've asked their system not to animate
     things. Same information, no movement. */
  function showStatic() {
    const q = DEMO_QUESTIONS[0];
    const rows = renderOptions(q, false);
    els.counter.textContent = 'Question 1 of ' + DEMO_QUESTIONS.length;
    els.question.textContent = q.question;
    els.fill.style.width = '33%';
    rows[q.correctIndex].classList.add('is-correct');
    rows.forEach(function (row, i) {
      if (i !== q.correctIndex) row.classList.add('is-dimmed');
    });
  }

  function start() {
    if (running) return;
    running = true;
    showQuestion();
  }

  function stop() {
    running = false;
    clearTimers();
  }

  function init() {
    els.card = document.getElementById('demo');
    els.counter = document.getElementById('demo-counter');
    els.question = document.getElementById('demo-question');
    els.options = document.getElementById('demo-options');
    els.fill = document.getElementById('demo-fill');

    // If the markup isn't on the page, do nothing rather than throw.
    if (!els.card || !els.question || !els.options) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      showStatic();
      return;
    }

    // Don't animate while the tab is in the background. It burns battery
    // redrawing something nobody is looking at, and browsers throttle timers
    // there anyway, which would leave the loop half-finished on return.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stop();
      } else if (isHomeVisible()) {
        start();
      }
    });

    // Only begin if the tab is actually in front. `visibilitychange` fires on
    // a change, so a page opened in a background tab would never receive one
    // and the loop would run unseen until the user finally switched to it.
    if (!document.hidden) start();
  }

  /* The demo only belongs on the home screen. Once someone is taking a quiz
     there's no reason to keep a fake quiz animating out of sight. */
  function isHomeVisible() {
    const home = document.getElementById('screen-home');
    return !!home && !home.hidden;
  }

  /* Called by the UI whenever screens change, so the loop follows the user. */
  function syncToScreen() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (isHomeVisible() && !document.hidden) {
      start();
    } else {
      stop();
    }
  }

  return { init: init, syncToScreen: syncToScreen, stop: stop };
})();
