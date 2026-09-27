import { useRef, useState, useEffect } from 'react';
import { Button } from './ui';
import { CheckIcon, TrashIcon } from './icons';

interface SignaturePadProps {
  onSave: (signatureDataUrl: string, signerName: string) => void;
  onCancel?: () => void;
  defaultName?: string;
  title?: string;
}

export default function SignaturePad({
  onSave,
  onCancel,
  defaultName = '',
  title = 'Customer Signature & Authorization',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signerName, setSignerName] = useState(defaultName);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    if ('clientX' in e) {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
    return { x: 0, y: 0 };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e?: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    if (e) e.preventDefault();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSave = () => {
    if (!hasDrawn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl, signerName.trim() || 'Authorized Customer');
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">{title}</h3>
          <p className="text-[11px] text-slate-500">Sign with finger or stylus inside the box below.</p>
        </div>
        {hasDrawn && (
          <button
            type="button"
            onClick={clearCanvas}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Signer Name (Printed)
        </label>
        <input
          type="text"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="e.g. Dale Reyes"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Signature Canvas Box */}
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="h-44 w-full cursor-crosshair"
        />
        {!hasDrawn && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <span className="text-2xl">✍️</span>
            <p className="mt-1 text-xs font-medium">Draw Signature Here</p>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-4 right-4 border-b border-slate-300/80" />
      </div>

      <p className="text-[10px] text-slate-500 leading-tight italic">
        "I authorize the repair order services, parts, and estimates listed above and acknowledge satisfactory completion."
      </p>

      <div className="flex items-center gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1 text-xs font-bold">
            Cancel
          </Button>
        )}
        <Button
          type="button"
          variant="accent"
          onClick={handleSave}
          disabled={!hasDrawn}
          className="flex-1 text-xs font-bold shadow-md"
        >
          <CheckIcon className="h-4 w-4" /> Save Signature
        </Button>
      </div>
    </div>
  );
}
