import { create } from 'zustand';

type Cart = Record<string, number>;

type CartStore = {
  cart: Cart;
  add: (productId: string, max: number) => void;
  dec: (productId: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartStore>()((set) => ({
  cart: {},
  add: (productId, max) =>
    set((s) => {
      const q = (s.cart[productId] ?? 0) + 1;
      if (q > max) return s;
      return { cart: { ...s.cart, [productId]: q } };
    }),
  dec: (productId) =>
    set((s) => {
      const q = (s.cart[productId] ?? 0) - 1;
      const next = { ...s.cart };
      if (q <= 0) delete next[productId];
      else next[productId] = q;
      return { cart: next };
    }),
  clear: () => set({ cart: {} }),
}));