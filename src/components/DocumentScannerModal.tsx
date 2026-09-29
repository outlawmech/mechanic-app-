import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { extractVin, fileAsImage, parseIdCard, readBarcodeImage, recognizeImage, vinCheckDigitMatches, type ScannedId } from '../lib/scanRecognition';

type Props = {
  mode: 'vin' | 'id';
  onClose: () => void;
  onVin?: (vin: string) => void;
  onId?: (id: ScannedId) => void;
};

export default function DocumentScannerModal({ mode, onClose, onVin, onId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultLocked = useRef(false);
  const [message, setMessage] = useState('Starting camera…');
  const [busy, setBusy] = useState(false);
  const [vin, setVin] = useState('');
  const [id, setId] = useState<ScannedId>({ firstName: '', lastName: '', address: '' });

  function acceptRaw(raw: string): boolean {
    if (resultLocked.current) return true;
    if (mode === 'vin') {
      const found = extractVin(raw);
      if (!found) return false;
      resultLocked.current = true;
      setVin(found);
      setMessage('Check the 17 characters against the vehicle before using them.');
      return true;
    }
    const found = parseIdCard(raw);
    if (!found) return false;
    resultLocked.current = true;
    setId(found);
    setMessage('Review the name and address against the card before using them.');
    return true;
  }

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    let controls: IScannerControls | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let detecting = false;
    const start = async () => {
      try {
        const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!active) { camera.getTracks().forEach((track) => track.stop()); return; }
        stream = camera;
        const video = videoRef.current;
        if (!video) throw new Error('Camera preview unavailable.');
        video.srcObject = camera;
        await video.play();
        const Detector = (window as any).BarcodeDetector;
        const formats = mode === 'id' ? ['pdf417'] : ['code_39', 'code_128', 'pdf417', 'qr_code'];
        let supported: string[] = [];
        if (Detector) {
          try { supported = await Detector.getSupportedFormats?.() || formats; } catch { /* ZXing fallback */ }
        }
        const available = formats.filter((format) => supported.includes(format));
        if (active && available.length) {
          const detector = new Detector({ formats: available });
          setMessage('Aim at the barcode. Use Capture text if it is damaged or absent.');
          interval = setInterval(async () => {
            if (!active || detecting || video.readyState < 2) return;
            detecting = true;
            try {
              const result = await detector.detect(video);
              if (active && result[0]?.rawValue) acceptRaw(result[0].rawValue);
            } catch { /* Camera frames are allowed to fail; the capture button remains available. */ }
            finally { detecting = false; }
          }, 600);
        } else if (active) {
          setMessage('Aim at the barcode. Use Capture text if it is damaged or absent.');
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          controls = await new BrowserMultiFormatReader().decodeFromVideoElement(video, (result) => {
            if (active && result) acceptRaw(result.getText());
          });
          if (!active) { controls.stop(); return; }
        }
      } catch {
        if (active) setMessage('Camera unavailable. Use Take / choose photo or enter the details manually.');
      }
    };
    void start();
    return () => {
      active = false;
      if (interval) clearInterval(interval);
      controls?.stop();
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [mode]);

  async function processFile(file: File) {
    setBusy(true);
    try {
      const { image, release } = await fileAsImage(file);
      try {
        const barcode = await readBarcodeImage(image);
        if (barcode && acceptRaw(barcode)) return;
        const text = await recognizeImage(file);
        if (!acceptRaw(text)) setMessage('Could not find the required fields. Retake a clear, close photo or type them manually.');
      } finally { release(); }
    } catch { setMessage('Could not read that image. Retake it or enter the details manually.'); }
    finally { setBusy(false); }
  }

  async function captureText() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) { setMessage('Camera is not ready. Take or choose a photo instead.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setBusy(true);
    try {
      const text = await recognizeImage(canvas);
      if (!acceptRaw(text)) setMessage('No clear result. Move closer, improve lighting, or type the details manually.');
    } catch { setMessage('Text recognition could not start. Use a photo or type the details manually.'); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={mode === 'vin' ? 'Scan VIN' : 'Scan customer ID'}
      className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 space-y-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="font-bold text-lg">{mode === 'vin' ? 'Scan VIN' : 'Scan customer ID'}</h2>
        <button type="button" aria-label="Close scanner" onClick={onClose}>✕</button></div>
      <p className="text-xs text-slate-600">{mode === 'id' ? 'Scan the PDF417 barcode on the back of the ID, or photograph its front. Only name and address will be copied.' : 'Aim at the windshield or door barcode. For printed VIN text, use Capture text.'}</p>
      <video ref={videoRef} muted playsInline className="w-full aspect-video rounded-xl bg-black object-cover" />
      <p role="status" className="text-xs text-slate-600">{busy ? 'Reading image on this device…' : message}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={captureText} className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold disabled:opacity-50">Capture text</button>
        <label className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold cursor-pointer">Take / choose photo
          <input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; if (file) void processFile(file); e.target.value = ''; }} />
        </label>
      </div>
      {mode === 'vin' ? <div className="space-y-2">
        <label className="block text-xs font-bold">Review VIN</label>
        <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} maxLength={17} className="w-full rounded-lg border p-2 font-mono" placeholder="17-character VIN" />
        {vin.length === 17 && !vinCheckDigitMatches(vin) && <p className="text-xs text-amber-700">VIN check digit differs. Confirm every character against the vehicle before using it.</p>}
        <button type="button" disabled={!extractVin(vin) || vin.length !== 17} onClick={() => { onVin?.(vin); onClose(); }} className="rounded-lg bg-orange-500 px-4 py-2 font-bold disabled:opacity-50">Use VIN</button>
      </div> : <div className="space-y-2">
        {(['firstName', 'lastName', 'address'] as const).map((key) => <label key={key} className="block text-xs font-bold">{key === 'firstName' ? 'First name' : key === 'lastName' ? 'Last name' : 'Address'}
          <input value={id[key]} onChange={(e) => setId((prev) => ({ ...prev, [key]: e.target.value }))} className="mt-1 w-full rounded-lg border p-2 font-normal" />
        </label>)}
        <button type="button" disabled={!id.firstName.trim() || !id.lastName.trim()} onClick={() => { onId?.(id); onClose(); }} className="rounded-lg bg-orange-500 px-4 py-2 font-bold disabled:opacity-50">Use customer details</button>
      </div>}
    </div>
  </div>;
}
