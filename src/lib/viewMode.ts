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
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
      if (saved === 'mobile' || saved === 'desktop' || saved === 'auto') {
        applyViewport(saved);
        return saved;
      }
    } catch {}
    return 'auto';
  });

  useEffect(() => {
    applyViewport(viewMode);
  }, [viewMode]);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    applyViewport(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  };

  return { viewMode, setViewMode };
}
