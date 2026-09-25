import { useState } from 'react';

export type ViewMode = 'auto' | 'mobile' | 'desktop';

const STORAGE_KEY = 'outlaw_view_mode';

export function useViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
      if (saved === 'mobile' || saved === 'desktop' || saved === 'auto') return saved;
    } catch {}
    return 'auto';
  });

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  };

  return { viewMode, setViewMode };
}
