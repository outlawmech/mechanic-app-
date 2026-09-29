import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import {
  BookOpenIcon,
  CheckIcon,
  PlusIcon,
  ScanIcon,
} from './icons';
import { Button, Card, Input } from './ui';
import type { Part } from '../types';
import { money, num } from '../lib/format';
import { lookupPriceBookSku, type PriceBookEntry } from '../lib/priceBooks';

interface PartScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: Part[];
  onSelectPart?: (part: Part) => void;
  onAdjustStock?: (part: Part, delta: number) => void;
  onAddNewPart?: (sku: string) => void;
}

export default function PartScannerModal({
  isOpen,
  onClose,
  parts,
  onSelectPart,
  onAdjustStock,
  onAddNewPart,
}: PartScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultLocked = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const [recognizedText, setRecognizedText] = useState<string>('');
  const [matchedPart, setMatchedPart] = useState<Part | null>(null);
  const [matchedPb, setMatchedPb] = useState<PriceBookEntry | null>(null);
  const [manualQuery, setManualQuery] = useState('');
  const [engineError, setEngineError] = useState<string | null>(null);

  // Reuse the app's original on-device barcode reader. This keeps barcode
  // decoding in the Android/WebView platform and avoids the later ZXing path
  // that stopped recognizing codes on the user's device.
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let scanInterval: ReturnType<typeof setInterval> | null = null;
    let detecting = false;
    let controls: IScannerControls | null = null;
    let lastValue = '';
    let lastValueAt = 0;

    if (isOpen) {
      setMatchedPart(null);
      setMatchedPb(null);
      setRecognizedText('');
      setCameraError(null);
      setScannerReady(false);
      setEngineError(null);
      resultLocked.current = false;

      const startZxing = async (video: HTMLVideoElement) => {
        try {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          controls = await new BrowserMultiFormatReader().decodeFromVideoElement(video, (result) => {
            if (!cancelled && !resultLocked.current && result) handleDetectedValue(result.getText());
          });
          if (cancelled) { controls.stop(); return; }
          if (!cancelled) setScannerReady(true);
        } catch {
          if (!cancelled) setEngineError('Barcode reader unavailable. Search by SKU below.');
        }
      };

      const startCamera = async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Camera access is not available in this app.');
          }

          const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });

          if (cancelled) {
            cameraStream.getTracks().forEach((track) => track.stop());
            return;
          }

          stream = cameraStream;
          const video = videoRef.current;
          if (!video) throw new Error('Camera preview is unavailable.');

          video.srcObject = cameraStream;
          video.muted = true;
          video.playsInline = true;
          await video.play();
          if (cancelled) return;

          const Detector = (window as any).BarcodeDetector;
          if (!Detector) {
            await startZxing(video);
            return;
          }

          const preferredFormats = [
            'qr_code',
            'ean_13',
            'ean_8',
            'code_128',
            'code_39',
            'upc_a',
            'upc_e',
          ];
          let formats = preferredFormats;
          if (typeof Detector.getSupportedFormats === 'function') {
            const supportedFormats = await Detector.getSupportedFormats();
            formats = preferredFormats.filter((format) => supportedFormats.includes(format));
          }
          if (!formats.length) {
            await startZxing(video);
            return;
          }

          const detector = new Detector({ formats });
          setScannerReady(true);
          scanInterval = setInterval(async () => {
            const activeVideo = videoRef.current;
            if (cancelled || resultLocked.current || detecting || !activeVideo || activeVideo.readyState < 2) return;

            detecting = true;
            try {
              const barcodes = await detector.detect(activeVideo);
              if (cancelled) return;
              const rawValue = barcodes[0]?.rawValue?.trim();
              const now = Date.now();
              if (rawValue && (rawValue !== lastValue || now - lastValueAt >= 2000)) {
                lastValue = rawValue;
                lastValueAt = now;
                handleDetectedValue(rawValue);
              }
            } catch (err) {
              console.warn('Part barcode detection error:', err);
              if (!cancelled) {
                setScannerReady(false);
                void startZxing(activeVideo);
              }
              if (scanInterval !== null) clearInterval(scanInterval);
              scanInterval = null;
            } finally {
              detecting = false;
            }
          }, 450);
        } catch (err) {
          if (cancelled) return;
          console.warn('Part scanner startup error:', err);
          if (videoRef.current && videoRef.current.readyState >= 2) {
            setEngineError('The barcode reader could not start on this device. You can still search by SKU below.');
          } else {
            setCameraError('Camera could not start. Check the app camera permission, then reopen the scanner.');
          }
        }
      };

      void startCamera();
    }

    return () => {
      cancelled = true;
      if (scanInterval !== null) clearInterval(scanInterval);
      controls?.stop();
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [isOpen]);

  function handleDetectedValue(val: string) {
    const clean = val.trim();
    if (!clean) return;
    resultLocked.current = true;

    setRecognizedText(clean);
    // 1. Check in-stock parts first
    const match = parts.find(
      (p) =>
        p.sku.toLowerCase() === clean.toLowerCase() ||
        p.sku.toLowerCase().replace(/[^a-z0-9]/g, '') === clean.toLowerCase().replace(/[^a-z0-9]/g, '')
    );

    if (match) {
      setMatchedPart(match);
      setMatchedPb(null);
    } else {
      setMatchedPart(null);
      // 2. Query OEM Master Price Books
      lookupPriceBookSku(clean).then((pb) => {
        setMatchedPb(pb);
      });

    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-orange-500 text-slate-950 font-black shadow-sm">
              <ScanIcon className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-white">Part Barcode Scanner</h3>
              <p className="text-[10px] text-slate-400">Scan a part barcode or QR code</p>
            </div>
          </div>
          <button
            type="button"
            data-modal-close="true"
            onClick={onClose}
            className="rounded-full bg-slate-800 p-1.5 text-xs font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Viewfinder Video Area */}
        <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
          {cameraError ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-xs text-orange-400 font-bold">{cameraError}</p>
              <p className="text-[11px] text-slate-400">
                You can type the part SKU directly into the manual search box below.
              </p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />

              {/* Viewfinder Target Overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="relative h-36 w-64 rounded-2xl border-2 border-dashed border-orange-400/80 bg-orange-500/5 shadow-inner">
                  {/* Corner Accents */}
                  <div className="absolute -left-1 -top-1 h-4 w-4 border-l-3 border-t-3 border-orange-400" />
                  <div className="absolute -right-1 -top-1 h-4 w-4 border-r-3 border-t-3 border-orange-400" />
                  <div className="absolute -bottom-1 -left-1 h-4 w-4 border-b-3 border-l-3 border-orange-400" />
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 border-b-3 border-r-3 border-orange-400" />

                  {/* Horizontal Red Laser Scan Line */}
                  <div className="absolute inset-x-2 top-1/2 h-0.5 bg-red-500 shadow-sm shadow-red-500/80 animate-pulse" />
                </div>
              </div>

            </>
          )}
        </div>

        {/* Scan Results & Part Matching Drawer */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900/90">
          <div className="flex flex-wrap gap-2">
            {resultLocked.current && <button type="button" onClick={() => { resultLocked.current = false; setRecognizedText(''); setMatchedPart(null); setMatchedPb(null); setEngineError(null); }} className="rounded-lg border border-slate-600 px-3 py-2 text-xs">Retry barcode</button>}
          </div>
          {!cameraError && !engineError && !recognizedText && (
            <p className="text-center text-[11px] font-semibold text-slate-400" role="status">
              {scannerReady
                ? 'Barcode reader active — hold the code steady inside the frame.'
                : 'Starting barcode reader…'}
            </p>
          )}
          {engineError && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-200">
              {engineError}
            </div>
          )}
          {/* Matched Part in Catalog */}
          {matchedPart ? (
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-950/20 p-4 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-300 border border-emerald-500/30">
                    <CheckIcon className="h-3 w-3" /> In Catalog Match
                  </span>
                  <h4 className="text-sm font-black text-white mt-1">{matchedPart.name}</h4>
                  <p className="font-mono text-xs text-orange-400 font-bold">SKU: {matchedPart.sku}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-emerald-400">{money(matchedPart.sell_price)}</p>
                  <p className="text-[10px] text-slate-400">Cost: {money(matchedPart.cost_price)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Bin / Shelf</span>
                  <span className="font-semibold text-slate-200">{matchedPart.location || 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Qty on Hand</span>
                  <span className={`font-bold ${num(matchedPart.qty_on_hand) <= num(matchedPart.reorder_point) ? 'text-orange-400' : 'text-slate-100'}`}>
                    {matchedPart.qty_on_hand} in stock
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {onSelectPart && (
                  <Button
                    variant="accent"
                    className="flex-1 text-xs font-bold py-1.5"
                    onClick={() => {
                      onSelectPart(matchedPart);
                      onClose();
                    }}
                  >
                    Select Part
                  </Button>
                )}

                {onAdjustStock && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onAdjustStock(matchedPart, 1)}
                      className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 active:scale-95"
                    >
                      +1 Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => onAdjustStock(matchedPart, -1)}
                      className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 active:scale-95"
                    >
                      -1 Stock
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : matchedPb ? (
            /* Matched in OEM Price Book */
            <div className="rounded-2xl border-2 border-purple-500/40 bg-purple-950/20 p-4 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-purple-300 border border-purple-500/30">
                    <BookOpenIcon className="h-3 w-3" /> Found in {matchedPb.brand || matchedPb.manufacturer} Price Book
                  </span>
                  <h4 className="text-sm font-black text-white mt-1">{matchedPb.name}</h4>
                  <p className="font-mono text-xs text-orange-400 font-bold">SKU: {matchedPb.sku}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-purple-300">{money(matchedPb.sell_price)}</p>
                  <p className="text-[10px] text-slate-400">Cost: {money(matchedPb.cost_price)}</p>
                </div>
              </div>

              <p className="text-xs text-slate-300">
                This item is verified in your OEM price book but not currently in stocking inventory.
              </p>

              {onAddNewPart && (
                <Button
                  variant="accent"
                  className="w-full text-xs font-bold flex items-center justify-center gap-1.5 py-2"
                  onClick={() => {
                    onAddNewPart(matchedPb.sku);
                    onClose();
                  }}
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>Add {matchedPb.sku} to Shop Inventory</span>
                </Button>
              )}
            </div>
          ) : recognizedText ? (
            /* Recognized SKU not in catalog */
            <div className="rounded-2xl border border-orange-500/30 bg-orange-950/20 p-4 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                    Detected Part Number
                  </p>
                  <p className="font-mono text-base font-black text-white mt-0.5">{recognizedText}</p>
                </div>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                  Not in Catalog
                </span>
              </div>

              <p className="text-xs text-slate-300">
                This SKU is not currently in your inventory. Would you like to add it as a new stock item?
              </p>

              {onAddNewPart && (
                <Button
                  variant="accent"
                  className="w-full text-xs font-bold flex items-center justify-center gap-1.5"
                  onClick={() => {
                    onAddNewPart(recognizedText);
                    onClose();
                  }}
                >
                  <PlusIcon className="h-4 w-4" />
                  <span>Add SKU "{recognizedText}" to Inventory</span>
                </Button>
              )}
            </div>
          ) : (
            /* Default Hint */
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-center space-y-1">
              <p className="text-xs font-bold text-slate-300">
                Align the part barcode or QR code within the targeting frame.
              </p>
              <p className="text-[11px] text-slate-500">
                Auto-matches against all {parts.length} part numbers in your catalog.
              </p>
            </div>
          )}

          {/* Quick Manual Entry Fallback */}
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Manual SKU Search
            </label>
            <div className="flex gap-2">
              <Input
                value={manualQuery}
                onChange={(e) => {
                  setManualQuery(e.target.value);
                  if (e.target.value.trim().length >= 2) {
                    handleDetectedValue(e.target.value.trim());
                  }
                }}
                placeholder="Type SKU or part number…"
                className="bg-slate-800 text-white text-xs"
              />
              <Button
                variant="ghost"
                className="text-xs text-slate-300 border border-slate-700 hover:bg-slate-800 shrink-0"
                onClick={() => {
                  if (manualQuery.trim()) handleDetectedValue(manualQuery.trim());
                }}
              >
                Search
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
