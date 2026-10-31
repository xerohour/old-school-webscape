/* Run energy — the real rules, not an approximation.

   Source: OSRS Wiki "Energy". Energy is stored in the game's own units, where
   10,000 units is 100%, and the interface shows the value as a percentage
   *rounded down* (so 9,999 units reads as "99"). A player with fewer than 100
   units (< 1%) cannot turn run on at all, and run switches itself off the
   moment energy reaches zero.

   Per game tick (600 ms):

     drain = floor( (60 + 67 * clamp(0, 64)(weight) / 64) * (1 - agility / 300) )
     regen = floor(agility / 10) + 15

   Weight is clamped to 0..64 kg (negative weight drains like zero, and anything
   over 64 kg drains like 64). Drain only applies on a tick the player actually
   *ran* — walking one tile with run enabled costs nothing, which is why the
   caller passes how many tiles the tick moved. */

export const RUN_UNITS = 10000;
export const RUN_ON_THRESHOLD = 100;

export function runDrainPerTick(weight, agility) {
  const w = Math.min(64, Math.max(0, weight));
  return Math.floor((60 + (67 * w) / 64) * (1 - agility / 300));
}

export function runRegenPerTick(agility) {
  return Math.floor(agility / 10) + 15;
}

/* Percentage as the interface shows it: rounded down, never negative. */
export function runPercent(units) {
  return Math.max(0, Math.floor(units / 100));
}
