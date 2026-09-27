import { useState, useRef, useEffect } from 'react';
import { ScanIcon, VehicleIcon, CheckIcon, WrenchIcon, SparklesIcon } from './icons';
import { Button, Spinner } from './ui';
import { decodeVehicleVIN, type DecodedVehicleInfo } from '../lib/vinDecoder';

export interface VinScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVinDetected: (vin: string, decodedInfo?: DecodedVehicleInfo) => void;
}

export default function VinScannerModal({
  isOpen,
  onClose,
  onVinDetected,
}: VinScannerModalProps) {
  const [scanMode, setScanMode] = useState<'barcode' | 'ocr'>('barcode');
  const [torchOn, setTorchOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [detectedVin, setDetectedVin] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [decodedInfo, setDecodedInfo] = useState<DecodedVehicleInfo | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Initialize Camera Stream
  useEffect(() => {
    let stream: MediaStream | null = null;
    let scanInterval: any = null;

    if (isOpen) {
      setDetectedVin('');
      setDecodedInfo(null);
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
            'Camera permission is required for live VIN barcode scanning. You can also type the VIN manually.'
          );
        });

      // Live Barcode Scanner
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ['code_39', 'code_128', 'data_matrix', 'qr_code', 'pdf417'],
          });

          scanInterval = setInterval(async () => {
            if (scanMode === 'barcode' && videoRef.current && videoRef.current.readyState >= 2) {
              try {
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes.length > 0) {
                  for (const b of barcodes) {
                    const raw = b.rawValue?.trim();
                    if (raw && (raw.length === 17 || raw.length === 12)) {
                      handleFoundVin(raw);
                      break;
                    }
                  }
                }
              } catch {}
            }
          }, 400);
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

  async function handleFoundVin(rawVin: string) {
    const clean = rawVin.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return;
    setDetectedVin(clean);
    setDecoding(true);

    try {
      const info = await decodeVehicleVIN(clean);
      setDecodedInfo(info);
    } catch {
      setDecodedInfo(null);
    } finally {
      setDecoding(false);
    }
  }

  // Toggle Torch/Flashlight
  async function toggleTorch() {
    const nextState = !torchOn;
    let success = false;

    const currentStream = activeStreamRef.current || (videoRef.current?.srcObject as MediaStream | null);
    if (currentStream) {
      const tracks = currentStream.getVideoTracks();
      for (const track of tracks) {
        try {
          await track.applyConstraints({
            advanced: [{ torch: nextState } as any],
          });
          success = true;
        } catch {
          try {
            await (track as any).applyConstraints({ torch: nextState });
            success = true;
          } catch (err) {
            console.warn('Torch constraint error:', err);
          }
        }
      }
    }

    if (typeof window !== 'undefined' && (window as any).AndroidNativeFlashlight) {
      try {
        const res = (window as any).AndroidNativeFlashlight.setTorch(nextState);
        if (res) success = true;
      } catch {}
    }

    setTorchOn(nextState);
  }

  // OCR VIN Frame Capture
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
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if ('TextDetector' in window) {
        const textDetector = new (window as any).TextDetector();
        const detectedTexts = await textDetector.detect(canvas);
        for (const t of detectedTexts) {
          const raw = t.rawValue?.trim() || '';
          const vinMatches = raw.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i) || raw.match(/\b[A-Z0-9]{12}\b/i);
          if (vinMatches && vinMatches[0]) {
            handleFoundVin(vinMatches[0]);
            break;
          }
        }
      }
    } catch (err) {
      console.warn('OCR error:', err);
    } finally {
      setScanning(false);
    }
  }

  function handleAccept() {
    if (!detectedVin) return;
    onVinDetected(detectedVin, decodedInfo || undefined);
    onClose();
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
              <h3 className="text-sm font-black text-white">VIN &amp; Marine HIN Scanner</h3>
              <p className="text-[10px] text-slate-400">Scan door jamb sticker, frame stamp, or title barcode</p>
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

        {/* Mode Selector */}
        <div className="grid grid-cols-2 p-2 bg-slate-950/80 border-b border-slate-800 text-xs font-bold gap-1.5">
          <button
            type="button"
            onClick={() => setScanMode('barcode')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl transition ${
              scanMode === 'barcode'
                ? 'bg-orange-500 text-slate-950 font-black shadow-xs'
                : 'text-slate-400 hover:text-white bg-slate-800/40'
            }`}
          >
            <span>📷 Barcode (Door / Frame)</span>
          </button>
          <button
            type="button"
            onClick={() => setScanMode('ocr')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl transition ${
              scanMode === 'ocr'
                ? 'bg-orange-500 text-slate-950 font-black shadow-xs'
                : 'text-slate-400 hover:text-white bg-slate-800/40'
            }`}
          >
            <span>🔤 Stamped Text / Neck</span>
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative flex-1 bg-black overflow-hidden min-h-[260px] max-h-[340px] flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Reticle */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="relative h-28 w-full max-w-sm rounded-2xl border-2 border-dashed border-orange-400/80 bg-orange-500/5 shadow-2xl">
              <div className="absolute -top-6 inset-x-0 text-center">
                <span className="rounded-full bg-slate-950/80 px-2.5 py-0.5 text-[10px] font-bold text-orange-400 uppercase tracking-wider backdrop-blur-xs">
                  {scanMode === 'barcode' ? 'Align VIN Barcode Inside Frame' : 'Align 17-Digit Text Stamping'}
                </span>
              </div>
              <div className="absolute inset-x-2 top-1/2 h-0.5 bg-red-500 shadow-sm shadow-red-500/80 animate-pulse" />
            </div>
          </div>

          {/* Flashlight Button */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            <button
              type="button"
              onClick={toggleTorch}
              className={`rounded-xl px-3 py-1.5 text-xs font-black transition shadow-lg flex items-center gap-1.5 ${
                torchOn
                  ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 shadow-amber-400/50'
                  : 'bg-slate-900/80 text-white hover:bg-slate-800 ring-1 ring-white/20'
              }`}
            >
              <span>💡</span>
              <span>{torchOn ? 'Flash ON' : 'Flash'}</span>
            </button>
          </div>

          {/* OCR Capture Button */}
          {scanMode === 'ocr' && (
            <div className="absolute bottom-3 inset-x-0 flex justify-center">
              <button
                type="button"
                onClick={captureAndReadOCR}
                disabled={scanning}
                className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-xs font-black text-slate-950 shadow-xl shadow-orange-500/30 hover:bg-orange-400 active:scale-95 transition"
              >
                <ScanIcon className="h-4 w-4" />
                <span>{scanning ? 'Reading Stamped VIN…' : '📸 Read VIN Stamp'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Results & Auto-Fill Bottom Card */}
        <div className="p-4 bg-slate-950 space-y-3 border-t border-slate-800">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Scanned VIN / HIN
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={detectedVin}
                onChange={(e) => handleFoundVin(e.target.value)}
                placeholder="Scan or type 17-digit VIN / 12-digit HIN…"
                className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 font-mono text-sm font-bold text-white uppercase placeholder-slate-500 focus:border-orange-500 outline-none"
              />
              {detectedVin && (
                <button
                  type="button"
                  onClick={() => handleFoundVin(detectedVin)}
                  disabled={decoding}
                  className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-orange-400 hover:bg-slate-700"
                >
                  {decoding ? <Spinner /> : 'Decode'}
                </button>
              )}
            </div>
          </div>

          {/* Decoded Specs Card */}
          {decodedInfo && (
            <div className="rounded-2xl bg-slate-900 border border-slate-700 p-3 text-xs space-y-1.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <VehicleIcon className="h-4 w-4 text-orange-400" />
                  <span>
                    {decodedInfo.year} {decodedInfo.make} {decodedInfo.model}
                  </span>
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-400">
                  NHTSA Verified
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                {decodedInfo.trim && <span>Trim: {decodedInfo.trim}</span>}
                {decodedInfo.engine_info && <span>Engine: {decodedInfo.engine_info}</span>}
                {decodedInfo.vehicle_type && (
                  <span className="capitalize">Type: {decodedInfo.vehicle_type}</span>
                )}
              </div>
            </div>
          )}

          {/* Auto-Fill Action */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-900"
            >
              Cancel
            </button>
            <Button
              variant="accent"
              onClick={handleAccept}
              disabled={!detectedVin.trim()}
              className="text-xs font-black shadow-lg shadow-orange-500/20"
            >
              <CheckIcon className="h-4 w-4" />
              <span>Auto-Fill Vehicle Info →</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
