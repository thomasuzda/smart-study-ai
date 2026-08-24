/* ==========================================================================
   config.js — connection settings
   --------------------------------------------------------------------------
   Accounts and saved quizzes are handled by Supabase, a free hosted service
   that provides a login system and a database. Two values connect this app
   to your Supabase project.

   IS IT SAFE TO HAVE THESE IN A PUBLIC FILE? Yes — for these two values
   specifically, and this is worth understanding rather than taking on faith:

     * The URL is just an address, like any website address.
     * The "anon key" (anonymous key) is DESIGNED to be public. It only
       identifies which project a request is for. It grants no permissions
       on its own.

   What actually protects your data is a database feature called Row Level
   Security (RLS): rules stored in the database saying "a user may only read
   or write rows where the user_id column equals their own id." Those rules
   run on Supabase's servers, where nobody can edit them. So even holding the
   anon key, a stranger cannot read your quizzes.

   The key that must NEVER be in this file — or any file the browser
   downloads — is the "service role" key, which bypasses those rules. Same
   goes for the Anthropic API key. Both live only on a server later on.
   ========================================================================== */

const CONFIG = {
  /* Paste your Supabase project's two values here.
     Find them at: supabase.com -> your project -> Settings -> API Keys

       SUPABASE_URL       is labeled "Project URL".
                          Looks like https://abcdefghijkl.supabase.co

       SUPABASE_ANON_KEY  is the PUBLIC key. Supabase has renamed this over
                          time, so depending on when your project was made it
                          is labeled either "Publishable key" (starts with
                          sb_publishable_) or "anon public" (a long key
                          starting with eyJ). Either works — they do the same
                          job. Just never take the one marked "secret" or
                          "service_role": that one bypasses every security
                          rule, and this file is downloaded by the browser. */
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
};

/**
 * Has Supabase been connected yet?
 *
 * Until it is, the app still works — you can take quizzes as a guest — but
 * the login and account-creation buttons explain what's missing instead of
 * failing with a confusing error. Degrading clearly beats breaking.
 */
CONFIG.isConfigured = function () {
  return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
};
