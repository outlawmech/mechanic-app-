import { useState, useRef, useEffect, useCallback } from 'react';
import { ScanIcon, VehicleIcon, CheckIcon, WrenchIcon, SparklesIcon } from './icons';
import { Button, Spinner } from './ui';
import { decodeVehicleVIN, type DecodedVehicleInfo } from '../lib/vinDecoder';
import { BarcodeEngine } from '../lib/barcodeEngine';
import { recognizeText } from '../lib/ocrEngine';

export interface VinScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVinDetected: (vin: string, decodedInfo?: DecodedVehicleInfo) => void;
}

function extractVehicleId(raw: string): string {
  for (const line of raw.toUpperCase().split(/[\r\n]+/)) {
    const compact = line
      .replace(/^\s*(?:VIN|HIN)\s*[:#-]?\s*/, '')
      .replace(/[^A-Z0-9]/g, '');
    const corrected = compact.replace(/[IOQ]/g, (letter) => (letter === 'I' ? '1' : '0'));
    if (compact.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(compact)) return compact;
    if (corrected.length === 17 && /^[A-HJ-NPR-Z0-9]{17}$/.test(corrected)) return corrected;
    if (compact.length === 12 && /^[A-Z0-9]{12}$/.test(compact)) return compact;
    if (corrected.length === 12 && /^[A-Z0-9]{12}$/.test(corrected)) return corrected;
  }
  return '';
}

export default function VinScannerModal({
  isOpen,
  onClose,
  onVinDetected,
}: VinScannerModalProps) {
  const [scanMode, setScanMode] = useState<'barcode' | 'ocr'>('barcode');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [detectedVin, setDetectedVin] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [decodedInfo, setDecodedInfo] = useState<DecodedVehicleInfo | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const barcodeEngineRef = useRef<BarcodeEngine | null>(null);

  const handleFoundVin = useCallback(
    async (rawVin: string) => {
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
    },
    []
  );

  // Initialize Camera Stream
  useEffect(() => {
    let stream: MediaStream | null = null;

    if (isOpen) {
      setDetectedVin('');
      setDecodedInfo(null);
      setCameraError(null);
      setEngineError(null);

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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

      // Live Barcode Scanner (ZXing — works in the Android WebView)
      if (scanMode === 'barcode' && videoRef.current) {
        const engine = new BarcodeEngine({
          formats: ['CODE_39', 'CODE_128', 'PDF_417', 'QR_CODE'],
          tryHarder: true,
          onResult: ({ text }) => {
            const candidate = extractVehicleId(text);
            if (candidate) void handleFoundVin(candidate);
          },
          onReady: () => setEngineError(null),
          onError: (err) => {
            console.warn('Barcode engine error:', err);
            setEngineError(
              'Barcode reader could not start. Close and reopen this screen; if it keeps failing, type the VIN in below.'
            );
          },
        });
        barcodeEngineRef.current = engine;
        void engine.start(videoRef.current);
      }
    }

    return () => {
      barcodeEngineRef.current?.stop();
      barcodeEngineRef.current = null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      activeStreamRef.current = null;
      setCameraActive(false);
    };
  }, [isOpen, scanMode, handleFoundVin]);

  // OCR VIN Frame Capture (Tesseract WASM)
  async function captureAndReadOCR() {
    if (!videoRef.current || !canvasRef.current) return;
    setScanning(true);

    try {
      setEngineError(null);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not prepare the camera image.');
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        throw new Error('The camera image is not ready yet.');
      }

      // Crop to the center target and enlarge it so small stamped characters
      // occupy more pixels before OCR.
      const cropWidth = Math.round(video.videoWidth * 0.88);
      const cropHeight = Math.round(video.videoHeight * 0.52);
      const sx = Math.round((video.videoWidth - cropWidth) / 2);
      const sy = Math.round((video.videoHeight - cropHeight) / 2);
      canvas.width = cropWidth * 2;
      canvas.height = cropHeight * 2;
      ctx.drawImage(video, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
        const enhanced = gray > 128 ? Math.min(255, (gray - 128) * 1.45 + 128) : Math.max(0, (gray - 128) * 1.45 + 128);
        image.data[i] = enhanced;
        image.data[i + 1] = enhanced;
        image.data[i + 2] = enhanced;
      }
      ctx.putImageData(image, 0, 0);

      const text = await recognizeText(canvas);
      const candidate = extractVehicleId(text);
      if (candidate) {
        setEngineError(null);
        await handleFoundVin(candidate);
      } else {
        setEngineError('No clear VIN or HIN was found. Center the stamped characters in the frame, steady the camera, and try again.');
      }
    } catch (err) {
      console.warn('OCR error:', err);
      setEngineError(
        'Text reader could not start on this device. You can still type the VIN in below.'
      );
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
          {engineError && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-200">
              {engineError}
            </div>
          )}
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
