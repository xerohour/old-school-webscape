/* ===================================================================== quests

   This world's quest log. One quest lives here - the Sheep Shearer - and the
   module is the *only* place its state is understood: the constants, the table
   the journal renders, and the accessors everything else goes through.

   Two fields carry it, and both ride the ordinary save (src/player.js creates
   them, src/save.js writes and restores them):

     * `ps.quests.sheep_shearer`       0 not started, 1 started, 2 complete;
     * `ps.quests.sheep_shearer_wool`  how many balls of wool Fred has taken off
                                       the player, so a half-finished hand-in is
                                       remembered;
     * `ps.stats.questPoints`          the number the journal's header counts.

   Keeping the state behind these calls is what stops the dialogue, the journal
   and the reward from ever disagreeing about where a player is: the dialogue
   asks `questState`, the journal reads the same call plus `sheepShearerWool`,
   and the reward writes `setQuestState` and `addQuestPoints`.

   The user's standing rule used to be that this world had no quests at all
   (2026-09-20); they lifted it on 2026-09-22 - "for the quest point cape i see
   now why you added the sheep shearer quest ... you can add it back" - so the
   module is back with the quest it was written around. See src/SPEC.md. */

/* Sheep Shearer's own numbers: the 20 balls Fred asks for, and the reward box
   the quest's own script pays out (`quest_sheep.rs2`:
   `inv_add(inv, coins, 60)`, `stat_advance(crafting, 1500)` - stats advance in
   tenths, so 150 xp - and `^sheep_questpoints`, which is 1). */
export const SHEEP_SHEARER_WOOL = 20;
export const SHEEP_SHEARER_COINS = 60;
export const SHEEP_SHEARER_XP = 150;

/* The two states the journal colours its entries by: the client prints a
   started quest's title in yellow and a finished one's in green. */
export const QUEST_STARTED = 1;
export const QUEST_COMPLETE = 2;

/* The journal's own table. `journal[state]` holds the lines printed under the
   quest's title, and a line may be a string or a function of `ps` - which is
   how the started entry carries its live counter without the journal having to
   know anything about wool. A state with no entry (0, not begun) prints
   nothing at all, which is what the live journal does too.

   The words are **this world's own**, and deliberately so: the live game keeps
   its quest journals on the server and its wiki transcribes only the
   *dialogue*, so there is no era text to copy here. The lines say exactly what
   the mechanic does. */
export const QUESTS = [
  {
    id: "sheep_shearer",
    name: "Sheep Shearer",
    /* the quest point its own reward box pays, counted by the journal's header
       when it is spent (src/actions.js#fredReward) */
    points: 1,
    journal: {
      [QUEST_STARTED]: [
        "I asked Fred the Farmer, outside Lumbridge, for a quest.",
        "He asked me to shear his sheep and bring him 20 balls of wool.",
        (ps) => "Balls of wool given to Fred so far: " + sheepShearerWool(ps) + "/" + SHEEP_SHEARER_WOOL + ".",
      ],
      [QUEST_COMPLETE]: [
        "I brought Fred the Farmer 20 balls of wool, and he paid me for it.",
        "Quest complete!",
      ],
    },
  },
];

/* Where the player is in a quest: 0 not begun, 1 under way, `QUEST_COMPLETE`
   done. An unknown id, or a save written before there were quests, reads as 0
   rather than throwing - the journal and Fred both ask about a quest that may
   not exist yet in a given save. */
export function questState(ps, id) {
  const q = ps && ps.quests;
  const st = q ? q[id] : 0;
  return typeof st === "number" ? st : 0;
}

/* Move a quest's state. The `quests` object is created on demand so a caller
   never has to care whether the save it was handed carried one. */
export function setQuestState(ps, id, state) {
  if (!ps) return;
  if (!ps.quests) ps.quests = {};
  ps.quests[id] = state;
}

/* The journal's header. Quest points are part of the *stats* block rather than
   the quest log (src/player.js#createPlayerState), because they are a running
   total the way kills and gp earned are. */
export function addQuestPoints(ps, n) {
  if (!ps) return;
  if (!ps.stats) ps.stats = {};
  ps.stats.questPoints = (ps.stats.questPoints || 0) + n;
}

/* How many balls of wool Fred has taken off the player so far. It is the one
   counter the quest keeps outside its own state - the live script remembers it
   in the quest's varp, and this is the same fact written down. */
export function sheepShearerWool(ps) {
  const q = ps && ps.quests;
  const n = q ? q.sheep_shearer_wool : 0;
  return typeof n === "number" ? n : 0;
}

export function setSheepShearerWool(ps, n) {
  if (!ps) return;
  if (!ps.quests) ps.quests = {};
  ps.quests.sheep_shearer_wool = n;
}

/* Every quest in this journal finished. It is what the Quest point cape asks
   for - to buy it at the counter (src/actions.js#skillcapeCanBuy) and to wear
   it (src/player.js#canEquip, through the item's `reqQuests` field) - and it is
   written once here so the two can never answer differently. */
export function allQuestsDone(ps) {
  for (const q of QUESTS) if (questState(ps, q.id) < QUEST_COMPLETE) return false;
  return true;
}
