import { create } from 'zustand';

interface UIState {
  quickSwitcher: boolean;
  commandPalette: { open: boolean; command: 'mp' | 'stop' | 'np' | 'radios' | null };
  settingsOpen: boolean;
  profileOpen: boolean;
  mobileNavOpen: boolean;
  membersOpen: boolean;
  setQuickSwitcher: (b: boolean) => void;
  setCommandPalette: (open: boolean, command?: 'mp' | 'stop' | 'np' | 'radios' | null) => void;
  setSettingsOpen: (b: boolean) => void;
  setProfileOpen: (b: boolean) => void;
  setMobileNavOpen: (b: boolean) => void;
  setMembersOpen: (b: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  quickSwitcher: false,
  commandPalette: { open: false, command: null },
  settingsOpen: false,
  profileOpen: false,
  mobileNavOpen: false,
  membersOpen: true,
  setQuickSwitcher: (quickSwitcher) => set({ quickSwitcher }),
  setCommandPalette: (open, command = null) => set({ commandPalette: { open, command } }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setProfileOpen: (profileOpen) => set({ profileOpen }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setMembersOpen: (membersOpen) => set({ membersOpen }),
}));
