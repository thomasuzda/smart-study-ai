/* ===========================================================================
   /api/generate-questions  —  the only code that ever touches the API key

   This runs on Vercel's servers, never in the browser. That distinction is the
   whole reason this file exists: the Anthropic key is read from an environment
   variable here, so it is never sent to anyone's computer. A key placed in the
   page instead would be visible to anyone who opens View Source, and they
   would be spending your money within the hour.

   The browser sends study material here; this file adds the key, calls Claude,
   checks the result, and sends back only the questions.
   =========================================================================== */

import Anthropic from '@anthropic-ai/sdk';

/* Change this one line to use a different model. Haiku is the cheapest and
   fastest; it is accurate on recall-style material (definitions, conversions,
   vocabulary) but can produce confidently wrong answers on multi-step maths
   and logic. 'claude-sonnet-5' costs roughly 20x more and gets those right. */
const MODEL = 'claude-haiku-4-5';

/* Guard rails. Without accounts there is nothing stopping a stranger who finds
   this URL from spending your credits, so we refuse anything unreasonable
   before it reaches the paid API. */
const LIMITS = {
  maxMaterialChars: 60000, // roughly 300 pasted questions
  maxCount: 30,
  minCount: 1,
  maxFeedbackChars: 2000,
  requestsPerWindow: 20,
  windowMs: 60 * 60 * 1000, // one hour
};

/* The shape Claude must return. Because this is a schema rather than an
   instruction in prose, a malformed reply is impossible — which removes both
   bugs the old NetBeans version had: hand-escaping quotes, and hunting for the
   first '[' to find the JSON inside chatty text. */
const SCHEMA = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description: 'Short subject label for this quiz, e.g. "Digital Logic" or "Cell Biology".',
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['multiple_choice', 'true_false'] },
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correctIndex: { type: 'integer', description: '0-based index into options' },
          explanation: { type: 'string' },
        },
        required: ['type', 'question', 'options', 'correctIndex', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['subject', 'questions'],
  additionalProperties: false,
};

/* Three different jobs, three prompts. Which one runs is chosen by the person
   in the chat, not guessed here — pasting a past exam and wanting the real
   questions is a completely different task from wanting new ones like it. */

const SHARED_RULES = `Rules for every question:
- multiple_choice takes exactly 4 options; true_false takes exactly 2.
- correctIndex is the 0-based position of the right answer within options.
- explanation says why the answer is right, in one or two sentences.
- Only state something as correct if you are confident it is.`;

/* EXTRACT — keep the professor's questions exactly as written. Adapted from
   the NetBeans prompt but inverted: that one deliberately avoided reusing the
   originals, this one deliberately preserves them. */
const SYSTEM_EXTRACT = `You convert a quiz someone pasted into an interactive
format. The text may be copied from a learning site and contain clutter:
"Question 7", "Correct 4.00 points out of 4.00", "Flag question", "Select one:",
"Feedback", "The correct answer is: ...". Strip that clutter.

Preserve each question's wording exactly as written. Do not reword, simplify,
improve or rewrite them, and do not invent new questions. This person wants to
practise the real exam.

Work out the correct answer from the text — usually stated after "The correct
answer is:". If a question's answer genuinely cannot be determined, leave that
question out rather than guessing.

Keep the original answer options and their wording. Strip any "a." / "B)" style
letter prefixes, since the app adds its own.

${SHARED_RULES}`;

/* MIRROR — new questions in the same style. The original NetBeans behaviour. */
const SYSTEM_MIRROR = `You write practice questions modelled on a quiz someone
pasted from their class.

Write NEW questions identical in style, format, difficulty and subject to the
ones provided, as though written by the same professor for the same course.
Mirror their conventions — if they use code, use code; if they use mathematical
notation, use it the same way. Never reuse a provided question verbatim.

The pasted text may contain clutter from a learning site ("Flag question",
"points out of", "Feedback"). Ignore it.

Wrong options must be genuinely plausible to someone who half-learned the
material. Never use filler or joke options; a wrong answer nobody would pick
teaches nothing. Vary which position is correct across the quiz.

${SHARED_RULES}`;

/* GENERATE — questions from study material. */
const SYSTEM_GENERATE = `You write practice questions from a student's study
material: notes, a textbook passage, slides, or a study guide.

Cover the most testable material. Wrong options must be genuinely plausible to
someone who half-learned it. Never use filler or joke options. Use true_false
only where a binary claim is genuinely the natural form. Vary which position is
correct across the quiz.

${SHARED_RULES}`;

/* CHAT — for talking rather than generating. Deliberately steered toward
   getting to a quiz, since that is what the app is for; a study assistant that
   chats pleasantly forever is not helping anyone revise. */
const SYSTEM_CHAT = `You are a study assistant inside a quiz app. The student
can paste notes or a past quiz and you turn it into practice questions.

Be brief and concrete — two or three sentences unless genuinely asked for more.
Help them decide what to study and what kind of quiz would suit it: how many
questions, multiple choice versus true/false, whether to reuse a past exam's
real questions or write new ones in the same style.

When they seem ready, tell them to paste their notes or quiz into the box. Do
not write quiz questions yourself in this mode — the app does that.

Write plain prose. The chat window shows your reply as written, so markdown
markup does not render: asterisks and hashes appear literally as punctuation.
Use short paragraphs and ordinary sentences instead of bold, headings or
bulleted lists.`;

const SYSTEMS = {
  extract: SYSTEM_EXTRACT,
  mirror: SYSTEM_MIRROR,
  generate: SYSTEM_GENERATE,
};

