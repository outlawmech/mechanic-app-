import { useEffect, useState } from 'react';

export type ViewMode = 'auto' | 'mobile' | 'desktop';

const STORAGE_KEY = 'outlaw_view_mode';

function applyViewport(mode: ViewMode) {
  try {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    if (mode === 'desktop') {
      meta.setAttribute(
        'content',
        'width=1200, initial-scale=0.35, minimum-scale=0.25, maximum-scale=3.0, user-scalable=yes'
      );
    } else {
      meta.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0'
      );
    }
  } catch (e) {
    console.error('Failed to apply viewport mode:', e);
  }
}

export function useViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    // Default to 'auto' so phones ALWAYS open in clean mobile phone mode by default!
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
      if (saved === 'mobile' || saved === 'desktop') {
        // If saved was desktop, but user is on a phone, reset to auto so it doesn't open in desktop by default
        if (saved === 'desktop' && typeof window !== 'undefined' && window.innerWidth < 768) {
          localStorage.removeItem(STORAGE_KEY);
          applyViewport('auto');
          return 'auto';
        }
        applyViewport(saved);
        return saved;
      }
    } catch {}
    applyViewport('auto');
    return 'auto';
  });

  useEffect(() => {
    applyViewport(viewMode);
  }, [viewMode]);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    applyViewport(mode);
    try {
      if (mode === 'auto') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, mode);
      }
    } catch {}
  };

  return { viewMode, setViewMode };
}
