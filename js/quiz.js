/* ==========================================================================
   quiz.js — the quiz engine
   --------------------------------------------------------------------------
   Runs a quiz: shows one question at a time, grades the answer immediately,
   explains it, then moves on and produces a results screen at the end.

   It doesn't care where the questions came from — the hardcoded sample file
   today, the AI later. It only needs the question shape described in
   sample-quiz.js.

   One rule followed throughout this file: any text that came from a person or
   from the AI is inserted with `.textContent`, never `.innerHTML`. Assigning
   to innerHTML makes the browser interpret the string as HTML, so pasted
   study notes containing something like <script> could actually run. Using
   textContent makes the browser treat it as plain text, always. This matters
   as soon as real pasted material flows through here.
   ========================================================================== */

const QuizEngine = (function () {
  "use strict";

  /* ------------------------------------------------------------------------
     STATE
     What the engine needs to remember while a quiz is in progress. Kept in
     this one place so there's a single source of truth.
     ------------------------------------------------------------------------ */
  let quiz = null;         // the quiz object currently being played
  let currentIndex = 0;    // which question we're on (0 = the first)
  let answered = false;    // has the current question been answered yet?
  let results = [];        // one record per answered question

  // Every element we touch, looked up once. Repeatedly calling
  // getElementById inside a loop is wasted work and clutters the code.
  const el = {
    quizScreen: document.getElementById("screen-quiz"),
    resultsScreen: document.getElementById("screen-results"),
    progress: document.getElementById("progress"),
    progressFill: document.getElementById("progress-fill"),
    counter: document.getElementById("question-counter"),
    scoreSoFar: document.getElementById("score-so-far"),
    questionText: document.getElementById("question-text"),
    answers: document.getElementById("answers"),
    feedback: document.getElementById("feedback"),
    feedbackVerdict: document.getElementById("feedback-verdict"),
    feedbackExplanation: document.getElementById("feedback-explanation"),
    nextButton: document.getElementById("next-question"),
    finalScore: document.getElementById("final-score"),
    resultsHeadline: document.getElementById("results-headline"),
    resultsDetail: document.getElementById("results-detail"),
    review: document.getElementById("review"),
  };

  // A, B, C, D… labels for the answer circles. Generated from the character
  // code so it keeps working past D if a question ever has more options.
  function letterFor(index) {
    return String.fromCharCode(65 + index); // 65 is "A" in character codes
  }

  /* ------------------------------------------------------------------------
     START
     Called with a quiz object. Resets everything, then draws question one.
     ------------------------------------------------------------------------ */
  function start(quizData) {
    // Guard against being handed something unusable. Failing loudly here with
    // a clear message beats a confusing crash three functions deeper.
    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      console.error("QuizEngine.start: no questions to run", quizData);
      return false;
    }

    quiz = quizData;
    currentIndex = 0;
    results = [];
    renderQuestion();
    return true;
  }

  /* ------------------------------------------------------------------------
     RENDER ONE QUESTION
     ------------------------------------------------------------------------ */
  function renderQuestion() {
    const question = quiz.questions[currentIndex];
    const total = quiz.questions.length;
    answered = false;

    // --- Progress bar ---
    // Percentage of questions COMPLETED, so the bar sits at 0% on question 1
    // and only fills as you actually finish things.
    const percent = (currentIndex / total) * 100;
    el.progressFill.style.width = percent + "%";
    // Keep the ARIA value in sync so screen readers report real progress.
    el.progress.setAttribute("aria-valuenow", String(Math.round(percent)));

    // --- Meta line ---
    el.counter.textContent = "Question " + (currentIndex + 1) + " of " + total;
    const correctCount = results.filter((r) => r.correct).length;
    el.scoreSoFar.textContent = correctCount + " correct";

    // --- Question text ---
    el.questionText.textContent = question.question;

    // --- Answer buttons ---
    // Clear whatever the previous question left behind. Setting textContent
    // to "" is the fastest safe way to empty an element.
    el.answers.textContent = "";

    question.options.forEach(function (optionText, index) {
      // Build each row as: <li><button><span letter><span text></button></li>
      const li = document.createElement("li");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer";
      // Remember which option this is, so the click handler knows what was
      // picked without needing a separate closure per button.
      button.dataset.index = String(index);

      const letter = document.createElement("span");
      letter.className = "answer__letter";
      letter.textContent = letterFor(index);
      // aria-hidden because the letter is a visual aid; a screen reader
      // reading "A" before every option is noise.
      letter.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.className = "answer__text";
      text.textContent = optionText; // textContent — see the note at the top

      button.appendChild(letter);
      button.appendChild(text);
      button.addEventListener("click", onAnswerClick);

      li.appendChild(button);
      el.answers.appendChild(li);
    });

    // --- Reset the feedback panel and Next button ---
    el.feedback.hidden = true;
    el.feedback.className = "feedback"; // drop any --correct/--wrong modifier
    el.nextButton.hidden = true;
  }

  /* ------------------------------------------------------------------------
     HANDLE AN ANSWER
     ------------------------------------------------------------------------ */
  function onAnswerClick(event) {
    // Ignore extra clicks after the question is already answered. Without
    // this, a fast double-click would record two answers for one question.
    if (answered) return;
    answered = true;

    // currentTarget is the button the listener is attached to. (event.target
    // could be the inner <span> the user actually clicked.)
    const button = event.currentTarget;
    const selectedIndex = Number(button.dataset.index);
    const question = quiz.questions[currentIndex];
    const isCorrect = selectedIndex === question.correctIndex;

    // Record it for the score and the end-of-quiz review.
    results.push({
      questionId: question.id,
      question: question.question,
      options: question.options,
      selectedIndex: selectedIndex,
      correctIndex: question.correctIndex,
      correct: isCorrect,
      explanation: question.explanation,
    });

    // --- Paint every answer button ---
    const allButtons = el.answers.querySelectorAll(".answer");
    allButtons.forEach(function (btn) {
      const index = Number(btn.dataset.index);
      // Lock them all so the answer can't be changed after the fact.
      btn.disabled = true;

      if (index === question.correctIndex) {
        // Always reveal the right answer, even when they got it wrong —
        // that's the part that teaches.
        btn.classList.add("is-correct");
      } else if (index === selectedIndex) {
        btn.classList.add("is-wrong");
      } else {
        // Neither picked nor correct — fade it back so the eye goes to the
        // two rows that matter.
        btn.classList.add("is-muted");
      }
    });

    // --- Feedback panel ---
    el.feedback.className = "feedback " + (isCorrect ? "feedback--correct" : "feedback--wrong");
    el.feedbackVerdict.textContent = isCorrect ? "Correct" : "Not quite";
    el.feedbackExplanation.textContent = question.explanation || "";
    el.feedback.hidden = false;

    // --- Live score in the meta line ---
    const correctCount = results.filter((r) => r.correct).length;
    el.scoreSoFar.textContent = correctCount + " correct";

    // --- Next button ---
    // Label it honestly: on the last question it goes to results, not "next".
    const isLast = currentIndex === quiz.questions.length - 1;
    el.nextButton.textContent = isLast ? "See Results" : "Next";
    el.nextButton.hidden = false;
    // Move keyboard focus to it so someone tabbing through doesn't have to
    // hunt for where the flow continues.
    el.nextButton.focus();
  }

  /* ------------------------------------------------------------------------
     ADVANCE
     ------------------------------------------------------------------------ */
  function next() {
    // Don't let Next skip an unanswered question.
    if (!answered) return;

    if (currentIndex < quiz.questions.length - 1) {
      currentIndex++;
      renderQuestion();
      // Jump back to the top — on a phone the Next button is far down the
      // page, and without this the new question starts off-screen.
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      showResults();
    }
  }

  /* ------------------------------------------------------------------------
     RESULTS
     ------------------------------------------------------------------------ */
  function showResults() {
    const total = quiz.questions.length;
    const correctCount = results.filter((r) => r.correct).length;
    const percent = Math.round((correctCount / total) * 100);

    el.finalScore.textContent = correctCount + "/" + total;

    // A headline that responds to how they actually did. Small touch, but it
    // makes the results feel like a response rather than a readout.
    let headline;
    if (percent === 100) headline = "Perfect score";
    else if (percent >= 80) headline = "Nice work";
    else if (percent >= 60) headline = "Not bad";
    else if (percent >= 40) headline = "Worth another pass";
    else headline = "Let's run that again";
    el.resultsHeadline.textContent = headline;

    const missed = total - correctCount;
    el.resultsDetail.textContent =
      percent +
      "% correct" +
      (missed > 0
        ? " — " + missed + (missed === 1 ? " question" : " questions") + " to review below."
        : " — you got every question.");

    renderReview();

    // Hand control over to the UI layer to swap screens. The engine doesn't
    // know how routing works, which keeps the two concerns separate.
    if (typeof window.showScreen === "function") {
      window.showScreen("results");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ------------------------------------------------------------------------
     REVIEW LIST
     One card per question, so a wrong answer becomes something you learn
     from instead of just a lost point.
     ------------------------------------------------------------------------ */
  function renderReview() {
    el.review.textContent = "";

    results.forEach(function (r, i) {
      const item = document.createElement("div");
      item.className = "review__item " + (r.correct ? "review__item--correct" : "review__item--wrong");

      // Question, numbered
      const q = document.createElement("p");
      q.className = "review__question";
      q.textContent = i + 1 + ". " + r.question;
      item.appendChild(q);

      // On a wrong answer, show what they picked. On a correct one there's no
      // point repeating it back to them.
      if (!r.correct) {
        const yours = document.createElement("p");
        yours.className = "review__line";
        // Build with separate nodes rather than an HTML string, so the answer
        // text stays plain text.
        yours.appendChild(document.createTextNode("You picked: "));
        const yourAnswer = document.createElement("strong");
        yourAnswer.textContent = r.options[r.selectedIndex];
        yours.appendChild(yourAnswer);
        item.appendChild(yours);
      }

      const answer = document.createElement("p");
      answer.className = "review__line";
      answer.appendChild(document.createTextNode(r.correct ? "Answer: " : "Correct answer: "));
      const correctAnswer = document.createElement("strong");
      correctAnswer.textContent = r.options[r.correctIndex];
      answer.appendChild(correctAnswer);
      item.appendChild(answer);

      if (r.explanation) {
        const why = document.createElement("p");
        why.className = "review__line";
        why.style.marginTop = "0.5rem";
        why.textContent = r.explanation;
        item.appendChild(why);
      }

      el.review.appendChild(item);
    });
  }

  /* ------------------------------------------------------------------------
     PUBLIC API
     Only these three are exposed. Everything above stays private to this
     file, so nothing else can accidentally reach in and corrupt the state.
     ------------------------------------------------------------------------ */
  return {
    start: start,
    next: next,
    // Which quiz is loaded, so the UI can restart the same one on "Try Again"
    getQuiz: function () {
      return quiz;
    },
  };
})();
