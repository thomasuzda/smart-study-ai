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
    detected_input_type: {
      type: 'string',
      enum: ['study_notes', 'existing_questions'],
      description: 'Whether the pasted text is study material or already-written quiz questions.',
    },
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
  required: ['detected_input_type', 'subject', 'questions'],
  additionalProperties: false,
};

/* Adapted from the prompt in your NetBeans QuizService. The key idea there —
   mirror the professor's style rather than writing generic questions — is kept
   and extended so it also handles plain study notes. */
const SYSTEM = `You write practice quizzes for a student.

First decide what the student pasted:
- "existing_questions" — already-written quiz or test questions.
- "study_notes" — notes, a textbook passage, slides, or a study guide.

If existing_questions: write NEW questions identical in style, format,
difficulty and subject to the ones provided, as though written by the same
professor for the same course. Mirror their conventions — if they use code,
use code; if they use mathematical notation, use it the same way. Never reuse
a provided question verbatim.

If study_notes: write questions covering the most testable material.

Rules for every question:
- Wrong options must be genuinely plausible to someone who half-learned the
  material. Never use filler or joke options; a wrong answer nobody would pick
  teaches nothing.
- Use true_false only where a binary claim is genuinely the natural form.
- multiple_choice takes exactly 4 options; true_false takes exactly 2.
- correctIndex is the 0-based position of the right answer within options.
- Vary which position is correct across the quiz.
- explanation says why the answer is right, in one or two sentences.
- Only state something as correct if you are confident it is. If the material
  is ambiguous, ask about what it does say rather than guessing.`;

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

  const { material, count, previousQuestions, feedback } = req.body || {};

  if (typeof material !== 'string' || material.trim().length < 20) {
    return res.status(400).json({
      error: 'Paste some notes or questions first — at least a sentence or two.',
    });
  }
  if (material.length > LIMITS.maxMaterialChars) {
    return res.status(400).json({
      error: `That is longer than this can handle (${material.length.toLocaleString()} characters, limit ${LIMITS.maxMaterialChars.toLocaleString()}).`,
    });
  }

  const howMany = Math.min(
    LIMITS.maxCount,
    Math.max(LIMITS.minCount, Number(count) || 10)
  );

  /* Build the conversation. A first request is one user turn. A revision
     replays what Claude produced last time plus what the student said was
     wrong, so it can correct that specific thing instead of starting over and
     losing the questions that were already fine. */
  const messages = [
    {
      role: 'user',
      content: `Write ${howMany} questions.\n\nPasted material:\n${material}`,
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
      system: SYSTEM,
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
      detectedInputType: data.detected_input_type,
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
