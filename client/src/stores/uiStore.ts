import { create } from 'zustand';

const KEY = 'vellin.ui';

type Theme = 'dark' | 'light';

interface UIState {
  theme: Theme;
  chatCollapsed: boolean;
  setTheme: (t: Theme) => void;
  toggleChat: () => void;
  setChatCollapsed: (collapsed: boolean) => void;
  applyTheme: () => void;
}

function readStorage(): { theme: Theme; chatCollapsed: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { theme: 'dark', chatCollapsed: false };
    const parsed = JSON.parse(raw) as { theme?: Theme; chatCollapsed?: boolean };
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      chatCollapsed: Boolean(parsed.chatCollapsed),
    };
  } catch {
    return { theme: 'dark', chatCollapsed: false };
  }
}

function persist(state: { theme: Theme; chatCollapsed: boolean }): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export const useUIStore = create<UIState>((set, get) => {
  const initial = readStorage();
  return {
    theme: initial.theme,
    chatCollapsed: initial.chatCollapsed,
    setTheme: (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      set({ theme });
      persist({ theme, chatCollapsed: get().chatCollapsed });
    },
    toggleChat: () => {
      const next = !get().chatCollapsed;
      set({ chatCollapsed: next });
      persist({ theme: get().theme, chatCollapsed: next });
    },
    setChatCollapsed: (collapsed) => {
      if (get().chatCollapsed === collapsed) return;
      set({ chatCollapsed: collapsed });
      persist({ theme: get().theme, chatCollapsed: collapsed });
    },
    applyTheme: () => {
      document.documentElement.setAttribute('data-theme', get().theme);
    },
  };
});
