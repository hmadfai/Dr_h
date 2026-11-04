/**
 * Public web preview of Padel Release Booker.
 *
 * Runs the real AppRuntime + mock adapter + SQLite persistence behind a
 * thin HTTP/SSE bridge so a reviewer can use the UI in a normal browser.
 * This is NOT the packaged macOS app and does NOT perform real Playtomic
 * bookings. Assisted-mode "open page" opens a new browser tab only.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/core/persistence/db.js';
import { SystemClock } from '../src/core/time/clock.js';
import { InMemorySecretsStore } from '../src/core/security/secretsStore.js';
import { AppRuntime } from '../src/main/appRuntime.js';
import { createApi, type ApiMethod } from './createApi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, 'dist');
const DATA_DIR = resolve(__dirname, '../.web-preview-data');
const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '0.0.0.0';

mkdirSync(DATA_DIR, { recursive: true });

const db = openDatabase({ filePath: join(DATA_DIR, 'preview.sqlite') });
const clock = new SystemClock();
const secretsStore = new InMemorySecretsStore();

function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
function setMeta(key: string, value: string): void {
  db.prepare(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

const openedUrls: string[] = [];
const runtime = new AppRuntime({
  db,
  clock,
  externalUrlOpener: {
    async open(url: string) {
      openedUrls.push(url);
      console.log(`[preview] would open external URL: ${url}`);
    }
  },
  notifier: {
    async notify(title: string, body: string) {
      console.log(`[preview] notify: ${title} — ${body}`);
    }
  },
  getMeta,
  setMeta
});

const api = createApi(runtime, clock, secretsStore);

type SseClient = { res: ServerResponse; id: number };
let nextSseId = 1;
const sseClients = new Set<SseClient>();

function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

runtime.on('heartbeat', (payload) => broadcast('heartbeat', payload));
runtime.on('notice', (payload) => broadcast('notice', payload));

await runtime.connect('mock');
runtime.start();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(text);
}

function serveStatic(reqPath: string, res: ServerResponse): void {
  const cleaned = normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(DIST, cleaned === '/' || cleaned === '' ? 'index.html' : cleaned);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, 'index.html');
  }
  if (!existsSync(filePath)) {
    res.writeHead(404).end('Not found — run npm run preview:build first');
    return;
  }
  const type = MIME[extname(filePath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  createReadStream(filePath).pipe(res);
}

const METHODS = new Set<ApiMethod>([
  'getAppState',
  'connect',
  'disconnect',
  'resolveClubByUrl',
  'confirmClub',
  'searchClubs',
  'listCourts',
  'createRule',
  'updateRule',
  'deleteRule',
  'previewOccurrences',
  'buildAuthorizationReview',
  'armRule',
  'pauseRule',
  'resumeRule',
  'emergencyStop',
  'emergencyResume',
  'listOccurrences',
  'listBookingHistory',
  'reportUserOutcome',
  'exportDiagnostics',
  'deleteAllLocalData',
  'openClubPage'
]);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');
      const client: SseClient = { res, id: nextSseId++ };
      sseClients.add(client);
      req.on('close', () => sseClients.delete(client));
      return;
    }

    if (url.pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        mode: 'mock-preview',
        note: 'Browser preview of Padel Release Booker mock sandbox — not a live Playtomic integration.'
      });
      return;
    }

    const invokeMatch = url.pathname.match(/^\/api\/invoke\/([A-Za-z]+)$/);
    if (invokeMatch && req.method === 'POST') {
      const method = invokeMatch[1] as ApiMethod;
      if (!METHODS.has(method)) {
        sendJson(res, 404, { error: `Unknown method: ${method}` });
        return;
      }
      const args = await readJson(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (api as any)[method] as (arg?: unknown) => Promise<unknown>;
      const result = await fn(args);
      sendJson(res, 200, { ok: true, result: result ?? null });
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[preview] request error:', message);
    sendJson(res, 400, { ok: false, error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[preview] Padel Release Booker web preview listening on http://${HOST}:${PORT}`);
  console.log(`[preview] Mock sandbox only — no real Playtomic bookings.`);
});

function shutdown(): void {
  runtime.stop();
  for (const client of sseClients) {
    try {
      client.res.end();
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
