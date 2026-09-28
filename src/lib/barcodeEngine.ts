/**
 * Universal barcode engine (ZXing), running fully in the browser.
 *
 * Replaces the native `window.BarcodeDetector` API used by the VIN, ID and
 * part scanner modals. `BarcodeDetector` is not implemented in the Android
 * WebView, so those scan loops never fired on device — this module decodes in
 * pure JS/WASM and works everywhere.
 *
 * IMPORTANT: this uses ZXing's *continuous* decode API, which runs exactly
 * one internal scan loop for the lifetime of the call. The single-shot
 * `decodeFromVideoElement()` must NOT be used here: it internally retries
 * forever on a miss, so calling it on a timer stacks up dozens of concurrent
 * infinite decode loops that saturate the CPU and prevent any code from ever
 * being recognised. Throttling is handled by `timeBetweenScansMillis` on the
 * reader, plus a dedupe window so a code held in frame fires only once.
 */

import type { BrowserMultiFormatReader, Result, BarcodeFormat } from '@zxing/library';

type ZxingModule = typeof import('@zxing/library');

/**
 * ZXing is a large dependency and only needed while a scanner modal is open,
 * so it is imported lazily and code-split out of the main bundle.
 */
let zxingPromise: Promise<ZxingModule> | null = null;

function loadZxing(): Promise<ZxingModule> {
  if (!zxingPromise) {
    zxingPromise = import('@zxing/library').catch((err) => {
      zxingPromise = null;
      throw err;
    });
  }
  return zxingPromise;
}

/** `BarcodeFormat` is a numeric enum; reverse-map it to a readable label. */
function formatName(zxing: ZxingModule, format: BarcodeFormat | undefined): string {
  if (format === undefined) return 'UNKNOWN';
  return zxing.BarcodeFormat[format] ?? 'UNKNOWN';
}

export interface BarcodeHit {
  text: string;
  format: string;
}

export interface BarcodeEngineOptions {
  /** Milliseconds between decode attempts. Lower = more responsive, more CPU. */
  scanIntervalMs?: number;
  /** Ignore repeat reads of the same value within this window. */
  dedupeMs?: number;
  /** Called for every successful decode. */
  onResult: (hit: BarcodeHit) => void;
  /** Called when the engine cannot start at all. */
  onError?: (err: unknown) => void;
  /** Called once the decoder is live and actively scanning. */
  onReady?: () => void;
}

const DEFAULT_SCAN_INTERVAL_MS = 300;
const DEFAULT_DEDUPE_MS = 2000;

export class BarcodeEngine {
  private reader: BrowserMultiFormatReader | null = null;
  private zxing: ZxingModule | null = null;
  private lastValue = '';
  private lastValueAt = 0;
  private stopped = true;

  private readonly scanIntervalMs: number;
  private readonly dedupeMs: number;
  private readonly onResult: (hit: BarcodeHit) => void;
  private readonly onError?: (err: unknown) => void;
  private readonly onReady?: () => void;

  constructor(options: BarcodeEngineOptions) {
    this.scanIntervalMs = options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS;
    this.dedupeMs = options.dedupeMs ?? DEFAULT_DEDUPE_MS;
    this.onResult = options.onResult;
    this.onError = options.onError;
    this.onReady = options.onReady;
  }

  /** Begin continuous decoding from `video` until `stop()` is called. */
  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    this.stopped = false;

    try {
      const zxing = await loadZxing();
      // The modal may have closed while ZXing was still loading.
      if (this.stopped) return;
      this.zxing = zxing;

      this.reader = new zxing.BrowserMultiFormatReader(undefined, this.scanIntervalMs);

      // One loop, managed by ZXing, for the life of this call.
      await this.reader.decodeFromVideoElementContinuously(video, (result: Result) => {
        if (this.stopped) return;
        const text = result?.getText()?.trim();
        if (!text) return;
        const now = Date.now();
        if (text === this.lastValue && now - this.lastValueAt < this.dedupeMs) return;
        this.lastValue = text;
        this.lastValueAt = now;
        this.onResult({ text, format: formatName(this.zxing as ZxingModule, result.getBarcodeFormat()) });
      });

      // Resolves once the scan loop is live, so the UI can show "scanning".
      if (!this.stopped) this.onReady?.();
    } catch (err) {
      if (this.stopped) return;
      this.stopped = true;
      this.onError?.(err);
    }
  }

  /** Stop decoding and release the reader. Safe to call repeatedly. */
  stop(): void {
    this.stopped = true;
    // `reset()` is what actually terminates ZXing's internal retry loop.
    try {
      this.reader?.reset();
    } catch {
      // Reader may already be torn down.
    }
    this.reader = null;
    this.zxing = null;
    this.lastValue = '';
  }

  /** True while the decoder is live. */
  get isRunning(): boolean {
    return !this.stopped;
  }
}

/** Convenience helper: decode a single still image (canvas, img, or data URL). */
export async function decodeStillImage(
  source: HTMLCanvasElement | HTMLImageElement | string
): Promise<BarcodeHit | null> {
  const zxing = await loadZxing();
  const reader = new zxing.BrowserMultiFormatReader();
  try {
    const result = await reader.decodeFromImageElement(source as HTMLImageElement);
    const text = result?.getText()?.trim();
    if (!text) return null;
    return { text, format: formatName(zxing, result.getBarcodeFormat()) };
  } catch {
    return null;
  } finally {
    try {
      reader.reset();
    } catch {
      // no-op
    }
  }
}
