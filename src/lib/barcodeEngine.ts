/**
 * Universal barcode engine (ZXing), running fully in the browser.
 *
 * Replaces the native `window.BarcodeDetector` API used by the VIN, ID and
 * part scanner modals. `BarcodeDetector` is not implemented in the Android
 * WebView, so those scan loops never fired on device — this module decodes in
 * pure JS/WASM and works everywhere.
 *
 * Scanning is driven by a manual rAF loop rather than
 * `decodeFromVideoContinuously` so we can throttle the decode rate (expensive
 * on low-end phones), stop cleanly, and guard against re-reporting the same
 * code while it is still in frame.
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
  /** Called when a decode attempt throws something other than "not found". */
  onError?: (err: unknown) => void;
}

const DEFAULT_SCAN_INTERVAL_MS = 300;
const DEFAULT_DEDUPE_MS = 1500;

export class BarcodeEngine {
  private reader: BrowserMultiFormatReader | null = null;
  private video: HTMLVideoElement | null = null;
  private rafId: number | null = null;
  private lastAttempt = 0;
  private lastValue = '';
  private lastValueAt = 0;
  private stopped = true;

  private readonly scanIntervalMs: number;
  private readonly dedupeMs: number;
  private readonly onResult: (hit: BarcodeHit) => void;
  private readonly onError?: (err: unknown) => void;

  constructor(options: BarcodeEngineOptions) {
    this.scanIntervalMs = options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS;
    this.dedupeMs = options.dedupeMs ?? DEFAULT_DEDUPE_MS;
    this.onResult = options.onResult;
    this.onError = options.onError;
  }

  private zxing: ZxingModule | null = null;

  /** Begin decoding frames from `video` until `stop()` is called. */
  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    this.stopped = false;
    this.video = video;

    try {
      const zxing = await loadZxing();
      // The modal may have been closed while ZXing was still loading.
      if (this.stopped) return;
      this.zxing = zxing;
      this.reader = new zxing.BrowserMultiFormatReader(undefined, this.scanIntervalMs);
    } catch (err) {
      this.stopped = true;
      this.onError?.(err);
      return;
    }

    this.schedule();
  }

  private schedule = () => {
    if (this.stopped) return;
    this.rafId = requestAnimationFrame(() => void this.tick());
  };

  private async tick() {
    if (this.stopped || !this.reader || !this.video) return;

    const now = Date.now();
    const video = this.video;

    // Video must have dimensions and at least current data before decoding.
    if (video.readyState >= 2 && video.videoWidth > 0) {
      if (now - this.lastAttempt >= this.scanIntervalMs) {
        this.lastAttempt = now;
        try {
          const result: Result = await this.reader.decodeFromVideoElement(video);
          const text = result?.getText()?.trim();
          if (text && this.isFresh(text, now)) {
            this.onResult({
              text,
              format: formatName(this.zxing as ZxingModule, result.getBarcodeFormat()),
            });
          }
        } catch (err) {
          // A miss is the normal case while aiming at a barcode.
          if (!isNotFound(err)) {
            this.onError?.(err);
          }
        }
      }
    }

    this.schedule();
  }

  private isFresh(text: string, now: number): boolean {
    if (text === this.lastValue && now - this.lastValueAt < this.dedupeMs) return false;
    this.lastValue = text;
    this.lastValueAt = now;
    return true;
  }

  /** Stop decoding and release the reader. Safe to call repeatedly. */
  stop(): void {
    this.stopped = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    try {
      this.reader?.reset();
    } catch {
      // Reader may already be torn down.
    }
    this.reader = null;
    this.zxing = null;
    this.video = null;
    this.lastValue = '';
  }
}

/** ZXing signals "no barcode in this frame" via NotFoundException. */
function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'NotFoundException'
  );
}

/** Convenience helper: decode a single still image (canvas, img, or data URL). */
export async function decodeStillImage(
  source: HTMLCanvasElement | HTMLImageElement | string
): Promise<BarcodeHit | null> {
  const zxing = await loadZxing();
  const reader = new zxing.BrowserMultiFormatReader();
  try {
    const result = await reader.decodeFromImageElement(
      source as HTMLImageElement
    );
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
