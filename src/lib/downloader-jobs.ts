import {
  downloadScribdPdf,
  ScribdDownloadError,
  type ScribdDownloadProgress,
  type ScribdDownloadResult,
} from '@/lib/scribd-downloader';
import { saveLocalPdfDocument } from '@/lib/local-documents';

type JobStatus = 'queued' | 'running' | 'complete' | 'error' | 'cancelled';

type JobEvent = 'status' | 'progress' | 'complete' | 'error' | 'cancelled';

type JobListener = (event: JobEvent, payload: PublicDownloaderJob) => void;

type DownloaderJob = {
  id: string;
  controller: AbortController;
  createdAt: number;
  status: JobStatus;
  progress: ScribdDownloadProgress;
  filename?: string;
  pageCount?: number;
  result?: Buffer;
  error?: string;
  listeners: Set<JobListener>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

export type PublicDownloaderJob = {
  id: string;
  status: JobStatus;
  progress: ScribdDownloadProgress;
  filename?: string;
  pageCount?: number;
  error?: string;
};

const JOB_TTL_MS = 10 * 60 * 1000;
const jobs = new Map<string, DownloaderJob>();

const publicJob = (job: DownloaderJob): PublicDownloaderJob => ({
  id: job.id,
  status: job.status,
  progress: job.progress,
  filename: job.filename,
  pageCount: job.pageCount,
  error: job.error,
});

const notify = (job: DownloaderJob, event: JobEvent) => {
  const payload = publicJob(job);
  for (const listener of job.listeners) {
    listener(event, payload);
  }
};

const scheduleCleanup = (job: DownloaderJob, delay = JOB_TTL_MS) => {
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(() => {
    job.listeners.clear();
    job.result = undefined;
    jobs.delete(job.id);
  }, delay);
};

export const startDownloaderJob = ({ url, includeText }: { url: string; includeText: boolean }) => {
  const id = crypto.randomUUID();
  const job: DownloaderJob = {
    id,
    controller: new AbortController(),
    createdAt: Date.now(),
    status: 'queued',
    progress: { stage: 'Queued', done: 0, total: 1, percent: 0 },
    listeners: new Set(),
  };
  jobs.set(id, job);

  queueMicrotask(() => {
    job.status = 'running';
    notify(job, 'status');
    void downloadScribdPdf({
      url,
      includeText,
      signal: job.controller.signal,
      onProgress: (progress) => {
        job.progress = progress;
        notify(job, 'progress');
      },
    })
      .then(async (result: ScribdDownloadResult) => {
        await saveLocalPdfDocument({ filename: result.filename, data: result.pdf });
        job.status = 'complete';
        job.filename = result.filename;
        job.pageCount = result.pageCount;
        job.result = result.pdf;
        notify(job, 'complete');
        scheduleCleanup(job);
      })
      .catch((error) => {
        job.result = undefined;
        job.error = error instanceof Error ? error.message : 'Unexpected downloader error.';
        job.status = job.controller.signal.aborted ? 'cancelled' : 'error';
        notify(job, job.status);
        scheduleCleanup(job, 60_000);
      });
  });

  return publicJob(job);
};

export const getDownloaderJob = (id: string | null | undefined) => {
  if (!id) return null;
  return jobs.get(id) ?? null;
};

export const getDownloaderResult = (id: string | null | undefined) => {
  const job = getDownloaderJob(id);
  if (!job) {
    throw new ScribdDownloadError('Download job was not found.', 404);
  }
  if (job.status !== 'complete' || !job.result || !job.filename) {
    throw new ScribdDownloadError('Download job is not complete yet.', 409);
  }
  return {
    filename: job.filename,
    pageCount: job.pageCount ?? 0,
    pdf: job.result,
  };
};

export const cancelDownloaderJob = (id: string | null | undefined) => {
  const job = getDownloaderJob(id);
  if (!job) return false;
  if (job.status === 'complete') {
    job.result = undefined;
    job.status = 'cancelled';
    job.error = 'Download cancelled.';
    notify(job, 'cancelled');
    scheduleCleanup(job, 0);
    return true;
  }
  if (job.status === 'error' || job.status === 'cancelled') return true;
  job.status = 'cancelled';
  job.error = 'Download cancelled.';
  job.controller.abort(new Error('Download cancelled.'));
  notify(job, 'cancelled');
  scheduleCleanup(job, 60_000);
  return true;
};

export const subscribeDownloaderJob = (id: string, listener: JobListener) => {
  const job = getDownloaderJob(id);
  if (!job) return null;
  job.listeners.add(listener);
  listener('status', publicJob(job));
  return () => {
    job.listeners.delete(listener);
  };
};
