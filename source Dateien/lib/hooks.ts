import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  options: { immediate?: boolean } = {}
): { data: T | null; loading: boolean; error: string | null; reload: () => void; setData: (d: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(options.immediate !== false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (!mounted.current || id !== requestId.current) return;
      setData(result);
    } catch (e: any) {
      if (!mounted.current || id !== requestId.current) return;
      setError(e?.message || 'Fehler beim Laden');
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (options.immediate === false) return;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: run, setData };
}

export function useInterval(callback: () => void, delay: number | null) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
