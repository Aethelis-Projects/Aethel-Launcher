import { create } from 'zustand';
import { commands, type AccountMetadata } from '../bindings';

export interface AccountProfile {
  name: string;
  uuid: string;
  token: string;
  userType: 'legacy' | 'mojang' | 'msa';
  isStub: boolean;
  accountType?: string;
  serverUrl?: string | null;
}

interface AccountState {
  accounts: AccountMetadata[];
  activeAccount: AccountProfile;
  isAccountModalOpen: boolean;
  isLoading: boolean;
  error: string | null;
  setIsAccountModalOpen: (open: boolean) => void;
  setPlayerName: (name: string, uuid?: string) => void;
  fetchAccounts: () => Promise<void>;
  loginMicrosoft: () => Promise<AccountMetadata>;
  loginOffline: (username: string) => Promise<AccountMetadata>;
  loginAuthlib: (serverUrl: string, username: string) => Promise<AccountMetadata>;
  setActiveAccount: (uuid: string) => Promise<void>;
  logout: (uuid: string) => Promise<void>;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccount: {
    name: 'Player',
    uuid: '00000000-0000-0000-0000-000000000000',
    token: '0',
    userType: 'legacy',
    isStub: true,
  },
  isAccountModalOpen: false,
  isLoading: false,
  error: null,

  setIsAccountModalOpen: (open: boolean) => set({ isAccountModalOpen: open }),

  setPlayerName: (name: string, uuid?: string) =>
    set({
      activeAccount: {
        name,
        uuid: uuid || '00000000-0000-0000-0000-000000000000',
        token: '0',
        userType: 'legacy',
        isStub: true,
      },
    }),

  fetchAccounts: async () => {
    try {
      set({ isLoading: true, error: null });
      const res = await commands.getAccounts();
      if (res.status === 'ok') {
        const accounts = res.data;
        const activeRes = await commands.getActiveAccount();
        const activeMeta = activeRes.status === 'ok' ? activeRes.data : null;

        if (activeMeta) {
          set({
            accounts,
            isLoading: false,
            activeAccount: {
              name: activeMeta.username,
              uuid: activeMeta.uuid,
              token: '0',
              userType: activeMeta.account_type === 'offline' ? 'legacy' : 'mojang',
              isStub: false,
              accountType: activeMeta.account_type,
              serverUrl: activeMeta.server_url,
            },
          });
        } else if (accounts.length > 0) {
          const first = accounts[0];
          set({
            accounts,
            isLoading: false,
            activeAccount: {
              name: first.username,
              uuid: first.uuid,
              token: '0',
              userType: first.account_type === 'offline' ? 'legacy' : 'mojang',
              isStub: false,
              accountType: first.account_type,
              serverUrl: first.server_url,
            },
          });
        } else {
          set({ accounts: [], isLoading: false });
        }
      } else {
        set({ isLoading: false, error: res.error });
      }
    } catch (e: any) {
      set({ isLoading: false, error: e?.message || 'Failed to fetch accounts' });
    }
  },

  loginMicrosoft: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await commands.loginMicrosoft();
      if (res.status === 'ok') {
        const acc = res.data;
        await get().fetchAccounts();
        return acc;
      } else {
        set({ isLoading: false, error: res.error });
        throw new Error(res.error);
      }
    } catch (e: any) {
      set({ isLoading: false, error: e?.message || 'Microsoft login failed' });
      throw e;
    }
  },

  loginOffline: async (username: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await commands.loginOffline(username);
      if (res.status === 'ok') {
        const acc = res.data;
        await get().fetchAccounts();
        return acc;
      } else {
        set({ isLoading: false, error: res.error });
        throw new Error(res.error);
      }
    } catch (e: any) {
      set({ isLoading: false, error: e?.message || 'Offline login failed' });
      throw e;
    }
  },

  loginAuthlib: async (serverUrl: string, username: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await commands.loginAuthlib(serverUrl, username);
      if (res.status === 'ok') {
        const acc = res.data;
        await get().fetchAccounts();
        return acc;
      } else {
        set({ isLoading: false, error: res.error });
        throw new Error(res.error);
      }
    } catch (e: any) {
      set({ isLoading: false, error: e?.message || 'Authlib login failed' });
      throw e;
    }
  },

  setActiveAccount: async (uuid: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await commands.setActiveAccount(uuid);
      if (res.status === 'ok') {
        await get().fetchAccounts();
      } else {
        set({ isLoading: false, error: res.error });
      }
    } catch (e: any) {
      set({ isLoading: false, error: e?.message || 'Failed to switch account' });
    }
  },

  logout: async (uuid: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await commands.logout(uuid);
      if (res.status === 'ok') {
        await get().fetchAccounts();
      } else {
        set({ isLoading: false, error: res.error });
      }
    } catch (e: any) {
      set({ isLoading: false, error: e?.message || 'Failed to remove account' });
    }
  },
}));
