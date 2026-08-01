import { create } from 'zustand';

type WalletState = {
  address: string | null;
  connected: boolean;
  setWallet: (address: string) => void;
  disconnect: () => void;
};

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  connected: false,
  setWallet: (address) => set({ address, connected: true }),
  disconnect: () => set({ address: null, connected: false })
}));
