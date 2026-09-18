import { useCallback, useEffect, useRef, useState } from 'react';

type State<T> = { data?: T; error?: string; loading: boolean };

/**
 * Small data-fetching hook: runs an async function, tracks loading/error,
 * and exposes reload(). Pass the same dependencies the function closes over.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    try {
      const data = await fnRef.current();
      setState({ data, loading: false });
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
