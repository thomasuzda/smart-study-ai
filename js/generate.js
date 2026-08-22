/* ===========================================================================
   generate.js — talks to the quiz-generating API

   The browser never sees the Anthropic key. It sends study material to our own
   /api/generate-questions, and that server-side file adds the key. This file is
   just the messenger, plus the memory needed to make "make them harder" work.
   =========================================================================== */

const Generate = (function () {
  /* What the last generation produced. Kept so a follow-up like "these are too
     easy" can be sent as a revision of those questions, rather than starting
     over from the notes and losing the ones that were already good. */
  let session = null; // { material, count, questions, subject }

  /* Guessing whether a message is new material or a note about the last quiz
     is unreliable on its own — a short paste of notes looks exactly like a
     long instruction. So the guess is deliberately conservative (a revision
     must be short AND a single line, the shape of "make them harder"), and the
     UI shows which mode it is in with a way to switch. The visible control is
     what makes this correct; the heuristic just picks a sensible default. */
  const FEEDBACK_MAX_CHARS = 200;

  function hasQuiz() {
    return !!(session && session.questions && session.questions.length);
  }

  /* Decide what the person meant by this message, without asking them.
     Returns "new" or "refine". The caller shows which one it chose, so a wrong
     guess is visible and correctable rather than silently confusing. */
  /* Words that begin an instruction about the existing questions. Checked
     against the start of the message, because "make them harder" opens with
     one and "Mitosis has four phases" does not. */
  const INSTRUCTION_START =
    /^(make|add|remove|delete|drop|change|fix|redo|rewrite|regenerate|try|use|avoid|stop|only|include|exclude|give|no|not|fewer|less|more|harder|easier|simpler|shorter|longer|another|again)\b/i;

  /* Refers to the questions we just produced rather than to new subject matter. */
  const REFERS_BACK = /\b(them|these|those|that one|the questions?|q\d+|question \d+)\b/i;

  function classify(message) {
    if (!hasQuiz()) return 'new';

    // Anything long or multi-line is material, not a note about the last quiz.
    if (message.includes('\n') || message.length > FEEDBACK_MAX_CHARS) return 'new';

    // Otherwise require positive evidence that this is an instruction. The
    // default leans to 'new' on purpose: producing an unwanted fresh quiz is
    // immediately obvious and one click to undo, whereas silently treating
    // pasted notes as feedback ignores the settings and confuses everyone.
    return INSTRUCTION_START.test(message.trim()) || REFERS_BACK.test(message)
      ? 'refine'
      : 'new';
  }

  async function callApi(payload) {
    let response;
    try {
      response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (networkError) {
      // fetch only rejects when the request never completed at all.
      throw new Error(
        'Could not reach the server. Check your connection and try again.'
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error('The server sent back something unreadable.');
    }

    if (!response.ok) {
      // The API always explains itself in `error`; prefer that over a status code.
      throw new Error(data.error || `Request failed (${response.status}).`);
    }
    return data;
  }

  /* Send a chat message and get back a quiz.

     Resolves with:
       { mode, quiz, detectedInputType, dropped }
     where mode is "new" or "refine" so the UI can say which happened. */
  async function send(message, count, forcedMode) {
    // forcedMode lets the UI override the guess when the person has told us
    // explicitly (by starting a new quiz), which always beats inference.
    const mode = forcedMode || classify(message);

    const payload =
      mode === 'refine'
        ? {
            material: session.material,
            // Use whatever the picker says now, so changing it and asking for
            // a revision actually changes how many you get.
            count: count || session.count,
            previousQuestions: session.questions,
            feedback: message,
          }
        : { material: message, count: count || 10 };

    const data = await callApi(payload);

    session = {
      material: mode === 'refine' ? session.material : message,
      count: count || (mode === 'refine' ? session.count : 10),
      questions: data.questions,
      subject: data.subject,
    };

    return {
      mode: mode,
      detectedInputType: data.detectedInputType,
      dropped: data.dropped || 0,
      quiz: {
        title: data.subject || 'Practice Quiz',
        subject: data.subject || '',
        questions: data.questions,
      },
    };
  }

  function currentQuiz() {
    if (!hasQuiz()) return null;
    return {
      title: session.subject || 'Practice Quiz',
      subject: session.subject || '',
      questions: session.questions,
    };
  }

  function reset() {
    session = null;
  }

  function subject() {
    return session ? session.subject : null;
  }

  return {
    send: send,
    hasQuiz: hasQuiz,
    currentQuiz: currentQuiz,
    reset: reset,
    subject: subject,
    classify: classify,
    FEEDBACK_MAX_CHARS: FEEDBACK_MAX_CHARS,
  };
})();
