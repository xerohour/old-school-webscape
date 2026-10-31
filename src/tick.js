export const TICK_MS = 600;
export const TICK_S = TICK_MS / 1000;

export function ticks(n) {
  return n * TICK_S;
}
