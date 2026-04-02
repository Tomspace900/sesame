import { useState, useRef, useEffect, useCallback } from 'react';

export function useDebouncedSearch(delay = 300) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setDebouncedSearch(value), delay);
    },
    [delay],
  );

  const setSearchImmediate = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearch(value);
    setDebouncedSearch(value);
  }, []);

  const clearSearch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSearch('');
    setDebouncedSearch('');
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { search, debouncedSearch, handleSearchChange, setSearchImmediate, clearSearch };
}
