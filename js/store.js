/* ==========================================================================
   store.js — saving quizzes and recording scores
   --------------------------------------------------------------------------
   Everything here talks to two tables in Supabase (see supabase/schema.sql):

     quizzes   — a saved quiz, created only when the user clicks "Save quiz"
     attempts  — one row per time a saved quiz is taken, logged automatically

   Saving is deliberate, not automatic. The refine loop can produce several
   drafts of "the same" quiz in one conversation ("make it harder", "no
   true/false") — auto-saving every draft would fill My Files with
   near-duplicates. Only the version the user actually clicks Save on is
   kept.

   Attempts, on the other hand, need no user action: they can only exist for
   a quiz that was already saved (the database requires a real quiz_id), so
   there's no clutter risk in logging every one automatically.

   This file never touches the DOM — ui.js owns that, same split as auth.js.
   ========================================================================== */

const Store = (function () {
  "use strict";

  function client() {
    return Auth.getClient();
  }

  /**
   * Most Supabase errors are fine to show as-is, but a missing table
   * produces a cryptic PostgREST message. That specific case has one fix —
   * run supabase/schema.sql — so it gets a message that says so.
   */
  function friendlyError(error) {
    const message = (error && error.message) || "";
    const missingTable =
      error && error.code === "42P01" || /does not exist|schema cache/i.test(message);
    if (missingTable) {
      return "The database tables haven't been set up yet. Run supabase/schema.sql " +
        "in your Supabase project's SQL Editor (SQL Editor → New query → " +
        "paste the file → Run), then try again.";
    }
    return message || "Something went wrong reaching your account.";
  }

  /**
   * Save a quiz. Returns the new row (its `id` is what lets a later attempt
   * be linked back to it).
   */
  async function saveQuiz(quiz, sourceKind) {
    const user = Auth.getUser();
    if (!user) throw new Error("Sign in to save a quiz.");

    const { data, error } = await client()
      .from("quizzes")
      .insert({
        user_id: user.id,
        title: quiz.title || quiz.subject || "Practice Quiz",
        subject: quiz.subject || "",
        questions: quiz.questions,
        question_count: quiz.questions.length,
        // 'pasted_questions' | 'notes' — see generate.js's mode() for why
        // this can't just be read off the latest chat message.
        source_kind: sourceKind === "generate" ? "notes" : "pasted_questions",
      })
      .select()
      .single();

    if (error) throw new Error(friendlyError(error));
    return data;
  }

  /**
   * Every saved quiz for the signed-in user, newest first. Row Level
   * Security is what actually restricts this to their own rows — there's no
   * user_id filter here because the database won't return anyone else's
   * regardless of what's asked for.
   */
  async function listQuizzes() {
    const { data, error } = await client()
      .from("quizzes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(friendlyError(error));
    return data || [];
  }

  async function deleteQuiz(id) {
    const { error } = await client().from("quizzes").delete().eq("id", id);
    if (error) throw new Error(friendlyError(error));
  }

  /**
   * Log a finished attempt. Silently does nothing if the quiz being played
   * was never saved (no id to attach it to) — a guest playing, or a signed-in
   * user who chose not to save this one, still gets to see their results;
   * there's just nothing to write down afterward.
   */
  async function recordAttempt(quizId, score, total, answers) {
    if (!quizId) return;
    const user = Auth.getUser();
    if (!user) return;

    const { error } = await client().from("attempts").insert({
      user_id: user.id,
      quiz_id: quizId,
      score: score,
      total: total,
      answers: answers,
    });
    // A failed write here shouldn't block the results screen the user is
    // already looking at — note it and move on rather than throw.
    if (error) console.warn("Could not record attempt:", error.message);
  }

  /**
   * The most recent attempt for each quiz id given, as { [quizId]: row }.
   * Used by My Files to show "8/10 · Aug 24" next to each saved quiz.
   */
  async function latestScores(quizIds) {
    if (!quizIds.length) return {};

    const { data, error } = await client()
      .from("attempts")
      .select("quiz_id, score, total, created_at")
      .in("quiz_id", quizIds)
      .order("created_at", { ascending: false });

    if (error) return {}; // Scores are a nice-to-have; a failed fetch here
                           // shouldn't stop the quiz list itself from showing.

    const latest = {};
    (data || []).forEach(function (row) {
      // Rows arrive newest-first, so the first one seen per quiz IS the
      // latest — nothing to compare, just skip once a quiz already has one.
      if (!latest[row.quiz_id]) latest[row.quiz_id] = row;
    });
    return latest;
  }

  return {
    saveQuiz: saveQuiz,
    listQuizzes: listQuizzes,
    deleteQuiz: deleteQuiz,
    recordAttempt: recordAttempt,
    latestScores: latestScores,
  };
})();
