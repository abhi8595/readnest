import { create } from 'zustand';

export type TTSStatus = 'idle' | 'speaking' | 'paused';

interface TTSState {
  status: TTSStatus;
  rate: number;
  sentenceIndex: number;
  sleepMinutes: number | null;
  showBar: boolean;
  /** true while the native background module owns playback */
  background: boolean;
  /** C2 — total sentences in the current narration + live time-left label. */
  totalSentences: number;
  timeLeft: string | null;
  set: (p: Partial<TTSState>) => void;
  reset: () => void;
}

export const useTTSStore = create<TTSState>((set) => ({
  status: 'idle',
  rate: 1.0,
  sentenceIndex: 0,
  sleepMinutes: null,
  showBar: false,
  background: false,
  totalSentences: 0,
  timeLeft: null,
  set: (p) => set(p),
  reset: () => set({ status: 'idle', sentenceIndex: 0, sleepMinutes: null, showBar: false, background: false, totalSentences: 0, timeLeft: null }),
}));