/* A crude in-memory rate limit, keyed by IP. It resets whenever Vercel starts a
   fresh instance, so it is a speed bump rather than a lock — enough to stop
   casual abuse. The real fix is requiring a logged-in account, which arrives
   with Supabase. */
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const seen = (hits.get(ip) || []).filter((t) => now - t < LIMITS.windowMs);
  seen.push(now);
  hits.set(ip, seen);
  return seen.length > LIMITS.requestsPerWindow;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    // A configuration mistake, not the user's fault — say so plainly.
    return res.status(500).json({
      error: 'The server is missing its ANTHROPIC_API_KEY setting.',
    });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({
      error: 'That is a lot of quizzes in one hour. Try again later.',
    });
  }

  const { material, count, previousQuestions, feedback, mode } = req.body || {};

  const minLength = mode === 'chat' ? 1 : 20;
  if (typeof material !== 'string' || material.trim().length < minLength) {
    return res.status(400).json({
      error: 'Paste some notes or questions first — at least a sentence or two.',
    });
  }
  if (material.length > LIMITS.maxMaterialChars) {
    return res.status(400).json({
      error: `That is longer than this can handle (${material.length.toLocaleString()} characters, limit ${LIMITS.maxMaterialChars.toLocaleString()}).`,
    });
  }

  // Default to 'generate' so an old client that doesn't send a mode still works.
  const job = SYSTEMS[mode] ? mode : 'generate';

  /* Conversation mode returns prose, not questions, so it skips the schema and
     all the question validation below. */
  if (mode === 'chat') {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const history = Array.isArray(req.body.history) ? req.body.history.slice(-10) : [];
      const reply = await client.messages.create({
        model: MODEL,
        max_tokens: 1000,
        system: SYSTEM_CHAT,
        messages: [...history, { role: 'user', content: material }],
      });
      if (reply.stop_reason === 'refusal') {
        return res.status(422).json({ error: 'Claude declined to answer that.' });
      }
      const said = reply.content.find((b) => b.type === 'text');
      return res.status(200).json({
        mode: 'chat',
        reply: said ? said.text : 'I did not have anything to add.',
      });
    } catch (err) {
      console.error('chat failed:', err);
      return res.status(500).json({ error: 'Could not reply. Try again.' });
    }
  }

  const howMany = Math.min(
    LIMITS.maxCount,
    Math.max(LIMITS.minCount, Number(count) || 10)
  );

  /* Build the conversation. A first request is one user turn. A revision
     replays what Claude produced last time plus what the student said was
     wrong, so it can correct that specific thing instead of starting over and
     losing the questions that were already fine. */
  /* Extract mode takes however many questions the pasted quiz actually has —
     asking for a fixed number would either invent extras or silently drop
     some of the professor's questions. */
  const instruction =
    job === 'extract'
      ? 'Convert every question in this quiz that has a determinable answer.'
      : `Write ${howMany} questions.`;

  const messages = [
    {
      role: 'user',
      content: `${instruction}\n\nPasted material:\n${material}`,
    },
  ];

  if (Array.isArray(previousQuestions) && previousQuestions.length && feedback) {
    if (String(feedback).length > LIMITS.maxFeedbackChars) {
      return res.status(400).json({ error: 'That note is too long.' });
    }
    messages.push({
      role: 'assistant',
      content: JSON.stringify({ questions: previousQuestions }),
    });
    messages.push({
      role: 'user',
      content:
        `The student reviewed those questions and said:\n\n${feedback}\n\n` +
        `Rewrite the full set of ${howMany} questions, fixing what they described. ` +
        `Leave questions they did not complain about essentially as they were.`,
    });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEMS[job],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages,
    });

    /* Check why Claude stopped before trusting anything it said. The old code
       assumed success and returned an empty string on failure, which surfaced
       as a confusing blank screen. */
    if (response.stop_reason === 'refusal') {
      return res.status(422).json({
        error: 'Claude declined to write questions for that material.',
      });
    }
    if (response.stop_reason === 'max_tokens') {
      return res.status(422).json({
        error: 'That produced more than fits in one reply. Try fewer questions.',
      });
    }

    const block = response.content.find((b) => b.type === 'text');
    if (!block) {
      return res.status(502).json({ error: 'Claude returned no questions.' });
    }

    const data = JSON.parse(block.text);

    /* The schema cannot express "exactly 4 options" or "correctIndex must be
       within range", so those are checked here. A question that fails is
       dropped rather than shown, because a broken question in a study tool
       teaches the wrong thing. */
    const questions = data.questions
      .filter((q) => {
        const wanted = q.type === 'true_false' ? 2 : 4;
        return (
          Array.isArray(q.options) &&
          q.options.length === wanted &&
          Number.isInteger(q.correctIndex) &&
          q.correctIndex >= 0 &&
          q.correctIndex < q.options.length
        );
      })
      .map((q, i) => ({ id: `q${i + 1}`, ...q }));

    if (!questions.length) {
      return res.status(502).json({
        error: 'The questions that came back were malformed. Try again.',
      });
    }

    return res.status(200).json({
      mode: job,
      subject: data.subject,
      questions,
      dropped: data.questions.length - questions.length,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    console.error('generate-questions failed:', err);
    const status = err?.status;
    if (status === 401) {
      return res.status(500).json({ error: 'The server API key was rejected.' });
    }
    if (status === 429) {
      return res.status(429).json({ error: 'Claude is rate limiting us. Wait a moment.' });
    }
    return res.status(500).json({ error: 'Could not generate questions. Try again.' });
  }
}
