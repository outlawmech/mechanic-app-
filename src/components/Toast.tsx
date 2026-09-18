import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Toast = { id: number; msg: string; kind: 'success' | 'error' };

const ToastCtx = createContext<(msg: string, kind?: Toast['kind']) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const show = useCallback((msg: string, kind: Toast['kind'] = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              t.kind === 'error' ? 'bg-red-600' : 'bg-slate-900'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
