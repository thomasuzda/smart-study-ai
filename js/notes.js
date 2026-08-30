/* ==========================================================================
   notes.js — class notes, saved on this device
   --------------------------------------------------------------------------
   Deliberately NOT part of store.js. That file is the Supabase layer: every
   call routes through Auth.getClient(), it throws for guests, and its failures
   are network failures. Notes are the opposite — synchronous, device-local,
   and they work signed out. Merging the two would give one module two
   incompatible failure models, and would make the eventual "sync notes to an
   account" change surgery instead of a swap.

   Everything lives under one localStorage key holding the whole tree. At this
   size (tens of notes) one read at load and one write per change is simpler
   than a key per note, and it makes every write atomic.

   No DOM access here, same as auth.js and store.js. ui.js does the rendering.
   ========================================================================== */

const Notes = (function () {
  "use strict";

  const KEY = "smartstudy.notes.v1";

  /* Mirrors the API's own limits (api/generate-questions.js), so a note that
     can't become a quiz is caught here instead of after a round trip. */
  const MAX_BODY_CHARS = 60000;
  const MIN_QUIZ_CHARS = 20;

  let available = true;
  let lastErrorMessage = null;

  function newId(prefix) {
    /* Not crypto.randomUUID(): it requires a secure context, so opening the
       page from file:// would throw the moment someone adds their first note. */
    return prefix + "_" + Date.now().toString(36) + "_" +
      Math.random().toString(36).slice(2, 8);
  }

  function empty() {
    return { version: 1, classes: [] };
  }

  /* This file runs before ui.js. An uncaught throw here would stop ui.js from
     ever registering its listeners and take down the whole app, not just this
     screen — so every failure path returns an empty tree instead of throwing. */
  function load() {
    let raw;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      // Private browsing can block storage entirely.
      available = false;
      lastErrorMessage =
        "Your browser is blocking storage, so notes can't be saved in this window.";
      return empty();
    }

    if (!raw) return empty();

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.classes)) {
        return empty();
      }
      return parsed;
    } catch (e) {
      /* Corrupt payload. An empty notebook beats a dead page. */
      console.warn("Notes: saved notes were unreadable, starting fresh.", e);
      return empty();
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      lastErrorMessage = null;
      return true;
    } catch (e) {
      /* Quota is the case that matters. Without a return value the caller
         would report "Saved" while the text was silently dropped. */
      lastErrorMessage =
        e && e.name === "QuotaExceededError"
          ? "Storage is full. Delete a note to free up space."
          : "Couldn't save — your browser is blocking storage.";
      return false;
    }
  }

  let data = load();

  /* Reads hand back copies, so ui.js physically cannot mutate the stored
     arrays and skip a persist(). Same instinct as the fresh object
     renderFileCard passes to launchQuiz. */
  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function findClass(classId) {
    for (let i = 0; i < data.classes.length; i++) {
      if (data.classes[i].id === classId) return data.classes[i];
    }
    return null;
  }

  function findNote(noteId) {
    for (let i = 0; i < data.classes.length; i++) {
      const notes = data.classes[i].notes || [];
      for (let j = 0; j < notes.length; j++) {
        if (notes[j].id === noteId) {
          return { cls: data.classes[i], note: notes[j], index: j };
        }
      }
    }
    return null;
  }

  // Shared by the class and note reorder buttons. Clamps at both ends.
  function moveWithin(list, index, delta) {
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return false;
    const item = list[index];
    list.splice(index, 1);
    list.splice(target, 0, item);
    return true;
  }

  return {
    MAX_BODY_CHARS: MAX_BODY_CHARS,
    MIN_QUIZ_CHARS: MIN_QUIZ_CHARS,

    isAvailable: function () { return available; },
    lastError: function () { return lastErrorMessage; },

    list: function () { return copy(data.classes); },

    getNote: function (noteId) {
      const hit = findNote(noteId);
      return hit ? { note: copy(hit.note), classId: hit.cls.id } : null;
    },

    createClass: function (name) {
      const clean = String(name || "").trim();
      if (!clean) return null;
      const cls = {
        id: newId("c"), name: clean, createdAt: Date.now(),
        collapsed: false, notes: [],
      };
      data.classes.push(cls);
      return persist() ? copy(cls) : null;
    },

    renameClass: function (classId, name) {
      const clean = String(name || "").trim();
      const cls = findClass(classId);
      if (!cls || !clean) return false;
      cls.name = clean;
      return persist();
    },

    deleteClass: function (classId) {
      const before = data.classes.length;
      data.classes = data.classes.filter(function (c) { return c.id !== classId; });
      if (data.classes.length === before) return false;
      return persist();
    },

    moveClass: function (classId, delta) {
      const index = data.classes.findIndex(function (c) { return c.id === classId; });
      if (!moveWithin(data.classes, index, delta)) return false;
      return persist();
    },

    setCollapsed: function (classId, collapsed) {
      const cls = findClass(classId);
      if (!cls) return false;
      cls.collapsed = Boolean(collapsed);
      return persist();
    },

    createNote: function (classId, title) {
      const cls = findClass(classId);
      if (!cls) return null;
      const note = {
        id: newId("n"), title: String(title || "").trim(), body: "",
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      cls.notes.push(note);
      return persist() ? copy(note) : null;
    },

    /* Stores an empty title rather than a placeholder, so "Untitled note" in
       the UI stays distinguishable from someone actually typing that. */
    updateNote: function (noteId, fields) {
      const hit = findNote(noteId);
      if (!hit) return null;
      if (typeof fields.title === "string") hit.note.title = fields.title.trim();
      if (typeof fields.body === "string") {
        hit.note.body = fields.body.slice(0, MAX_BODY_CHARS);
      }
      hit.note.updatedAt = Date.now();
      return persist() ? copy(hit.note) : null;
    },

    deleteNote: function (noteId) {
      const hit = findNote(noteId);
      if (!hit) return false;
      hit.cls.notes.splice(hit.index, 1);
      return persist();
    },

    moveNote: function (noteId, delta) {
      const hit = findNote(noteId);
      if (!hit || !moveWithin(hit.cls.notes, hit.index, delta)) return false;
      return persist();
    },

    /* Another tab changed the notes. Re-read, so this tab doesn't later
       overwrite a class it never saw with its own stale copy. */
    reload: function () { data = load(); },
  };
})();
