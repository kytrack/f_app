import { create } from 'zustand';

export type Celebration =
  | { type: 'level'; level: number }
  | { type: 'perfect'; date: string; count: number }
  | { type: 'milestone'; name: string; days: number; bonus: number }
  | { type: 'focus'; title: string; points: number };

interface CelebrationState {
  queue: Celebration[];
  push: (c: Celebration) => void;
  dismiss: () => void;
}

/** Small UI-only queue: the overlay shows the head, dismiss pops it. */
export const useCelebration = create<CelebrationState>((set) => ({
  queue: [],
  push: (c) => set((s) => ({ queue: [...s.queue, c] })),
  dismiss: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

export const celebrate = (c: Celebration) => useCelebration.getState().push(c);
