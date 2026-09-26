import { useState, useRef, useEffect } from 'react';
import type { PhotoCategory, WorkOrderPhoto } from '../types';
import { Button } from './ui';
import { TrashIcon } from './icons';
import { useToast } from './Toast';
import { generateUUID } from '../lib/offlineSync';
import {
  saveWorkOrderPhoto,
  getWorkOrderPhotos,
  deleteWorkOrderPhoto,
} from '../lib/photoStorage';

interface PhotoGalleryProps {
  workOrderId: string;
}

const CATEGORY_MAP: Record<PhotoCategory, { label: string; emoji: string; color: string }> = {
  pre_inspection: { label: 'Pre-Inspection', emoji: '🔍', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  damaged_part: { label: 'Damaged / Worn', emoji: '⚠️', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed_work: { label: 'Completed Work', emoji: '✅', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  diagnostic: { label: 'Diagnostic Scan', emoji: '📊', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  general: { label: 'General Photo', emoji: '📷', color: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export default function PhotoGallery({ workOrderId }: PhotoGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

  const [photos, setPhotos] = useState<WorkOrderPhoto[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<WorkOrderPhoto | null>(null);
  const [addingCategory, setAddingCategory] = useState<PhotoCategory>('pre_inspection');
  const [addingCaption, setAddingCaption] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Load photos from IndexedDB on mount & when workOrderId changes
  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!workOrderId) return;
      const stored = await getWorkOrderPhotos(workOrderId);
      if (isMounted) {
        setPhotos(stored);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [workOrderId]);

  // Robust client-side image compression
  const processImageFile = async (file: File) => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const maxDim = 800; // Optimized size for mobile stability and low memory
              let width = img.width;
              let height = img.height;

              if (width > height && width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve(e.target?.result as string);
                return;
              }
              ctx.drawImage(img, 0, 0, width, height);
              const compressed = canvas.toDataURL('image/jpeg', 0.7);
              resolve(compressed);
            } catch (canvasErr) {
              resolve(e.target?.result as string);
            }
          };
          img.onerror = () => reject(new Error('Could not load image'));
          img.src = e.target?.result as string;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const newPhoto: WorkOrderPhoto = {
        id: generateUUID(),
        work_order_id: workOrderId,
        photo_url: dataUrl,
        category: addingCategory,
        caption: addingCaption.trim(),
        created_at: new Date().toISOString(),
      };

      // Save to IndexedDB
      await saveWorkOrderPhoto(newPhoto);
      setPhotos((prev) => [newPhoto, ...prev]);
      toast('Photo saved to Repair Order');
      setAddingCaption('');
    } catch (err: any) {
      console.error('Error processing photo:', err);
      toast('Could not process photo. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    e.target.value = '';
  };

  const handleDelete = async (photoId: string) => {
    if (!window.confirm('Delete this photo?')) return;
    await deleteWorkOrderPhoto(photoId);
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    if (selectedPhoto?.id === photoId) {
      setSelectedPhoto(null);
    }
    toast('Photo deleted');
  };

  const filteredPhotos =
    activeCategoryFilter === 'all'
      ? photos
      : photos.filter((p) => p.category === activeCategoryFilter);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
            📸 Job Site Photos ({photos.length})
          </h3>
          <p className="text-[11px] text-slate-500">
            Document pre-existing damage, diagnostic scans, and completed repairs.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          <Button
            type="button"
            variant="accent"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              cameraInputRef.current?.click();
            }}
            disabled={isProcessing}
            className="text-xs font-bold shadow-sm px-2.5 py-1.5"
          >
            {isProcessing ? 'Saving…' : '📷 Snap Camera'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            disabled={isProcessing}
            className="text-xs font-semibold px-2.5 py-1.5"
          >
            📁 Upload
          </Button>
        </div>
      </div>

      {/* Tag selector for next upload & caption */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 border border-slate-100">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Tag for new photo
          </label>
          <select
            value={addingCategory}
            onChange={(e) => setAddingCategory(e.target.value as PhotoCategory)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
          >
            {Object.entries(CATEGORY_MAP).map(([key, info]) => (
              <option key={key} value={key}>
                {info.emoji} {info.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Optional Note / Description
          </label>
          <input
            type="text"
            value={addingCaption}
            onChange={(e) => setAddingCaption(e.target.value)}
            placeholder="e.g. Scratched fender before work / New alternator installed"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Category Filter Chips */}
      {photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setActiveCategoryFilter('all')}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
              activeCategoryFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({photos.length})
          </button>
          {Object.entries(CATEGORY_MAP).map(([key, info]) => {
            const count = photos.filter((p) => p.category === key).length;
            if (count === 0) return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategoryFilter(key)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                  activeCategoryFilter === key
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{info.emoji}</span>
                <span>{info.label} ({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Photos Grid */}
      {filteredPhotos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-400">
          <span className="text-3xl">📷</span>
          <p className="mt-2 text-xs font-semibold text-slate-600">No photos attached yet</p>
          <p className="text-[11px] text-slate-400">
            Tap "Snap Camera" to document vehicle condition or take photos of worn parts.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-1">
          {filteredPhotos.map((photo) => {
            const cat = CATEGORY_MAP[photo.category] || CATEGORY_MAP.general;
            return (
              <div
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm transition hover:shadow-md active:scale-95"
              >
                <img
                  src={photo.photo_url}
                  alt={photo.caption || cat.label}
                  className="h-28 w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute top-1.5 left-1.5">
                  <span className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[9px] font-bold shadow-xs backdrop-blur ${cat.color}`}>
                    {cat.emoji} {cat.label}
                  </span>
                </div>
                {photo.caption && (
                  <div className="p-1.5 bg-white border-t border-slate-100">
                    <p className="truncate text-[10px] font-medium text-slate-700">{photo.caption}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox / Zoom Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-lg w-full overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 p-3">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">
                  {CATEGORY_MAP[selectedPhoto.category]?.emoji || '📷'}
                </span>
                <span className="text-xs font-bold text-amber-400">
                  {CATEGORY_MAP[selectedPhoto.category]?.label || 'Photo'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(selectedPhoto.id);
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/20 hover:text-red-400"
                  title="Delete Photo"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white text-xs font-bold"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <div className="max-h-[65vh] overflow-auto bg-black flex items-center justify-center">
              <img
                src={selectedPhoto.photo_url}
                alt={selectedPhoto.caption || 'Job Photo'}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="p-3 bg-slate-900 border-t border-slate-800">
              <p className="text-xs font-medium text-slate-200">
                {selectedPhoto.caption || 'No caption provided.'}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                Taken on {new Date(selectedPhoto.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
