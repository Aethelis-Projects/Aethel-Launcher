import { create } from 'zustand';

export interface AccountProfile {
  name: string;
  uuid: string;
  token: string;
  userType: 'legacy' | 'mojang' | 'msa';
  isStub: boolean;
}

interface AccountState {
  activeAccount: AccountProfile;
  setPlayerName: (name: string, uuid?: string) => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  activeAccount: {
    name: 'Player',
    uuid: '00000000-0000-0000-0000-000000000000',
    token: '0',
    userType: 'legacy',
    isStub: true,
  },
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
}));
