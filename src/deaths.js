/* -------------------------------------------------------------- death lines

   "Somebody died" as a posted notice: the wording the world uses when it tells
   everybody that a player has fallen.

   This is the one thing that is *not* the 2007 client's. The cache has no such
   message - a death is private there, and you read "Oh dear, you are dead!" and
   nothing else - and the user asked for the other kind, by name: *"when someone
   dies, you should send a global message in the chat ... a random line saying how
   _________________ got owned, or _______ bit the dust. or ____________ got
   knocked out, bad."* So the flavour is the genre's own (the private servers of
   the era announced every death to the whole world), the table is written here
   rather than read out of the cache, and the pick is made **on the client that
   reads it** - which is what makes one death read differently on two screens, and
   is the whole point of having a table.

   `name` is the fallen player's display name, taken from the packet rather than
   from the local ghost, because the announcement goes to the whole world and the
   people it reaches may never have seen that player's body (see src/net.js
   #netDeath, which is where the line is printed on the way out and on the way
   in). */

const DEATH_LINES = [
  (n) => n + " got owned!",
  (n) => n + " bit the dust.",
  (n) => n + " got knocked out - bad.",
  (n) => n + " has been defeated.",
  (n) => n + " got wrecked!",
  (n) => n + " has fallen in battle.",
  (n) => n + " was slain.",
  (n) => n + " got pwned.",
  (n) => n + " was taken down.",
  (n) => n + " met an untimely end.",
  (n) => n + " just died. Better luck next time.",
  (n) => n + " couldn't take the heat and fell.",
  (n) => n + " has been obliterated.",
  (n) => n + " took one hit too many.",
  (n) => n + " is pushing up daisies.",
  (n) => n + " learned the hard way that dying is bad.",
];

export function deathLine(name) {
  const who = String(name || "").trim() || "Someone";
  return DEATH_LINES[(Math.random() * DEATH_LINES.length) | 0](who);
}

export const DEATH_LINE_COUNT = DEATH_LINES.length;
