/* ===========================================================================
   dev-server.mjs — for running the whole app on your own machine

   Vercel does two jobs in production: serve the static files, and run anything
   in /api as a function. Nothing does both locally, so this small server fills
   that gap. It is a development convenience only — Vercel ignores this file.

   Run it with:
     ANTHROPIC_API_KEY=your-key npm run dev

   Then open http://localhost:8765
   =========================================================================== */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = 8765;
const ROOT = process.cwd();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* Vercel hands functions an Express-style `res`. This fakes just enough of that
   shape for the same function file to run unmodified in both places. */
function fakeVercelResponse(res) {
  return {
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return this;
    },
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    // Read the body, then hand off to the real function file.
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Body was not valid JSON.' }));
    }
    try {
      // Cache-busted import so edits to the function apply without a restart.
      const mod = await import(
        `./api/${url.pathname.replace('/api/', '')}.js?t=${Date.now()}`
      );
      return void (await mod.default(req, fakeVercelResponse(res)));
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: String(err?.message || err) }));
    }
  }

  // Static files. normalize() stops a request like /../../.ssh escaping ROOT.
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(filePath);
    res.setHeader('Content-Type', TYPES[extname(filePath)] || 'application/octet-stream');
    // No caching locally, so a reload always shows the newest edit.
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  const key = process.env.ANTHROPIC_API_KEY;
  console.log(`\n  Smart Study AI running at http://localhost:${PORT}`);
  console.log(
    key
      ? `  API key loaded (${key.length} chars) — quiz generation will work.\n`
      : `  No ANTHROPIC_API_KEY set — everything works except generating quizzes.\n`
  );
});
