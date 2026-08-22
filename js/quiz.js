/* ===========================================================================
   quiz.js — the quiz itself

   Every question is on the page at once, as a list you scroll through and can
   answer in any order, the way your original Smart Study AI worked.

   Two ways to get feedback, chosen before you start:

     instant  — each answer turns green or red the moment you pick it, with the
                explanation underneath. Good for learning material you don't
                know yet.
     after    — nothing is revealed until you press Submit, so you find out
                whether you actually knew it rather than being told as you go.
                Closer to sitting the real exam.
   =========================================================================== */

const QuizEngine = (function () {
  let quiz = null;
  let mode = "instant";      // "instant" | "after"
  let answers = [];          // answers[i] = chosen option index, or null
  let submitted = false;

  const el = {
    list: null,
    counter: null,
    score: null,
    progressFill: null,
    progress: null,
    submitTop: null,
    submitBottom: null,
  };

  function cache() {
    el.list = document.getElementById("questions");
    el.counter = document.getElementById("question-counter");
    el.score = document.getElementById("score-so-far");
    el.progressFill = document.getElementById("progress-fill");
    el.progress = document.getElementById("progress");
    el.submitTop = document.getElementById("submit-quiz");
    el.submitBottom = document.getElementById("submit-quiz-bottom");
  }

  function letterFor(index) {
    return String.fromCharCode(65 + index); // 0 -> A
  }

  /* ---------------------------------------------------------------------
     BUILDING THE LIST
     --------------------------------------------------------------------- */

  function buildQuestion(question, questionIndex) {
    const item = document.createElement("li");
    item.className = "qcard";
    item.id = "q-" + questionIndex;

    const number = document.createElement("span");
    number.className = "qcard__number";
    number.textContent = questionIndex + 1;
    item.appendChild(number);

    const text = document.createElement("h3");
    text.className = "qcard__text";
    text.textContent = question.question;
    item.appendChild(text);

    const options = document.createElement("ul");
    options.className = "answers";

    question.options.forEach(function (optionText, optionIndex) {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer";
      button.dataset.question = String(questionIndex);
      button.dataset.option = String(optionIndex);

      const letter = document.createElement("span");
      letter.className = "answer__letter";
      letter.textContent = letterFor(optionIndex);
      button.appendChild(letter);

      const label = document.createElement("span");
      label.className = "answer__text";
      label.textContent = optionText;
      button.appendChild(label);

      button.addEventListener("click", onAnswer);
      row.appendChild(button);
      options.appendChild(row);
    });

    item.appendChild(options);

    // The explanation panel, revealed either immediately or on submit.
    const feedback = document.createElement("div");
    feedback.className = "feedback";
    feedback.hidden = true;
    feedback.id = "feedback-" + questionIndex;
    const verdict = document.createElement("p");
    verdict.className = "feedback__verdict";
    const explanation = document.createElement("p");
    explanation.className = "feedback__explanation";
    feedback.appendChild(verdict);
    feedback.appendChild(explanation);
    item.appendChild(feedback);

    return item;
  }

  function render() {
    el.list.innerHTML = "";
    quiz.questions.forEach(function (question, i) {
      el.list.appendChild(buildQuestion(question, i));
    });
    updateProgress();
  }

  /* ---------------------------------------------------------------------
     ANSWERING
     --------------------------------------------------------------------- */

  function onAnswer(event) {
    if (submitted) return; // the quiz is over; nothing left to change

    const button = event.currentTarget;
    const questionIndex = Number(button.dataset.question);
    const optionIndex = Number(button.dataset.option);

    // In instant mode an answer is final, so a second click on the same
    // question would let you keep guessing until it went green.
    if (mode === "instant" && answers[questionIndex] !== null) return;

    answers[questionIndex] = optionIndex;

    const card = document.getElementById("q-" + questionIndex);
    card.querySelectorAll(".answer").forEach(function (b) {
      b.classList.toggle("is-chosen", Number(b.dataset.option) === optionIndex);
    });

    if (mode === "instant") revealQuestion(questionIndex);
    updateProgress();
  }

  /* Show whether this question was right, and why. */
  function revealQuestion(questionIndex) {
    const question = quiz.questions[questionIndex];
    const chosen = answers[questionIndex];
    const card = document.getElementById("q-" + questionIndex);
    const correct = chosen === question.correctIndex;

    card.querySelectorAll(".answer").forEach(function (b) {
      const optionIndex = Number(b.dataset.option);
      b.disabled = true;
      if (optionIndex === question.correctIndex) b.classList.add("is-correct");
      else if (optionIndex === chosen) b.classList.add("is-wrong");
    });

    const feedback = document.getElementById("feedback-" + questionIndex);
    const verdict = feedback.querySelector(".feedback__verdict");
    if (chosen === null || chosen === undefined) {
      verdict.textContent = "Not answered — the answer was " +
        letterFor(question.correctIndex) + ".";
      verdict.className = "feedback__verdict feedback__verdict--wrong";
    } else if (correct) {
      verdict.textContent = "Correct";
      verdict.className = "feedback__verdict feedback__verdict--correct";
    } else {
      verdict.textContent = "Not quite — the answer was " +
        letterFor(question.correctIndex) + ".";
      verdict.className = "feedback__verdict feedback__verdict--wrong";
    }
    feedback.querySelector(".feedback__explanation").textContent = question.explanation || "";
    feedback.hidden = false;
    card.classList.add("is-revealed");
  }

  function answeredCount() {
    return answers.filter(function (a) { return a !== null && a !== undefined; }).length;
  }

  function correctCount() {
    return quiz.questions.reduce(function (total, question, i) {
      return total + (answers[i] === question.correctIndex ? 1 : 0);
    }, 0);
  }

  function updateProgress() {
    const total = quiz.questions.length;
    const done = answeredCount();
    const percent = (done / total) * 100;
    el.progressFill.style.width = percent + "%";
    el.progress.setAttribute("aria-valuenow", String(Math.round(percent)));
    el.counter.textContent = done + " of " + total + " answered";

    // Only show a running score when answers are being revealed as you go.
    // In "after" mode a live score would give the game away.
    el.score.textContent =
      mode === "instant" && done ? correctCount() + " correct" : "";
  }

  /* ---------------------------------------------------------------------
     SUBMITTING
     --------------------------------------------------------------------- */

  function submit() {
    if (!quiz || submitted) return false;

    const unanswered = quiz.questions.length - answeredCount();
    if (unanswered > 0) {
      const ok = window.confirm(
        unanswered +
          (unanswered === 1 ? " question is" : " questions are") +
          " still unanswered. Submit anyway?"
      );
      if (!ok) {
        // Take them to the first gap rather than leaving them to hunt for it.
        const firstGap = answers.findIndex(function (a) {
          return a === null || a === undefined;
        });
        const card = document.getElementById("q-" + firstGap);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
        return false;
      }
    }

    submitted = true;
    // Reveal everything that isn't already showing.
    quiz.questions.forEach(function (_, i) {
      const feedback = document.getElementById("feedback-" + i);
      if (feedback && feedback.hidden) revealQuestion(i);
    });

    if (typeof window.showResults === "function") {
      window.showResults({
        score: correctCount(),
        total: quiz.questions.length,
        quiz: quiz,
        answers: answers.slice(),
      });
    }
    return true;
  }

  /* ---------------------------------------------------------------------
     LIFECYCLE
     --------------------------------------------------------------------- */

  function start(quizData, feedbackMode) {
    if (!quizData || !quizData.questions || !quizData.questions.length) {
      console.error("QuizEngine.start: no questions to run", quizData);
      return false;
    }
    cache();
    quiz = quizData;
    mode = feedbackMode === "after" ? "after" : "instant";
    answers = new Array(quiz.questions.length).fill(null);
    submitted = false;
    render();
    return true;
  }

  /* Fisher-Yates: walks backwards swapping each item with a random earlier
     one. Every ordering is equally likely, which sort(() => Math.random() -
     0.5) is not. */
  function shuffled(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = copy[i];
      copy[i] = copy[j];
      copy[j] = t;
    }
    return copy;
  }

  /* Reorder questions and the options inside them. Shuffling options means
     moving correctIndex with the right answer — otherwise it keeps pointing at
     whatever lands in that slot and every answer is marked wrong. */
  function shuffle() {
    if (!quiz) return false;
    const reordered = shuffled(quiz.questions).map(function (question) {
      const pairs = question.options.map(function (text, index) {
        return { text: text, wasCorrect: index === question.correctIndex };
      });
      const mixed = shuffled(pairs);
      return Object.assign({}, question, {
        options: mixed.map(function (p) { return p.text; }),
        correctIndex: mixed.findIndex(function (p) { return p.wasCorrect; }),
      });
    });
    return start(Object.assign({}, quiz, { questions: reordered }), mode);
  }

  return {
    start: start,
    submit: submit,
    shuffle: shuffle,
    getQuiz: function () { return quiz; },
    answeredCount: answeredCount,
    getMode: function () { return mode; },
    isSubmitted: function () { return submitted; },
  };
})();
