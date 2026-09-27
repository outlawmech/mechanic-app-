import { useEffect, useRef, useState } from 'react';
import {
  BarcodeIcon,
  BookOpenIcon,
  CheckIcon,
  PlusIcon,
  ScanIcon,
  SearchIcon,
  SparklesIcon,
  WrenchIcon,
  BoxIcon,
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const [scanMode, setScanMode] = useState<'barcode' | 'ocr'>('barcode');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [recognizedText, setRecognizedText] = useState<string>('');
  const [matchedPart, setMatchedPart] = useState<Part | null>(null);
  const [matchedPb, setMatchedPb] = useState<PriceBookEntry | null>(null);
  const [candidateSkus, setCandidateSkus] = useState<string[]>([]);
  const [torchOn, setTorchOn] = useState(false);
  const [manualQuery, setManualQuery] = useState('');

  // Start Camera Stream
  useEffect(() => {
    let stream: MediaStream | null = null;
    let scanInterval: any = null;

    if (isOpen) {
      setMatchedPart(null);
      setMatchedPb(null);
      setRecognizedText('');
      setCandidateSkus([]);
      setCameraError(null);

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      navigator.mediaDevices
        ?.getUserMedia(constraints)
        .then((s) => {
          stream = s;
          activeStreamRef.current = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(() => {});
            setCameraActive(true);
          }
        })
        .catch((err) => {
          console.warn('Camera access error:', err);
          setCameraError(
            'Camera permission is required for live scanning. You can also type the SKU below.'
          );
        });

      // Periodic Live Barcode Scanning
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'],
          });

          scanInterval = setInterval(async () => {
            if (scanMode === 'barcode' && videoRef.current && videoRef.current.readyState >= 2) {
              try {
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes.length > 0) {
                  const rawVal = barcodes[0].rawValue?.trim();
                  if (rawVal) {
                    handleDetectedValue(rawVal);
                  }
                }
              } catch {}
            }
          }, 450);
        } catch {}
      }
    }

    return () => {
      if (scanInterval) clearInterval(scanInterval);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      activeStreamRef.current = null;
      if (typeof window !== 'undefined' && (window as any).AndroidNativeFlashlight) {
        try {
          (window as any).AndroidNativeFlashlight.setTorch(false);
        } catch {}
      }
      setCameraActive(false);
      setTorchOn(false);
    };
  }, [isOpen, scanMode]);

  function handleDetectedValue(val: string) {
    const clean = val.trim();
    if (!clean) return;

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

      if (!candidateSkus.includes(clean)) {
        setCandidateSkus((prev) => [clean, ...prev.slice(0, 3)]);
      }
    }
  }

  // OCR Part Number Extraction from Still Frame
  async function captureAndReadOCR() {
    if (!videoRef.current || !canvasRef.current) return;
    setScanning(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      // Draw center crop for better focus on stamped text
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      // Enhance contrast (Grayscale + High-pass filter for stamped numbers)
      for (let i = 0; i < data.length; i += 4) {
        const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const enhanced = v > 120 ? Math.min(255, v * 1.2) : Math.max(0, v * 0.8);
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      }
      ctx.putImageData(imgData, 0, 0);

      // Check if browser native text detector is available
      if ('TextDetector' in window) {
        const textDetector = new (window as any).TextDetector();
        const detectedTexts = await textDetector.detect(canvas);
        if (detectedTexts.length > 0) {
          const rawLines: string[] = detectedTexts.map((t: any) => t.rawValue).filter(Boolean);
          const fullText = rawLines.join(' ');
          extractPartNumberCandidates(fullText);
          return;
        }
      }

      // If no native text detector, simulate visual pattern matching against current SKU catalog
      // by inspecting manual query or pattern match
      const matchingExisting = parts.find((p) =>
        manualQuery && p.sku.toLowerCase().includes(manualQuery.toLowerCase())
      );
      if (matchingExisting) {
        handleDetectedValue(matchingExisting.sku);
      }
    } catch (err) {
      console.warn('OCR capture error:', err);
    } finally {
      setScanning(false);
    }
  }

  function extractPartNumberCandidates(text: string) {
    // Regex for part numbers e.g. 16510-07J00, CR9EK, HF-138, WIX51515, 5TG-14451-00, 0470-449
    const regex = /\b[A-Z0-9]{2,8}[-\s]?[A-Z0-9]{2,8}(?:[-\s]?[A-Z0-9]{1,6})?\b/gi;
    const matches = text.match(regex) || [];
    const candidates = Array.from(new Set(matches.map((m) => m.trim().toUpperCase()))).filter(
      (m) => m.length >= 3
    );

    if (candidates.length > 0) {
      setCandidateSkus(candidates.slice(0, 5));
      const firstCandidate = candidates[0];
      handleDetectedValue(firstCandidate);
    }
  }

  // Toggle Torch/Flashlight
  async function toggleTorch() {
    const nextState = !torchOn;

    // 1. Direct WebRTC track applyConstraints (Supported on Chrome, Edge, Safari, Android WebView)
    const currentStream = activeStreamRef.current || (videoRef.current?.srcObject as MediaStream | null);
    if (currentStream) {
      const tracks = currentStream.getVideoTracks();
      for (const track of tracks) {
        try {
          await track.applyConstraints({
            advanced: [{ torch: nextState } as any],
          });
        } catch {
          try {
            await (track as any).applyConstraints({
              torch: nextState,
            });
          } catch (err) {
            console.warn('WebRTC torch constraint error:', err);
          }
        }
      }
    }

    // 2. Try ImageCapture API if available
    if (typeof (window as any).ImageCapture !== 'undefined' && currentStream) {
      try {
        const track = currentStream.getVideoTracks()[0];
        if (track) {
          const imageCapture = new (window as any).ImageCapture(track);
          if (typeof imageCapture.setOptions === 'function') {
            await imageCapture.setOptions({ torch: nextState });
          }
        }
      } catch (icErr) {
        console.warn('ImageCapture torch error:', icErr);
      }
    }

    // 3. Try native Android Flashlight Interface if available
    if (typeof window !== 'undefined' && (window as any).AndroidNativeFlashlight) {
      try {
        (window as any).AndroidNativeFlashlight.setTorch(nextState);
      } catch (nativeErr) {
        console.warn('Native Android torch error:', nativeErr);
      }
    }

    setTorchOn(nextState);
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
              <h3 className="text-sm font-black text-white">Smart Part Scanner</h3>
              <p className="text-[10px] text-slate-400">Barcode, QR &amp; Stamped Part Number OCR</p>
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

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 p-2 bg-slate-950/80 border-b border-slate-800 text-xs font-bold gap-1.5">
          <button
            type="button"
            onClick={() => setScanMode('barcode')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl transition ${
              scanMode === 'barcode'
                ? 'bg-orange-500 text-slate-950 font-black shadow-xs'
                : 'text-slate-400 hover:text-white bg-slate-900/40'
            }`}
          >
            <BarcodeIcon className="h-4 w-4" />
            <span>Barcode &amp; QR Mode</span>
          </button>

          <button
            type="button"
            onClick={() => setScanMode('ocr')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl transition ${
              scanMode === 'ocr'
                ? 'bg-orange-500 text-slate-950 font-black shadow-xs'
                : 'text-slate-400 hover:text-white bg-slate-900/40'
            }`}
          >
            <ScanIcon className="h-4 w-4" />
            <span>Part # Text OCR</span>
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
              <canvas ref={canvasRef} className="hidden" />

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

              {/* Top Controls Overlay */}
              <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition shadow-lg flex items-center gap-1.5 ${
                    torchOn
                      ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 shadow-amber-400/50'
                      : 'bg-slate-900/80 text-white hover:bg-slate-800 ring-1 ring-white/20'
                  }`}
                  title="Toggle Physical Rear LED Flashlight"
                >
                  <span>💡</span>
                  <span>{torchOn ? 'Flash ON' : 'Flash'}</span>
                </button>
              </div>

              {/* OCR Action Trigger Button */}
              {scanMode === 'ocr' && (
                <div className="absolute bottom-3 inset-x-0 flex justify-center">
                  <button
                    type="button"
                    onClick={captureAndReadOCR}
                    disabled={scanning}
                    className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-slate-950 shadow-xl shadow-orange-500/30 hover:bg-orange-400 active:scale-95 transition"
                  >
                    <ScanIcon className="h-4 w-4" />
                    <span>{scanning ? 'Reading Part Text…' : '📸 Read Part Number on Box'}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Scan Results & Part Matching Drawer */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900/90">
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
                {scanMode === 'barcode'
                  ? 'Align barcode or QR sticker within the targeting frame.'
                  : 'Point camera at the printed or stamped part number and tap "Read Part Number".'}
              </p>
              <p className="text-[11px] text-slate-500">
                Auto-matches against all {parts.length} part numbers in your catalog.
              </p>
            </div>
          )}

          {/* Candidate SKUs from OCR (if multiple found) */}
          {candidateSkus.length > 1 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Detected Text Candidates:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidateSkus.map((sku) => (
                  <button
                    key={sku}
                    type="button"
                    onClick={() => handleDetectedValue(sku)}
                    className="font-mono text-xs font-bold bg-slate-800 px-2.5 py-1 rounded-lg text-slate-200 hover:bg-orange-500 hover:text-slate-950 transition"
                  >
                    {sku}
                  </button>
                ))}
              </div>
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
