/**
 * Offline OCR engine (Tesseract WASM).
 *
 * Replaces the native `window.TextDetector` API, which is unavailable in the
 * Android WebView this app ships in (it only ships in Chrome for Android with
 * specific flags) and was disabled in this codebase. Tesseract runs the WASM
 * build locally so scanning works with no network connection.
 *
 * All WASM/worker/language assets are served from `public/tesseract/**`, so the
 * APK works fully offline. A single worker is shared across calls and lazily
 * created on first use — the language model takes a moment to load.
 */

import type { Worker } from 'tesseract.js';

const WORKER_PATH = '/tesseract/worker.min.js';
const CORE_PATH = '/tesseract/core/';
const LANG_PATH = '/tesseract/lang';

let workerPromise: Promise<Worker> | null = null;
let terminated = false;

/** Progress of the most recent recognition, 0..1. -1 when idle/unknown. */
let lastProgress = -1;

function ensureNotTerminated() {
  if (terminated) {
    throw new Error('OCR engine has been terminated. Call warmUp() to restart it.');
  }
}

/**
 * Lazily create the shared Tesseract worker.
 * Concurrent callers share one worker so we never boot WASM twice.
 */
export function getOcrWorker(): Promise<Worker> {
  ensureNotTerminated();
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng', 1 /* LSTM_ONLY */, {
        workerPath: WORKER_PATH,
        corePath: CORE_PATH,
        langPath: LANG_PATH,
        // Local assets are already compressed on the wire by the packager.
        gzip: true,
        logger: (m: { status?: string; progress?: number }) => {
          if (typeof m?.progress === 'number') lastProgress = m.progress;
        },
        errorHandler: (e: unknown) => {
          console.warn('[ocr] worker error', e);
        },
      });
    })().catch((err) => {
      // Allow a later call to retry rather than caching a rejected promise.
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Preload the WASM + language model so the first scan feels faster. */
export function warmUp(): Promise<void> {
  return getOcrWorker().then(
    () => undefined,
    () => undefined
  );
}

/**
 * Run OCR over an image source (canvas, video, blob, or data URL).
 * Resolves to the full recognized text, or '' if nothing legible was found.
 */
export async function recognizeText(source: HTMLCanvasElement | HTMLVideoElement | string): Promise<string> {
  const worker = await getOcrWorker();
  lastProgress = -1;
  const { data } = await worker.recognize(source);
  return (data?.text ?? '').trim();
}

/** Progress of the in-flight recognition, 0..1. -1 when idle. */
export function getOcrProgress(): number {
  return lastProgress;
}

/**
 * Tear down the worker and release the WASM heap.
 * Required on low-memory Android devices; call `warmUp()` to restart.
 */
export async function terminateOcr(): Promise<void> {
  terminated = true;
  const pending = workerPromise;
  workerPromise = null;
  if (pending) {
    try {
      const worker = await pending;
      await worker.terminate();
    } catch {
      // Worker failed to boot; nothing to tear down.
    }
  }
  lastProgress = -1;
}

/** Allow the engine to be used again after `terminateOcr()`. */
export function resetOcrEngine(): void {
  terminated = false;
  lastProgress = -1;
}
