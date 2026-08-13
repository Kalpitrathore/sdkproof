// Hand-authored, known-correct Zustand 5 usage — proves the fixture can express
// a PASSING answer. See test/fixtures.test.ts.
//
// Exercises the drift-prone surface: v5 removed the default export, so
// `import create from "zustand"` is a hard TS1192. The named export is the
// only way in. Custom equality also moved: `create` no longer accepts an
// equality function, it lives in `createWithEqualityFn` under
// "zustand/traditional".
import { create } from "zustand";
import { createWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";

interface CounterState {
  count: number;
  increment: () => void;
  reset: () => void;
}

export const useCounter = create<CounterState>()((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}));

interface CartState {
  items: string[];
  add: (item: string) => void;
}

export const useCart = createWithEqualityFn<CartState>()(
  (set) => ({
    items: [],
    add: (item) => set((s) => ({ items: [...s.items, item] })),
  }),
  shallow,
);

export function readCount() {
  return useCounter.getState().count;
}
