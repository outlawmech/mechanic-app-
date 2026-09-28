/**
 * Part barcode scanner engine backed by ZXing in the Android WebView.
 *
 * Do one synchronous decode attempt per timer tick. Do not call
 * decodeFromVideoElement repeatedly: that API retries internally forever on
 * a miss and can create overlapping loops. Using reader.decode(video) gives
 * us exactly one attempt, followed by a controlled delay.
 */

import type { BrowserMultiFormatReader, Result, BarcodeFormat } from '@zxing/library';

type ZxingModule = typeof import('@zxing/library');

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

function formatName(zxing: ZxingModule, format: BarcodeFormat | undefined): string {
  if (format === undefined) return 'UNKNOWN';
  return zxing.BarcodeFormat[format] ?? 'UNKNOWN';
}

function isExpectedMiss(zxing: ZxingModule, error: unknown): boolean {
  return (
    error instanceof zxing.NotFoundException ||
    error instanceof zxing.ChecksumException ||
    error instanceof zxing.FormatException
  );
}

export interface BarcodeHit {
  text: string;
  format: string;
}

export interface BarcodeEngineOptions {
  /** Delay between single-frame attempts. */
  scanIntervalMs?: number;
  /** Ignore repeat reads of the same value within this window. */
  dedupeMs?: number;
  /** Spend more time on dense or difficult barcodes. */
  tryHarder?: boolean;
  onResult: (hit: BarcodeHit) => void;
  onError?: (err: unknown) => void;
  onReady?: () => void;
}

const DEFAULT_SCAN_INTERVAL_MS = 300;
const DEFAULT_DEDUPE_MS = 2000;

export class BarcodeEngine {
  private reader: BrowserMultiFormatReader | null = null;
  private zxing: ZxingModule | null = null;
  private video: HTMLVideoElement | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private lastValue = '';
  private lastValueAt = 0;
  private stopped = true;

  private readonly scanIntervalMs: number;
  private readonly dedupeMs: number;
  private readonly tryHarder: boolean;
  private readonly onResult: (hit: BarcodeHit) => void;
  private readonly onError?: (err: unknown) => void;
  private readonly onReady?: () => void;

  constructor(options: BarcodeEngineOptions) {
    this.scanIntervalMs = options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS;
    this.dedupeMs = options.dedupeMs ?? DEFAULT_DEDUPE_MS;
    this.tryHarder = options.tryHarder ?? false;
    this.onResult = options.onResult;
    this.onError = options.onError;
    this.onReady = options.onReady;
  }

  /** Start scanning the already-running camera preview. */
  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    this.stopped = false;

    try {
      const zxing = await loadZxing();
      if (this.stopped) return;

      this.zxing = zxing;
      this.video = video;
      const hints = new Map();
      if (this.tryHarder) hints.set(zxing.DecodeHintType.TRY_HARDER, true);
      this.reader = new zxing.BrowserMultiFormatReader(hints.size ? hints : undefined);
      this.onReady?.();
      this.scanFrame();
    } catch (err) {
      if (this.stopped) return;
      this.stopped = true;
      this.onError?.(err);
    }
  }

  /** One decode attempt; a miss schedules exactly one later attempt. */
  private scanFrame = (): void => {
    if (this.stopped || !this.reader || !this.zxing || !this.video) return;

    const video = this.video;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      try {
        const result: Result = this.reader.decode(video);
        const text = result.getText()?.trim();
        if (text) {
          const now = Date.now();
          if (text !== this.lastValue || now - this.lastValueAt >= this.dedupeMs) {
            this.lastValue = text;
            this.lastValueAt = now;
            this.onResult({ text, format: formatName(this.zxing, result.getBarcodeFormat()) });
          }
        }
      } catch (err) {
        if (!isExpectedMiss(this.zxing, err)) {
          this.stopped = true;
          this.onError?.(err);
          return;
        }
      }
    }

    if (!this.stopped) {
      this.scanTimer = setTimeout(this.scanFrame, this.scanIntervalMs);
    }
  };

  /** Stop decoding and release the reader. Safe to call repeatedly. */
  stop(): void {
    this.stopped = true;
    if (this.scanTimer !== null) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
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

  get isRunning(): boolean {
    return !this.stopped;
  }
}
