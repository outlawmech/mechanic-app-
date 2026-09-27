import { useState, useRef, useEffect } from 'react';
import { ScanIcon, UsersIcon, CheckIcon, MapPinIcon } from './icons';
import { Button } from './ui';
import { parseAAMVA, type ParsedDriverLicense } from '../lib/aamvaParser';

export interface IdCardScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIdDetected: (idData: ParsedDriverLicense) => void;
}

export default function IdCardScannerModal({
  isOpen,
  onClose,
  onIdDetected,
}: IdCardScannerModalProps) {
  const [torchOn, setTorchOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedId, setScannedId] = useState<ParsedDriverLicense | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Initialize Camera Stream
  useEffect(() => {
    let stream: MediaStream | null = null;
    let scanInterval: any = null;

    if (isOpen) {
      setScannedId(null);
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
            'Camera permission is required to scan driver license barcodes. You can also enter customer details manually.'
          );
        });

      // PDF417 Live Barcode Scanner
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ['pdf417', 'qr_code'],
          });

          scanInterval = setInterval(async () => {
            if (videoRef.current && videoRef.current.readyState >= 2) {
              try {
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes.length > 0) {
                  for (const b of barcodes) {
                    const raw = b.rawValue?.trim();
                    if (raw) {
                      const parsed = parseAAMVA(raw);
                      if (parsed) {
                        setScannedId(parsed);
                        break;
                      }
                    }
                  }
                }
              } catch {}
            }
          }, 350);
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
  }, [isOpen]);

  // Toggle Torch/Flashlight
  async function toggleTorch() {
    const nextState = !torchOn;

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
            await (track as any).applyConstraints({ torch: nextState });
          } catch (err) {
            console.warn('Torch constraint error:', err);
          }
        }
      }
    }

    if (typeof window !== 'undefined' && (window as any).AndroidNativeFlashlight) {
      try {
        (window as any).AndroidNativeFlashlight.setTorch(nextState);
      } catch {}
    }

    setTorchOn(nextState);
  }

  function handleAccept() {
    if (!scannedId) return;
    onIdDetected(scannedId);
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
              <UsersIcon className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-white">Driver's License / ID Scanner</h3>
              <p className="text-[10px] text-slate-400">Scan dense PDF417 barcode on back of US/CA ID</p>
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

        {/* Viewfinder Area */}
        <div className="relative flex-1 bg-black overflow-hidden min-h-[260px] max-h-[340px] flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />

          {/* Reticle */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="relative h-32 w-full max-w-sm rounded-2xl border-2 border-dashed border-orange-400/80 bg-orange-500/5 shadow-2xl">
              <div className="absolute -top-6 inset-x-0 text-center">
                <span className="rounded-full bg-slate-950/80 px-2.5 py-0.5 text-[10px] font-bold text-orange-400 uppercase tracking-wider backdrop-blur-xs">
                  Align Back of ID Barcode Inside Frame
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
        </div>

        {/* Results & Auto-Fill Bottom Card */}
        <div className="p-4 bg-slate-950 space-y-3 border-t border-slate-800">
          {scannedId ? (
            <div className="rounded-2xl bg-slate-900 border border-slate-700 p-3.5 text-xs space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-white">{scannedId.fullName}</p>
                  {scannedId.licenseNumber && (
                    <p className="text-[11px] font-mono text-slate-400">
                      DL / ID #{scannedId.licenseNumber} ({scannedId.state})
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-400">
                  AAMVA Verified
                </span>
              </div>

              <div className="border-t border-slate-800 pt-2 space-y-1 text-slate-300">
                <p className="flex items-center gap-1.5 text-slate-400">
                  <MapPinIcon className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                  <span className="text-white font-medium">{scannedId.fullAddress || `${scannedId.streetAddress}, ${scannedId.city}, ${scannedId.state} ${scannedId.postalCode}`}</span>
                </p>
                {scannedId.dateOfBirth && (
                  <p className="text-[11px] text-slate-400">
                    DOB: <span className="text-slate-200 font-mono">{scannedId.dateOfBirth}</span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 text-center">
              <p className="text-xs text-slate-400">
                Point camera at the large rectangular barcode on the back of any state driver's license.
              </p>
            </div>
          )}

          {/* Action Buttons */}
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
              disabled={!scannedId}
              className="text-xs font-black shadow-lg shadow-orange-500/20"
            >
              <CheckIcon className="h-4 w-4" />
              <span>Auto-Fill Customer Info →</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
