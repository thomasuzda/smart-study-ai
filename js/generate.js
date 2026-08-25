/* ===========================================================================
   generate.js — deciding what a pasted message is, and asking the API for it

   The browser never sees the Anthropic key. It sends text to our own
   /api/generate-questions and that server-side file adds the key.

   The important idea here is that the app asks rather than guesses. Pasting a
   past exam is ambiguous — you might want the professor's real questions made
   clickable, or new ones in the same style. Those are different enough that
   picking one silently is worse than a single tap to say which.
   =========================================================================== */

const Generate = (function () {
  let session = null;   // { material, count, questions, subject, mode }
  let chatHistory = []; // running conversation, for the talking mode

  const FEEDBACK_MAX_CHARS = 200;

  /* ---------------------------------------------------------------------
     WHAT DID THEY JUST PASTE?
     Done here in the browser rather than by asking Claude: it is instant,
     free, and a wrong guess costs nothing because the app shows its
     conclusion and offers the alternative as a button.
     --------------------------------------------------------------------- */
  const QUIZ_SIGNALS = [
    /^\s*[a-dA-D][).]\s+\S/m,            // "a) ..." or "B. ..." option lines
    /\bselect one\b/i,                    // Moodle
    /\bthe correct answer is\b/i,
    /\bquestion\s*\d+\b/i,
    /\bpoints out of\b/i,
    /\bflag question\b/i,
    /\bmultiple choice\b/i,
    /\btrue or false\b/i,
  ];

  function looksLikeQuiz(text) {
    const hits = QUIZ_SIGNALS.filter((re) => re.test(text)).length;
    // Two independent signals, so one stray "Question 1" in a set of notes
    // doesn't misclassify the whole thing.
    return hits >= 2;
  }

  /* Rough count of how many questions are in a pasted quiz, only so the app
     can say "about 10 questions" when offering the choice. */
  function countQuestions(text) {
    const numbered = text.match(/\bquestion\s*\d+\b/gi);
    if (numbered) {
      const unique = new Set(numbered.map((m) => m.toLowerCase().replace(/\s+/g, ' ')));
      return unique.size;
    }
    const answers = text.match(/\bthe correct answer is\b/gi);
    return answers ? answers.length : 0;
  }

  const INSTRUCTION_START =
    /^(make|add|remove|delete|drop|change|fix|redo|rewrite|regenerate|try|use|avoid|stop|only|include|exclude|give|no|not|fewer|less|more|harder|easier|simpler|shorter|longer|another|again|shuffle)\b/i;
  const REFERS_BACK = /\b(them|these|those|that one|the questions?|q\d+|question \d+)\b/i;

  /* What should happen with this message?
       "refine"  — a note about the quiz we just made
       "choose"  — a pasted quiz; ask which of the two things they want
       "plan"    — pasted study material; ask what kind of quiz
       "chat"    — talking, not pasting                                     */
  function classify(message) {
    const text = message.trim();

    if (session && text.length <= FEEDBACK_MAX_CHARS &&
        !text.includes('\n') &&
        (INSTRUCTION_START.test(text) || REFERS_BACK.test(text))) {
      return 'refine';
    }
    if (looksLikeQuiz(text)) return 'choose';

    // Enough substance to build a quiz from is treated as material to plan
    // around; anything shorter is someone talking to us.
    const substantial = text.length > 180 || text.split('\n').length > 4;
    return substantial ? 'plan' : 'chat';
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
      throw new Error('Could not reach the server. Check your connection and try again.');
    }

    /* A non-JSON reply almost always means this page is served from somewhere
       that can't run the API — GitHub Pages hands out files only. Name that,
       rather than reporting an unreadable response. */
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(
        "Quiz generation isn't available on this address (" +
          window.location.hostname +
          '). It needs a server to hold the API key, and this one only serves ' +
          'files. Run the app on your Mac with start.command and use ' +
          'http://localhost:8765, or deploy it to Vercel to make it work here.'
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error('The server sent back something that was not valid JSON.');
    }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  /* Build a quiz. `mode` is one of extract | mirror | generate. */
  async function buildQuiz(material, mode, count) {
    const data = await callApi({ material: material, mode: mode, count: count || 10 });
    session = {
      material: material,
      count: count || 10,
      questions: data.questions,
      subject: data.subject,
      mode: mode,
    };
    return {
      mode: data.mode,
      dropped: data.dropped || 0,
      quiz: currentQuiz(),
    };
  }

  /* Revise the quiz already on screen. */
  async function refine(feedback, count) {
    const data = await callApi({
      material: session.material,
      mode: session.mode,
      count: count || session.count,
      previousQuestions: session.questions,
      feedback: feedback,
    });
    session.questions = data.questions;
    session.subject = data.subject;
    session.count = count || session.count;
    return { mode: 'refine', dropped: data.dropped || 0, quiz: currentQuiz() };
  }

  /* Plain conversation — no questions produced. */
  async function chat(message) {
    const data = await callApi({ material: message, mode: 'chat', history: chatHistory });
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: data.reply });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
    return data.reply;
  }

  function currentQuiz() {
    if (!session || !session.questions || !session.questions.length) return null;
    return {
      title: session.subject || 'Practice Quiz',
      subject: session.subject || '',
      questions: session.questions,
    };
  }

  return {
    classify: classify,
    looksLikeQuiz: looksLikeQuiz,
    countQuestions: countQuestions,
    buildQuiz: buildQuiz,
    refine: refine,
    chat: chat,
    currentQuiz: currentQuiz,
    hasQuiz: function () { return !!currentQuiz(); },
    subject: function () { return session ? session.subject : null; },
    /* extract | mirror | generate — the ORIGINAL classification, kept as-is
       through any number of refine rounds. Saving needs to know whether a
       quiz came from pasted questions or written from notes; result.mode
       passed to presentQuiz turns into 'refine' after the first revision,
       which would lose that distinction. */
    mode: function () { return session ? session.mode : null; },
    reset: function () { session = null; },
  };
})();
