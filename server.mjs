import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

process.env.ASTRO_NODE_AUTOSTART = 'disabled';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { handler } = await import('./dist/server/entry.mjs');

const findDownloaderJobsModule = async () => {
  const chunksDir = path.join(__dirname, 'dist/server/chunks');
  const files = await fs.readdir(chunksDir);
  const file = files.find((name) => /^downloader-jobs_.*\.mjs$/.test(name));
  if (!file) {
    throw new Error('Could not find built downloader jobs module.');
  }
  return import(pathToFileURL(path.join(chunksDir, file)).href);
};

const jobsModule = await findDownloaderJobsModule();
const startDownloaderJob = jobsModule.startDownloaderJob ?? jobsModule.s;
const subscribeDownloaderJob = jobsModule.subscribeDownloaderJob ?? jobsModule.a;
const cancelDownloaderJob = jobsModule.cancelDownloaderJob ?? jobsModule.c;

if (!startDownloaderJob || !subscribeDownloaderJob || !cancelDownloaderJob) {
  throw new Error('Built downloader jobs module does not expose the expected job functions.');
}

const port = Number(process.env.PORT || 4321);
const host = process.env.HOST || '0.0.0.0';
const server = http.createServer((req, res) => {
  void handler(req, res);
});
const wss = new WebSocketServer({ noServer: true });

const send = (ws, type, payload) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
};

wss.on('connection', (ws) => {
  let jobId = null;
  let unsubscribe = null;

  const cleanup = (cancelJob) => {
    unsubscribe?.();
    unsubscribe = null;
    if (cancelJob && jobId) {
      cancelDownloaderJob(jobId);
    }
    jobId = null;
  };

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      send(ws, 'error', { error: 'Invalid WebSocket message.' });
      return;
    }

    if (message.type !== 'start') {
      send(ws, 'error', { error: 'Unsupported WebSocket message.' });
      return;
    }

    cleanup(true);
    const job = startDownloaderJob({
      url: String(message.url || ''),
      includeText: message.includeText !== false,
    });
    jobId = job.id;
    send(ws, 'job', job);

    unsubscribe = subscribeDownloaderJob(job.id, (event, payload) => {
      send(ws, event, payload);
      if (event === 'complete' || event === 'error' || event === 'cancelled') {
        unsubscribe?.();
        unsubscribe = null;
      }
    });
  });

  ws.on('close', () => cleanup(true));
  ws.on('error', () => cleanup(true));
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== '/api/downloader/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
