import { create } from 'zustand';

const MAX_HISTORY = 5;

type SearchState = {
  history: string[];
  addToHistory: (query: string) => void;
  clearHistory: () => void;
};

export const useSearchStore = create<SearchState>((set) => ({
  history: [],
  addToHistory: (query) =>
    set((state) => {
      const trimmed = query.trim();
      if (!trimmed) return state;
      const next = [trimmed, ...state.history.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
      return { history: next };
    }),
  clearHistory: () => set({ history: [] }),
}));
