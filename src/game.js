import * as THREE from "https://esm.sh/three@0.160.0";
import { createWorld, inKinshra, inUnderbelly, inMinigame, inTutCaySafe, UP_Y, W } from "./world.js";
import { View } from "./scene.js";
import { makeCharacter, animateCharacter, makeSpriteBillboard, makeShadow } from "./entities.js";
import { findPath, nearestWalkable } from "./pathfind.js";
import { createPlayerState, weaponOf, totalWeight } from "./player.js";
import { attackAnimFor, combatAnimAt, blockAnimFor, EQUIP_SLOTS, KIT_SLOTS, EQUIP_BODY_PART, ITEMS } from "./items.js";
import { RUN_UNITS, RUN_ON_THRESHOLD, runDrainPerTick, runRegenPerTick } from "./run.js";
import { npcTexture, npcSpriteHeight, npcSpriteAspect, pickNpcSprite, PLAYER_SPRITES } from "./npcsprites.js";
import { makeModelCharacter, modelData, modelKeys, hasHeldModel, modelsReady } from "./models3d.js";
import { buildKitBody, isKitKey } from "./identikits.js";
import { runHeadgearReview } from "./review.js";
import { openHeadgearReview } from "./review-ui.js";
import { archetypeByKey, archetypeBodyKey, archetypeEquip } from "./archetypes.js";
import { Frame } from "./gameframe.js";
import { TICK_S } from "./tick.js";
import { emoteAt, isSkillcapeEmoteAnim, skillcapeEmote, skillcapeEmoteForAnim } from "./emotes.js";
import { Fx, MARK_WALK } from "./fx.js";
import { StatueSwirl } from "./statueswirl.js";
import { Gfx } from "./gfx.js";
import { loadHandPlaced } from "./handplaced.js";
import { energyRecoveryFactor } from "./prayer.js";
import { combatLevel } from "./skills.js";
import { tickSurf } from "./surf.js";

export const Game = {
  world: null,
  view: null,
  player: null,
  npcs: [],
  entities: [],
  yaw: 0,
  pitch: 0.94,
  dist: 15,
  targetDist: 15,
  camYaw: 0,
  camPitch: 0.94,
  camPos: new THREE.Vector3(),
  input: { keys: {}, dragging: false, lastX: 0, lastY: 0, moved: 0, rightRotate: true, oneButton: false, menuHoldMs: 300 },
  hooks: {
    onClickTile: null, onRightClickWorld: null, onRightClickCancel: null,
    onInteract: null, onTick: null, beforeRender: null, aimPreferScenery: null,
  },
  time: 0,
  paused: false,
  playerAppearance: "male",
  fps: 60,
  tickCount: 0,
  tickProgress: 0,
  backlog: 0,
  frameCount: 0,
  /* Other players, by the connection id their state arrives under (src/net.js):
     one entity each, in `entities` so the render loop draws and animates them,
     but deliberately NOT in `npcs`, so nothing in the sim ever targets them,
     moves them or gives them a wander. See `addGhost` below. */
  ghosts: new Map(),
  /* The other player the local player is following (src/actions.js's own menu
     sets it through followPlayer): the ghost itself, not its id, because the
     only things done with it are reading its tile and its name. Cleared by any
     walk the player asks for directly, by the target leaving, and by
     stopFollowing. */
  follow: null,
  /* Click grace (ui.js#updateWorldHover stamps this every frame the cursor holds
     a creature): the entity the cursor was most recently on, and when. A click
     that lands a pixel off a running target re-picks at press time and would
     otherwise become a walk; the memory below lets the press forgive it. Read
     in `forgivePick`, invalidated there. */
  hoverMemory: { ent: null, t: 0 },
};

const NPC_LOOKS = {
  man: { shirt: 0x8a6b4a, pants: 0x4a4a52, hair: 0x3a2a18, skin: 0xdfae86 },
  woman: { shirt: 0x9a4a6a, pants: 0x5a4a5a, hair: 0x6a3a18, skin: 0xe8c09a },
  child: { shirt: 0x4a8a6a, pants: 0x5a5a52, hair: 0x8a6a2a, skin: 0xe8c09a },
  guard: { shirt: 0x3a4a6a, pants: 0x3a3a42, hair: 0x2a2a2a, skin: 0xdfae86 },
  banker: { shirt: 0xb8a86a, pants: 0x4a4a4a, hair: 0x2a2a2a, skin: 0xe8c09a },
  shopkeeper: { shirt: 0x6a8a3a, pants: 0x4a4a4a, hair: 0x4a3a2a, skin: 0xe8c09a },
  magic_store_owner: { shirt: 0x3b4fa5, pants: 0x2a3a7a, hair: 0x4a3a2a, skin: 0xe8c09a },
  /* The specialist shopkeepers (src/actions.js#SHOPS), each in a different
     shirt so a street of shops does not read as one man in five doorways. */
  armour_shop_owner: { shirt: 0x8a8f98, pants: 0x4a4a52, hair: 0x3a2a18, skin: 0xdfae86 },
  sword_shop_owner: { shirt: 0x9a3a3a, pants: 0x3a3a42, hair: 0x2a2a2a, skin: 0xe8c09a },
  archery_shop_owner: { shirt: 0x7a6a3a, pants: 0x4a5a2a, hair: 0x6a5a2a, skin: 0xdfae86 },
  fishing_shop_owner: { shirt: 0x3a7a8a, pants: 0x3a4a5a, hair: 0x4a3a2a, skin: 0xe8c09a },
  food_shop_owner: { shirt: 0xc0a040, pants: 0x5a4a3a, hair: 0x5a3a18, skin: 0xe8c09a },
  clothes_shop_owner: { shirt: 0x9a5a8a, pants: 0x5a3a4a, hair: 0x2a1a18, skin: 0xdfae86 },
  /* The capes of accomplishment' seller's fallback look only; the market-square
     seller himself is Mac, drawn from his own baked model (npc 6481, Oct 2015) -
     and the town square's tutorial post
     keeps the cache's own Wise Old Man (npc 2253): a white-haired old man in a
     long blue robe. */
  wise_old_man: { shirt: 0x4a6aa8, pants: 0x3a5a88, hair: 0xd8d8d0, skin: 0xdfae86 },
  /* Wizard Sedridor: the Wizards' Tower blue with a white archmage's beard. */
  sedridor: { shirt: 0x2a4fa8, pants: 0x2a3a7a, hair: 0xd8d8d0, skin: 0xe8c09a },
  mac: { shirt: 0x2a4a3a, pants: 0x6a6a6a, hair: 0xd8b83a, skin: 0xdfae86 },
  makeover_mage: { shirt: 0x5a3fa5, pants: 0x3a2a7a, hair: 0xd8d8d0, skin: 0xe8c09a },
  /* Wizard Thormac, the staff-enchanter (src/actions.js#thormacScreens,
     src/world.js). Only the stand-in's colours - his real art is his own
     bake, the cache's Thormac (npc 389) - kept in the blue robe and white
     beard the tower wizard wears. */
  thormac: { shirt: 0x2a4fa5, pants: 0x2a3a7a, hair: 0xd8d8d0, skin: 0xe8c09a },
  /* The Duke of Lumbridge (npc 741, his own bake): a nobleman's purple and
     gold over the old man's grey. Stand-in colours only. */
  duke: { shirt: 0x5a2a7a, pants: 0x3a2a4a, hair: 0xd8d8d0, skin: 0xe8c09a },
  /* The Bee keeper (npc 4416, his own bake): the white suit. Stand-in colours
     only. */
  beekeeper: { shirt: 0xe8e8e0, pants: 0xe8e8e0, hair: 0x4a3a2a, skin: 0xe8c09a },
  goblin: { shirt: 0x5a7a3a, pants: 0x4a5a2a, hair: 0x2a3a1a, skin: 0x6a8a4a },
  gas_goblin: { shirt: 0x5a7a3a, pants: 0x4a5a2a, hair: 0x2a3a1a, skin: 0x6a8a4a },
  cow: { shirt: 0x8a7a5a, pants: 0x8a7a5a, hair: 0x5a4a2a, skin: 0xe8e0d0 },
  chicken: { shirt: 0xf0f0e8, pants: 0xf0f0e8, hair: 0xd85a3a, skin: 0xf0f0e8 },
  rat: { shirt: 0x6a6a62, pants: 0x6a6a62, hair: 0x4a4a44, skin: 0x8a8a80 },
  farmer: { shirt: 0x7a6a3a, pants: 0x3a3a30, hair: 0x6a5a2a, skin: 0xdfae86 },
  giant_rat: { shirt: 0x5a5a52, pants: 0x5a5a52, hair: 0x3a3a34, skin: 0x7a7a70 },
  zombie: { shirt: 0x4a5a3a, pants: 0x4a3a2a, hair: 0x2a2a22, skin: 0x6a8a5a },
  skeleton: { shirt: 0xd8d4c4, pants: 0xd8d4c4, hair: 0xd8d4c4, skin: 0xd8d4c4 },
  ghost: { shirt: 0xcfd8e8, pants: 0xcfd8e8, hair: 0xcfd8e8, skin: 0xcfd8e8 },
  giant_spider: { shirt: 0x3a2a22, pants: 0x3a2a22, hair: 0x3a2a22, skin: 0x3a2a22 },
  imp: { shirt: 0x8a2a2a, pants: 0x8a2a2a, hair: 0x2a2a2a, skin: 0x9a3a2a },
  unicorn: { shirt: 0xf0ece0, pants: 0xf0ece0, hair: 0xe8e0c8, skin: 0xf0ece0 },
  monk: { shirt: 0x6a4a2a, pants: 0x6a4a2a, hair: 0x2a2a2a, skin: 0xdfae86 },
  dark_wizard: { shirt: 0x2a2a4a, pants: 0x2a2a4a, hair: 0x1a1a1a, skin: 0xdfae86 },
  dark_wizard_young: { shirt: 0x2a2a4a, pants: 0x2a2a4a, hair: 0x1a1a1a, skin: 0xdfae86 },
  barbarian: { shirt: 0x8a7a4a, pants: 0x5a4a3a, hair: 0xc8a050, skin: 0xdfae86 },
  wizard: { shirt: 0x2a5a9a, pants: 0x2a5a9a, hair: 0x2a2a2a, skin: 0xdfae86 },
  druid: { shirt: 0x4a6a3a, pants: 0x3a4a2a, hair: 0x6a5a2a, skin: 0xdfae86 },
  warrior_woman: { shirt: 0xb8a070, pants: 0x6a5a4a, hair: 0x3a2a18, skin: 0xe8c09a },
  knight_of_ardougne: { shirt: 0x9a9aa8, pants: 0x7a6a4a, hair: 0x4a3a2a, skin: 0xdfae86 },
  priest: { shirt: 0xe8e8e0, pants: 0xe8e8e0, hair: 0xd8d0c0, skin: 0xdfae86 },
  soldier: { shirt: 0x8a3a3a, pants: 0x3a3a42, hair: 0x4a3a2a, skin: 0xdfae86 },
  mugger: { shirt: 0x5a5a5a, pants: 0x3a3a3a, hair: 0x2a2a2a, skin: 0xdfae86 },
  black_knight: { shirt: 0x2a2a30, pants: 0x2a2a30, hair: 0x1a1a1a, skin: 0xdfae86 },
  highwayman: { shirt: 0x4a3a5a, pants: 0x3a3a42, hair: 0x2a2a2a, skin: 0xdfae86 },
  rogue: { shirt: 0x5a4a6a, pants: 0x3a3a42, hair: 0x3a2a18, skin: 0xdfae86 },
  monk_of_zamorak: { shirt: 0x6a2a2a, pants: 0x6a2a2a, hair: 0x2a2a2a, skin: 0xdfae86 },
  unicorn_foal: { shirt: 0xf0ece0, pants: 0xf0ece0, hair: 0xe8e0c8, skin: 0xf0ece0 },
  skeleton_mage: { shirt: 0xd8d4c4, pants: 0xd8d4c4, hair: 0xd8d4c4, skin: 0xd8d4c4 },
  duck: { shirt: 0xf0f0e8, pants: 0xf0f0e8, hair: 0xd8a030, skin: 0xf0f0e8 },
  duckling: { shirt: 0xf0e0a0, pants: 0xf0e0a0, hair: 0xd8a030, skin: 0xf0e0a0 },
  seagull: { shirt: 0xf4f4f0, pants: 0xf4f4f0, hair: 0xd8d8d0, skin: 0xf4f4f0 },
  sheep: { shirt: 0xf0ece0, pants: 0xf0ece0, hair: 0xe0dcd0, skin: 0xe8e4d8 },
  ram: { shirt: 0xe8e0d0, pants: 0xe8e0d0, hair: 0x8a7a6a, skin: 0xe0d8c8 },
  guard_dog: { shirt: 0x6a5a42, pants: 0x6a5a42, hair: 0x4a3a2a, skin: 0x8a7a5a },
  wolf: { shirt: 0x8a8a8a, pants: 0x8a8a8a, hair: 0x6a6a6a, skin: 0x9a9a9a },
  dwarf: { shirt: 0x6a4a3a, pants: 0x4a3a2a, hair: 0xa05030, skin: 0xdfae86 },
  hobgoblin: { shirt: 0x6a5a3a, pants: 0x5a4a2a, hair: 0x3a2a1a, skin: 0x8a7a5a },
  bear_cub: { shirt: 0x5a4030, pants: 0x5a4030, hair: 0x4a3428, skin: 0x6a4a38 },

  /* --- the town's own people (src/PLAN.md unit J). The real art is the baked
     cache model; these keep each of them legible if a model ever fails to
     load, and the two small ones are what tell a child from an adult at
     stand-in scale. */
  hans: { shirt: 0x6a7a5a, pants: 0x4a4a3a, hair: 0x8a6a2a, skin: 0xdfae86 },
  lumbridge_guide: { shirt: 0x8a3a3a, pants: 0x4a4a52, hair: 0x5a4a2a, skin: 0xdfae86 },
  cook: { shirt: 0xe8e8e0, pants: 0xd8d8d0, hair: 0x3a2a18, skin: 0xdfae86 },
  fisherman: { shirt: 0x3a5a7a, pants: 0x3a4a5a, hair: 0x4a3a2a, skin: 0xdfae86 },
  miner: { shirt: 0x7a6a3a, pants: 0x4a4a42, hair: 0x2a2a2a, skin: 0xdfae86 },
  beggar: { shirt: 0x6a6a5a, pants: 0x5a5a4a, hair: 0x5a5a4a, skin: 0xdfae86 },
  child: { shirt: 0x4a8a6a, pants: 0x5a5a52, hair: 0x8a6a2a, skin: 0xe8c09a },
  schoolgirl: { shirt: 0x9a4a6a, pants: 0x4a4a5a, hair: 0x8a6a2a, skin: 0xe8c09a },
  gardener: { shirt: 0x4a6a3a, pants: 0x6a5a3a, hair: 0x6a5a2a, skin: 0xdfae86 },
  shop_assistant: { shirt: 0x7a8a5a, pants: 0x4a4a4a, hair: 0x5a3a18, skin: 0xe8c09a },
  apprentice: { shirt: 0x3a4a9a, pants: 0x2a3a7a, hair: 0x3a2a18, skin: 0xdfae86 },
  drunken_man: { shirt: 0x7a5a4a, pants: 0x4a3a32, hair: 0x5a4a3a, skin: 0xdfae86 },
  tanner: { shirt: 0x8a5a32, pants: 0x6a4a2a, hair: 0x3a2a18, skin: 0xdfae86 },
  /* The town herbalist (Herblore, unit T12): a stallholder in the market square
     who keeps the herbs, secondaries and vials that the skill needs. She wears
     the baked shopkeeper model (NPC_MODEL_ALIASES) in a green apron. */
  herbalist: { shirt: 0x4a7a3a, pants: 0x4a4a3a, hair: 0x6a5a2a, skin: 0xe8c09a },
  /* Dommik, who keeps the crafting shop on the market square: a shopkeeper in
     a brown apron. */
  dommik: { shirt: 0x7a5a32, pants: 0x4a3a2a, hair: 0x3a2a18, skin: 0xe8c09a },
  /* Brother Jered, who blesses unblessed symbols in the church: a monk in the
     brown habit, white-bearded. */
  jered: { shirt: 0x6a4a2a, pants: 0x6a4a2a, hair: 0xd8d8d0, skin: 0xdfae86 },
  /* The Spirit of Scorpius, who blesses unpowered symbols by the churchyard
     graves: a pale lingering ghost. */
  scorpius: { shirt: 0xcfd8e8, pants: 0xcfd8e8, hair: 0xcfd8e8, skin: 0xcfd8e8 },
  /* Bob (Bob's Brilliant Axes, src/PLAN.md unit C3): the cache's NPC 519, a
     human axe-seller standing at the market's south stall row. These are only
     the blocky stand-in's colours - his real art is his own bake - kept in the
     red tunic the model wears. */
  bob: { shirt: 0x8a3a2a, pants: 0x4a3a2a, hair: 0x3a2a18, skin: 0xdfae86 },
  /* Fred the Farmer: NPC 758, a farmer rather than a monster, and drawn from
     his own bake. The
     stand-in borrows the farmer palette for the same reason Bob's borrows the
     dwarf's. */
  fred: { shirt: 0x7a6a3a, pants: 0x3a3a30, hair: 0x6a5a2a, skin: 0xdfae86 },

  /* --- the wider bestiary (src/PLAN.md unit E). The colours only matter to the
     blocky stand-in - the real art is the baked cache model - but they keep a
     creature legible if a model ever fails to load. */
  black_bear: { shirt: 0x2f2620, pants: 0x2f2620, hair: 0x241d18, skin: 0x3a2f28 },
  hill_giant: { shirt: 0x8a6a4a, pants: 0x6a5038, hair: 0x4a3420, skin: 0xc09068 },
  moss_giant: { shirt: 0x4f6a3a, pants: 0x3f5230, hair: 0x2f4224, skin: 0x6f8a52 },
  fire_giant: { shirt: 0x7a3a2a, pants: 0x5a2a1e, hair: 0x2a1a14, skin: 0xa85840 },
  ice_giant: { shirt: 0x5a7a8a, pants: 0x44606e, hair: 0x2e4652, skin: 0x86a8b8 },
  lesser_demon: { shirt: 0x6a2a22, pants: 0x6a2a22, hair: 0x2a1a14, skin: 0x8a3a2a },
  greater_demon: { shirt: 0x5a2018, pants: 0x5a2018, hair: 0x221410, skin: 0x7a2f20 },
  scorpion: { shirt: 0x6a5a2a, pants: 0x6a5a2a, hair: 0x4a3a18, skin: 0x8a7a3a },
  deadly_red_spider: { shirt: 0x6a1a14, pants: 0x6a1a14, hair: 0x4a120e, skin: 0x8a2418 },
  giant_bat: { shirt: 0x40342c, pants: 0x40342c, hair: 0x2a211c, skin: 0x50423a },
  crawling_hand: { shirt: 0x9a7a62, pants: 0x9a7a62, hair: 0x7a5c48, skin: 0xbc9a80 },
  banshee: { shirt: 0xc8d0dc, pants: 0xc8d0dc, hair: 0xa8b2c0, skin: 0xdcdfe8 },
  blue_dragon: { shirt: 0x3a5a8a, pants: 0x2e4870, hair: 0x24405f, skin: 0x4e6f9e },
  earth_warrior: { shirt: 0x6a5a3a, pants: 0x4a4030, hair: 0x3a2f22, skin: 0x8a7a52 },
  chaos_druid: { shirt: 0x3f5a3a, pants: 0x2f4229, hair: 0x4a3a22, skin: 0xdfae86 },
  /* The river trolls' stand-in (river green-grey) - only ever seen if the
     baked model fails to load. */
  river_troll_79: { shirt: 0x4a5a44, pants: 0x3a4838, hair: 0x2c382c, skin: 0x6a7a5e },
  river_troll_120: { shirt: 0x4a5a44, pants: 0x3a4838, hair: 0x2c382c, skin: 0x6a7a5e },
  river_troll_159: { shirt: 0x4a5a44, pants: 0x3a4838, hair: 0x2c382c, skin: 0x6a7a5e },
  river_troll_199: { shirt: 0x3a4a34, pants: 0x2c3828, hair: 0x202820, skin: 0x5a6a4e },
  /* The ocean trolls' stand-in (dark mint blue) - same fallback deal. The
     real bake is the river troll's teal body retinted blue at spawn (see
     createNpc), so both families read apart even with the model shared. */
  ocean_troll_79: { shirt: 0x3a6a72, pants: 0x2c565e, hair: 0x24484e, skin: 0x5a9aa4 },
  ocean_troll_120: { shirt: 0x3a6a72, pants: 0x2c565e, hair: 0x24484e, skin: 0x5a9aa4 },
  ocean_troll_159: { shirt: 0x3a6a72, pants: 0x2c565e, hair: 0x24484e, skin: 0x5a9aa4 },
  ocean_troll_199: { shirt: 0x2e5660, pants: 0x22444a, hair: 0x1c3a40, skin: 0x4a8290 },

  /* --- the wilderness band (unit C2, the creature families) ------------------
     The six creatures the classic Wilderness was populated with (see the unit
     C2 spawns in src/world.js and the C2 block in src/tools/cache-bake/
     bake.mjs). The colours only matter to the blocky stand-in - the real art is
     the baked cache model - but they keep each creature legible if a model ever
     fails to load: the dark warrior and the bandit are two humans in black
     plate and in leather, the chaos dwarf is a dwarf in rust-red armour, the
     black unicorn is the unicorn's own body in charcoal, the grizzly bear is
     the black bear's body in a paler brown, and the black demon is the darkest
     thing in the demon line. */
  dark_warrior: { shirt: 0x2f2f34, pants: 0x24242a, hair: 0x1e1e22, skin: 0xdfae86 },
  bandit: { shirt: 0x6a5540, pants: 0x4a3a2a, hair: 0x2a2a2a, skin: 0xdfae86 },
  chaos_dwarf: { shirt: 0x8a3a26, pants: 0x4a2a1e, hair: 0xa05030, skin: 0xdfae86 },
  black_unicorn: { shirt: 0x2b2b32, pants: 0x2b2b32, hair: 0x3a3a44, skin: 0x2b2b32 },
  grizzly_bear: { shirt: 0x6a4a2a, pants: 0x6a4a2a, hair: 0x4a3420, skin: 0x8a6a45 },
  black_demon: { shirt: 0x3a1410, pants: 0x3a1410, hair: 0x1a0e0c, skin: 0x4a1a14 },
};

/* Combat stats straight out of the 2007 NPC definitions: hp, combat level and
   the attack/strength/defence levels the client's own combat formula reads.
   `size` is only the blocky stand-in's scale (the real number comes from the
   baked model's bounds) and `xp` is the hitpoints experience a kill grants.
   **A creature's loot is not here**: it is `items.js#NPC_DROPS`, keyed by the
   same type, and it is the only drop table the runtime reads (src/combat.js).
   There used to be a `drops: [...]` summary on every row as well, and it had
   already drifted from the real table by the time unit C1 audited the bestiary.
   `undead` is the one creature *class* a mechanic keys off by name today: the
   three undead-only spells (Crumble/Shatter/Pulverize, src/magic.js#SPELLS)
   refuse to fire at a creature without it. It is declared here on the creature's
   own row rather than in a list beside the spell, so a creature is classified
   where it is defined - see `isUndead` below. */
export const NPC_STATS = {
  man: { hp: 7, level: 2, attack: 1, strength: 1, defence: 1, size: 1, xp: 10 },
  woman: { hp: 7, level: 2, attack: 1, strength: 1, defence: 1, size: 1, xp: 10 },
  guard: { hp: 22, level: 21, attack: 15, strength: 15, defence: 15, size: 1, xp: 60 },
  banker: { hp: 10, level: 3, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  shopkeeper: { hp: 10, level: 3, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* The Wizards' Guild's own vendor, who unlike the town shopkeeper is not a
     combat NPC at all - level 0, exactly like the monk and the priest. */
  magic_store_owner: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* The specialist shopkeepers, none of them a combat NPC either. */
  armour_shop_owner: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  sword_shop_owner: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  archery_shop_owner: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  fishing_shop_owner: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  food_shop_owner: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  clothes_shop_owner: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* The capes of accomplishment' seller's mechanics (src/world.js, src/actions.js#
     SHOPS.skillcape): Mac (npc 6481, a level-0 pacifist like the other
     vendors), drawn from his own baked model. The town square's tutorial post
     is a different man entirely - the cache's own Wise Old Man (npc 2253). */
  wise_old_man: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  mac: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  makeover_mage: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* Wizard Thormac: a level-0 pacifist like the other tradesmen, and no drops
     row in items.js#NPC_DROPS - there is nothing to loot off him because, like
     the banker and the vendors, he cannot be fought at all
     (src/actions.js#npcCanAttack). */
  thormac: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* Dommik, who keeps the crafting shop: a level-0 pacifist like the other
     vendors, there to trade, never to fight (src/actions.js#npcCanAttack). */
  dommik: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* Brother Jered and the Spirit of Scorpius, who bless the silver symbols:
     level-0 pacifists like the monks and priests, attackable like them and
     hitting back for nothing (src/actions.js#npcCanAttack). */
  jered: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  scorpius: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0, undead: true },
  /* Wizard Sedridor: a level-0 pacifist like the other tradesmen - there to
     talk and to teleport, never to fight (src/actions.js#npcCanAttack). */
  sedridor: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* The Duke of Lumbridge: a level-0 pacifist like Hans and the cook -
     attackable like them, hitting back for nothing
     (src/actions.js#npcCanAttack). */
  duke: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* The Bee keeper in the smithy: a level-0 pacifist like the duke - there to
     stand and to talk, never to fight. */
  beekeeper: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* Hatius Cosaintus, keeper of the coin shrine in the woods north-east of
     the market: the cache's own Hatius (build-95 npc 5523, Talk-to, combat 0),
     baked with his 3rd-age plate, cloak, top hat and cane. A level-0 pacifist
     like the beekeeper - there to stand and to talk, never to fight. */
  hiatus: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  goblin: { hp: 12, level: 2, attack: 1, strength: 1, defence: 1, size: 1, xp: 12 },
  gas_goblin: { hp: 12, level: 2, attack: 1, strength: 1, defence: 1, size: 1, xp: 12 },
  /* Four creatures cannot be poisoned at all, and `poisonImmune` is why. The
     wiki's own list of monsters immune to poison names the cow, the calf, the
     chicken and the duck, and the reason the Poison page gives for the first of
     them is the reason for all four: "For certain NPCs, this [poison] timer is
     used for other actions instead, such as cows mooing; as a result, they
     cannot be poisoned, even if Monster Examine shows they're not immune." No
     other creature in this world's bestiary is on that list - every goblin and
     every demon and every dragon can be poisoned - so the four are the whole of
     it (src/combat.js#poisonOnHit reads the flag). */
  cow: { hp: 8, level: 2, attack: 1, strength: 1, defence: 1, size: 1.15, xp: 8, poisonImmune: true },
  cow_calf: { hp: 8, level: 2, attack: 1, strength: 1, defence: 1, size: 0.75, xp: 8, poisonImmune: true },
  chicken: { hp: 3, level: 1, attack: 1, strength: 1, defence: 1, size: 0.62, xp: 4, poisonImmune: true },
  rat: { hp: 2, level: 1, attack: 1, strength: 1, defence: 1, size: 0.5, xp: 4 },
  giant_rat: { hp: 5, level: 3, attack: 1, strength: 1, defence: 1, size: 1.2, xp: 15 },
  farmer: { hp: 7, level: 7, attack: 1, strength: 1, defence: 1, size: 1, xp: 21 },
  /* The town's monks and priests are pacifists - level 0, no real hitpoints -
     and the user has asked for them to be undead, so the undead-only spells do
     bite them (see `undead` above). It is the class that matters here, not the
     creature: they are otherwise ordinary humans. */
  monk: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0, undead: true },
  zombie: { hp: 30, level: 24, attack: 25, strength: 25, defence: 20, size: 1.1, xp: 90, undead: true },
  skeleton: { hp: 29, level: 22, attack: 20, strength: 20, defence: 20, size: 1.1, xp: 87, undead: true },
  /* Scully, the tutorial island's marooned teacher (src/world.js): a skeleton
     in a pirate hat, and otherwise just a skeleton - the same stats, the same
     drops (items.js#NPC_DROPS), the same style and max hit (src/combat.js), no
     aggression row (he never attacks on sight - the bestiary lists that as a
     note, which is the point for a teacher), and his own Talk-to
     (src/dialogue.js#NPC_TALK). His body is its own bake (src/models/skully.json:
     the skeleton with the pirate's hat merged onto its head bone), so the
     menu borrows the skeleton's def through the synthetic row in
     src/data/npc-cache-menus.json. */
  scully: { hp: 29, level: 22, attack: 20, strength: 20, defence: 20, size: 1.1, xp: 87, undead: true },
  ghost: { hp: 25, level: 19, attack: 20, strength: 20, defence: 15, size: 1.05, xp: 75, undead: true },
  giant_spider: { hp: 5, level: 2, attack: 1, strength: 1, defence: 1, size: 1.3, xp: 15 },
  imp: { hp: 8, level: 2, attack: 1, strength: 1, defence: 1, size: 0.9, xp: 24, demon: true },
  unicorn: { hp: 19, level: 15, attack: 11, strength: 13, defence: 11, size: 1.4, xp: 57 },
  dark_wizard: { hp: 22, level: 20, attack: 15, strength: 15, defence: 10, size: 1, xp: 66, zamorak: true },
  dark_wizard_young: { hp: 12, level: 7, attack: 6, strength: 6, defence: 4, size: 1, xp: 36, zamorak: true },

  /* --- the wider population -------------------------------------------------
     `xp` follows the same 3 x hitpoints rule the rest of the table uses (the
     live game's own experience for an NPC kill), and the levels are the NPCs'
     published combat levels. `size` only matters to the blocky stand-in. */
  barbarian: { hp: 14, level: 7, attack: 6, strength: 6, defence: 4, size: 1, xp: 42 },
  wizard: { hp: 14, level: 9, attack: 7, strength: 7, defence: 6, size: 1, xp: 42 },
  druid: { hp: 40, level: 33, attack: 25, strength: 25, defence: 30, size: 1, xp: 120 },
  warrior_woman: { hp: 20, level: 24, attack: 18, strength: 18, defence: 18, size: 1, xp: 60 },
  knight_of_ardougne: { hp: 52, level: 46, attack: 35, strength: 35, defence: 35, size: 1, xp: 156 },
  /* Priests are not combat NPCs - level 0, exactly like the monk - and, like
     the monk, they carry the undead class the user asked for. */
  priest: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0, undead: true },
  soldier: { hp: 26, level: 28, attack: 22, strength: 22, defence: 22, size: 1, xp: 78 },
  mugger: { hp: 8, level: 6, attack: 5, strength: 5, defence: 4, size: 1, xp: 24 },
  black_knight: { hp: 42, level: 33, attack: 25, strength: 25, defence: 25, size: 1, xp: 126, zamorak: true },
  highwayman: { hp: 13, level: 5, attack: 4, strength: 4, defence: 2, size: 1, xp: 39 },
  rogue: { hp: 18, level: 15, attack: 13, strength: 13, defence: 13, size: 1, xp: 54 },
  monk_of_zamorak: { hp: 25, level: 22, attack: 20, strength: 20, defence: 20, size: 1, xp: 75, undead: true, zamorak: true },
  /* Solus Dellagar, the Wanted! quest's warrior-mage, standing alone on the
     open ground south of the grove: the cache's own Talk-to variant
     (npc 2747) is combat level 0, so he is a level-0 pacifist like the other
     townsfolk. */
  solus_dellagar: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  /* The Wanted! quest's Ranger, standing with Solus south of the grove: the
     cache's own Attack variant (npc 2779) is combat level 0, so he is a
     level-0 pacifist too. */
  ranger: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  surok_magis: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  surok_magis_dagonhai: { hp: 10, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },

  unicorn_foal: { hp: 12, level: 12, attack: 9, strength: 11, defence: 9, size: 1, xp: 36 },
  /* The churchyard's mage stands on its own published line rather than the
     skeleton warrior's: the wiki's Skeleton Mage is **level 16 with 17
     hitpoints and 14/14/14**, and the cache's own entry for the body this model
     was baked from (npc 94) carries 16 as well. Unit C1's audit found the row
     had been built up to the skeleton's 22/20s. Its published max hit of 3 is
     what `NPC_MAX_HIT` already carried, and both this line and the skeleton's
     now come out of the player formula at the level the client draws. */
  skeleton_mage: { hp: 17, level: 16, attack: 14, strength: 14, defence: 14, size: 1, xp: 51, undead: true },

  duck: { hp: 1, level: 1, attack: 1, strength: 1, defence: 1, size: 1, xp: 4, poisonImmune: true },
  duckling: { hp: 1, level: 1, attack: 1, strength: 1, defence: 1, size: 0.65, xp: 4 },
  /* The gull is the one bird on this row that is not a one-hitpoint pest: the
     wiki's Seagull is **level 2 with 6 hitpoints**, and the cache body this
     model was baked from (npc 6115) draws the same level. Its published max hit
     is 0, which `NPC_MAX_HIT`'s fallback turns into the 1 every harmless row
     uses. */
 seagull: { hp: 6, level: 2, attack: 1, strength: 1, defence: 1, size: 1, xp: 18 },
  /* The cay's beach crabs (cache npc 2706, "Crab"): combat level 0 in the
     cache, no actions, ambient wanderers - unattackable by design (see
     actions.js#npcCanAttack and combat.js#attackNpc), so level stays 0 and
     no combat rows are needed. */
  crab: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1, xp: 0 },
  sheep: { hp: 3, level: 1, attack: 1, strength: 1, defence: 1, size: 1, xp: 4 },
  ram: { hp: 3, level: 2, attack: 1, strength: 1, defence: 1, size: 1, xp: 4 },
  /* The published Guard dog, which is the creature whose body this model was
     baked from: **level 44, 49 hitpoints, 35/36/37, a maximum hit of 5**, and
     the same combat level the cache draws for it. Unit C1's audit found a
     level-27, 13-hitpoint dog here that no page ever published. Its published
     aggression is "Varies", so it keeps no `AGGRO` row - it guards its gate
     without starting anything, and its published attack speed and defence
     bonus are the table defaults, so neither needs a row either. */
  guard_dog: { hp: 49, level: 44, attack: 35, strength: 36, defence: 37, size: 1, xp: 147 },
  /* The wiki publishes five wolves that share this body, and the one this world
     spawns is the **level-11 grey wolf** - its page's own variant 1, released
     in 2006, not aggressive, 10 hitpoints, and **10/10/10**, where unit C1's
     audit found a toned-down 8/8/6. The cache's id for the model is the
     level-64 wolf of the same page, which is why the audit's cache-level line
     for this key reads 64. */
  wolf: { hp: 10, level: 11, attack: 10, strength: 10, defence: 10, size: 1, xp: 30 },
  dwarf: { hp: 16, level: 10, attack: 9, strength: 9, defence: 9, size: 1, xp: 48 },
  hobgoblin: { hp: 15, level: 28, attack: 18, strength: 18, defence: 18, size: 1, xp: 45 },
  /* The published Bear Cub: **level 15, 20 hitpoints, 10/15/10, slashing**.
     The level-5, 8-hitpoint row this replaced was this world's own invention,
     and the published one also gives the black bear a cub that is genuinely
     weaker than it is. */
  bear_cub: { hp: 20, level: 15, attack: 10, strength: 15, defence: 10, size: 1, xp: 60 },

  /* --- the wider bestiary (src/PLAN.md unit E) ------------------------------
     Published 2007 combat levels, hitpoints and max hits; `attack`/`strength`/
     `defence` are the levels that produce the published combat level through
     the same formula the game uses. `xp` is 3 x hitpoints, the live game's own
     experience for a kill. `size` is the baked model's own height in tiles, so
     the blocky stand-in is at least the right scale if a model fails to load.

     The drops are in src/items.js#NPC_DROPS with the rest of the bestiary. */
  black_bear: { hp: 25, level: 19, attack: 15, strength: 16, defence: 13, size: 1.35, xp: 75 },
  hill_giant: { hp: 35, level: 28, attack: 18, strength: 20, defence: 26, size: 2.7, xp: 105 },
  moss_giant: { hp: 60, level: 42, attack: 30, strength: 33, defence: 30, size: 2.9, xp: 180 },
  fire_giant: { hp: 111, level: 86, attack: 65, strength: 65, defence: 65, size: 2.8, xp: 333 },
  ice_giant: { hp: 70, level: 53, attack: 40, strength: 42, defence: 40, size: 2.9, xp: 210 },
  lesser_demon: { hp: 79, level: 82, attack: 68, strength: 70, defence: 62, size: 2.4, xp: 237, demon: true },
  greater_demon: { hp: 87, level: 92, attack: 76, strength: 78, defence: 72, size: 3.7, xp: 261, demon: true },
  scorpion: { hp: 17, level: 14, attack: 10, strength: 11, defence: 10, size: 0.5, xp: 51 },
  deadly_red_spider: { hp: 35, level: 34, attack: 26, strength: 28, defence: 26, size: 0.4, xp: 105 },
  giant_bat: { hp: 32, level: 27, attack: 22, strength: 22, defence: 20, size: 2.0, xp: 96 },
  crawling_hand: { hp: 16, level: 8, attack: 6, strength: 6, defence: 4, size: 0.3, xp: 48 },
  banshee: { hp: 22, level: 23, attack: 18, strength: 18, defence: 18, size: 2.05, xp: 66, undead: true },
  blue_dragon: { hp: 120, level: 111, attack: 90, strength: 90, defence: 90, size: 3.3, xp: 360, dragonfire: 50 },
  /* The three smaller chromatic dragons and the snake (src/PLAN.md unit P):
     published combat levels, hitpoints, max hits and combat stats from each
     creature's own 2007-era infobox, with `attack`/`strength`/`defence` the
     levels that produce that published combat level through the game's own
     formula. `xp` is 3 x hitpoints like every other row here. All three dragons
     breathe (the same `dragonfire` field the blue dragon and the King Black
     Dragon carry, which is the bare maximum `combat.js#dragonfireMax` repeats),
     and all three
     are 3.3 tiles tall - the baked model's own height, shared with the blue
     dragon because they share its rig. */
  green_dragon: { hp: 75, level: 79, attack: 68, strength: 68, defence: 68, size: 3.3, xp: 225, dragonfire: 50 },
  red_dragon: { hp: 140, level: 152, attack: 130, strength: 130, defence: 130, size: 3.3, xp: 420, dragonfire: 50 },
  black_dragon: { hp: 190, level: 227, attack: 200, strength: 200, defence: 200, size: 3.3, xp: 570, dragonfire: 50 },
  /* The level-5 snake (npc 128): 6 hitpoints, a max hit of 1, and 18 XP a kill.
     Its model is the smallest thing in the bestiary at 0.11 tiles tall and 1.68
     long - it lies along the ground, so its `size` is the length, not a height,
     and it is the one creature whose stand-in box should read as flat. */
  snake: { hp: 6, level: 5, attack: 4, strength: 5, defence: 3, size: 1.68, xp: 18 },
  earth_warrior: { hp: 54, level: 51, attack: 38, strength: 40, defence: 38, size: 1.7, xp: 162 },
  chaos_druid: { hp: 20, level: 13, attack: 10, strength: 10, defence: 10, size: 1.6, xp: 60 },
  /* The river trolls (the 2014 random event, baked from the build-95 cache -
     only the three high tiers walk this world, see tickRiverTrollEvent). Wiki
     combat stats per tier (attack/strength/defence 65/100/130, HP 85/120/170,
     max hits 7/11/14), crush attackers on the ordinary 4-tick cycle. `xp`
     breaks the 3 x hitpoints rule on purpose: the live game's own -97.5%
     random-event XP penalty, which is why the wiki warns they are not worth
     slaying. `size` is the baked model's own 1.6-tile standing height. */
  river_troll_79: { hp: 85, level: 79, attack: 65, strength: 65, defence: 65, size: 1.6, xp: 6 },
  river_troll_120: { hp: 120, level: 120, attack: 100, strength: 100, defence: 100, size: 1.6, xp: 9 },
  river_troll_159: { hp: 170, level: 159, attack: 130, strength: 130, defence: 130, size: 1.6, xp: 13 },
  /* The pack's alpha walks the same banks: top-tier river troll 6658 at
     double scale (the cache has no bigger teal troll - baked as
     `river_troll_big`). One per wave at most, and only ever for company the
     spawner's own combat level earned. `size` is the stand-in fallback only. */
  river_troll_199: { hp: 220, level: 199, attack: 160, strength: 160, defence: 160, size: 3.2, xp: 17 },
  /* The ocean trolls (user ask 2026-10-30): the sea's own family - same stats
     and tiers as the river pack, own blue look, waves rise from ocean water
     only (see tickRiverTrollEvent). */
  ocean_troll_79: { hp: 85, level: 79, attack: 65, strength: 65, defence: 65, size: 1.6, xp: 6 },
  ocean_troll_120: { hp: 120, level: 120, attack: 100, strength: 100, defence: 100, size: 1.6, xp: 9 },
  ocean_troll_159: { hp: 170, level: 159, attack: 130, strength: 130, defence: 130, size: 1.6, xp: 13 },
  ocean_troll_199: { hp: 220, level: 199, attack: 160, strength: 160, defence: 160, size: 3.2, xp: 17 },

  /* --- the town's own people (src/PLAN.md unit J) ---------------------------
     Every one of these is a *townsman*, not a monster: level 0, no real
     hitpoints, no drops, exactly like the monk, the priest, the banker and the
     shopkeepers above. A town you can pick a fight with is not a town, and the
     whole point of this row is that a person with a job is not a resource.

     `size` is the baked model's own height in tiles, so the blocky stand-in is
     the right scale if a model fails to load - which is why the child and the
     schoolgirl are the two short rows: their defs author them at 1.07 and 1.13
     tiles, and that is what the bake produced. (Two of the twelve do carry a
     combat level in the cache - the gardener 4, the drunken man 3 - but a
     level-4 gardener who attacks you on sight is neither this world nor the
     live game's Lumbridge, so both are pacifists here.) */
  hans: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.58, xp: 0 },
  lumbridge_guide: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.58, xp: 0 },
  cook: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.74, xp: 0 },
  fisherman: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.61, xp: 0 },
  miner: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.58, xp: 0 },
  beggar: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.58, xp: 0 },
  child: { hp: 3, level: 0, attack: 1, strength: 1, defence: 1, size: 1.07, xp: 0 },
  /* Crassus, Hatius Cosaintus's yellow cat, wandering the shrine clearing: a
     level-0 pacifist like the child, and rat-small (size 0.5) rather than
     child-tall - the size is only the blocky stand-in's scale. */
  crassus: { hp: 3, level: 0, attack: 1, strength: 1, defence: 1, size: 0.5, xp: 0 },
  schoolgirl: { hp: 3, level: 0, attack: 1, strength: 1, defence: 1, size: 1.13, xp: 0 },
  gardener: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.58, xp: 0 },
  shop_assistant: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.59, xp: 0 },
  apprentice: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.82, xp: 0 },
  drunken_man: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.58, xp: 0 },
  /* The tanner (src/PLAN.md unit O): NPC 804, combat level 0 in the cache, and
     a tradesman rather than a monster here like the rest of this block. His
     height is the baked model's own 1.578 tiles. */
  tanner: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.578, xp: 0 },
  /* The herbalist, like the tanner: a tradesman, not a monster. */
  herbalist: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.59, xp: 0 },
  /* Bob's Brilliant Axes' owner (NPC 519, combat level 0): a human
     axe-seller, and 1.586 tiles is his own baked model's height. */
  bob: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.586, xp: 0 },
  /* Fred the Farmer (NPC 758, combat level 0 in the cache): a pacifist like the
     tanner and the herbalist - he has no attack option anywhere in his
     conversation tree or his def. */
  fred: { hp: 5, level: 0, attack: 1, strength: 1, defence: 1, size: 1.64, xp: 0 },

  /* --- the bosses (src/PLAN.md unit I) --------------------------------------
     The published stat lines, taken from each creature's own wiki infobox (the
     values are unchanged from this era's): all three Dagannoth Kings are combat
     303 with 255 hitpoints and the Dragon King's 255 attack and strength, Rex
     and Prime at 255 Defence and Supreme at 128; the King Black Dragon is
     combat 276 with 240 hitpoints and 240 in every stat. `xp` is 3 x hitpoints
     like every other row in this table (765 for a King, 720 for the dragon),
     which is the engine's own rule rather than the wiki's `slayxp`.

     Two optional fields matter here:

     * `dragonfire` - the creature's breath attack (src/game.js#dragonfireOf).
       The blue dragon's published melee max hit is 10 and its dragonfire is 50;
       the King Black Dragon's are 25 (melee) and 65 (dragonfire). The blue
       dragon has carried the field from this pass on, so an anti-dragon shield
       finally has something to do - and the *protection* it buys (5 of those 50
       for a chromatic dragon, 15 of the King Black Dragon's 65) is the wiki's
       own table, `combat.js#dragonfireMax`.
     * `poison` - the *initial damage* of the creature's poison, the number the
       wiki's poisonous-monsters table prints (src/combat.js#inflictPoison).
       Only the King Black Dragon carries one: it is the one poisonous monster
       this world spawns (initial damage 8). The common snake is deliberately
       NOT poisonous, which is what the cache's own revision says - the wiki's
       Snake page is explicit that it does not inflict poison, so the antidotes
       are aimed at the dragon.
     * `size` is the baked model's height in tiles, used only by the blocky
       stand-in if a model fails to load. */
  dagannoth_supreme: { hp: 255, level: 303, attack: 255, strength: 255, defence: 128, size: 3.1, xp: 765 },
  dagannoth_prime: { hp: 255, level: 303, attack: 255, strength: 255, defence: 255, size: 3.4, xp: 765 },
  dagannoth_rex: { hp: 255, level: 303, attack: 255, strength: 255, defence: 255, size: 3.0, xp: 765 },
  king_black_dragon: { hp: 240, level: 276, attack: 240, strength: 240, defence: 240, size: 3.9, xp: 720, dragonfire: 65, poison: 8 },

  /* -------------------------------------------------- the Barrows brothers
     (src/PLAN.md unit T) - the six vengeful spirits of the crypt in the
     graveyard's north-east corner. Every number is the brother's own page:
     the four melee brothers are a flat 100/100/100 with 100 hitpoints and a
     combat level of 115, while Karil (100 Ranged, 1 Attack and Strength) and
     Ahrim (100 Magic, 1 Attack and Strength) are 98 - so they are *hit* like a
     level-100 creature and hit back through their weapon, which is the whole
     shape of the fight. Their accuracy uses `attack` in every case, because
     that is the level this world's accuracy roll reads; Karil's and Ahrim's
     real accuracy stats (Ranged and Magic) are the same 100. `xp` is each
     brother's published Slayer XP, the figure the rest of this table uses. */
  dharok: { hp: 100, level: 115, attack: 100, strength: 100, defence: 100, size: 1, xp: 115, undead: true },
  guthan: { hp: 100, level: 115, attack: 100, strength: 100, defence: 100, size: 1, xp: 115, undead: true },
  verac: { hp: 100, level: 115, attack: 100, strength: 100, defence: 100, size: 1, xp: 112.5, undead: true },
  torag: { hp: 100, level: 115, attack: 100, strength: 100, defence: 100, size: 1, xp: 112.5, undead: true },
  karil: { hp: 100, level: 98, attack: 100, strength: 1, defence: 100, size: 1, xp: 100, undead: true },
  ahrim: { hp: 100, level: 98, attack: 100, strength: 1, defence: 100, size: 1, xp: 102.5, undead: true },

  /* --- the wilderness band (unit C2, the creature families) ------------------
     Six more of the era's creatures, added as families rather than one-offs
     (src/TODO.md, unit C2). Every line is the creature's own published infobox
     - combat level, hitpoints and the attack/strength/defence levels that
     produce that combat level through the client's own formula - with `xp` on
     the usual 3 x hitpoints rule, and `size` the *baked model's* own height in
     tiles, which is what the blocky stand-in uses if the real model fails:
     1.578 for the two humans (the man's own body), 1.297 for the chaos dwarf
     (the dwarf's body at the def's 133% scale), 1.537 for the black unicorn
     (the unicorn's body), 1.273 for the grizzly bear (the black bear's body)
     and 4.32 for the black demon, which is the greater demon's own 4.32-tile
     body - the demon line's largest silhouette until a boss shows up.

     **One trap worth recording, because it cost a bake.** The wiki's own `id`
     field for these creatures is the *modern* OSRS id, and it is not this
     2007-era cache's id: the first attempt at this block baked wiki ids and
     quietly produced Dark warrior -> "Shop assistant" (531) and Black demon ->
     "Sir Gawain" (240). The ids here are the cache's own (192, 195, 119, 133,
     105, 84), read out of the cache's npc definitions, and `parseNpc` is the
     only thing that may choose them. */
  dark_warrior: { hp: 17, level: 8, attack: 5, strength: 5, defence: 5, size: 1.578, xp: 51 },
  bandit: { hp: 27, level: 22, attack: 17, strength: 17, defence: 17, size: 1.578, xp: 81 },
  chaos_dwarf: { hp: 61, level: 48, attack: 38, strength: 42, defence: 28, size: 1.297, xp: 183 },
  black_unicorn: { hp: 29, level: 27, attack: 21, strength: 23, defence: 23, size: 1.537, xp: 87 },
  grizzly_bear: { hp: 27, level: 21, attack: 17, strength: 18, defence: 15, size: 1.273, xp: 81 },
  /* The black demon closes the demon line the map's north-west already builds
     towards (imp 708 -> lesser 82 -> greater 83 -> black 84), and it carries the
     `demon` class beside the two smaller ones, so Darklight's Weaken special is
     twice as hard on all three. */
  black_demon: { hp: 157, level: 172, attack: 145, strength: 148, defence: 152, size: 4.32, xp: 471, demon: true },
  /* **Saradomin**, the god in the north-western woods (the user's ask,
     2026-09-24; his whole fight lives in src/saradomin.js). He is not a
     creature of the bestiary so much as a small encounter: he stands where he
     is planted, never wanders and never swings a weapon, and he throws the
     spell that carries his name at everything within a tile of him - a 3x3
     nova - three times as hard on a demon or a Zamorakian
     (src/game.js#isHolyFoe).

     200 hitpoints at combat level 250 with Defence 100 and the +25 melee
     defence below make him about the wall a black demon is, which is the right
     place for him: killable by a high-level player, fatal to wander into at
     low level. His *own* attack level and Strength are 1, because nothing in
     his fight reads them - the nova's damage is rolled in his own module, not
     through `npcMaxHit`. He carries neither the `demon` nor the `undead` class:
     he is neither, and nothing in the game should read him as one. */
  saradomin: { hp: 200, level: 250, attack: 1, strength: 1, defence: 100, size: 1.578, xp: 600 },
  iban: { hp: 174, level: 150, attack: 76, strength: 78, defence: 77, size: 1.578, xp: 522, undead: true },
};

/* Is this creature of the undead class? The undead-only spells ask this about
   the creature they are pointed at (src/combat.js#castAt) instead of comparing
   its name against a hard-coded list, so the classification lives with the
   creature's own stats and a new undead creature only has to declare itself. */
export function isUndead(type) {
  const s = NPC_STATS[type];
  return !!(s && s.undead);
}

/* Is this creature a demon? Darklight's Weaken special attack is twice as hard
   on them (10% off Attack, Strength and Defence rather than 5%; see
   src/combat.js#SPECIALS). Declared the same way the undead class is - on the
   creature's own row in NPC_STATS - so a demon added later only has to say so.

   The class is the *demon line* the cache draws from the imp up: `imp` is one
   (it is a demon in the live game, and Saradomin's own strike below treats it as
   one), lesser/greater/black demon are the other three. */
export function isDemon(type) {
  const s = NPC_STATS[type];
  return !!(s && s.demon);
}

/* Is this creature **Zamorak's**? A class of its own, declared on the row the
   way `undead` and `demon` are, and read by the one thing that cares: the god
   in the northern woods (src/saradomin.js), whose strike is three times as hard
   on a demon or a Zamorakian as on anything else.

   Three creatures carry it, and they are the cache's own Zamorakians: the
   **monk of Zamorak** (his order, in his own robes), the **dark wizard** (the
   Zamorakian mages of the wilds - the live game's own dark wizards wear Zamorak
   robes) and the **black knight** (Zamorak's knights, who hold the wilderness
   camp). Nothing else in the bestiary has a god attached to it. */
export function isZamorakian(type) {
  const s = NPC_STATS[type];
  return !!(s && s.zamorak);
}

/* Is this creature one the god's strike is three times as hard on? */
export function isHolyFoe(type) {
  return isDemon(type) || isZamorakian(type);
}

/* ------------------------------------------------------- the ground a body owns

   Most creatures are one tile wide, and their tile *is* their body: you stand
   beside them, you click them, they block nothing a player may walk onto. A few
   are not. The demon line is drawn with a **tile floor** - the cache's own NPC
   definitions give the lesser demon a 2x2 and the greater and black demons a
   3x3 - and those are the numbers `NPC_FOOT` writes down, hand-declared here for
   the same reason `TREE_FOOT` (src/world.js) is: the world and the renderer both
   need to know the span, and it is one line per creature.

   A footprint is the *ground* the creature occupies, not a solid block. The user's
   rule (2026-09-24) is the same one the trees already follow in reverse: a player
   may stand under a big monster ("a player can stand under a 2x2 or 3x3
   monster"), because a player's step is never blocked by a body at all
   (`isPlayerBody`), but the ground it covers still counts as *its* for everything
   else - other creatures plan around it (`entityBlockTest`), nothing is placed
   inside it (`entityAtTile`), and above all **an attack is measured against it**:
   a melee blow is struck from a tile beside the *floor*, not from inside it, so a
   player standing under a demon is walked out to the nearest of the four sides
   before the sword falls (src/combat.js#reachTo / #stepOutFromUnder).

   The demon line and the dragons carry a floor. A creature not named here is
   1x1, which is what the whole rest of the bestiary is. */
export const NPC_FOOT = {
  lesser_demon: 2,
  greater_demon: 3,
  black_demon: 3,
  /* The dragons (OSRS wiki infoboxes, matching the cache def sizes the demon
     line above was read from): every chromatic dragon is 4x4 and the King
     Black Dragon is 5x5. Until this row the dragons were 1x1, so a melee blow
     was measured to the dragon's middle and the `::boxes` view drew no ground
     for them at all - even though the baked model is 2.7 tiles wide and 5.8
     long and visibly covers several tiles. */
  green_dragon: 4,
  blue_dragon: 4,
  red_dragon: 4,
  black_dragon: 4,
  king_black_dragon: 5,
};

/* How many tiles across a creature's floor is. */
export function npcFoot(type) {
  return NPC_FOOT[type] || 1;
}

/* The tiles a body covers, as `{x0, z0, x1, z1}` - inclusive tile coordinates,
   off the body's own tile. That tile is the footprint's SOUTH-WEST corner:
   the live game's own rule (OSRS wiki, "Game square": *"for larger monsters,
   their location is defined by the south-westernmost square they occupy"*),
   and the location every other calculation - drops, the census, the
   spawn table - is taken from. So the floor grows EAST (+x) and NORTH (-z,
   which is north here: see world.js#edgeCrossed) from the body's tile, and an
   entity's x/z is the centre of that corner tile, exactly as a 1x1 body's is
   of its own tile. `n` comes with it so a caller can loop the block without
   re-reading the field. */
export function npcFootBox(e) {
  const n = (e && e.foot) || 1;
  const x0 = Math.floor(e.x);
  const z1 = Math.floor(e.z);
  return { x0, z0: z1 - n + 1, x1: x0 + n - 1, z1, n };
}

/* Where a body's MODEL is drawn: the middle of its floor. The logic walks on
   the south-west tile (see `npcFootBox`) but the art stands over the whole
   footprint, so the group is posed at the centre - (n-1)/2 tiles east and
   (n-1)/2 tiles north of the body's tile - and everything drawn off the body
   (its click box, its bars, its missiles, its `::boxes` outline) reads from
   there. A 1x1 body is its own middle, so both helpers are the identity for
   everything ordinary and only big bodies move. */
export function npcDrawCX(e, x) {
  const n = (e && e.foot) || 1;
  return (x == null ? e.x : x) + (n > 1 ? (n - 1) / 2 : 0);
}
export function npcDrawCZ(e, z) {
  const n = (e && e.foot) || 1;
  return (z == null ? e.z : z) - (n > 1 ? (n - 1) / 2 : 0);
}

/* Is this tile inside the floor? */
export function inFoot(x, z, box) {
  return x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
}

/* Every tile of a floor, for face checks (world.js#swingBlocked asks pairs). */
export function floorTiles(box) {
  const out = [];
  for (let x = box.x0; x <= box.x1; x++) {
    for (let z = box.z0; z <= box.z1; z++) out.push({ x, z });
  }
  return out;
}

/* How far a tile is from the floor, in both of the measures this game uses: the
   **orthogonal** one (Manhattan, the measure a melee reach is taken in) and the
   **chebyshev** one (the client's own, which counts a diagonal step as one - the
   measure a spell or a bow is taken in). Zero means the tile is inside the floor,
   which is "standing under it". A 1x1 floor gives exactly the old tile-to-tile
   numbers, so every ordinary creature is untouched by this. */
export function footDistance(x, z, box) {
  const dx = x < box.x0 ? box.x0 - x : (x > box.x1 ? x - box.x1 : 0);
  const dz = z < box.z0 ? box.z0 - z : (z > box.z1 ? z - box.z1 : 0);
  return { orth: dx + dz, cheb: Math.max(dx, dz), dx, dz };
}

/* The tile of a body's floor nearest another tile: what a melee attacker is
   measured *to* (see `footDistance` above, whose `dx`/`dz` are the distance to
   this tile), and what the walk-in to a victim aims at. */
export function nearestFootTile(x, z, box) {
  return {
    x: x < box.x0 ? box.x0 : (x > box.x1 ? box.x1 : x),
    z: z < box.z0 ? box.z0 : (z > box.z1 ? box.z1 : z),
  };
}

/* The tile a body is *at* for reach purposes - the nearest tile of its floor,
   which for a 1x1 body is simply the tile it stands on. */
export function reachTileOf(e) {
  if (!e) return null;
  if (!(e.foot > 1)) return { x: Math.floor(e.x), z: Math.floor(e.z) };
  return nearestFootTile(Math.floor(e.x), Math.floor(e.z), npcFootBox(e));
}

/* How hard the creature's dragonfire hits, or 0 for a creature that does not
   breathe it. A dragon's *melee* max hit is the small published one - 25 for the
   King Black Dragon, 10 for the blue dragon - and its breath is the one that
   kills people, which is why the two numbers live apart (see
   src/combat.js#NPC_DRAGONFIRE for what a shield does about it). */
export function dragonfireOf(type) {
  const s = NPC_STATS[type];
  return (s && s.dragonfire) || 0;
}

/* Display names for the NPC types whose spawn key does not prettify into the
   name the live game prints: a key is lowercase-and-underscores, while a few
   NPC names capitalise the second word as well. */
export const NPC_NAMES = {
  knight_of_ardougne: "Knight of Ardougne",
  monk_of_zamorak: "Monk of Zamorak",
  skeleton_mage: "Skeleton Mage",
  /* The cache's own capitals. Everything else in the new bestiary matches the
     default title-casing, but the giant's second word is capitalised in the NPC
     definition and the crawling hand's is, so both are spelled out. */
  hill_giant: "Hill Giant",
  crawling_hand: "Crawling Hand",
  /* The tier suffix is machinery, not a name - the cache calls every tier
     "River troll". */
  river_troll_79: "River troll",
  river_troll_120: "River troll",
  river_troll_159: "River troll",
  river_troll_199: "River troll",
  ocean_troll_79: "Ocean troll",
  ocean_troll_120: "Ocean troll",
  ocean_troll_159: "Ocean troll",
  ocean_troll_199: "Ocean troll",
  magic_store_owner: "Magic Shop owner",
  armour_shop_owner: "Armour Shop owner",
  sword_shop_owner: "Sword seller",
  archery_shop_owner: "Archery Shop owner",
  fishing_shop_owner: "Fishing Shop owner",
  food_shop_owner: "Food Store owner",
  clothes_shop_owner: "Clothes Shop owner",
  wise_old_man: "Wise Old Man",
  mac: "Mac",
  makeover_mage: "Makeover Mage",
  dark_wizard_young: "Dark wizard",
  /* The town's own people (src/PLAN.md unit J): the two whose names are more
     than one capitalised word. The cache spells the guide's own name out, and
     the live game never capitalises the second word of "Shop assistant" or
     "Drunken man". */
  lumbridge_guide: "Lumbridge Guide",
  shop_assistant: "Shop assistant",
  drunken_man: "Drunken man",
  herbalist: "Herbalist",
  solus_dellagar: "Solus Dellagar",
  ranger: "Ranger",
  surok_magis: "Surok Magis",
  surok_magis_dagonhai: "Surok Magis",
  bob: "Bob",
  fred: "Fred the Farmer",
  thormac: "Wizard Thormac",
  sedridor: "Wizard Sedridor",
  duke: "Duke Horacio",
  beekeeper: "Bee keeper",
  crassus: "Crassus",
  hiatus: "Hatius Cosaintus",
  gas_goblin: "G.A.S. Goblin",
  dommik: "Dommik",
  jered: "Brother Jered",
  scorpius: "Spirit of Scorpius",
  /* Just Scully - no title, no rank. He would insist on the distinction. */
  scully: "Scully",
};

/* Spawn types that wear an NPC they are not: a vendor can be a variant of an
   existing person rather than a new bake, so the Wizards' Guild's store owner
   uses the shopkeeper model (she is a shopkeeper, just not the town's). Keyed
   type -> the baked model key to draw it from. */
export const NPC_MODEL_ALIASES = {
  magic_store_owner: "shopkeeper",
  /* The specialist shopkeepers draw from the same baked shopkeeper model - only
     the name and the look distinguish them, and both are data (NPC_NAMES /
     NPC_LOOKS above). */
  armour_shop_owner: "shopkeeper",
  sword_shop_owner: "shopkeeper",
  archery_shop_owner: "shopkeeper",
  fishing_shop_owner: "shopkeeper",
  food_shop_owner: "shopkeeper",
  clothes_shop_owner: "shopkeeper",
  herbalist: "shopkeeper",
  makeover_mage: "wizard",
  /* Dommik is a shopkeeper like the rest; Jered wears the monk's own baked
     habit and Scorpius the ghost's - the cache's Dommik (npc 545), Brother
     Jered (npc 802) and Spirit of Scorpius (npc 492). */
  dommik: "shopkeeper",
  jered: "monk",
  scorpius: "ghost",
  /* Sedridor wears the blue wizard's own baked body; his white beard is his
     look above, not a new model. */
  sedridor: "wizard",
  dark_wizard_young: "dark_wizard",
  /* A sheep is the cache's *woolly* animal - NPC 43, whose own option list is
     exactly "Shear" - while the `sheep` model key is NPC 42, the very same
     animal shorn, which the cache gives no options at all. They are two
     creatures and two bakes, so the type aliases onto the woolly model, and
     shearing swaps that one sheep over to the shorn key until its fleece grows
     back (src/actions.js#shearSheep -> game.js#setNpcModel). Aliasing here
     rather than renaming the bakes leaves the model keys alone, which the
     bestiary audit tool and README's own model tables both name. */
  /* Scully is drawn from his own bake (src/models/skully.json) - the alias
     exists because the spawn type carries his name while the bake keeps the
     old key, same as the sheep's woolly model above. */
  scully: "skully",
  sheep: "sheep_2",
  /* Crassus is the cache's Cat (npc 768), baked as `cat` - the spawn type
     carries the name and the stats, only the model key is shared. Hatius
     needs no alias: he is drawn from his own baked model (build-95 npc
     5523) under his own key. */
  crassus: "cat",
  /* The three walking tiers share the one river_troll bake (see
     src/tools/cache-bake/bake.mjs#CHARACTERS). */
  river_troll_79: "river_troll",
  river_troll_120: "river_troll",
  river_troll_159: "river_troll",
  river_troll_199: "river_troll_big",
  /* The ocean family walks in the same bodies (see CHARACTERS) - the blue is
     a spawn-time material tint, not a second bake (see createNpc). */
  ocean_troll_79: "river_troll",
  ocean_troll_120: "river_troll",
  ocean_troll_159: "river_troll",
  ocean_troll_199: "river_troll_big",
};

/* Cosmetic skins. Jagex ships several NPC ids whose only difference is the
   model the creature is drawn from - four cow hides, three chicken bantams and
   the rooster - and a real herd is a mix of them. The spawn type still decides
   the stats, drops and behaviour; only the model key changes, picked round
   robin by the spawn index so a field of cows reads like the live game's. */
export const NPC_MODEL_VARIANTS = {
  cow: ["cow", "cow_2", "cow_3", "cow_4"],
  chicken: ["chicken", "chicken_2", "chicken_3", "chicken_4", "rooster"],
  /* The other creatures Jagex ships in several skins, same idea: the spawn type
     carries the stats and the drop table, only the model key changes. */
  zombie: ["zombie", "zombie_2", "zombie_3", "zombie_4"],
  skeleton: ["skeleton", "skeleton_2"],
  goblin: ["goblin", "goblin_2", "goblin_3"],
  gas_goblin: ["goblin", "goblin_2", "goblin_3"],
  giant_rat: ["giant_rat", "giant_rat_2"],
};

/* Model key for a spawn type: the baked character models are keyed by the same
   names the world uses for its spawn types. */
export function npcModelKey(type) {
  const variants = NPC_MODEL_VARIANTS[type];
  if (variants) return variants[0];
  const alias = NPC_MODEL_ALIASES[type];
  if (alias) return modelData.has(alias) ? alias : null;
  return modelData.has(type) ? type : null;
}

/* The model this particular spawn draws from: the same base key, or one of the
   type's skins. `idx` is the 1-based spawn counter for the type (see
   createNpc), so a run of spawns cycles through the skins deterministically. */
function variantModelKey(type, idx) {
  const variants = NPC_MODEL_VARIANTS[type];
  if (variants && variants.length > 1) {
    const k = variants[((idx - 1) % variants.length + variants.length) % variants.length];
    if (modelData.has(k)) return k;
  }
  const alias = NPC_MODEL_ALIASES[type];
  if (alias && modelData.has(alias)) return alias;
  return modelData.has(type) ? type : null;
}

/* Builds the render object for an *archetype* (src/archetypes.js): a humanoid
   NPC that wears an outfit. The body is a merged identity-kit model - the same
   machinery the player's own body uses, see src/identikits.js) - and the
   garments are merged over it with the worn-model path (src/models3d.js#setWorn
   via #wornKeysFor/#wornOptsFor below), exactly as the player's equipment is.
   Because it is a player-shaped body, it carries the same shadow and is swapped
   as a whole by `setNpcModel` the same way. */
function makeArchetypeRender(arch) {
  const mc = makeModelCharacter(archetypeBodyKey(arch));
  if (!mc) return null;
  const size = Math.max(mc.data.width || 1, mc.data.depth || 1);
  mc.group.add(makeShadow(Math.min(2.6, Math.max(0.55, size * 0.9))));
  const eq = archetypeEquip(arch);
  if (mc.setWorn) mc.setWorn(wornKeysFor(eq, null), wornOptsFor(eq, null));
  mc.wornEq = eq;
  return mc;
}

/* Builds the render object for a character: the real animated 3D model when the
   baked data is available, otherwise the sprite billboard, otherwise the blocky
   stand-in. */
function makeCharacterRender(type, idx, fallbackLook, fallbackSize) {
  const mkey = variantModelKey(type, idx);
  if (mkey) {
    const mc = makeModelCharacter(mkey);
    if (mc) {
      /* No per-type height fudge here on purpose: every model already carries
         the NPC def's own widthScale/heightScale (baked as data.scale), which
         is the only size factor the real client applies. */
      const size = Math.max(mc.data.width || 1, mc.data.depth || 1);
      if (type !== "crab" && type !== "snake") mc.group.add(makeShadow(Math.min(2.6, Math.max(0.55, size * 0.9))));
      return mc;
    }
  }
  const spriteKey = pickNpcSprite(type, idx);
  const tex = spriteKey ? npcTexture(spriteKey) : null;
  if (tex) return makeSpriteBillboard(tex, npcSpriteHeight(spriteKey), npcSpriteAspect(spriteKey));
  const ch = makeCharacter(fallbackLook);
  ch.group.scale.setScalar(fallbackSize);
  return ch;
}

const npcSpriteCount = {};

/* The next creature's tile-stacking rank (see bodyStackRank). */
let npcSeq = 0;

export function createNpc(world, view, spawn) {
  /* An archetype spawn (src/archetypes.js) carries its mechanical base in
     `spawn.type` and names the registry entry in `spawn.archetype`, so every
     table in the game - stats, drops, menus, aggression, cast - reads the base
     unchanged and only the *look* comes from the archetype. */
  const arch = spawn.archetype ? archetypeByKey(spawn.archetype) : null;
  const stats = NPC_STATS[spawn.type] || NPC_STATS.man;
  const look = NPC_LOOKS[spawn.type] || NPC_LOOKS.man;
  const idx = npcSpriteCount[spawn.type] = (npcSpriteCount[spawn.type] || 0) + 1;
  const ch = (arch && makeArchetypeRender(arch)) || makeCharacterRender(spawn.type, idx, look, stats.size);
  const npc = {
    kind: "npc",
    type: spawn.type,
    /* The registry entry this creature's look and display name come from, or
       null for an ordinary cache creature. `type` stays the base so the whole
       mechanics side is untouched; see src/actions.js#npcDisplayName. */
    archetype: arch ? arch.key : null,
    name: arch ? arch.name : null,
    /* Vendors render no overhead name label (fx skips it): a shopkeeper is
       found by her counter and her Trade row, not by floating text. Set on
       the spawn (`hideLabel: true`) - the name itself stays for hover text,
       menus and chat. */
    hideLabel: !!spawn.hideLabel,
    /* The equipment object an archetype body was merged with, so a model swap
       (src/game.js#setNpcModel) can re-apply the garments on the new body. */
    wornEq: ch && ch.wornEq ? ch.wornEq : null,
    /* A stable, unique number for the tile-stacking rank (see bodyStackRank) -
       a creature has no id of its own, and the rank must not change from frame
       to frame or two bodies on one tile would take turns being drawn. */
    seq: ++npcSeq,
    /* Where this creature sits in the world's spawn table (src/world.js), which
       is built identically on every client - the one name for a creature that
       both ends of the wire agree on. A neighbouring player's fight is told as
       this number rather than as a tile (src/net.js#netCombat): two clients
       simulate the same spawn independently and their copies of it wander
       apart, so "the goblin at 57,104" names a different body on each screen
       while "spawn 213" names the same one everywhere. 0xffff is "not from the
       table" - an archetype preview (src/game.js#spawnArchetypeNpc) - and no
       fight packet can refer to it. */
    spawnIx: spawn.spawnIx == null ? 0xffff : spawn.spawnIx,
    stats,
    look,
    /* Which variant of this creature's art it was drawn with (`makeCharacter-
       Render`'s own counter, one per type): the cache's creatures have several
       models and several sprites to a type, and the same number is what a
       rebuild has to ask for so a repaired body is the body that was there - see
       src/game.js#refreshCharacterModels. */
    lookIdx: idx,
    ch,
    x: spawn.x + 0.5,
    z: spawn.z + 0.5,
    px: spawn.x + 0.5,
    pz: spawn.z + 0.5,
    dir: spawn.dir != null ? spawn.dir : Math.random() * Math.PI * 2,
    phase: Math.random() * 6,
    rphase: Math.random() * 6,
    moveEvery: 1,
    path: [],
    home: { x: spawn.x, z: spawn.z },
    /* The shop this vendor runs, named by the spawn itself (src/world.js). It
       is what makes a vendor data rather than code: a creature with a `shop`
       opens that shop on Talk-to and is never a combat target. */
    shop: spawn.shop || null,
    /* One of **Saradomin's assailants** (src/world.js's grove, 2026-09-24): a
       creature that fights *him* and never the player. It is a flag on the spawn
       rather than a row in any type table, because the same imp is an ordinary
       imp everywhere else in the world - only the ones that live in his glade
       are sworn to pull him down. Three things read it: the creature menu, which
       offers such a body nothing but Examine (src/actions.js#npcCanAttack), the
       creature AI, which steps over it (src/combat.js#tickCombat), and the god's
       own module, which hands it Saradomin as a target
       (src/saradomin.js#tickGodFoe). */
    godFoe: !!spawn.godFoe,
    ibanFoe: !!spawn.ibanFoe,
    /* The minigame dungeon's private cast (src/minigame.js): bodies that never
       come back and never drop - a clear stays cleared, and instanced loot
       never leaks onto shared ground. Read by updateNpcs (the dead branch
       skips the spawn timer) and src/combat.js#killNpc (the drop table is
       not rolled). */
    noRespawn: !!spawn.noRespawn,
    noDrops: !!spawn.noDrops,
    /* A cast of its own (`cast: "tower_wizard"`): the spawn throws a different
       spell from its type's ordinary one (src/combat.js#castSpecOf). A flag on
       the spawn rather than a row in any type table, for the same reason as
       `godFoe` above - the tower wizard east of the mine is an ordinary wizard
       everywhere but in the Fire Strike it throws. */
    castOverride: spawn.cast || null,
    radius: spawn.radius ?? 3,
    /* The **ground** this creature covers, in tiles across (see `NPC_FOOT`):
       1 for everything ordinary, 2 for a lesser demon, 3 for a greater or
       black demon, 4 for a chromatic dragon and 5 for the King Black Dragon.
       The body's tile is the floor's south-west corner and the model is drawn
       at its middle (see `npcFootBox` / `npcDrawCX`). It is read by the
       world's occupancy tests, by an attacker's reach (src/combat.js#reachTo)
       and by the walk-in a chase plans, and it is *not* a wall - a player may
       stand on it (see the note on `NPC_FOOT`). */
    foot: npcFoot(spawn.type),
    waitTimer: Math.random() * 3,
    hp: stats.hp,
    level: stats.level,
    attackCd: 0,
    target: null,
    attackAnim: 0,
    dead: false,
    respawn: 0,
    respawnTicks: 0,
    corpse: false,
    wander: spawn.radius > 0,
    /* How many game ticks this creature still counts as the local player's
       fight (set on every blow the player lands on it, see
       src/combat.js#broadcastHit). It outlives `target`, which the kill clears,
       so the creature stays in the census for a moment after it dies - that is
       what carries its death to the other clients (src/game.js
       #creatureStateBatch). */
    playerHitTicks: 0,
    /* Whose copy of this creature everyone is looking at, and where that copy
       says it is (see src/game.js#applyNpcStates): the id of the connection
       that last supplied it, whether that connection is fighting it, the tile
       it was reported on and how many ticks of freshness are left. All zero
       until somebody else's census arrives, at which point this creature stops
       living its own life here and is drawn where its reporter says it is. */
    netOwner: -1,
    netEngaged: false,
    netTicks: 0,
    netTx: 0,
    netTz: 0,
  };
  npc.ch.group.position.set(npcDrawCX(npc), world.heightAt(npcDrawCX(npc), npcDrawCZ(npc)), npcDrawCZ(npc));
  /* The facing this creature goes back to: its spawn-table direction, which
     for the Wise Old Man is the new-player spawn tile (src/world.js). Read by
     updateNpcs when his post-conversation timer runs out. */
  npc.homeDir = npc.dir;
  npc.rot = yawToRot(npc.dir || 0);
  npc.targetRot = npc.rot;
  npc.turnDiff = 0;
  /* Ocean trolls wear the river troll's body dyed dark mint blue (user ask
     2026-10-30): same bake, per-instance material clones multiplied toward
     blue - shared materials are never touched, so the river family keeps its
     teal. Non-opaque materials (shadows) are left alone. */
  if (spawn.type && spawn.type.indexOf("ocean_troll") === 0 && ch && ch.group) {
    const dye = new THREE.Color(0.55, 0.82, 0.92);
    ch.group.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.color) return;
      if (o.material.transparent && o.material.opacity < 1) return;
      o.material = o.material.clone();
      o.material.color.multiply(dye);
    });
  }
  tagPick(npc.ch, npc);
  view.scene.add(npc.ch.group);
  return npc;
}

export function spawnNpcs(world, view) {
  const list = [];
  const taken = new Set();
  /* The player's own tile is spoken for before any spawn claims it - a cow is
     planted on the player's starting tile in the spawn table, and a creature
     standing inside the player is both a stack and a click hazard. */
  if (Game.player) taken.add(Math.floor(Game.player.x) * 4096 + Math.floor(Game.player.z));
  /* A spawn claims its whole floor, not just its south-west tile: every tile
     of the footprint has to be walkable ground and unclaimed, so a 4x4 dragon
     never spawns hanging over a wall or inside another body. */
  const claimsFit = (x, z, n) => {
    for (let dx = 0; dx < n; dx++) {
      for (let dz = 0; dz < n; dz++) {
        if (!world.isWalkable(x + dx, z - dz) || taken.has((x + dx) * 4096 + (z - dz))) return false;
      }
    }
    return true;
  };
  const claim = (x, z, n) => {
    for (let dx = 0; dx < n; dx++) for (let dz = 0; dz < n; dz++) taken.add((x + dx) * 4096 + (z - dz));
  };
  const free = (x, z, n) => claimsFit(x, z, n || 1);
  for (let si = 0; si < world.spawns.length; si++) {
    const s = world.spawns[si];
    const n = npcFoot(s.type);
    /* The spawn table has a cow and a chicken planted on one tile, and a pair
       under a shared cursor is exactly what made two creatures swap places
       when one of them was clicked. A spawn whose tile is already taken moves
       outward in rings to the nearest free tile instead. */
    let x = s.x, z = s.z;
    if (!free(x, z, n)) {
      let found = null;
      for (let r = 1; r <= 10 && !found; r++) {
        for (let dz = -r; dz <= r && !found; dz++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            if (free(x + dx, z + dz, n)) found = [x + dx, z + dz];
          }
        }
      }
      if (found) { x = found[0]; z = found[1]; }
    }
    claim(x, z, n);
    list.push(createNpc(world, view, { ...s, x, z, spawnIx: si }));
  }
  return list;
}

/* ---------------------------------------------------------------- archetypes

   Spawning an archetype (src/archetypes.js) into the world. Unlike a save's own
   creatures these are *preview* spawns: they are made by the `::archetypes` and
   `::archetype` commands (src/ui.js) so the user can walk a lineup and pick the
   ones worth keeping, and they are tracked here so the next command can clear
   the last lot before planting the new one. */

const archetypeNpcs = [];

/* Plant one archetype as a real, clickable NPC. `x`/`z` are tile corners, as
   the spawn table's are; `dir` faces it. The creature inherits everything from
   the archetype's base (see the note in createNpc), so it fights, drops and
   opens its own menu, and its Examine reads its outfit out
   (src/actions.js#npcDisplayName / #npcExamine). */
export function spawnArchetypeNpc(arch, x, z, dir) {
  if (typeof arch === "string") arch = archetypeByKey(arch);
  if (!arch) return null;
  const npc = createNpc(Game.world, Game.view, {
    type: arch.base, archetype: arch.key, x, z, dir: dir != null ? dir : 0, radius: 0,
  });
  npc.archetypePreview = true;
  Game.npcs.push(npc);
  Game.entities.push(npc);
  archetypeNpcs.push(npc);
  return npc;
}

/* Take the preview spawns back out of the world: out of the simulation, out of
   the render list, and out of the scene (disposed, mesh and all). */
export function clearArchetypeNpcs() {
  const n = removeDynamicNpcs(archetypeNpcs);
  archetypeNpcs.length = 0;
  return n;
}

/* Take a list of dynamic NPCs back out of the world: out of the simulation,
   out of the render list, and out of the scene (disposed, mesh and all). The
   archetype previews' removal, generalised - src/minigame.js clears a
   finished or voided run's private cast through this. */
export function removeDynamicNpcs(list) {
  let n = 0;
  for (const npc of list) {
    const i = Game.npcs.indexOf(npc);
    if (i >= 0) Game.npcs.splice(i, 1);
    const j = Game.entities.indexOf(npc);
    if (j >= 0) Game.entities.splice(j, 1);
    /* Anything that was attacking the removed creature loses its target
       rather than chasing a body that no longer exists. */
    for (const e of Game.entities) if (e && e.target === npc) e.target = null;
    if (npc.ch) {
      if (npc.ch.group && npc.ch.group.parent) npc.ch.group.parent.remove(npc.ch.group);
      disposePickProxies(npc.ch);
      if (npc.ch.dispose) npc.ch.dispose();
    }
    n++;
  }
  return n;
}

export function archetypeNpcCount() { return archetypeNpcs.length; }

/* ------------------------------------------------------------------ occupancy

   Characters are walk-through (the user's rule, 2026-09-20) - no body blocks
   another body's step, at either end of it - so occupancy here is a *planning*
   hint, not a wall: the pathfinder routes a creature around its neighbours so
   routes look natural, and anything that *places* an entity (a save load, a
   teleport, a spawn) still prefers a free tile. `stepEntity` no longer refuses
   a step onto an occupied tile, which is what lets a route finish on the one
   open tile in front of a door or a fishing spot when somebody is standing on
   it.

   A creature owns the tile it is standing on *and* the tile it is walking onto:
   x/z already hold the destination while it is between tiles, so keying on
   floor(x)/floor(z) reserves exactly the tile it is about to occupy.

   **A player is the exception to every body** (the user's rules, 2026-09-20 for
   other players and 2026-09-22 for the world's NPCs): the local player, and the
   other players' ghosts (see the `kind` in src/net.js), never block one another
   *or* a creature, so a crowd can stand on the same tile the way it does in the
   live game's banks and a player can walk through an NPC and occupy its tile
   (`entityBlockTest` answers false for a player, and `entityAtTile` answers
   null for one). The exception is asked for *from the asker's point of view*, so
   a creature is untouched and still plans around everything - which is what
   keeps the animals from piling up. A click on a creature is still a click on
   the creature: that walk asks for the `adjacent` goal set (see walkTo), not
   for this predicate to keep its tile free. */
function isPlayerBody(e) { return !!e && (e.kind === "player" || e.kind === "ghost"); }

/* Which body wins a tile when several share one (see the stacking note in
   updateVisuals). The local player always outranks everybody; then the other
   players, by network id (a stable choice - the id is the peer's own, so the
   same two clients always agree on the winner and the body on top does not swap
   back and forth every frame); then the world's own creatures, by the sequence
   number `createNpc` gives them (stable, and unique, which an NPC otherwise has
   no field for: a creature carries `type` and its spawn, not an id).

   The local player winning its own tile is the user's own rule, made for
   player-on-player stacks and kept here for a body of any kind: your character
   is the one body you must always be able to see, and it is the body whose tile
   the camera is centred on. */
function bodyStackRank(e) {
  if (e.kind === "player") return -1;
  if (e.kind === "ghost") return typeof e.id === "number" ? e.id : 0;
  return 1e9 + (e.seq || 0);
}

/* How close (in tiles) two character bodies must be drawn before the lower-ranked
   one is hidden by the one-body-per-tile rule (see the stacking note in
   updateVisuals). The rule keys on the *tile* a body is drawn on, but a tile is
   1.0 wide, so sharing one is not the same as being on top of each other - and
   the whole timing question is when a walker counts as "on" the body it is
   landing on.

   0.18 tiles is that moment: for a one-tile step it is the last 18% of the
   approach (the same instant the previous revision expressed as `LAND_FRAC` =
   0.82 through the step), and it is
   **symmetric about the tile centre** - the walker is within 0.18 of the centre
   for the last 0.18 tiles of the way in and the first 0.18 tiles of the way out,
   so the same constant gives both halves of the user's report:

   * arriving: *"it makes the npc disappear just a little slightly more
     instantaneously than we want … only a very brief instant right before you
     actually fully land in place on the tile"* - hide at the end of the step,
     not at its midpoint;
   * leaving: *"same thing when it de-culls when you move off of the tile …
     do the same for the off-step"* - show it again as the walker steps off,
     not most of a tile later.

   Two bodies on the same tile but drawn well apart (a walker crossing a tile an
   occupant is standing on, or a step caught mid-segment) are both shown: they
   overlap the way two characters do in the client, and it is only at the
   coincidence - which is where the two meshes are in the same place and a
   depth-buffered scene z-fights - that one of them goes. */
const COINCIDENT = 0.18;

function entityBlockTest(self) {
  /* A **player** ignores every other body: other players (the user's rule,
     2026-09-20) and now the world's NPCs too (the user's, 2026-09-22: "it
     seems like you arent able to actually walk through npc's we need to change
     that similarly to the way we updated so you can walk through players and
     occupy the same tile as them"). So a player's route is planned on terrain
     alone, and a click on a tile somebody is standing on is taken at its word:
     the body is walked through and the tile is shared. A CREATURE is untouched
     and still plans around everything, which is what keeps the animals from
     piling up. (The one thing a player still has to be able to do is walk *up
     to* a creature rather than onto it; that is not this predicate's job - it
     is the `adjacent` goal set a click on a creature asks for, see walkTo.) */
  if (isPlayerBody(self)) return () => false;
  const occupied = new Set();
  for (const e of Game.entities) {
    if (e === self || e.dead || e.corpse) continue;
    /* A creature plans around other creatures only - never around the player.
       The user's rule (2026-10-01): dragons (and every other NPC) collide with
       other dragons, trees and scenery, but not with the player, so the player
       is left out of the set and a dragon's route and wander cross the player's
       tile exactly as open ground. */
    if (isPlayerBody(e)) continue;
    /* A body with a tile floor owns **every tile of it**, not just the one its
       own feet are on: a route plans around the ground a greater demon covers,
       which is the same "a footprint is ground" rule the trees follow
       (src/world.js#TREE_FOOT, inverted - the trees seal their ground, the
       creatures merely claim it). A 1x1 body adds exactly the one tile it
       always did, so nothing ordinary moved by this. */
    const box = npcFootBox(e);
    for (let x = box.x0; x <= box.x1; x++) {
      for (let z = box.z0; z <= box.z1; z++) occupied.add(x * 4096 + z);
    }
  }
  return (x, z) => occupied.has(x * 4096 + z);
}

/* The creature standing on tile (x, z), if any - the step-time half of the
   same rule, and the one `except`'s own kind bends (see isPlayerBody above: a
   player asking does not count the other players). Exported because anything
   that *places* an entity rather than walking it (a save load, a teleport) has
   to respect it too: a saved player position can be a tile a creature has since
   settled on. */
export function entityAtTile(x, z, except) {
  /* A player asks from the player's own point of view: another player (the
     user's rule, 2026-09-20) and an NPC (the 2026-09-22 follow-up: a player may
     now share a tile with a creature) are both things a player may stand on, so
     neither is reported. Everything else - a creature asking, or the
     unconditional question asked with no `except` at all (`spawnNpcs`'s
     de-duplication, `combat.js`'s flee step) - keeps every body. */
  if (isPlayerBody(except)) return null;
  for (const e of Game.entities) {
    if (e === except || e.dead || e.corpse) continue;
    /* Any tile of a big creature's ground is "its" tile - the same rule
       `entityBlockTest` applies to a route. A 1x1 body answers for exactly the
       tile it stands on, as it always did. */
    if (inFoot(x, z, npcFootBox(e))) return e;
  }
  return null;
}

/* How much longer than the straight line a wander's route may be before the
   creature gives up on that spot and picks another. Twelve tiles of detour is
   far more than a walk inside an ordinary `npc.radius` (the largest mainland
   one is the cattle pen's 7; the cay gulls roam at 100) ever needs, and it is what keeps a wander from draining the whole map: see
   the note on `opts.limit` in src/pathfind.js, and the note below. */
const WANDER_DETOUR = 12;
const WANDER_PERIOD = 8;

function hash3(a, b, c) {
  let h = ((a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}

function wanderEpoch() {
  return Math.floor(Date.now() / (TICK_S * 1000));
}

export function wanderRand(spawnIx, salt) {
  return hash3(spawnIx | 0, wanderEpoch(), salt | 0) / 4294967296;
}

function wanderRandAt(spawnIx, quantum, salt) {
  return hash3(spawnIx | 0, quantum | 0, salt | 0) / 4294967296;
}

function pickWanderTarget(world, npc, quantum) {
  const blocked = entityBlockTest(npc);
  /* Sealed faces bind wanderers too: without this a creature ambles through
     wall panels, since this was the one route planner that never passed
     `crossed` (walkTo always did). */
  const crossed = world.blocksStep || null;
  const sx = Math.round(npc.x);
  const sz = Math.round(npc.z);
  /* A big body moves its whole floor: the target tile is the floor's
     south-west corner, so every tile of it has to be walkable ground and free
     of other bodies, not just the corner the route is planned to. */
  const n = npc.foot || 1;
  const floorFree = (tx, tz) => {
    for (let dx = 0; dx < n; dx++) {
      for (let dz = 0; dz < n; dz++) {
        if (!world.isWalkable(tx + dx, tz - dz) || blocked(tx + dx, tz - dz)) return false;
      }
    }
    return true;
  };
  /* The route holds the whole floor too, not just its destination (see
     pathfind.js#findPath's `stand`): the wander below hands the search the
     same floor test the target passed, so the walk there never drags the body
     through a wall its corner fits past. */
  const stand = n > 1
    ? (x, z) => {
      for (let dx = 0; dx < n; dx++) {
        for (let dz = 0; dz < n; dz++) {
          if (!world.isWalkable(x + dx, z - dz)) return false;
          if (blocked(x + dx, z - dz)) return false;
        }
      }
      return true;
    }
    : null;
  for (let i = 0; i < 12; i++) {
    const u1 = Math.random();
    const u2 = Math.random();
    const a = u1 * Math.PI * 2;
    /* sqrt keeps the target uniform over the disc, so NPCs pick a spot a few
       tiles away about as often as one right next to them (as in the game) */
    const r = Math.sqrt(u2) * npc.radius;
    const tx = Math.round(npc.home.x + Math.cos(a) * r);
    const tz = Math.round(npc.home.z + Math.sin(a) * r);
    if (!floorFree(tx, tz)) continue;
    /* `maxNodes` stays 0 - "let the window be the bound" - but the *depth* is
       bounded, and that is the bound this caller wants (see src/pathfind.js's
       note on `opts.limit`). A wander is the one route in the game that is
       purely decorative: the creature is ambling a few tiles around its home,
       so a target whose way there is absurdly long for the distance asked is
       worth abandoning in favour of another spot - the creature loses nothing
       (it waits out its timer and picks again) and the search stops exploring a
       diamond the size of the world. Without this bound the *failure* case was
       the expensive one, and a wander target landing inside a building (whose
       interior is walkable but whose door a creature cannot open) is common
       enough to have been the game's single biggest CPU cost - see the numbers
       in that note. */
    const limit = Math.max(Math.abs(tx - sx), Math.abs(tz - sz)) + WANDER_DETOUR;
    let p = findPath(world, sx, sz, tx, tz, 0, { blocked, limit, stand, crossed });
    /* as in walkTo: a creature is never left with nowhere to go because its
       neighbours are in the way */
    if (!p) p = findPath(world, sx, sz, tx, tz, 0, { limit, stand, crossed });
    if (p && p.length) return p.slice(1);
  }
  return null;
}

/* One game tick of movement: entities advance an integer number of tiles
   along their queued path (1 walking, 2 running), exactly like the real
   game's 600ms server tick. Rendering interpolates between px/pz and x/z. */
export function stepEntity(e, tiles) {
  if (!e.path || !e.path.length) {
    /* A stopped entity has no step left to interpolate, so the render origin
       must sit exactly on its tile. Leaving it a tile behind (as it was when
       the final step completed) makes renderPos replay that last step on every
       tick: the model glides the whole tile forward and snaps back again, over
       and over, the whole time it stands still.

       An entity mid-LEAP is the one exception, and it is not a stopped entity
       even though it has no path: it has been moved a tile and is being drawn
       flying across it (src/actions.js#applyLeap), so collapsing the render
       origin here would draw the whole arc in place at the landing tile instead
       of along the flight. `airT` is that flight, and the collapse happens by
       itself on the tick after it ends. */
    e.moving = false;
    e.stepPts = null;
    if (!(e.airT > 0)) { e.px = e.x; e.pz = e.z; }
    return 0;
  }
  let moved = 0;
  /* The tiles this tick's steps pass through, origin first - the renderer
     interpolates along these one tile at a time (see renderPos), so a running
     tick that turns a corner is drawn round the corner instead of straight
     across it, and the character turns with it. */
  let pts = null;
  for (let i = 0; i < tiles; i++) {
    const n = e.path[0];
    if (!n) break;
    const tx = n.x + 0.5;
    const tz = n.z + 0.5;
    if (Math.abs(tx - e.x) < 0.01 && Math.abs(tz - e.z) < 0.01) {
      e.path.shift();
      i--;
      continue;
    }
    /* never teleport: the next node must be an adjacent tile, otherwise the
       path is stale (the entity was moved) and must be re-planned */
    if (Math.abs(tx - e.x) > 1.01 || Math.abs(tz - e.z) > 1.01) {
      e.path.length = 0;
      break;
    }
    /* A creature may never step onto a tile it could not have planned to: every
       creature route comes out of `pathfind.js#findPath`, which only ever walks
       `world.isWalkable` tiles, so this is a net for a path that has gone stale
       under it - a door that shut behind it, a prop that moved. It is what
       makes "npcs shouldnt be able to walk through certain objects such as
       tables" true of a *stale* route as well as a fresh one (the live fault was
       a 2x1 table the world had marked solid on only one of its two tiles, see
       world.js's archery shop). The PLAYER is exempt on purpose, for the LEAPS:
       a hop over water is queued as a path tile the player is not allowed to
       walk to (`actions.js#leapTo`), so applying this test to them would break
       every crossing of the stepping stones. A shut door is NOT the reason -
       the player's routes never contain one (a shut door is a wall to the
       pathfinder - see walkTo). */
    if (e.kind !== "player" && Game.world && !Game.world.isWalkable(n.x, n.z)) {
      e.path.length = 0;
      break;
    }
    /* A tile can be walkable and still refuse THIS step: a wall-decor item
       seals a face of its tile without filling it (world.js#blocksStep). Every
       walker is held to it, the player included - unlike the tile test above,
       there is no state an item opens into that would make the step legal
       later. Both ends are asked in TILE coordinates: the walker is mid-step on
       the tile it is leaving, so its position is rounded back first. */
    if (Game.world && Game.world.blocksStep
        && Game.world.blocksStep(Math.round(e.x - 0.5), Math.round(e.z - 0.5), n.x, n.z, e.plane || 0)) {
      e.path.length = 0;
      break;
    }
    /* Characters are walk-through (the user's rule, 2026-09-20): no body ever
       blocks another body's step, neither while passing through nor when the
       step *ends* on the tile somebody else is standing on. The ending step is
       the one that matters for the complaint this rule answers - the single
       open tile in front of a door, a fishing spot or a bank counter is often
       the only tile a route can finish on, and refusing it is what let one
       character pin another out of the shop. The pathfinder still plans around
       creatures (`entityBlockTest`), so routes look natural and nobody goes
       looking for a crowded tile, but where there is no alternative the step is
       taken and the two share the tile until one moves on. */
    if (!e.faceEnt) e.dir = Math.atan2(tx - e.x, tz - e.z);
    if (moved === 0) { e.px = e.x; e.pz = e.z; pts = [[e.x, e.z]]; }
    e.x = tx;
    e.z = tz;
    pts.push([tx, tz]);
    e.path.shift();
    moved++;
  }
  if (moved === 0) { e.px = e.x; e.pz = e.z; }
  e.stepPts = pts;
  e.moving = moved > 0;
  return moved;
}

/* One step of a straight-line chase: the tile toward the victim's tile along
   the direct line (diagonal first, then the longer axis), refused only by an
   unwalkable tile or a sealed face. A creature chasing the player never routes
   round a wall - it presses against it facing them instead (the user's rule,
   2026-10-09: cast over a wall and the skeleton pushes into the wall rather
   than walking round the end). A wide body fits its whole floor; occupancy is
   never consulted, because bodies are walk-through. Returns a one-node path in
   the shape stepEntity reads, or an empty one when the line itself is shut. */
/* Bodies block a chase's steps - but only other bodies, never the player. Most
   monsters cannot pass through another monster (OSRS wiki, Safespot: the bat
   in front of Damis holds the dungeon's melee off behind it), so a step onto a
   tile a creature owns is refused and the chaser sidesteps or stands instead.
   The player is exempt on purpose (the user's rule, 2026-10-01: NPCs collide
   with other NPCs, trees and scenery, but cross the player's tile as open
   ground), which entityBlockTest already expresses - it never counts the
   player. Bosses walk through everything (the wiki's excluded-NPC list). */
const NPC_PASSTHROUGH = { dagannoth_supreme: true, dagannoth_prime: true, dagannoth_rex: true, king_black_dragon: true };
export function linearChaseStep(npc, world, tx, tz) {
  const sx = Math.round(npc.x - 0.5);
  const sz = Math.round(npc.z - 0.5);
  const dx = Math.sign(tx - sx);
  const dz = Math.sign(tz - sz);
  if (!dx && !dz) return [];
  const blocked = NPC_PASSTHROUGH[npc.type] ? null : entityBlockTest(npc);
  const n = npc.foot || 1;
  const fits = (nx, nz) => {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (!world.isWalkable(nx + a, nz - b)) return false;
        /* A wide floor owns every tile of it: the corner fitting past a body
           still drags the rest of the floor through it. */
        if (blocked && blocked(nx + a, nz - b)) return false;
      }
    }
    if (world.blocksStep && world.blocksStep(sx, sz, nx, nz)) return false;
    return true;
  };
  const cands = [];
  /* One tile diagonally off the victim, a pursuer prefers east/west and
     holds if that is shut - it never slips round the corner north/south (OSRS
     Mechanics Explained, safespotting: the NPC "sits there on the other side,
     staring at you menacingly"). The diagonal candidate is skipped too, so a
     cornered creature cannot step onto the victim's tile to get round it. */
  const diagAdj = Math.abs(tx - sx) === 1 && Math.abs(tz - sz) === 1;
  if (dx && dz && !diagAdj) cands.push([sx + dx, sz + dz]);
  if (diagAdj) {
    if (dx) cands.push([sx + dx, sz]);
  } else if (Math.abs(tx - sx) >= Math.abs(tz - sz)) {
    if (dx) cands.push([sx + dx, sz]);
    if (dz) cands.push([sx, sz + dz]);
  } else {
    if (dz) cands.push([sx, sz + dz]);
    if (dx) cands.push([sx + dx, sz]);
  }
  for (const [nx, nz] of cands) {
    if (fits(nx, nz)) return [{ x: nx, z: nz }];
  }
  return [];
}

/* Creatures that run from a fight they are losing (OSRS wiki, Retreat):
   chickens and seagulls at critically low health. Up to two straight-line
   steps directly away from the victim - the step that gains the most distance
   wins, so a cornered bird still sidesteps - each refused by an unwalkable tile
   or a sealed face, whole floor fitted for wide bodies. */
const FLEE_TYPES = { chicken: true, chicken_2: true, chicken_3: true, chicken_4: true, rooster: true, seagull: true, snake: true };
export function linearFleeSteps(npc, world, ptx, ptz) {
  const n = npc.foot || 1;
  const blocked = NPC_PASSTHROUGH[npc.type] ? null : entityBlockTest(npc);
  const fits = (sx, sz, nx, nz) => {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (!world.isWalkable(nx + a, nz - b)) return false;
        if (blocked && blocked(nx + a, nz - b)) return false;
      }
    }
    if (world.blocksStep && world.blocksStep(sx, sz, nx, nz)) return false;
    return true;
  };
  const out = [];
  let sx = Math.round(npc.x - 0.5);
  let sz = Math.round(npc.z - 0.5);
  for (let s = 0; s < 2; s++) {
    const here = Math.max(Math.abs(sx - ptx), Math.abs(sz - ptz));
    let best = null;
    let bestD = here;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = sx + dx;
        const nz = sz + dz;
        if (!fits(sx, sz, nx, nz)) continue;
        const dd = Math.max(Math.abs(nx - ptx), Math.abs(nz - ptz));
        if (dd > bestD) { bestD = dd; best = { x: nx, z: nz }; }
      }
    }
    if (!best) break;
    out.push(best);
    sx = best.x;
    sz = best.z;
  }
  return out;
}

/* One wide body's step out from over its victim: a random fitting south-west
   corner up to three tiles out - usually one with the victim in the 1-tile
   ring outside the new floor, sometimes not, so a body against a wall shuffles
   off somewhere new instead of working the same two tiles for good. A plain
   walk to it - never a goal-set search - and every try is walked to completion
   before the next is planned. */
export function npcStepOut(npc, world, tx, tz) {
  const n = npc.foot || 1;
  const sx = Math.round(npc.x - 0.5);
  const sz = Math.round(npc.z - 0.5);
  const ring = [];
  const rest = [];
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (!dx && !dz) continue;
      const cx = sx + dx;
      const cz = sz + dz;
      let fits = true;
      for (let a = 0; a < n && fits; a++) {
        for (let b = 0; b < n && fits; b++) {
          if (!world.isWalkable(cx + a, cz - b)) fits = false;
        }
      }
      if (!fits) continue;
      const d = footDistance(tx, tz, { x0: cx, z0: cz - n + 1, x1: cx + n - 1, z1: cz }).orth;
      (d === 1 ? ring : rest).push({ x: cx, z: cz });
    }
  }
  const order = [];
  const ringFirst = !ring.length || Math.random() < 2 / 3;
  const first = ringFirst ? ring : rest;
  const second = ringFirst ? rest : ring;
  for (const group of [first, second]) {
    const shuffled = group.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    for (const c of shuffled) order.push(c);
  }
  for (const c of order) {
    if (walkTo(npc, world, c.x, c.z, 0, null, true, null)) return true;
  }
  return false;
}

/* The modifier state for a walk the player did **not** click for: an activity's
   walk-in, a chase, an approach, a follow, a stale-route re-plan. Such a walk
   follows the run orb and nothing else.

   It exists because `walkTo`'s other source of the modifier is the key map, and
   the key map can be *stale*: a shift whose keyup the page never saw (the
   window losing focus mid-press, an OS-level grab) stays latched down, and
   every later walk that reads it silently pins `runClick` to walk - the run orb
   still reads "on", the character walks anyway. `src/combat.js#chaseTarget`
   already refuses to let the map decide a chase for this exact reason; this
   constant is the same refusal for every other walk the player did not ask for
   by clicking. The map is now also *reconciled from the click itself* (see the
   key handlers' `noteModifiers`), so a latch cannot outlive one click where it
   would matter. */
export const NO_MODS = Object.freeze({ shiftKey: false, ctrlKey: false });

/* The modifier state of a menu row's own click ("Walk here" in the world menu,
   and on the minimap). Those rows are a walk the player *did* ask for, so the
   way the real client reads the modifier key at that moment is kept - read here
   at the moment the row is used, which is why this is a function and not a
   cached value. */
export function clickMods() {
  const k = Game.input.keys;
  return { shiftKey: !!k.shift, ctrlKey: !!k.ctrl };
}

export function walkTo(e, world, tx, tz, reach = 0, mods = null, keepRunOverride = false, opts = null) {
  /* A stunned player cannot walk: the published nine-tick freeze from a failed
     pickpocket (src/player.js#createPlayerState). Every click routes a route
     through here, so this one gate stops the lot - and it is checked before the
     pathfinder runs, so nothing is computed for a step that cannot be taken. */
  if (e.kind === "player" && e.ps && e.ps.stunTicks > 0) return false;
  if (e.kind === "player" && e.ps && e.ps.emoteLockTicks > 0) return false;
  /* A climb in progress finishes before anything else moves the climber: every
     click routes a route through here, so this one gate stops the lot
     (src/actions.js#climbLadder owns the lock and its own arrival clears it). */
  if (e.kind === "player" && e.climbLock) return false;
  const sx = Math.round(e.x - 0.5);
  const sz = Math.round(e.z - 0.5);
  /* Every creature that is not this one, as the pathfinder's *preference*
     (`opts.blocked`): a route never goes *through* a neighbour when an equally
     short way round exists, but a body may never lengthen a route or refuse a
     diagonal — see src/pathfind.js's note on `blocked`. An occupied destination
     is honoured as asked, so a click on a creature's tile walks you *onto* it:
     see the swap note below. */
  const blocked = entityBlockTest(e);
  /* `opts.adjacent`: the destination tile holds the thing being walked up to
     (a creature in a chase), so the goal is the open ring *around* it and the
     route is free to arrive from whichever side is actually reachable - see
     src/pathfind.js#findPath's `goalTest`. The occupied-destination swap below
     is the degenerate version of the same idea (it picks one neighbour blindly,
     by scan order, and forces the whole route through it), so it is skipped. */
  const adjacent = !!(opts && opts.adjacent);
  /* ...and `opts.orthogonal` narrows that ring from the eight tiles around the
     destination to its four **sides** - north, south, east and west. A melee
     blow is struck from a side tile and never from a diagonal one
     (src/combat.js's note on `reachDistance`), so the walk-in to one is planned
     on the same four tiles: under the full ring the diagonal the attacker was
     already standing on satisfied the goal, the route came back zero steps
     long, and the attacker stood beside its victim unable to swing - which is
     why the two halves of the melee rule have to move together. */
  const orthogonal = !!(opts && opts.orthogonal);
  /* A caller may bring its own goal set instead of a single tile: the walk-in
     to a creature spoken to across a bank counter plans to "any tile within
     reach of the creature" (src/actions.js#npcReachTile), exactly the way a
     chase plans to "any tile beside the victim". A caller-supplied test is
     taken as-is, and it is the same predicate the activity's own arrival test
     reads, so the route and the test that ends it cannot disagree. */
  /* ...and `opts.foot` moves the destination from one **tile** out to a whole
     **floor** - the ground a 2x2 or 3x3 creature covers (src/game.js
     #npcFootBox). It is the walk-in half of the user's big-monster rule
     (2026-09-24): a melee blow is struck from a tile beside the *floor* and
     never from inside it, so the ring a chase plans to is built around the box
     rather than around the tile the creature's own feet are on. Only the
     `adjacent`/`orthogonal` shapes read it - a caller bringing its own
     `goalTest` is taken at its word, as ever. A 1x1 floor gives exactly the old
     four (or eight) tiles, so every ordinary creature is untouched by this. */
  const foot = (opts && opts.foot) || null;
  const fbox = foot || { x0: tx, z0: tz, x1: tx, z1: tz };
  /* The level this route is planned on: the walker's own (see world.js#UP_Y).
     Creatures never leave the ground, so theirs is always 0 and nothing they
     do changes; the player carries theirs up the shop stairs and back down. */
  const plane = e.plane || 0;
  /* A wide walker plans with its whole body, not with its corner: every tile
     the search steps the south-west corner onto has to hold the entire floor
     (see pathfind.js#findPath's `stand`), and a chase's goal ring only offers
     corners the attacker's floor fits on. A 1x1 walker skips both and the
     search reads exactly what it always did. */
  const n = e.foot || 1;
  const stand = n > 1
    ? (x, z) => {
      for (let dx = 0; dx < n; dx++) {
        for (let dz = 0; dz < n; dz++) {
          if (!world.isWalkable(x + dx, z - dz)) return false;
          /* A wide body's floor is a wall to every other wide body: a dragon
             routes round another dragon's whole footprint. The player - left
             out of `blocked` above - stays open ground, and trees and scenery
             hold through `isWalkable`. */
          if (blocked(x + dx, z - dz)) return false;
        }
      }
      return true;
    }
    : null;
  const goalTest = (opts && opts.goalTest)
    || (adjacent
      ? (orthogonal
        ? (x, z) => footDistance(x, z, fbox).orth === 1 && world.isWalkable(x, z, plane) && !blocked(x, z) && (!stand || stand(x, z)) && (!(opts && opts.faceClear) || opts.faceClear(x, z))
        : (x, z) => footDistance(x, z, fbox).cheb === 1 && world.isWalkable(x, z, plane) && !blocked(x, z) && (!stand || stand(x, z)))
      : null);
  /* A shut door is a WALL to every route, the player's included. It is the
     user's own rule that a door is strictly a toggle (2026-09-22, standing
     preference P3): the click is the only thing in the game that swings a leaf,
     so no route may cross one and no walk may open one - unlike the client,
     which walks you into a shut door and swings it for you. A destination on the
     far side of a shut door therefore plans to the tile this side of it (the
     search's nearest-reached fallback puts the walker at the door) and the
     player opens it and clicks again. */
  /* Sealed faces bind routes, not tiles (world.js#blocksStep): wall panels and
     wall decor alike. A route has to respect them or a walker crosses the wall
     a painting hangs on - or any wall at all, now that wall tiles are standable.
     Every walker is held to it, the player included. */
  const crossed = world.blocksStep ? (afx, afz, atx, atz) => world.blocksStep(afx, afz, atx, atz, plane) : null;
  /* --------------------------------------------------- standing under a body

     A destination that a creature is standing on is **walked onto**, not swapped
     for a tile beside it (the user's report, 2026-09-22: *"you need to be able
     to stand underneath npcs … when you right click and select walk here, right
     now it doesnt nothing"*). Creatures are walk-through in this world - no body
     blocks another body's *step* (see `stepEntity`) - and the walk has to be as
     walk-through as the step is: the swap this replaces made a click on a
     creature's tile stop on a neighbour nobody asked for, and when the
     neighbour the ring scan happened to reach first was the tile the player was
     already standing on, it made the click do nothing at all.

     The swap is kept for a walk that is *for* something: a caller that asked to
     "come within `reach`" is an interaction's approach (src/actions.js#actWalk),
     where stopping beside the target is the whole point. The other interaction
     walk-ins say the same thing in their goal set instead
     (`opts.adjacent`/`opts.goalTest`), which skips this branch by construction.

     A **solid** creature - the user says a very few such NPCs exist and that
     they will be hand-made, one at a time, if ever - is the one thing that wants
     this swap back for a plain walk. There is no `solid` flag on an entity yet,
     so nothing is written for it; when one is added this is the place it is
     read (alongside `blocked(tx, tz)`), never the pathfinder, whose occupancy
     must stay a preference. */
  if (!goalTest && reach > 0 && blocked(tx, tz)) {
    const near = nearestWalkable(world, tx, tz, 3, blocked, plane);
    if (near) { tx = near.x; tz = near.z; }
  }
  let p = findPath(world, sx, sz, tx, tz, 0, { reach, blocked, goalTest, crossed, stand, plane });
  /* A route that stops short of the goal is treated as a failure and planned
     again with every creature ignored.

     Since occupancy became a tie-break (2026-09-22; see `pathfind.js`'s note on
     `blocked`), a body can no longer *cause* this: it never refuses a step and
     never lengthens a route, so the only way the blocked pass can miss the goal
     is that the goal is unreachable over terrain - and the creature-free pass
     cannot reach it either, so it changes nothing. It is kept as
     belt-and-braces because the two passes are not quite the same question:
     `findPath`'s occupied-destination swap (`nearestWalkable`) and a caller's
     own `goalTest` can make the two answer differently, and this branch only
     runs on a plan that already failed to reach the goal (a few ms, and only on
     such a tick). Read it as "try again in the simplest possible world", not as
     a creature workaround. */
  if (blocked) {
    const last = p && p[p.length - 1];
    const reached = !!last && (goalTest ? goalTest(last.x, last.z) : (last.x === tx && last.z === tz));
    if (!reached) {
      const q = findPath(world, sx, sz, tx, tz, 0, { reach, goalTest, crossed, stand });
      if (q) p = q;
    }
  }
  if (!p) return false;
  /* Walking to the tile you are already standing on is not a walk, and a plan
     that cannot leave it is not a plan: that is what the search answers when
     the goal is unreachable even with every creature ignored - a room with no
     way in - because its partial answer is then the start tile itself. Saying
     "planned" would leave the caller waiting on a route that is consumed in a
     single no-op step and then never re-planned (the blocked-step retry only
     watches a walk that still has a route). A caller-supplied goal set is the
     exception: a start tile that satisfies it means "already there", which is
     the answer the search was asked for, not a failure. */
  if (!goalTest && p.length <= 1 && (p[0].x !== tx || p[0].z !== tz)) return false;
  if (p.length > 1) p.shift();
  /* Do NOT snap the interpolation origin to the logical tile here. An entity
     that is halfway through a step (the common case - every re-click, every
     combat chase repath, every skilling retarget) has already advanced e.x/e.z
     to the tile it is walking onto, so resetting px/pz would teleport it
     forward to that tile's centre and then freeze it there for the rest of the
     tick. Leaving px/pz alone lets the current step finish smoothly and the new
     route continue from it, which is what the real client does. */
  if (e.px == null) { e.px = e.x; e.pz = e.z; }
  /* The run toggle governs by default; holding shift or ctrl as you click
     inverts it for that one destination - the real client's control-click.

     The modifier is read from the *click event's* own shiftKey/ctrlKey when the
     caller has one (`mods`). That matters: an event's own modifier flags cannot
     go stale, where the key map can (a keyup the page never sees - the tab
     losing focus mid-press, an OS-level grab - leaves the modifier latched on).
     The key map is kept only as the fallback for walk requests that arrive
     without a pointer event (a menu row, a wander) and is reconciled from every
     key *and pointer* event, so it can never be staler than the player's last
     click (see `noteModifiers` and game.js#clickMods).

     A caller that is not the player's own click passes `NO_MODS`, which reads
     as "no modifier" rather than falling through to the key map. That is the
     important half - an activity's walk-in is planned by the *click on the
     object*, and a latched shift must not turn it into a walk (the user's
     report, 2026-09-22: "when cutting a tree run is deactivated even tho its
     still turned on"). src/combat.js#chaseTarget refuses the map for a chase
     for the same reason.

     `keepRunOverride` is for a re-plan of a walk already in progress (see the
     blocked-step retry in stepSim): the per-click override belongs to the walk,
     not to the planning, so a mid-walk re-plan must leave it alone. */
  if (!keepRunOverride && e.kind === "player" && e.ps) {
    const invert = mods
      ? !!(mods.shiftKey || mods.ctrlKey)
      : !!(Game.input.keys["shift"] || Game.input.keys["ctrl"]);
    e.runClick = invert ? !e.ps.runEnabled : null;
  }
  /* the tile the entity will actually stop on - it can differ from the tile
     that was asked for when that one was occupied (see above), or when the
     search could only get part of the way there, so the caller paints its
     destination flag from these rather than from the request. Under
     `opts.adjacent` the goal tile is not known until the search has chosen one,
     which is exactly why it comes off the end of the route. */
  const goal = p.length ? p[p.length - 1] : { x: tx, z: tz };
  e.destX = goal.x;
  e.destZ = goal.z;
  e.path = p;
  return true;
}

/* Move an entity instantly (load, respawn, death) without the render
   interpolation sliding it across the map. */
export function placeEntity(e, x, z, dir, plane) {
  /* A placement may name the level with it: climbs land upstairs, teleports
     and respawns land on the ground, and anything that does not name one
     (a leap step, an NPC nudge) keeps the level it had. */
  if (plane != null) e.plane = plane;
  /* Being put inside a creature is the same stacking bug as walking into one,
     and every instant placement - a teleport, a death respawn, a save load -
     aims at a fixed tile that a wanderer may since have claimed. An occupied
     destination is swapped for the nearest free tile, so no placement can ever
     produce a shared tile. */
  if (Game.world && Game.entities && entityAtTile(Math.floor(x), Math.floor(z), e)) {
    /* the predicate is "is this tile blocked?", the same shape walkTo hands
       to the pathfinder */
    const taken = (nx, nz) => !!entityAtTile(nx, nz, e);
    const near = nearestWalkable(Game.world, Math.floor(x), Math.floor(z), 12, taken);
    if (near) { x = near.x + 0.5; z = near.z + 0.5; }
  }
  e.x = x; e.z = z;
  e.px = x; e.pz = z;
  if (dir != null) e.dir = dir;
  e.rot = yawToRot(e.dir || 0);
  e.targetRot = e.rot;
  e.turnDiff = 0;
  if (e.path) e.path.length = 0;
  e.stepPts = null;
  e.moving = false;
  if (e.rx != null) { e.rx = x; e.rz = z; }
  e.lrx = null; e.lrz = null;
  e.rdist = 0;
}

/* Where the entity is *drawn* this frame. A tick moves an integer number of
   tiles - one walking, two running - and the frame interpolates across them, so
   the movement is read out of `e.stepPts` (the tiles the tick's steps passed
   through, origin first) one segment at a time rather than as a single straight
   line from the origin to the destination. That is the difference between a
   running character turning the corner it ran round and one sliding diagonally
   across the corner's inside, facing wherever the last step pointed. `seg` is
   which segment of that list the frame is on, so the renderer can face the
   body along the segment it is actually walking (see updateEntityTransform). */
export function renderPos(e, out) {
  /* `out` lets a caller that reads the answer immediately and then throws it
     away reuse one object instead of allocating ~250 of them per frame - see
     the scratch below. Every caller that leaves it off still gets a fresh
     object, exactly as before. */
  const r = out || { x: 0, z: 0, seg: -1, segs: 0 };
  const p = Game.tickProgress;
  const pts = e.stepPts;
  if (pts && pts.length > 1) {
    const n = pts.length - 1;
    let seg = Math.floor(p * n);
    if (seg >= n) seg = n - 1;
    if (seg < 0) seg = 0;
    const t = p * n - seg;
    const a = pts[seg];
    const b = pts[seg + 1];
    r.x = a[0] + (b[0] - a[0]) * t;
    r.z = a[1] + (b[1] - a[1]) * t;
    r.seg = seg;
    r.segs = n;
    return r;
  }
  const px = e.px == null ? e.x : e.px;
  const pz = e.pz == null ? e.z : e.pz;
  r.x = px + (e.x - px) * p;
  r.z = pz + (e.z - pz) * p;
  r.seg = -1;
  r.segs = 0;
  return r;
}

/* The frame's own reuse buffer for `renderPos` (see its `out`). It belongs to
   `updateEntityTransform`, which reads the answer and copies what it needs out
   of it before anything else can call this - so one buffer is safe. */
const _rpScratch = { x: 0, z: 0, seg: -1, segs: 0 };

/* The frame's visibility cull (see the note in updateVisuals): the camera's
   frustum, rebuilt once a frame and enlarged by CULL_MARGIN tiles, plus the one
   sphere it is tested against. All three are reused, so the cull allocates
   nothing per entity. */
const _cullFrustum = new THREE.Frustum();
const _cullMat = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere(new THREE.Vector3(), 1.8);
const CULL_MARGIN = 4;

/* The blob shadow's ground-hug (see updateVisuals): a flat quad at the feet
   reads as a clean ellipse on flat ground, but on a slope the uphill half
   sinks under the terrain and only a downhill sliver shows - which reads as
   a streak trailing off the feet. Tilting the quad to the terrain normal
   keeps the whole ellipse on the surface. Scratch, reused, never allocated. */
const _blobN = new THREE.Vector3();
const _blobUp = new THREE.Vector3(0, 1, 0);
const _blobI = new THREE.Quaternion();
/* Crab slope-tilt scratch (see updateEntityTransform): yaw-then-tilt quats plus
   the tile-corner vectors the normal is built from. Reused, never allocated. */
const _tiltX = new THREE.Vector3();
const _tiltZ = new THREE.Vector3();
const _tiltN = new THREE.Vector3();
const _tiltQ = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
function findBlobShadow(ch) {
  if (!ch || !ch.group) return null;
  let found = null;
  ch.group.traverse((o) => { if (!found && o.isMesh && o.userData && o.userData.blobShadow) found = o; });
  return found;
}
function tiltBlobToGround(mesh, world, x, z, plane, yaw) {
  mesh.quaternion.copy(_blobI);
  let center = 0;
  try { center = world.heightAt(x, z, plane); } catch (e) { center = 0; }
  const pos = mesh.geometry.attributes.position;
  const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i), lz = pos.getZ(i);
    const dx = lx * c + lz * s, dz = -lx * s + lz * c;
    let h = center;
    try { h = world.heightAt(x + dx, z + dz, plane); } catch (e) { h = center; }
    pos.setY(i, (h - center) + 0.06);
  }
  pos.needsUpdate = true;
}

/* The tile-stacking pass's own map (see updateVisuals): which body wins each
   tile, rebuilt from scratch every frame but in the *same* Map - a fresh one per
   frame was 60 short-lived allocations a second for no benefit, and a Map that
   is emptied and refilled has exactly the same contents. `_rank` is the body's
   `bodyStackRank`, cached on the entity for the duration of one pass so the
   comparison does not re-derive it (it reads `kind` and walks the ghost ids). */
const _topBody = new Map();

/* Which way the body is turned on screen: the direction of the step it is
   *currently* walking, which is the segment of `stepPts` the frame is on - not
   `e.dir`, which is always the last step of the tick and so would face a
   running character along its second step while it is still drawn walking the
   first. */
export function facingOf(e, r) {
  if (r && r.seg >= 0 && e.stepPts) {
    const a = e.stepPts[r.seg];
    const b = e.stepPts[r.seg + 1];
    return Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
  return e.dir;
}

export const ROT_UNITS = 2048;
const ROT_TAU = Math.PI * 2;
export function yawToRot(yaw) {
  const n = ((yaw % ROT_TAU) + ROT_TAU) % ROT_TAU;
  return Math.round(n / ROT_TAU * ROT_UNITS) % ROT_UNITS;
}
export function rotToYaw(rot) {
  return (rot / ROT_UNITS) * ROT_TAU;
}
export function rotDiff(from, to) {
  let d = (to - from) % ROT_UNITS;
  if (d > 1024) d -= ROT_UNITS;
  if (d < -1024) d += ROT_UNITS;
  return d;
}
export function turnRateOf(e) {
  return (e.ch && e.ch.data && e.ch.data.turnRate) || 32;
}
export function desiredYawOf(e, r) {
  /* A big body turns from its middle, not from its south-west tile - the head
     tracks the victim from where the head is drawn (see `npcDrawCX`). */
  if (e.kind === "npc" && e.target && !e.target.dead && !e.fleeing && e.target.x != null)
    return Math.atan2(e.target.x - npcDrawCX(e), e.target.z - npcDrawCZ(e));
  if (e.kind === "npc" && e.talking && Game.player)
    return Math.atan2(Game.player.x - npcDrawCX(e), Game.player.z - npcDrawCZ(e));
  /* A player locked onto a victim strafes looking at it for the whole walk-in:
     the logic aims e.dir at faceEnt every tick, but facingOf below would turn
     the drawn body along the step segment instead, so the body walked facing
     its feet while the swing measured the target. The target owns the drawn
     facing exactly the way an NPC's target does above. */
  if (e.faceEnt && !e.faceEnt.dead && e.faceEnt.x != null) {
    const f = e.faceEnt;
    const fx = (f.rx != null ? f.rx : npcDrawCX(f));
    const fz = (f.rz != null ? f.rz : npcDrawCZ(f));
    const ex = npcDrawCX(e, r ? r.x : e.x);
    const ez = npcDrawCZ(e, r ? r.z : e.z);
    return Math.atan2(fx - ex, fz - ez);
  }
  return facingOf(e, r);
}
export function stepRotation(e, dt) {
  const target = e.targetRot != null ? e.targetRot : yawToRot(e.dir || 0);
  if (e.rot == null) e.rot = target;
  let d = rotDiff(e.rot, target);
  if (dt > 0) {
    const maxStep = turnRateOf(e) * dt / 0.02;
    if (Math.abs(d) <= Math.max(maxStep, 1)) {
      e.rot = target;
      d = 0;
    } else {
      e.rot = (e.rot + Math.sign(d) * maxStep + ROT_UNITS) % ROT_UNITS;
    }
  }
  e.turnDiff = d;
  return d;
}
export function turnAnimFor(e, moving, diff) {
  const m = e.ch && e.ch.data;
  const has = (n) => !!(m && m.anims && m.anims[n]);
  const a = Math.abs(diff || 0);
  if (!moving) {
    if (a > 8 && has("standTurn")) return "standTurn";
    return null;
  }
  if (a >= 768 && has("turn180")) return "turn180";
  if (diff > 128 && has("turnRight")) return "turnRight";
  if (diff < -128 && has("turnLeft")) return "turnLeft";
  return null;
}

/* Stop an entity dead exactly where it is currently drawn.

   An entity between tiles carries its previous tile in px/pz and the tile it is
   walking onto in x/z, and the renderer replays that step every tick. A creature
   that is rooted (Bind/Snare/Entangle) or that dies mid-step must not take
   another step, so its movement has to be cancelled - but cancelling it by
   leaving px/pz behind would make renderPos glide it a whole tile forward and
   snap it back on every single tick, which reads as the creature choppily
   moonwalking on the spot. Collapsing both the logical tile and the
   interpolation origin onto the point it is drawn at freezes it in place with
   no pop either way. */
export function freezeEntity(e) {
  if (e.px != null && (e.px !== e.x || e.pz !== e.z)) {
    const r = renderPos(e);
    e.x = r.x; e.z = r.z;
    e.px = r.x; e.pz = r.z;
  } else {
    e.px = e.x; e.pz = e.z;
  }
  if (e.path) e.path.length = 0;
  e.stepPts = null;
  e.moving = false;
}

export function updateEntityTransform(view, e, dt) {
  const r = renderPos(e, _rpScratch);
  /* The body is DRAWN at the middle of its floor (see `npcDrawCX`), while the
     logic walks on the south-west tile - so the drawn position is the logical
     one plus the centre offset, and everything that follows on this frame
     (the group, rx/rz, the height under the feet) reads the drawn one. */
  const cx = npcDrawCX(e, r.x);
  const cz = npcDrawCZ(e, r.z);
  e.rx = cx;
  e.rz = cz;
  /* The level stands the body up: the ground under the feet plus the storey
     (see world.js#UP_Y) - the camera reads `ry`, so it follows upstairs. */
  let y = view.world.heightAt(cx, cz, e.plane || 0);
  /* A leap between rocks (src/actions.js#leapTo) is one tile-to-tile step drawn
     as an arc. The entity is already standing on the far tile when the leap is
     made - the step is what the renderer interpolates, exactly as for a walk -
     and `tickProgress` runs 0..1 across that same step, so the flight is drawn
     over it: from the surface the leap started on, to the surface it is landing
     on, with a sine's hump above both (`airH`, about a tile and a bit for a
     long hop, less for a short one). The two ends are read from the entities'
     own tiles rather than from `heightAt` under the flight path, which matters:
     a leap over water crosses the RIVER BED, two tiles below the rock the whole
     crossing is made between, and following the ground under the arc would duck
     the jumper into the water mid-hop. `airT` is how many ticks are left to
     draw it and is counted down at the top of stepSim, so the flight lives
     through exactly the tick whose step it is and never leaks into the walk
     that follows. */
  if (e.airT > 0) {
    const p = Game.tickProgress;
    const a = view.world.heightAt(e.px == null ? r.x : e.px, e.pz == null ? r.z : e.pz);
    const b = view.world.heightAt(e.x, e.z);
    y = a + (b - a) * p + Math.sin(Math.PI * p) * (e.airH || 1);
  }
  /* The height this body is DRAWN at, kept for the camera to read. The camera
     used to re-read the terrain under the player from its own interpolated
     position (`heightAt(rx, rz)` in updateVisuals), which is the same number in
     every case but one: a leap. The arc deliberately ignores the ground beneath
     it, and over the river that ground is the BED - at the stepping stones the
     tile between two rocks is three tiles down, so the camera's target followed
     the jumper's feet into the water and back out on every hop (the user's
     report: "the camera should be moving like that bugging out going
     underwater"). Reading the drawn height instead makes the camera follow the
     arc the character is actually flying along, at no cost - it is the same
     value the model was just placed at. */
  e.ry = y;
  /* The wash-up opening's lie (src/actions.js#cayStart): the group alone rides
     up by the lift while the logic height (and so the camera) stays on the
     sand; the rise tweens it back to planted. */
  if (e.kind === "player" && e.cayLift) y += e.cayLift;
  e.ch.group.position.set(cx, y, cz);
  const face = desiredYawOf(e, r);
  e.targetRot = yawToRot(face);
  if (e.kind === "npc" && ((e.target && !e.target.dead) || e.talking)) e.dir = face;
  if (e.faceEnt && !e.faceEnt.dead && e.faceEnt.x != null) e.dir = face;
  stepRotation(e, dt || 0);
  const yaw = rotToYaw(e.rot);
  if (e.ch.isSprite) {
    e.ch.group.rotation.y = 0;
    e.ch.face(yaw, Game.yaw, Game.pitch);
  } else if (e.kind === "npc" && (e.type === "crab" || e.type === "snake") && view.world && view.world.cornerAt) {
    /* Beach crabs ride their slope exactly the way a lit fire does
       (scene.js#addFire): the tile corners' normal, no slope limit - a crab
       climbing the bluff tips right over with it. Snakes ride the same way
       (user ask 2026-10-31): a snake on a dune flows over it, never floats
       above it. Yaw first, then the tilt,
       so the facing never changes, only the lean. */
    const w = view.world;
    const cx0 = Math.floor(cx), cz0 = Math.floor(cz);
    const h00 = w.cornerAt(cx0, cz0), h10 = w.cornerAt(cx0 + 1, cz0);
    const h01 = w.cornerAt(cx0, cz0 + 1), h11 = w.cornerAt(cx0 + 1, cz0 + 1);
    _tiltX.set(1, (h10 + h11) / 2 - (h00 + h01) / 2, 0);
    _tiltZ.set(0, (h01 + h11) / 2 - (h00 + h10) / 2, 1);
    _tiltN.crossVectors(_tiltZ, _tiltX).normalize();
    _tiltQ.setFromUnitVectors(_blobUp, _tiltN);
    _yawQ.setFromAxisAngle(_blobUp, yaw);
    e.ch.group.quaternion.copy(_tiltQ).multiply(_yawQ);
  } else {
    e.ch.group.rotation.y = yaw;
  }
  /* a plain square root rather than Math.hypot: hypot is the guard against
     overflow/underflow nobody here can hit, and it costs about twice as much -
     this runs once per entity per frame, ~250 times a frame */
  const ldx = r.x - (e.lrx == null ? r.x : e.lrx);
  const ldz = r.z - (e.lrz == null ? r.z : e.lrz);
  const d = Math.sqrt(ldx * ldx + ldz * ldz);
  e.lrx = r.x;
  e.lrz = r.z;
  /* distance covered since this character's animation was last advanced - the
     walk/run cycle is driven by ground speed so the feet never slide */
  e.rdist = (e.rdist || 0) + d;
  e.rphase = (e.rphase || 0) + d * 2.7;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/* ---------------------------------------------------------------- click boxes

   A creature's click box is the model's own bounding box in the body's local
   frame: `[x0, x1, y0, y1, z0, z1]`, y from the feet up (the bake's `bounds` is
   already in the drawn convention - x right, y up from the feet, and the
   renderer negates the authored z, so the box's z runs from -maxZ to -minZ).
   See `Game.pickEntity` for why the box is used rather than the geometry's
   bounding sphere. The blob shadow and the held-item fallback are separate
   meshes on the group, so they are deliberately not part of the box. */
function clickBoxOf(ch) {
  const d = ch && ch.data;
  if (!d) return null;
  const b = d.bounds;
  if (b && b.length === 6) return [b[0], b[3], b[1], b[4], -b[5], -b[2]];
  /* models with no baked bounds still get a body-sized box from their own
     width/height/depth figures */
  const w = (d.width || 0.5) / 2, h = d.height || 1, dp = (d.depth || 0.5) / 2;
  return [-w, w, 0, h, -dp, dp];
}

/* The same box in world space, for the `::boxes` view (src/scene.js#setHoverEnt).
   A creature is *drawn* rotated by the body's facing, so the box the picker
   tests is the model's own box turned with the body - `rot` is that box's
   axis-aligned bound (the eight local corners turned by the group's yaw, then
   min/max), and `flat` is the box left unrotated where the body stands, which
   is the model's extent as authored. The box a click resolves through is
   `rot`; `flat` is drawn beside it so the turn the facing applies is visible,
   the same click-box/model-box pairing the loc view draws (scene.js#setHoverBox
   - and there the picker's box is a whole tile, here it is the model's own).
   `box`/`yaw`/`x`/`y`/`z` carry the oriented pick box itself (the frame
   `pickAllFrom` tests the ray in), so the view can draw it turned with the
   body rather than only its axis-aligned bound. */
export function entityBoxWorld(ent) {
  const ch = ent && ent.ch;
  if (!ch || !ch.group) return null;
  if (!ent.clickBox) ent.clickBox = clickBoxOf(ch);
  const b = ent.clickBox;
  if (!b) return null;
  const p = ch.group.position;
  const a = ch.group.rotation.y;
  const ca = Math.cos(a), sa = Math.sin(a);
  const rot = { min: [Infinity, p.y + b[2], Infinity], max: [-Infinity, p.y + b[3], -Infinity] };
  for (const x of [b[0], b[1]]) {
    for (const z of [b[4], b[5]]) {
      /* local -> world is the inverse of the ray transform in `pickAllFrom`
         (wx = cos*x + sin*z, wz = -sin*x + cos*z) */
      const wx = p.x + ca * x + sa * z;
      const wz = p.z - sa * x + ca * z;
      if (wx < rot.min[0]) rot.min[0] = wx;
      if (wx > rot.max[0]) rot.max[0] = wx;
      if (wz < rot.min[2]) rot.min[2] = wz;
      if (wz > rot.max[2]) rot.max[2] = wz;
    }
  }
  const flat = {
    min: [p.x + b[0], p.y + b[2], p.z + b[4]],
    max: [p.x + b[1], p.y + b[3], p.z + b[5]],
  };
  /* The oriented box the picker tests (see `pickAllFrom`: the ray is moved into
     this same frame), carried for the `::boxes` view so it can draw the box
     turned with the body instead of only its axis-aligned bound: the local
     extents, the yaw they turn by, and the feet they stand on. `foot` is the
     body's tile floor (see `npcFootBox`) - the ground it owns, which unlike
     the model box never turns: a footprint is tiles, and tiles do not rotate
     with the body. */
  return { rot, flat, box: b, yaw: a, x: p.x, y: p.y, z: p.z, foot: npcFootBox(ent) };
}

/* A scratch interval, shared so the box test allocates nothing per candidate. */
const _slab = { t0: 0, t1: 0 };

/* One axis of a ray/box slab clip: narrows `_slab`'s [t0, t1] to the part of
   the ray inside this slab, returning false when the ray misses it entirely. */
function slabAxis(o, d, lo, hi) {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let s0 = (lo - o) / d;
  let s1 = (hi - o) / d;
  if (s0 > s1) { const t = s0; s0 = s1; s1 = t; }
  if (s0 > _slab.t0) _slab.t0 = s0;
  if (s1 < _slab.t1) _slab.t1 = s1;
  return _slab.t0 <= _slab.t1;
}

/* The animation the player swings with: their weapon's fight-type animation for
   the combat mode currently selected (bare hands punch or kick). */
export function playerAttackAnim() {
  const ps = Game.ps;
  if (!ps) return "attack_punch";
  return attackAnimFor(weaponOf(ps), ps.styleIndex || 0);
}

/* The casting sequence the player is part-way through, if any. The model
   module latches this into a one-shot swing so the pose always plays out in
   full, however briefly the flag is raised. */
function playerCastAnim() {
  const p = Game.player;
  return p && p.castLeft > 0 && p.castAnim ? p.castAnim : null;
}

/* Raise a one-shot pose on a character - the player, or one of the creatures
   that casts (the dark wizard). `name` is a baked animation key: the cast
   sequences in src/tools/cache-bake/bake.mjs#CAST_ANIMS on the player, the
   skilling poses in #SKILL_ANIMS (the pickpocket's dip, the stunned flinch -
   see src/actions.js#pickpocket), or the single `curse` sequence the wizard's
   own skeleton carries. The pose is held for the length of its own sequence, so
   the model never restarts or cuts it short, or for `seconds` when the caller
   knows better.

   `loop` marks a *work* pose that the activity repeats - the woodcutting swing,
   which is a single 0.8 s chop the client plays over and over while the player
   keeps chopping (src/actions.js#attemptWc). Such a pose is held and wrapped by
   the model for as long as the caller asks for it, instead of playing once and
   dropping, so the axe never rests between swings (see src/models3d.js). Spells
   and one-shot swings leave it unset.

   `tail` goes with `loop`: it asks the model to enter the wrap at the sequence's
   *final* frame rather than its first, which is the frame these work sequences
   settle back to the tool-at-rest stance in. A looping pose entered at the top
   instead shows the swing already at the top of its wind-up, because the cache's
   first frame is one short reaching pose (see src/actions.js#workAnim for the
   report and the whole argument). */
export function playCastAnim(entity, name, seconds, loop, tool, tail) {
  const e = entity || Game.player;
  if (!e || !e.ch || !e.ch.data || !e.ch.data._anims) return false;
  const a = e.ch.data._anims[name];
  if (!a) return false;
  e.castAnim = name;
  e.castLeft = seconds != null ? seconds : a.totalTicks * 0.02;
  e.castLoop = !!loop;
  /* Whether the model should enter that wrap at the sequence's final frame - see
     the `tail` note above. Meaningless without `loop`, and cleared with it. */
  e.castTail = !!(loop && tail);
  /* a new pose wraps back into its own idle tail unless the caller says
     otherwise the moment it returns (the teleport's arrival - see
     src/actions.js#teleportJump) */
  e.castClamp = false;
  /* The item the pose is performed *with*, for a work pose - the axe a tree is
     being chopped with, the pickaxe a rock is being mined with (see
     src/actions.js#workAnim). It is what the hand holds instead of the weapon
     for as long as this pose is the one playing (src/game.js#wornKeysFor reads
     `e.castTool`), so it is stamped here, with the pose, and every pose
     overwrites it: a spell cast raised over a mining swing puts the weapon back
     in the hand, exactly as the animation changes. */
  e.castTool = tool || null;
  /* A cast's request stays raised for its whole duration (see
     `playerCastAnim`), so the model needs a way to tell a *new* cast from the
     same one still being asked for - otherwise it re-arms the pose the moment
     its sequence runs out, restarting the gather after the missile has gone.
     The token is bumped here, once per cast, and handed to the model with the
     pose (see src/models3d.js#buildMesh's `castToken`). */
  e.castId = (e.castId || 0) + 1;
  return true;
}

/* The casting pose a creature is part-way through, if any. */
function entityCastAnim(e) {
  return e.castLeft > 0 && e.castAnim ? e.castAnim : null;
}

function tickCastAnim(e, dt) {
  if (e.castLeft > 0) {
    e.castLeft = Math.max(0, e.castLeft - dt);
    if (e.castLeft === 0) { e.castAnim = null; e.castLoop = false; e.castTail = false; e.castClamp = false; if (!e.castToolHold) e.castTool = null; }
  }
}

/* --------------------------------------------------------------- the emotes

   An emote is a one-shot pose like a cast, and it is played the same way - the
   entity carries the sequence's name and its remaining time, and the model
   latches the pose from that (src/models3d.js#update's `emote` option). It is
   *not* a cast, though, and the differences are the two things that make an
   emote an emote:

     * It is cut short the moment the character does anything else. A cast's
       request outlives its sequence on purpose (the model must finish the
       gather however briefly the flag was raised); an emote must stop the
       instant a step, a swing, a spell or an action begins, so the caller
       destroys the request rather than latched time - see the cancel in
       src/game.js#updateVisuals. That check is the *only* rule: an emote is
       simply the lowest-priority pose in the model, so whatever else is
       happening wins, exactly as the client's animation priorities work.

     * It restarts when asked for again. `emoteId` is a token bumped once per
       request, which is how the model tells "a second Yes" from "the same Yes,
       still playing" (see src/models3d.js's `emoteToken`).

   The pose is held for the length of its own sequence. Nothing here decides
   what an emote *means*: the emote book is src/emotes.js and what a button
   does with a cape that has no emote is src/actions.js#performEmote. */
export function playEmote(entity, name) {
  const e = entity || Game.player;
  if (!e || !e.ch || !e.ch.data || !e.ch.data._anims) return false;
  const a = e.ch.data._anims[name];
  if (!a) return false;
  e.emoteAnim = name;
  e.emoteLeft = a.totalTicks * 0.02;
  e.emoteId = (e.emoteId || 0) + 1;
  return true;
}

/* Who is emoting right now, or null - the model's `emote` option. */
export function emoteAnimOf(e) {
  return e && e.emoteLeft > 0 && e.emoteAnim ? e.emoteAnim : null;
}

/* Play a cape of accomplishment's own emote on one entity - the pair `emotes.js
   #SKILLCAPE_EMOTES` holds for the cape's skill. The sequence is the cape's own
   pose, and the graphic goes where the *body* is, not on the tile it is walking
   off (`rx`/`rz` are the interpolated render position), at height 0 - the cape
   models are authored around the body, so no offset is needed
   (src/tools/cache-bake/bake.mjs#SKILLCAPE_GFX) - carrying the wearer as its
   target so it rides the body for the whole pose, the same as a missile in
   flight.

   Two callers, and they are the two ways a cape emote can happen in this world:
   the local player's own button (src/actions.js#performEmote) and a cape emote
   arriving from another player, played on their ghost (src/game.js#ghostEmote).
   Both are also why the pose hides the held weapon and shield
   (src/game.js#wornKeysFor). */
export function playCapeEmote(entity, sc) {
  if (!entity || !sc) return false;
  if (!playEmote(entity, sc.anim)) return false;
  Gfx.play(sc.gfx, {
    x: entity.rx != null ? entity.rx : entity.x,
    z: entity.rz != null ? entity.rz : entity.z,
    height: 0,
    dir: entity.dir || 0,
    target: entity,
    /* The graphic lives as long as the POSE does, not as long as its own
       sequence: seven of the cache's cape graphics are authored shorter than
       the emote they belong to (see src/gfx.js#play), and playing them off
       their own clock made the emote's own scene - the barbell, the conjured
       shield and sword, the tree, the net, the anvil - vanish up to a second
       and a half before the pose was over. `playEmote` has just set
       `emoteLeft` to the pose's authored length, so that is the clock handed
       over; the graphic's `hold` clamp then keeps its last authored frame on
       screen for the rest of the emote instead of dropping the meshes. */
    seconds: entity.emoteLeft,
  });
  return true;
}

/* Another player has performed an emote (src/net.js#S_EMOTE): the wire carries
   the emote's position in the book (src/emotes.js), because both clients have
   the same table and a name would be a string where one byte will do. A ghost
   emotes exactly as the local player does - the same fields, the same pose -
   so everything below it (the cancel rule, the LOD demotion, the interpolation
   of the walk) needs no special case for a remote one. */
export function ghostEmote(id, index) {
  const g = Game.ghosts.get(id);
  if (!g) return null;
  const emote = emoteAt(index);
  if (!emote) return null;
  /* The book's last button is the conditional one, and its index carries no
     animation of its own - what plays is the emote of the cape the *emoter* is
     wearing. Their ghost is wearing exactly that cape: the kit arrives with the
     join packet (src/game.js#setGhostKit), so the pose and the graphic can be
     read off the ghost's own equipment and the peer sees what the emoter sees,
     instead of the nothing an unresolvable index used to draw. */
  if (!emote.anim) {
    const cape = g.wornEq && g.wornEq.cape ? g.wornEq.cape.id : null;
    const def = cape ? ITEMS[cape] : null;
    const sc = def && def.skillcape ? skillcapeEmote(def.skillcape) : null;
    if (!sc) return null;
    playCapeEmote(g, sc);
    return g;
  }
  playEmote(g, emote.anim);
  return g;
}

/* ------------------------------------------------------- another player's work

   Every other thing about a player that travels on its own packet is a *moment*
   - a swing, a spell, an emote, a word - so one packet per event is the whole of
   it. Working is not a moment. A woodcutter, a miner, a fisher, a cook, a
   smither, a fletcher holds a pose for as long as the activity runs, and that
   pose is the whole of what a bystander sees; until this packet existed the only
   thing the neighbourhood knew about a chopping player was where they were
   standing, so two people in one wood watched each other stand perfectly still
   while the trees fell around them (the user's report: *"make sure all players
   update in real time ... what they are doing, what actions doing currently"*).

   The packet invents no vocabulary. The sender sends exactly what its own model
   is being asked for - the pose's baked name, whether it loops, whether it is
   entered at its tail, and the tool it is performed with (src/actions.js#
   workAnim, src/game.js#playCastAnim) - and the receiver hands that same request
   to the ghost's model, so `ghostAction` below is a few lines and needs no table.
   The pose names are the cache's own animation keys (bake.mjs#SKILL_ANIMS), which
   both clients already carry, and a name that is not in the ghost's skeleton is
   dropped by `playCastAnim` rather than drawn.

   Only **work** poses travel this way, and that is what `WORK_POSES` is for. A
   spell's gather, a special attack's swing and a cape emote all have packets of
   their own (S_SPELL, S_COMBAT, S_EMOTE) and are already played on the ghost by
   the code that receives them, so relaying the pose as well would play each of
   them a second time - a caster visibly gathering the spell twice. The
   discriminator is therefore an allow-list of the skilling poses rather than
   "everything that is not a spell": an unlisted pose is simply not relayed,
   which fails to nothing, where a missed *exclusion* would fail to a pose drawn
   twice. The keys are `bake.mjs#SKILL_ANIMS` plus the handful of poses the
   skilling code raises directly rather than through `workAnim` (firemaking,
   fletching, the gem cuts, leathercraft, praying, the bucket, the pickups,
   runecrafting and the twelve bow-stringings),
   and the direct `playCastAnim` calls in src/actions.js and src/ui.js are the
   place to look when a new one is added - and that look is enforced, not just
   advised: a player pose with no wire is a failing audit
   (src/tools/check-visibility.mjs, the visibility rule in src/README.md). */
const WORK_POSES = new Set([
  /* woodcutting and mining, one sequence per tool tier */
  "wc_bronze", "wc_iron", "wc_steel", "wc_black", "wc_mithril", "wc_adamant", "wc_rune",
  "mine_bronze", "mine_iron", "mine_steel", "mine_mithril", "mine_adamant", "mine_rune", "mine_old",
  /* fishing, one per method */
  "fish_smallnet", "fish_bignet", "fish_cage", "fish_harpoon", "fish_cast", "fish_onspot",
  /* the fire-and-metal skills, and the rest of the pack's work poses */
  "cook_range", "cook_fire", "smith_anvil", "smelt_furnace", "firemaking", "pray",
  "fletch", "leathercraft", "herb_mix", "herb_grind", "shear", "spin", "runecraft",
  /* the potter's wheel and the glassblowing pipe (bake.mjs#SKILL_ANIMS) */
  "pot", "glassblow",
  /* bow-stringing: one reaching pose per bow, named by the unstrung bow
     (src/actions.js#STRING_ANIM) - a strung yew played nothing on other
     screens until these joined the set */
  "string_shortbow", "string_oak_shortbow", "string_willow_shortbow",
  "string_maple_shortbow", "string_yew_shortbow", "string_magic_shortbow",
  "string_longbow", "string_oak_longbow", "string_willow_longbow",
  "string_maple_longbow", "string_yew_longbow", "string_magic_longbow",
  /* the gem cuts - the animation names the gem, not the level */
  "cut_dragonstone", "cut_diamond", "cut_ruby", "cut_sapphire", "cut_emerald",
  /* thieving, and the small reaching poses */
  "skill_pickpocket", "skill_stunned", "pickup_table", "fill_bucket", "pickup", "eat",
  /* the agility course (Cairn Isle): every pose the kit plays, so a crossing is
     seen on other screens as the climb/swing/squeeze it is rather than a glide
     (the user's report). The full 39 of bake.mjs#AGILITY_ANIMS, including the
     ready/fail poses no piece currently plays, so a future PIECE row needs no
     matching edit here. An agility crossing is short (under a second of pose),
     but the sender re-sends a held pose on the heartbeat and the ghost holds
     each packet for GHOST_WORK_HOLD, so the pose outlives the glide. */
  "agile_climb", "agile_climb_ready", "agile_climb_fall",
  "agile_climb_down", "agile_hang_climb", "agile_climb_out",
  "agile_reach_ladder", "agile_ladder_top",
  "agile_climb_bookcase", "agile_climb_bookcase_fail",
  "agile_pipe_squeeze", "agile_pipe_ready", "agile_pipe_unsqueeze",
  "agile_pipe_double",
  "agile_rope_swing", "agile_rope_swing_long", "agile_rope_miss",
  "agile_throw_rope", "agile_throw_rope_up",
  "agile_log_balance", "agile_log_balance_ready", "agile_log_balance_stumble",
  "agile_stepping_stone", "agile_jump_stones", "agile_jump_hurdle",
  "agile_long_jump", "agile_spot_jump",
  "agile_ledge_on_left", "agile_ledge_off_left",
  "agile_ledge_on_right", "agile_ledge_off_right",
  "agile_ledge_walk_left", "agile_ledge_walk_right",
  "agile_crawl", "agile_crawl_ready", "agile_crawl_long",
  "agile_crumbled_wall", "agile_low_wall", "agile_low_wall_fail",
]);

export function isWorkPose(name) {
  return !!name && WORK_POSES.has(name);
}

/* How long a remote work pose is held between packets. The sender re-sends its
   pose every couple of seconds for as long as the work continues
   (src/net.js#sendAction), so this is the slack a packet is allowed to go
   missing in - the same job `WORK_POSE_HOLD` does locally (src/actions.js),
   where the activity itself does the refreshing. */
const GHOST_WORK_HOLD = 4;

/* Another player's work pose (src/net.js#S_ACT), applied to their ghost. The
   same rules the local player's own pose machinery follows, because it is the
   same machinery: a looping pose is held for as long as its caller keeps asking,
   a repeat of the pose already playing only refreshes it (re-arming would
   restart the chop from the top every time a packet landed - src/actions.js#
   workAnim does exactly this check), and a one-shot pose is left to play itself
   out. `tool` is the item the pose is performed with - the axe a tree is being
   chopped with - which the ghost then holds in place of its weapon for as long
   as the pose lasts (src/game.js#wornKeysFor). */
export function ghostAction(id, pose, loop, tail, tool) {
  const g = Game.ghosts.get(id);
  if (!g) return null;
  /* The channel carries work poses and nothing else, and that is enforced at
     *both* ends: the sender refuses to put anything else on it, and this refuses
     to play anything else, so a peer cannot use it to force this client's ghost
     of them into a pose the world has no business showing (a death, a spell's
     gather - both of which have their own packets and their own rules). An
     unknown name never reaches the model at all. */
  if (pose && !isWorkPose(pose)) return g;
  if (!pose) {
    /* the work is over: only a *looping* pose is dropped here, because only a
       looping pose is the sender's to keep alive. A one-shot (a cooking reach, a
       gem cut) is a swing the model has latched, and cutting it short would snap
       the ghost out of the middle of it. */
    if (g.castLoop) {
      g.castLoop = false;
      g.castTail = false;
      g.castClamp = false;
      g.castAnim = null;
      g.castLeft = 0;
      g.castTool = null;
    }
    return g;
  }
  if (g.castAnim === pose && g.castLeft > 0) {
    if (loop) g.castLeft = Math.max(g.castLeft, GHOST_WORK_HOLD);
    g.castTool = tool || null;
    return g;
  }
  playCastAnim(g, pose, loop ? GHOST_WORK_HOLD : undefined, loop, tool || null, tail);
  return g;
}

/* ------------------------------------------------------- another player's creatures

   Every client simulates the creatures on its own - the world server owns no
   creature state - and left alone, two clients' copies of one spawn drift apart:
   each runs its own creature AI off Math.random, and a wanderer may stray its
   whole radius (up to nine tiles) from home. Two players standing side by side
   were therefore looking at two different cows, and a player watching a
   neighbour's fight saw the hitsplats land on a body that was not the one being
   fought, a health bar that never moved, and no death at all.

   What both clients *do* share is the spawn table (src/world.js) - the same
   seeded world, built in the same order - so a creature's index in it names the
   same body everywhere. Every creature carries that index as `npc.spawnIx`
   (src/game.js#spawnNpcs), and a fight packet names it, which is how a blow is
   anchored on the right creature (see `ghostCombat` below).

   The bodies themselves are kept together by a **census**: once a tick,
   `creatureStateBatch` builds the list of creatures this player can see - where
   each one is, how hurt it is, whether it is the one being fought - and
   src/net.js#netNpcStates relays it to the neighbours. `applyNpcsStates` reads
   the other end's and puts this client's copies where they are said to be.

   **Whose copy is believed.** Not everyone's at once, or two idle players would
   each spend their time walking their creatures to the other's idea of where
   they are. A player who is *fighting* a creature speaks for it - that is what
   the `engaged` flag means, and it is why a neighbour's fight is followed to the
   letter. Between two clients that both merely see a creature, the lower
   connection id wins, and a client that is the lowest id in earshot simply keeps
   its own copy and ignores everyone. Every client computes the same answer from
   what is already on the wire, so the server does not arbitrate and no client
   can be wrong about who is right. A creature nobody has spoken for in
   NPC_FRESH_TICKS ticks goes back to living its own life (see `updateNpcs`).

   **The fight packets are still separate** (see `ghostCombat` just below): this
   one says where the bodies are and how hurt they are, and that one says what
   just happened - a swing, a splat - because a splat is an event with no state
   to carry. */

/* This client's own creature standing for a reported spawn index, or null when
   the index names nothing here. A scan rather than `Game.npcs[ix]`: that array
   is the spawn list only until the first archetype preview pushes onto it
   (src/game.js#spawnArchetypeNpc), and any splice after that would shift an
   index a packet had already been posted with. */
export function creatureBySpawnIx(ix) {
  if (!(ix >= 0) || ix === 0xffff) return null;
  for (const npc of Game.npcs) {
    if (npc && npc.spawnIx === ix) return npc;
  }
  return null;
}

/* How long a creature may be reported dead before it is allowed back: the real
   game's own spawn timer range, but drawn from the creature's *index* rather
   than from Math.random. Both clients used to roll their own timer, so a
   creature killed by one player came back up to thirty seconds apart on the two
   screens; a number that depends only on which creature it is comes out the same
   everywhere, so the two clients raise it together (see src/combat.js#killNpc
   and #applyRemoteDeath below). */
export function respawnTicksFor(spawnIx) {
  let h = Math.imul(((spawnIx | 0) ^ 0x9e3779b9) >>> 0, 2654435761) >>> 0;
  /* The xorshift has to be read back as *unsigned*: `h ^= h >>> 15` writes a
     signed 32-bit result, so a spawn index whose hash lands above 0x7fffffff
     (half of them) came out of the return below as a *negative* number of
     ticks. Every caller compares `npc.respawn >= respawnTicks * TICK_S`, which
     a negative bound satisfies on the creature's very first frame of being
     dead - so a rat killed by one player was back on its feet instantly in
     full health on both screens, which is the "rats are immortal, it
     regenerates for the other player" report (the killer sees it vanish and
     reappear at its home tile, everyone else sees it simply heal; the
     Lumbridge Guide, whose own index hashes negative too, "respawns
     instantly"). Both clients run this same function, so making it positive
     also makes them agree on *when* the creature returns. */
  h = (h ^ (h >>> 15)) >>> 0;
  return 17 + (h % 30);
}

/* A creature's health as the one byte the wire has room for: a percentage that
   never reads as zero while the creature is alive, because an empty bar over a
   live body would be a lie (the drawing code makes the same promise the other
   way round - see src/fx.js#renderBars). */
function hpPercent(npc) {
  const max = (npc.stats && npc.stats.hp) || 1;
  if (npc.dead) return 0;
  return Math.max(1, Math.min(100, Math.ceil((npc.hp / max) * 100)));
}

/* How far from the player a creature has to be to be worth reporting. A census
   is about the bodies a player can see; anything further away is behind a hill,
   in the next chunk, or both, and is nobody's business here. */
const CENSUS_TILES = 14;

/* How long after the last census a creature keeps being drawn where its
   reporter says it is, in game ticks, before it goes back to living its own
   life. Four ticks is a little under two and a half seconds - long enough that
   a dropped or rate-limited packet changes nothing, short enough that a
   creature whose reporter has walked away is free again almost at once. */
const NPC_FRESH_TICKS = 4;

/* The creatures to tell the neighbours about (src/net.js#netNpcStates). The
   player's own fight comes first and is never dropped by the cap - it is the one
   body whose position and health everybody else has to agree with - and the rest
   of the batch is the nearest few around them, so that two players standing in
   the same place are looking at the same animals as well as the same fight.

   Creatures with no wander radius (a vendor, a banker, a Barrows brother) are
   planted on the same tile by both clients and cannot drift, so only a fight
   makes one worth mentioning - but then it *is* worth mentioning, because its
   health and its death are as shared as anybody's. A corpse is carried for the
   second and a half after it falls, which is how the other clients learn it
   died at all; after that it is a body on the ground and there is nothing left
   to say about it. */
export function creatureStateBatch() {
  const pl = Game.player;
  if (!pl || !Game.ghosts || Game.ghosts.size === 0) return null;
  const engaged = [];
  const near = [];
  for (const npc of Game.npcs) {
    if (!npc || npc.archetypePreview) continue;
    if (!(npc.spawnIx >= 0) || npc.spawnIx === 0xffff) continue;
    const eng = npc.target === pl || npc.playerHitTicks > 0;
    if (npc.dead && (npc.respawn || 0) > 1.5) continue;
    if (!npc.wander && !eng) continue;
    if (eng) { engaged.push(npc); continue; }
    if (!npc.dead && Math.hypot(npc.x - pl.x, npc.z - pl.z) <= CENSUS_TILES) near.push(npc);
  }
  if (!engaged.length && !near.length) return null;
  if (near.length > 1) near.sort((a, b) =>
    Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z));
  const pick = engaged.concat(near).slice(0, 8);
  return pick.map((npc) => ({
    ix: npc.spawnIx,
    x: Math.floor(npc.x),
    z: Math.floor(npc.z),
    hp: hpPercent(npc),
    engaged: npc.target === pl || npc.playerHitTicks > 0,
    dead: !!npc.dead,
    /* The one thing the census carries that is neither a place nor a wound: a
       shorn sheep. The fleece is shared world state like a felled tree - walk
       into the field after somebody has been at it and the sheep are shorn -
       and it rides this packet rather than the world ledger because the record
       would have to name a *creature*, and a creature is a body that moves. */
    sheared: !!npc.sheared,
  }));
}

/* A creature has been killed somewhere else (see src/net.js#S_NPC and
   src/combat.js#killNpc). It is the same death this client would have run - the
   body falls on the same sequence and the spawn timer is now the creature's own
   number - with the two things that are the *killer's* left out: the drops on
   the ground and the experience for the damage. Those belong to the player who
   did the killing; the rest of the world only has to watch it happen. */
function applyRemoteDeath(npc) {
  if (npc.dead) return false;
  npc.dead = true;
  npc.hp = 0;
  if (npc.ch && npc.ch.group && !npc.ch.isModel) npc.ch.group.visible = false;
  npc.corpse = true;
  npc.respawn = 0;
  npc.respawnTicks = respawnTicksFor(npc.spawnIx);
  npc.target = null;
  npc.aggroed = null;
  npc.path.length = 0;
  npc.moving = false;
  npc.rphase = 0;
  npc.netTicks = 0;
  return true;
}

/* Whether a source outranks another for the right to say where a creature is:
   the one fighting it first, then the lower connection id. Written as a tuple
   comparison because that is what it is - both clients evaluate it and agree. */
function rankLess(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0];
  return a[1] < b[1];
}

/* The neighbours' creatures (src/net.js#S_NPC): put this client's copies where
   the clients that speak for them say they are, and give them the health those
   clients report.

   What is adopted:
     * a **death** from a player who was fighting it, always - it is a fact, and
       this client's copy has to fall too;
     * **health** from a fighting player, but only downwards. Damage is the one
       thing that only ever goes one way, so a slower client's stale figure
       cannot undo a blow; two players fighting the same creature therefore see
       it lose the health either of them took off it;
     * **position** only when this client is not the one fighting it. A player's
       own fight is theirs: their creature must not be dragged around by
       somebody else's copy of it mid-swing, and their own movement is what
       everybody else is being told to follow anyway.
   Everything else about the creature - its AI, its aggro, its drops - stays
   exactly where it was. Only where it is drawn and how hurt it looks travel. */
export function applyNpcStates(senderId, list, myId) {
  if (!list || !list.length) return 0;
  let n = 0;
  for (const e of list) {
    let npc = creatureBySpawnIx(e.ix);
    /* A neighbour's river troll this client never spawned (the wave rose for
       them, not for us): mirror the body so both screens show the same fight
       (multiplayer sync, user ask 2026-10-27). The tier rides in the index
       band (see riverTrollIx); a dead report with no local body is nothing to
       mirror. The mirror runs the ordinary local AI until a report arrives,
       and the position/health adoption below keeps it on the reporter's copy. */
    if (!npc && e.ix >= 40000 && e.ix < 44000 && !e.dead && Game.world && Game.view && Game.player) {
      const ocean = e.ix >= 42000;
      const ti = Math.max(0, Math.min(3, Math.floor(((ocean ? e.ix - 42000 : e.ix - 40000)) / 500)));
      try {
        npc = createNpc(Game.world, Game.view, {
          type: (ocean ? OCEAN_TROLL_TYPES : RIVER_TROLL_TYPES)[ti],
          x: Math.max(0, e.x | 0),
          z: Math.max(0, e.z | 0),
          dir: 0,
          radius: 5,
          spawnIx: e.ix,
          noRespawn: true,
        });
        const max = (npc.stats && npc.stats.hp) || 1;
        npc.hp = Math.max(1, Math.min(max, Math.round((e.hp / 100) * max)));
        Game.npcs.push(npc);
        Game.entities.push(npc);
      } catch (err) { npc = null; }
    }
    if (!npc) continue;
    const localEng = npc.target === Game.player || npc.playerHitTicks > 0;
    /* A shorn sheep is shorn for everybody, and it is adopted from *whoever*
       reports it - even a client that loses the position rank, whose report is
       dropped a few lines down. "This sheep has been shorn" is a fact about the
       world rather than about where the body is standing, so it does not have to
       be arbitrated; the shear itself (the model swap and the fleece's own
       thirty-second clock) is done by src/actions.js's tick, which owns the
       sheep models. */
    if (e.sheared && !npc.sheared) npc.netSheared = true;
    if (e.engaged) {
      if (e.dead) { if (applyRemoteDeath(npc)) n++; continue; }
      const max = (npc.stats && npc.stats.hp) || 1;
      const hp = Math.max(1, Math.min(max, Math.round((e.hp / 100) * max)));
      if (hp < npc.hp) {
        npc.hp = hp;
        Fx.showBar(npc);
        if (npc.hp <= 0 && applyRemoteDeath(npc)) { n++; continue; }
        n++;
      }
    }
    if (localEng || npc.dead || !npc.ch) continue;
    const inc = [e.engaged ? 0 : 1, senderId];
    const mine = [1, myId];
    const owner = npc.netTicks > 0 && senderId === npc.netOwner;
    const cur = npc.netTicks > 0 ? [npc.netEngaged ? 0 : 1, npc.netOwner] : null;
    if (!owner && !(rankLess(inc, mine) && (!cur || rankLess(inc, cur)))) continue;
    npc.netOwner = senderId;
    npc.netEngaged = !!e.engaged;
    npc.netTicks = NPC_FRESH_TICKS;
    npc.netTx = e.x;
    npc.netTz = e.z;
    n++;
  }
  return n;
}

/* ------------------------------------------------------- another player's fight

   A fight packet says what just *happened* between a player and a creature -
   the swing they are in, or a splat - and names the creature by its spawn index,
   so the blow is anchored on exactly the body that was struck even when this
   client's copy of it is somewhere else (see the census note above, which is
   what brings the copy back into line).

   `kind` is the packet's own byte (src/net.js#S_COMBAT):
     0  a swing - `a` is an index into the shared sequence table, `b`/`c` the
        tile that was attacked (the fallback anchor when `ix` cannot resolve);
     1  a blow on a creature - `a` is the damage, `b`/`c` the tile it landed on;
     2  a blow on the sender themselves - `a` is the damage.

   `ix` is the struck creature's spawn index, or 0xffff when the sender cannot
   name one (an archetype preview). The two tile bytes stay as the fallback for
   a blow whose creature this client does not have at all.

   The swing is played through `playCastAnim`, which is the same one-shot pose
   machinery an emote and a spell use, and which works on any entity that has a
   skeleton - a ghost included. Its clock is ticked by `tickGhosts` below, so
   the pose drops on its own rather than freezing the ghost mid-swing. */
export function ghostCombat(id, kind, a, b, c, ix) {
  const g = Game.ghosts.get(id);
  if (!g) return null;
  if (kind === 0) {
    const name = combatAnimAt(a);
    if (b != null && c != null) {
      try { g.dir = Math.atan2((b + 0.5) - g.x, (c + 0.5) - g.z); } catch (err) {}
    }
    if (name) playCastAnim(g, name);
    return g;
  }
  if (kind === 1) {
    /* A dead copy is no anchor: the splat belongs over a body that is standing
       there (see `splatAnchorAt`, whose stand-in exists for exactly this case). */
    const found = creatureBySpawnIx(ix);
    const npc = found && !found.dead ? found : null;
    const at = npc || splatAnchorAt(b, c);
    Fx.hitsplat(at, a);
    at.hitFlash = 0.3;
    return g;
  }
  if (kind === 2) {
    Fx.hitsplat(g, a);
    g.hitFlash = 0.3;
    /* The blow's style rides in `b` (0 melee, 1 range, 2 magic - an older
       build sent 0 for everything) and the shield's answer in `c`: the
       hitsplat a magic blow lit the ring shields for, or 0. A lit shield
       flashes on the ghost exactly as on the victim's own screen
       (src/combat.js#npcStrikeHit), fed to the mesh by the same per-frame
       feed that carries the local player's. */
    if ((b | 0) === 2 && (c | 0) > 0) { g.shieldFlash = 0.3; g.shieldFlashDmg = c | 0; }
    /* The block, on the ghost that took it: a kind-2 packet is the victim's own
       client reporting a blow that landed on them (src/net.js#netCombat), so
       every watcher raises what the victim's own client raised -
       src/combat.js#maybeBlockPlayer, same guards (a pose already playing wins,
       the dead do not block). Until this, a watched fight showed the swing and
       the splat but the victim stood still through both. */
    if ((g.hp == null || g.hp > 0) && !(g.castLeft > 0)) {
      const wid = g.wornEq && g.wornEq.weapon ? g.wornEq.weapon.id : null;
      const w = wid ? ITEMS[wid] : null;
      const has = (n) => !!(g.ch && g.ch.data && g.ch.data._anims && g.ch.data._anims[n]);
      if (a > 0) {
        const h = blockAnimFor(w);
        if (has(h)) playCastAnim(g, h);
        else if (has("defend")) playCastAnim(g, "defend");
      } else if (has("defend")) playCastAnim(g, "defend");
    }
    try {
      /* The swing goes on the attacker the packet names - every build since
         the cast wire sends it - and only a melee blow swings at all: a cast
         already played its pose on kind 3, so swinging here would punch for a
         spell. An older build's packet names nobody, and then a melee blow
         falls back to the nearest body, exactly as before. */
      let attacker = ix != null && ix !== 0xffff ? creatureBySpawnIx(ix) : null;
      if ((!attacker || attacker.dead) && (b | 0) === 0) {
        let best = null;
        let bestD = 9;
        for (const npc of Game.npcs) {
          if (!npc || npc.dead || !npc.ch) continue;
          const dx = npc.x - g.x;
          const dz = npc.z - g.z;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = npc; }
        }
        attacker = best;
      }
      if ((b | 0) === 0 && attacker && !attacker.dead) {
        attacker.dir = Math.atan2(g.x - attacker.x, g.z - attacker.z);
        attacker.attackAnim = 1;
        attacker.swingId = (attacker.swingId || 0) + 1;
      }
    } catch (err) {}
    return g;
  }
  return null;
}

/* How far from a reported blow this client will look for one of its own
   creatures to put the number over, when the blow carried no spawn index this
   client could resolve. A fallback only: a named blow is anchored exactly. */
const SPLAT_ANCHOR_TILES = 3;

/* The body a reported blow lands on: the nearest of this client's own living
   creatures to the tile, or, when none is close enough, an invisible stand-in
   pinned to the tile itself so the number still shows. The stand-in carries
   only what the hitsplat pass reads - a visible model group, the ground height
   under it, and a body height of one tile - because it is never drawn as a
   body, only as the anchor for the number (see src/fx.js#renderSplats). */
function splatAnchorAt(tx, tz) {
  const x = tx + 0.5, z = tz + 0.5;
  let best = null;
  let bestD = SPLAT_ANCHOR_TILES * SPLAT_ANCHOR_TILES;
  for (const npc of Game.npcs) {
    if (!npc || npc.dead || !npc.ch) continue;
    const dx = npc.x - x, dz = npc.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = npc; }
  }
  if (best) return best;
  let y = 0;
  try { y = Game.world.heightAt(x, z); } catch (err) { y = 0; }
  return {
    kind: "splat", x, z, rx: x, rz: z,
    ch: { height: 1, group: { visible: true, position: { y } } },
  };
}

/* The item id of the weapon the player is holding, or null for empty hands. */
export function playerWeaponId() {  const ps = Game.ps;
  const s = ps && ps.equip ? ps.equip.weapon : null;
  return s ? s.id : null;
}

/* Everything the player is wearing, in the client's own equipment order (the
   order `equipment[]` is merged in Player.getAnimatedModel: head, cape, amulet,
   weapon, body, shield, legs, hands, feet, ring), so a later slot's model is
   drawn over an earlier one. Items with no baked worn model are dropped by
   setWorn, so a cape or ring simply does not show. */
export function playerWornKeys() {
  const ps = Game.ps;
  return wornKeysFor(ps && ps.equip, emoteAnimOf(Game.player), Game.player && Game.player.castTool);
}

/* The three worn-model helpers take an *equipment object* rather than reading
   the local player, because another player's ghost wears the kit its own client
   sent over the socket (src/net.js) - the rules (which parts armour hides, which
   slots cover the body) have to be the same for a ghost as for the player, or
   two people would see each other wearing different things.

   `poseTool` is the third thing a pose can put in the hand: the tool the player
   is working with right now - the axe a tree is being chopped with, the pickaxe
   a rock is being mined with (`Game.player.castTool`, set by the activity while
   its pose is up - see src/actions.js#tickActions). It is drawn **in place of**
   the weapon for as long as the pose lasts, and nothing is unequipped: the
   weapon slot still holds exactly what it held, and its model is back the moment
   the working stops, because the caller passes the current tool and nothing is
   cached. That is the whole point of it - the client cuts a tree with the axe it
   is using, and in this world that axe may be sitting in the pack while a whip
   is worn. */
export function wornKeysFor(eq, emoteAnim, poseTool) {
  if (!eq) return [];
  const out = [];
  /* A cape of accomplishment's own pose is authored **with empty hands**: its
     graphic supplies the prop (the wand, the bow, the anvil, the conjured
     shield), so while one plays the weapon and the shield are left out of the
     merged body model. Nothing is unequipped - the slots still hold what they
     held, and the two models come back the instant the pose ends, because the
     caller passes the entity's *current* emote (src/game.js#playerWornKeys, and
     the ghost half of #updateVisuals) and a null one restores them
     (src/emotes.js#isSkillcapeEmoteAnim). `KIT_SLOTS`, not `EQUIP_SLOTS`:
     ammunition sits in a slot of its own but has no worn model, so it is not
     part of what the body wears. */
  const emptyHands = isSkillcapeEmoteAnim(emoteAnim);
  /* A cape pose that holds a prop says so in its own sequence (`weapon`/
     `shield`, see src/emotes.js#SKILLCAPE_EMOTES and the bake's header): the
     client writes those item ids into its equipment array, so the prop is drawn
     in the hand *instead of* whatever is equipped there. A pose that names
     nothing (`sc` null, or a null field) keeps the old rule - the slot's model
     is simply left out. */
  const sc = skillcapeEmoteForAnim(emoteAnim);
  for (const slot of KIT_SLOTS) {
    if (emptyHands && (slot === "weapon" || slot === "shield")) {
      const prop = sc && (slot === "weapon" ? sc.weapon : sc.shield);
      if (prop) out.push(prop);
      continue;
    }
    /* The tool the working pose is being performed with, in the weapon slot.
       An item with no baked worn model cannot be drawn, so it does not replace
       anything: the fishing tools are the ones this is for - a net or a rod
       would otherwise take the weapon out of the hand and put nothing there. */
    if (slot === "weapon" && poseTool && hasHeldModel(poseTool)) { out.push(poseTool); continue; }
    const s = eq[slot];
    if (s && s.id) out.push(s.id);
  }
  return out;
}

/* The item keys the character *holds* rather than wears: whatever ends up on
   the weapon and the shield, including the prop a cape-of-accomplishment pose
   holds in place of the equipped item (src/emotes.js#SKILLCAPE_EMOTES). Those
   two models are held in front of the body, not worn over it, so they are the
   ones the renderer must not give the garment depth bias
   (src/models3d.js#COVER_Z_BIAS). Same rule as `wornKeysFor`'s, so the two
   always agree about which item is in the hand - including the tool a work pose
   is being performed with (`poseTool`), which is held in the weapon slot's
   place. */
export function heldKeysFor(eq, emoteAnim, poseTool) {
  const out = [];
  if (!eq) return out;
  const emptyHands = isSkillcapeEmoteAnim(emoteAnim);
  const sc = skillcapeEmoteForAnim(emoteAnim);
  for (const slot of ["weapon", "shield"]) {
    if (emptyHands) {
      const prop = sc && (slot === "weapon" ? sc.weapon : sc.shield);
      if (prop) out.push(prop);
      continue;
    }
    if (slot === "weapon" && poseTool && hasHeldModel(poseTool)) { out.push(poseTool); continue; }
    const s = eq[slot];
    if (s && s.id) out.push(s.id);
  }
  return out;
}

/* The identity-kit body parts the equipped armour *replaces* - the body/gloves/
   legs/boots pieces (see items.js#EQUIP_BODY_PART). Handed to setWorn so the
   parts the armour is authored over are not drawn underneath it. */
export function playerHiddenParts() {
  const ps = Game.ps;
  return hiddenPartsFor(ps && ps.equip);
}

export function hiddenPartsFor(eq) {
  if (!eq) return null;
  const out = [];
  for (const slot of EQUIP_SLOTS) {
    const part = EQUIP_BODY_PART[slot];
    if (part == null || out.includes(part)) continue;
    const s = eq[slot];
    if (s && s.id) out.push(part);
  }
  return out.length ? out : null;
}

/* The equipment slots whose item is *worn on* the body, so its worn model may
   sit so close to the kit underneath that the two surfaces have to be
   separated by hand (see models3d.js#coveredBodyFaces). A weapon or a shield is
   held in front of the body rather than over it, and a cape/amulet/ring covers
   nothing, so none of them take part. */
const COVER_SLOTS = ["head", "body", "legs", "hands", "feet"];

/* The slots whose item the client paints over *everything* it covers - a rank
   above the armour that the renderer's single garment step settles against the
   body (see models3d.js's "The garment ladder"). Only capes: an amulet's or a
   ring's model is small and sits in its own place in front of the body, and
   the armour parts have nothing above them but the cape. */
const DRAPE_SLOTS = ["cape"];

/* The slots whose item hangs over everything beneath it - the neck slot, whose
   amulet the client paints over the chest and over a cape (see
   models3d.js#TOP_LEVEL). Only the amulet has a worn model here; a ring carries
   none and is dropped by setWorn either way. */
const TOP_SLOTS = ["amulet"];

/* Everything setWorn needs to know about the player's equipment: which kit
   parts the armour replaces, which item is on the head - a closed helm's worn
   model carries its own face, so the renderer drops the kit's head and beard
   under it (see models3d.js#itemSuppliesHead / #headEnclosure) - which item is
   on the body, whose worn model may carry a second model that takes the arms
   slot too (models3d.js#setWorn), and which worn models are allowed to cover
   the body. */
export function playerWornOpts() {
  const ps = Game.ps;
  return wornOptsFor(ps && ps.equip, emoteAnimOf(Game.player), Game.player && Game.player.castTool);
}

export function wornOptsFor(eq, emoteAnim, poseTool) {
  const head = eq && eq.head;
  const body = eq && eq.body;
  const coverKeys = [];
  if (eq) for (const slot of COVER_SLOTS) {
    const s = eq[slot];
    if (s && s.id) coverKeys.push(s.id);
  }
  /* Which of those keys the client paints in a rank of their own (see
     DRAPE_SLOTS above and models3d.js's "The garment ladder"). */
  const drapeKeys = [];
  if (eq) for (const slot of DRAPE_SLOTS) {
    const s = eq[slot];
    if (s && s.id) drapeKeys.push(s.id);
  }
  /* The neck-slot item, painted over chest and cape alike (see TOP_SLOTS). */
  const topKeys = [];
  if (eq) for (const slot of TOP_SLOTS) {
    const s = eq[slot];
    if (s && s.id) topKeys.push(s.id);
  }
  /* The body and leg-slot items a cape hangs over: the renderer drops the worn
     faces the cape covers, so every top and every bottom is clipped by capes
     rather than poking through them (see models3d.js#setWorn). */
  const capeUnderKeys = [];
  if (eq) for (const slot of ["body", "legs"]) {
    const s = eq[slot];
    if (s && s.id) capeUnderKeys.push(s.id);
  }
  return {
    hideParts: hiddenPartsFor(eq),
    headKey: head && head.id ? head.id : null,
    bodyKey: body && body.id ? body.id : null,
    coverKeys,
    drapeKeys,
    topKeys,
    capeUnderKeys,
    /* The two *held* slots (see heldKeysFor above) - the worn models the
       renderer leaves out of the garment depth bias. Always present, so
       setWorn can tell "nothing is held" from "the caller did not say". */
    heldKeys: heldKeysFor(eq, emoteAnim, poseTool),
  };
}

/* Which baked character model the player renders with. A skin name is either a
   PLAYER_SPRITES alias ("male"/"female") or the key of any baked model, so the
   player can wear an NPC's skin ("banker", "guard", "goblin", ...). Unknown
   names resolve to null. */
function resolvePlayerModel(name) {
  /* A designed body is a *key* the identity-kit system builds and registers
     (src/identikits.js#buildKitBody): "kit:m:0.10.18.26.33.36.42:0.0.0.0.0" and
     the like. Building is idempotent and cached by the key, so this can be
     called every frame; a name that is not a kit key simply falls through to the
     baked skins below. */
  if (isKitKey(name)) return buildKitBody(name) || null;
  if (PLAYER_SPRITES[name]) return PLAYER_SPRITES[name];
  const keys = modelKeys();
  return keys && keys.includes(name) ? name : null;
}

export function playerModelKey(name) {
  return resolvePlayerModel(name == null ? Game.playerAppearance : name)
    || resolvePlayerModel(Game.playerAppearance)
    || PLAYER_SPRITES.male;
}

/* The player uses a real character render, falling back to the blocky stand-in
   if the sprite files aren't available. */
export function makePlayerCharacter(key) {
  const modelKey = key ? (resolvePlayerModel(key) || PLAYER_SPRITES.male) : playerModelKey();
  const mc = makeModelCharacter(modelKey);
  if (mc) {
    mc.group.add(makeShadow(Math.min(2.6, Math.max(0.55, Math.max(mc.data.width || 1, mc.data.depth || 1) * 0.9))));
    return mc;
  }
  const tex = npcTexture(modelKey);
  if (tex) return makeSpriteBillboard(tex, npcSpriteHeight(modelKey), npcSpriteAspect(modelKey));
  return makeCharacter({ shirt: 0x3f6fa5, pants: 0x4a4a52, hair: 0x4b3220 });
}

/* Wear a different skin, live. Swaps the player's model in place - position,
   direction, path and the held weapon all carry over - and remembers the name
   so a save/load keeps it. Returns the model key it settled on, or null if the
   name matches nothing baked. */
export function setPlayerAppearance(name) {
  const modelKey = resolvePlayerModel(name);
  if (!modelKey) return null;
  Game.playerAppearance = name;
  const e = Game.player;
  if (!e || !e.ch) return modelKey;
  const ch = makePlayerCharacter(modelKey);
  if (!ch) return null;
  const old = e.ch;
  if (old.group && old.group.parent) old.group.parent.remove(old.group);
  if (old.dispose) old.dispose();
  e.ch = ch;
  Game.view.scene.add(ch.group);
  /* A fresh body forgets the shield it was already wearing - seed it, so a
     skin change does not replay the equip pulse (src/models3d.js#setWorn). */
  if (Game.ps && Game.ps.equip && Game.ps.equip.shield) ch._wornRingKey = Game.ps.equip.shield.id;
  if (ch.setWorn) ch.setWorn(playerWornKeys(), playerWornOpts());
  updateEntityTransform(Game.view, e);
  return modelKey;
}

/* Swap an NPC's model in place - the same in-place skin change the player's own
   setPlayerAppearance does, and for the same reason: the entity's position,
   direction, path, hitpoints and timers all carry over and only the mesh under
   it changes. What needs it in the live game is a sheep's fleece: shearing
   draws the shorn model (src/actions.js#shearSheep) and the woolly one comes
   back when the fleece regrows. Returns the key it settled on, or null when the
   creature was not drawn from a baked model or nothing is baked under that
   name (in which case the caller should leave the sheep as it is rather than
   take the fleece it cannot show). */
export function setNpcModel(npc, key) {
  if (!npc || !npc.ch || !npc.ch.isModel || !modelData.has(key)) return null;
  const mc = makeModelCharacter(key);
  if (!mc) return null;
  const size = Math.max(mc.data.width || 1, mc.data.depth || 1);
  mc.group.add(makeShadow(Math.min(2.6, Math.max(0.55, size * 0.9))));
  /* An archetype body carries its garments as a worn-model merge - the swap
     builds a bare body, so put the outfit back on it before it is shown. */
  if (npc.wornEq && mc.setWorn) {
    mc.setWorn(wornKeysFor(npc.wornEq, null), wornOptsFor(npc.wornEq, null));
    mc.wornEq = npc.wornEq;
  }
  const old = npc.ch;
  if (old.group && old.group.parent) old.group.parent.remove(old.group);
  disposePickProxies(old);
  if (old.dispose) old.dispose();
  npc.ch = mc;
  tagPick(mc, npc);
  Game.view.scene.add(mc.group);
  updateEntityTransform(Game.view, npc);
  return key;
}

/* ---------------------------------------------------------------- art repair

   The character half of "the art landed late" (the scenery half is
   src/scene.js#attachLocAtlas and the chunk rebuild beside it). main.js boots
   the world against an 8 s guard rather than waiting for megabytes of baked
   cache data, so on a slow connection every body in the world is built before
   the art for it exists - and a body built with no `src/models/index.json` is
   the **blocky stand-in** (src/entities.js#makeCharacter), an NPC with no model
   is a sprite billboard, and nothing in the frame loop ever revisits that
   decision. The world rebuild that fixes the scenery touches meshes and tiles;
   a character is neither.

   That is the user's report of 2026-09-24, and it is exactly what a
   photograph of it shows: "the wrong sprites, that we had at the very very very
   beginning of development", with the real cache models sitting on disk the
   whole time. The reason the ground and the scenery in that photograph are
   correct while the bodies are not is that the ground and scenery were repaired
   on arrival and this was not.

   So: rebuild every body that is still standing in for the real art, in place,
   through the same builders that made it. A body is rebuilt, never moved - the
   entity keeps its tile, direction, path,
   hitpoints, target and animation clocks, and only the mesh under it changes,
   which is what setPlayerAppearance and setNpcModel already do one body at a
   time. The per-frame pass re-applies every worn merge (updateVisuals'
   `setWorn`), so nothing here has to put the armour back on; the *held* models
   come back with it, because `wornKeysFor` drops a model the bake does not
   carry yet and therefore really does change its answer the moment that bake
   lands. */
export function refreshCharacterModels() {
  if (!modelsReady() || !Game.view) return false;
  for (const e of Game.entities || []) {
    if (!e || !e.ch) continue;
    if (e.kind === "player") {
      /* The player is rebuilt whatever it is showing: its body is a merge of
         the identity-kit bake (src/identikits.js), and a body built before that
         bake landed is a *model* - the plain male one - rather than a
         stand-in, so `isModel` cannot tell the difference here. It is one body. */
      const ch = makePlayerCharacter();
      if (!ch) continue;
      swapBody(e, ch);
      if (ch.setWorn) ch.setWorn(playerWornKeys(), playerWornOpts());
    } else if (e.kind === "npc" && !e.ch.isModel) {
      /* A creature already drawn from a baked model has nothing to gain and
         something to lose: rebuilding a **corpse** would replay its fall from
         the first frame (the death clock lives on the mesh), so the repair only
         touches a body that is still a stand-in - the sprite billboard or the
         blocky box - which is exactly the set that is wrong. */
      const ch = npcRenderFor(e);
      if (ch) swapBody(e, ch);
    } else if (e.kind === "ghost" && !e.ch.isModel) {
      /* A ghost's body is rebuilt from the kit its own client last sent, and
         only when that kit changes (buildGhostModel) - so a ghost drawn before
         the bakes landed would keep its stand-in until its owner changed their
         equipment. Rebuilding it is the same call its own kit change makes. */
      buildGhostModel(e);
      if (e.ch) updateEntityTransform(Game.view, e);
    }
  }
  return true;
}

/* The render a creature was spawned with, rebuilt from what the spawn carried
   (`lookIdx` is the variant counter createNpc drew it with) - the archetype
   first, exactly as createNpc asks. */
function npcRenderFor(npc) {
  const arch = npc.archetype ? archetypeByKey(npc.archetype) : null;
  return (arch && makeArchetypeRender(arch))
    || makeCharacterRender(npc.type, npc.lookIdx || 1, npc.look, npc.stats.size);
}

function tagPick(ch, e) {
  if (!ch || !e) return;
  if (ch.mesh) ch.mesh.userData._ent = e;
  if (ch.plane) ch.plane.userData._ent = e;
  ensureNpcPickProxies(ch, e);
}

const _pickProxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false, colorWrite: false, side: THREE.DoubleSide });

function livePickBox(ch) {
  const g = ch && ch.mesh && ch.mesh.geometry;
  if (!g) return null;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  if (!bb) return null;
  return [bb.min.x, bb.max.x, bb.min.y, bb.max.y, bb.min.z, bb.max.z];
}

function disposePickProxies(ch) {
  if (!ch || !ch.pickProxies) return;
  for (const p of ch.pickProxies) {
    if (p.parent) p.parent.remove(p);
    if (p.geometry) p.geometry.dispose();
  }
  ch.pickProxies = null;
  ch.pickDisc = null;
}

function ensureNpcPickProxies(ch, e) {
  disposePickProxies(ch);
  if (!ch || !ch.group || !e || e.kind !== "npc" || (e.foot || 1) > 1) return;
  if (!ch.mesh && !ch.plane) return;
  const b = livePickBox(ch) || clickBoxOf(ch);
  const shR = b
    ? Math.max(Math.max((b[1] - b[0]) / 2, (b[5] - b[4]) / 2) * 1.3, 0.32)
    : Math.max((ch.width || 0.7) * 0.45, 0.32);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(shR, 0.05), 10), _pickProxyMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  disc.userData._ent = e;
  ch.group.add(disc);
  ch.pickDisc = disc;
  ch.pickProxies = [disc];
}

/* Put a freshly built body on an entity in place of the one it has: the mesh is
   swapped, the entity is not. Shared by refreshCharacterModels' three kinds,
   because the rule is the same for all of them - the old render leaves the
   scene, the new one is placed at the entity's own drawn position and the frame
   loop takes it from there. */
function swapBody(e, ch) {
  const old = e.ch;
  if (old && old.group && old.group.parent) old.group.parent.remove(old.group);
  disposePickProxies(old);
  if (old && old.dispose) old.dispose();
  e.ch = ch;
  tagPick(ch, e);
  ch.group.visible = true;
  Game.view.scene.add(ch.group);
  updateEntityTransform(Game.view, e);
  /* An archetype body wears its outfit as a worn-model merge, which a bare
     rebuild drops - the same restore setNpcModel makes on its own swap. */
  if (ch.setWorn && e.wornEq) {
    ch.setWorn(wornKeysFor(e.wornEq, null), wornOptsFor(e.wornEq, null));
    ch.wornEq = e.wornEq;
  }
}

/* ------------------------------------------------------------- other players

   A "ghost" is another player: an entity with a real character model (their own
   identity kit *and* their worn armour, rebuilt from the equipment list their
   client sends - src/net.js), a name and its spoken lines drawn over its head
   (src/fx.js#renderLabels, src/game.js#ghostSay) and no simulation at all. It is
   not in `Game.npcs`, so nothing in the sim
   touches it: no targeting, no wander, no collision.

   **Positioning is smoothed here rather than by the renderer's own
   interpolation.** The client's normal trick - keep the previous tile in
   `px/pz` and let `renderPos` slide to `x/z` over the tick - needs the two ends
   of the step to line up with the tick clock, which for a remote player they do
   not: their packets are published on *their* tick and relayed a network hop
   later, so replaying each step over my tick would stall and snap at every
   packet boundary. Instead the drawn position walks toward the last tile it was
   told about at the sender's own walk/run speed (see below), arriving as the
   next packet lands. `px/pz` are pinned to the drawn position every
   frame, so the renderer's interpolation is a no-op for a ghost. */
/* Ghosts glide at exactly the sender's own speeds (1 tile a walk tick, 2 a run
   tick): the state packet lands every tick, so a ghost walking at the true
   speed arrives as the next packet lands - a steady glide with one packet's
   worth of lag. True teleports still snap (see below). */
const GHOST_WALK_SPEED = 1 / TICK_S;
const GHOST_RUN_SPEED = 2 / TICK_S;
/* A jump further than this is not a step: it is a teleport (a spell, a load),
   and sliding across the map after it would look like a ghost sprinting through
   walls. Snap instead. */
const GHOST_SNAP_TILES = 10;

/* The kit list a ghost was told about, as an equipment object the worn-model
   helpers can read: the slots are in the client's own equipment order
   (src/items.js#EQUIP_SLOTS), so an empty entry means "nothing in that slot". */
function ghostEquip(slotKeys) {
  if (!slotKeys || !slotKeys.length) return {};
  const eq = {};
  for (let i = 0; i < KIT_SLOTS.length; i++) {
    const id = slotKeys[i];
    if (id) eq[KIT_SLOTS[i]] = { id, qty: 1 };
  }
  return eq;
}

function disposeGhostModel(g) {
  const ch = g.ch;
  if (!ch) return;
  if (ch.group && ch.group.parent) ch.group.parent.remove(ch.group);
  if (ch.dispose) ch.dispose();
  g.ch = null;
}

/* Build (or rebuild) the ghost's character: identity kit first, then the worn
   models over it, exactly the order the local player's own body is assembled
   in (src/game.js#makePlayerCharacter / #setPlayerAppearance). */
function buildGhostModel(g) {
  disposeGhostModel(g);
  const oldShield = g.wornEq && g.wornEq.shield ? g.wornEq.shield.id : null;
  const ch = makePlayerCharacter(g.appearance);
  if (!ch) return;
  const eq = ghostEquip(g.slotKeys);
  /* Kept on the ghost so the per-frame sync (#updateVisuals) can re-ask for the
     worn keys without rebuilding the equipment object every frame - it needs
     that call to take a **skillcape pose**'s weapon and shield out of the model
     and put them back (src/game.js#wornKeysFor). */
  g.wornEq = eq;
  /* A kit change elsewhere rebuilds the whole character (see the kitSig sync
     below): seed the new body's shield memory with the old slot's content, so
     a carried-over shield stays quiet and only a newly-equipped one pulses
     (src/models3d.js#setWorn). */
  if (oldShield) ch._wornRingKey = oldShield;
  if (ch.setWorn) ch.setWorn(wornKeysFor(eq, emoteAnimOf(g)), wornOptsFor(eq, emoteAnimOf(g)));
  g.ch = ch;
  tagPick(ch, g);
  Game.view.scene.add(ch.group);
  if (ch.group) ch.group.visible = true;
}

function ghostKitSig(appearance, slotKeys) {
  return (appearance || "male") + "|" + (slotKeys || []).join(",");
}

/* Add a ghost. `opts` carries the tile it was last seen on and whatever the
   join packet said (`name`, `appearance`, `slotKeys`); `pointAt` places it
   exactly where the peer is rather than at the nearest free tile, because a
   ghost has to stand where its player really is, even if that is inside a
   creature. */
export function addGhost(id, opts = {}) {
  const g = {
    kind: "ghost",
    id,
    name: opts.name || "Player",
    appearance: opts.appearance || "male",
    slotKeys: opts.slotKeys || null,
    kitSig: null,
    ch: null,
    x: 0, z: 0, px: 0, pz: 0, tx: 0, tz: 0,
    /* The level the peer is standing on (see world.js#UP_Y): the renderer
       stands the body up from it, and the picker only offers same-level
       bodies, so an upstairs peer reads upstairs. */
    plane: opts.plane || 0,
    dir: opts.dir || 0,
    moving: false,
    /* The gait the peer says it is travelling at, straight off the state
       packet's "running" bit. It is the ghost's half of the runner's own
       `player.gaitRun` (see `updateVisuals`, which hands the *model* one
       `running` flag for both kinds of body), and without it every other player
       ran at walk speed with the walk cycle playing underneath - the body
       arrived at the right place at the right time and looked like it was
       strolling there. */
    gaitRun: !!opts.running,
    /* The sender's own moving flag, straight off the state packet, plus when
       it was last heard. tickGhosts holds the walk animation through the
       micro-waits between packets while this says they are still going, so a
       ghost never flickers to stand mid-stride (see GHOST_MOVE_HOLD_MS). */
    remoteMoving: !!opts.moving,
    lastStateAt: 0,
    senderDir: opts.dir || 0,
    /* What the peer's own client worked out as their combat level, from the kit
       packet (src/net.js#kitText). Nobody else can derive it - another client
       sees a body and a kit, not a stat sheet - so it is a fact the player tells
       everybody, and it is what the right-click menu puts beside their name
       (src/actions.js#playerMenuName). 0 means "not known". */
    combatLevel: opts.combatLevel || 0,
    speed: GHOST_WALK_SPEED,
    hp: opts.hp == null ? 100 : opts.hp,
    maxHp: 100,
    seen: 0,
    /* Whether this player has switched away from their tab (src/net.js
       #STATE_AWAY). It is not a fact about the body - an away player's body is
       just as present as anybody else's, which is the entire point of the flag -
       it is a fact about the *label*: an away player is named in grey
       (src/fx.js#AFK_NAME_COLOR) so that the people looking at a motionless
       figure can tell "standing still" from "not at the keyboard". */
    away: !!opts.away,
    overhead: opts.overhead || 0,
  };
  g.kitSig = ghostKitSig(g.appearance, g.slotKeys);
  buildGhostModel(g);
  const x = (opts.x || 0) + 0.5;
  const z = (opts.z || 0) + 0.5;
  g.x = g.px = g.tx = x;
  g.z = g.pz = g.tz = z;
  g.rot = yawToRot(g.dir || 0);
  g.targetRot = g.rot;
  g.turnDiff = 0;
  Game.ghosts.set(id, g);
  Game.entities.push(g);
  if (g.ch) updateEntityTransform(Game.view, g, 0);
  return g;
}

/* A state packet: where the peer says it is (tile coords), which way it faces,
   how fast it is travelling, and its hit points as a percentage (the bar over
   another player's head has no business knowing their exact maximum). */
export function updateGhostState(id, st) {
  const g = Game.ghosts.get(id);
  if (!g) return null;
  if (st.x != null) g.tx = st.centered ? st.x : st.x + 0.5;
  if (st.z != null) g.tz = st.centered ? st.z : st.z + 0.5;
  if (st.dir != null) {
    g.dir = st.dir;
    g.senderDir = st.dir;
    if (g.targetRot == null || g.rot == null) {
      g.rot = yawToRot(g.dir || 0);
      g.targetRot = g.rot;
      g.turnDiff = 0;
    }
  }
  if (st.running != null) g.gaitRun = !!st.running;
  g.speed = st.running ? GHOST_RUN_SPEED : GHOST_WALK_SPEED;
  if (st.moving != null) g.remoteMoving = !!st.moving;
  g.lastStateAt = Date.now();
  if (st.hp != null) g.hp = st.hp;
  /* ...and the one fact about the *player* rather than the body: whether they
     are still at the keyboard (src/net.js#STATE_AWAY, src/fx.js#AFK_NAME_COLOR).
     It arrives on the same packet as everything above and matters for nothing
     but the colour of their name. */
  if (st.away != null) g.away = !!st.away;
  if (st.overhead != null) g.overhead = st.overhead;
  /* The peer's level (see world.js#UP_Y): taken as-is off the newest packet,
     so a ghost climbs with its player a beat after they do. */
  if (st.plane != null) g.plane = st.plane;
  const jump = Math.hypot(g.tx - g.x, g.tz - g.z);
  if (jump > GHOST_SNAP_TILES) {
    g.x = g.px = g.tx;
    g.z = g.pz = g.tz;
    g.lrx = null; g.lrz = null;
    g.rdist = 0;
    if (g.ch) updateEntityTransform(Game.view, g, 0);
  }
  return g;
}

/* A join packet: the peer's name and the kit it is wearing. The model is only
   rebuilt when the appearance or the equipment really changed, because a join
   is re-sent every few seconds (src/net.js) so that newcomers learn it. */
export function setGhostKit(id, opts) {
  const g = Game.ghosts.get(id);
  if (!g) return null;
  if (opts.name) g.name = opts.name;
  /* The kit packet carries the combat level the peer worked out for itself
     (src/net.js#kitText) - a join is re-sent periodically, so this is also how a
     levelling player's new level reaches everybody's right-click menu. */
  if (opts.combatLevel) g.combatLevel = opts.combatLevel;
  const sig = ghostKitSig(opts.appearance || g.appearance, opts.slotKeys || g.slotKeys);
  if (sig !== g.kitSig) {
    g.appearance = opts.appearance || g.appearance;
    g.slotKeys = opts.slotKeys || g.slotKeys;
    g.kitSig = sig;
    buildGhostModel(g);
    if (g.ch) updateEntityTransform(Game.view, g, 0);
  }
  return g;
}

export function removeGhost(id) {
  const g = Game.ghosts.get(id);
  if (!g) return false;
  Game.ghosts.delete(id);
  const i = Game.entities.indexOf(g);
  if (i >= 0) Game.entities.splice(i, 1);
  disposeGhostModel(g);
  return true;
}

export function clearGhosts() {
  for (const id of [...Game.ghosts.keys()]) removeGhost(id);
}

/* How long after the last state packet a ghost that was moving keeps playing
   its walk cycle standing still: long enough to cover the 600 ms packet
   cadence plus jitter, short enough that a real stop still reads as a stop.
   Without it every early arrival (see the speed margin above) drops to the
   stand pose until the next packet lands - the start-stop flicker on every
   tile. Biased toward staying in the movement animation, per the user's rule:
   while the sender's own moving flag says they are going, the body walks. */
const GHOST_MOVE_HOLD_MS = 900;

/* The per-frame ghost clock (wired in src/main.js through the frame hook): walk
   each ghost toward the tile it was last reported on. */
export function tickGhosts(dt) {
  const now = Date.now();
  for (const g of Game.ghosts.values()) {
    const age = now - (g.lastStateAt || 0);
    const held = !!g.remoteMoving && age < GHOST_MOVE_HOLD_MS;
    const dx = g.tx - g.x;
    const dz = g.tz - g.z;
    const d = Math.hypot(dx, dz);
    const step = g.speed * dt;
    let gliding = true;
    if (d <= step) {
      g.x = g.tx;
      g.z = g.tz;
      gliding = false;
    } else {
      g.x += (dx / d) * step;
      g.z += (dz / d) * step;
      gliding = true;
      g.dir = Math.atan2(dx, dz);
    }
    g.moving = gliding || held;
    if (!gliding && held) g.rdist = (g.rdist || 0) + g.speed * dt;
    /* pinned, so renderPos returns exactly the drawn point (see the note above) */
    g.px = g.x;
    g.pz = g.z;
    /* A one-shot pose a ghost was put into from the wire - a spell's gather
       (src/actions.js#remoteSpell) or a swing (src/game.js#ghostCombat) - has to
       expire on its own, exactly as the local player's and a creature's do. The
       clock was never ticked here, so a ghost that cast a spell once held the
       gather forever; the ghost's own pose machinery is the same as everyone
       else's, so it just needed the same tick. */
    tickCastAnim(g, dt);
    /* The hit flashes burn down here too, like the local player's and the
       creatures' do in src/combat.js#tickCombat: nothing else ticks a ghost's,
       so a shield lit by a magic blow kept its glow forever. */
    if (g.hitFlash) g.hitFlash = Math.max(0, g.hitFlash - dt);
    if (g.shieldFlash) g.shieldFlash = Math.max(0, g.shieldFlash - dt);
    if (!g.shieldFlash) g.shieldFlashDmg = 0;
  }
}

/* --------------------------------------------------------------- following

   The client's Follow (RS Wiki "Follow"): a standing instruction to go
   wherever the leader goes, set by right-clicking another player. The
   follower trails the leader and stops beside them - any adjacent tile, the
   one the pathfinder reaches first - re-planned every time they move, at any
   range, turning constantly toward them through faceEnt (the same machinery
   that turns a creature toward its victim). Two players following each other
   circle (the "dance"); a line of
   followers forms a party train. Both emerge from the adjacency chase with
   no special-casing.

   Run mirrors the leader through the run orb: run on + running leader = run,
   run on + walking leader = walk, run off = always walk (never auto-runs,
   even when left behind), plus a catch-up sprint past arm's reach so the
   chase never walks a tile behind a runner. Toggling run never cancels.

   Cancelled by: clicking to walk anywhere, starting an activity or attack,
   teleporting, dying, and putting on / taking off equipment (all wired to
   stopFollowing). Player-to-player trade offers would cancel too, but this
   world has no player trading (Trade is NPC shops), so there is nothing to
   wire. A shut door or water between the two strands the follower facing
   them - followers genuinely snag on fences and trees, per the wiki.

   Only the *state* lives here; the movement itself is a step in the sim (see
   tickFollow in boot), so a follow cannot run on a frame the sim is paused. */

export function followPlayer(ghost) {
  if (!ghost || ghost.kind !== "ghost") return false;
  Game.follow = ghost;
  ghost.followTile = null;
  ghost.followFailCd = 0;
  /* NPC-style facing from the first tick: a faced entity is aimed at its
     faceEnt every tick (see stepSim + desiredYawOf), the same machinery that
     turns a creature constantly toward its victim. */
  if (Game.player && Game.player.faceEnt !== ghost) Game.player.faceEnt = ghost;
  return true;
}

export function stopFollowing() {
  const g = Game.follow;
  Game.follow = null;
  if (g) {
    g.followTile = null;
    if (Game.player && Game.player.faceEnt === g) Game.player.faceEnt = null;
  }
  return !!g;
}

export function followingId() {
  return Game.follow ? Game.follow.id : -1;
}

/* ---------------------------------------------------------- overhead speech

   Public chat goes two places: the chatbox (where it stays) and the speaker's
   own head (where the client shows it for a few seconds and then forgets it).
   The entity fields are the whole mechanism - `fx.js#renderLabels` reads
   `chatText`/`chatUntil` every frame and draws whatever has not expired - so a
   line costs nothing when nobody is talking and needs no clock of its own.

   The two callers are the two halves of a conversation: `sayOverhead` puts your
   own line over your own head the moment you press enter, and `ghostSay` puts
   somebody else's over theirs as their packet arrives (src/net.js). */
const CHAT_OVERHEAD_MS = 4000;

export function sayOverhead(entity, text) {
  if (!entity) return;
  entity.chatText = text ? String(text) : "";
  entity.chatUntil = text ? Date.now() + CHAT_OVERHEAD_MS : 0;
}

/* Addressed the way the network knows other players: by the connection id their
   ghost is keyed on. A line from somebody whose body has not arrived yet is
   dropped over the head that is not there - it is still in the chatbox, which is
   the copy that matters. */
export function ghostSay(id, text) {
  const g = Game.ghosts.get(id);
  if (g) sayOverhead(g, text);
}

/* Goblins Against Shovels: the goblin camp's organised faction. Shovels came
   out recently and the holes don't dig themselves - or rather, they do now,
   and five pairs of hands are suddenly spare. So the band marches, placards
   up, shouting its yellow lines at anyone close enough to read them. */
export const GAS_SHOUTS = [
  "DOWN WITH SHOVELS!",
  "Hands built these holes!",
  "Me grandad dug with hands!",
  "A shovel never fed a goblin!",
  "They took our holes!",
  "G.A.S. says NO!",
  "One goblin, one hole, two hands!",
  "Shovels dig graves too... ours!",
  "Me hands still work!",
  "Protest! ...after this hole.",
  "What did a hole ever do to you?",
  "Keep digging! With HANDS!",
  "The shovel lobby must fall!",
  "No holes for shovels!",
  "Me hole, me rules!",
  "Shovels took me job!",
  "Hands don't need sharpenin'!",
  "Down with the long spoon!",
  "A spade's a thief with a handle!",
  "We dug here first!",
  "Honk if yer hands!",
  "Blunt steel, blunt future!",
  "Me fingers got seniority!",
  "Wood handle, wooden head!",
  "Strike! Strike! ...lunch first.",
  "A shovel can't march!",
  "Hands up for hands!",
  "The dirt remembers!",
];

/* An imp's blink (OSRS Wiki, Imp): every 30-120 seconds a 25% chance to vanish
   in a puff of smoke and land a short distance away, inside its own wander
   disc. The puff is the standard teleport's own ball (spotanim 111) - forwards
   out of the old tile, backwards into the new one, the same pair a player
   teleport plays (src/actions.js#teleportJump). Height 40 units sits it on the
   imp's mid-body; the arrival is cut to the bubble's own 1.3 seconds. */
function impTeleport(npc) {
  const world = Game.world;
  if (!world || !npc.home) return;
  const hr = npc.radius || 3;
  const hx = Math.floor(npc.home.x), hz = Math.floor(npc.home.z);
  const cx = Math.round(npc.x - 0.5), cz = Math.round(npc.z - 0.5);
  for (let i = 0; i < 12; i++) {
    const tx = hx + ((Math.random() * (2 * hr + 1)) | 0) - hr;
    const tz = hz + ((Math.random() * (2 * hr + 1)) | 0) - hr;
    if ((tx === cx && tz === cz) || !world.isWalkable(tx, tz)) continue;
    Gfx.play(111, { x: npc.x, z: npc.z, height: 40, dir: npc.dir || 0 });
    placeEntity(npc, tx + 0.5, tz + 0.5, npc.dir);
    npc.waitTimer = 1 + Math.random() * 2;
    Gfx.play(111, {
      x: npc.x, z: npc.z, height: 40, dir: npc.dir || 0, target: npc,
      reverse: true, delay: 15, seconds: 1.3,
    });
    return;
  }
}
/* River trolls (OSRS Wiki, River troll): the fishing random event - they burst
   out of the water after the player's fish, shouting yellow lines, aggressive
   to whoever walks close. Deliberately rare (the natural timer runs in the
   tens of minutes; `::trolls` exists so a test never waits on it).

   THE LORE, as the trolls themselves would tell it: they are the river's
   chronically-online gatekeepers, holding this fishing spot since 2014, and
   you are camping it. They smelled the fish on you - doxxed. "Touch grass",
   they say, from waist-deep water, because they cannot. The small ones are
   the reply guys; the alpha - the Troll general's own armoured bulk, one per
   wave at most - is the mod, and touching the alpha catches a ban. Ratio.

   FUTURE (user's note, not yet built): waves should only rise in "dangerous"
   areas. When that lands it gates here, on the spawn decision, and nowhere
   else - the tiers, the yells and the alpha rule stay exactly as they are. */
const RIVER_TROLL_TYPES = ["river_troll_79", "river_troll_120", "river_troll_159", "river_troll_199"];
const OCEAN_TROLL_TYPES = ["ocean_troll_79", "ocean_troll_120", "ocean_troll_159", "ocean_troll_199"];
const TROLL_TYPES = [...RIVER_TROLL_TYPES, ...OCEAN_TROLL_TYPES];
const RIVER_TROLL_LINES = [
  "Fishies be mine, leave dem fishies!",
  "Me smell fishies on you!",
  "Dis river OURS, hu-man!",
  "Stomp da land-walker!",
  "Tasty pinkies! Come here!",
  "You take our fishies, we take YOU!",
  "Read da name. RIVER troll.",
  "Me live IN da water, hu-man!",
  "Puny pinky can't fight!",
  "Me count, us many, you one.",
  "Dis OUR sit-spot, leave!",
  "Me nose know you took da fish!",
  "Me tummy want da shrimps!",
  "Me FIRST to da fishies!",
  "Go back to you hut, pinky!",
  "Me guard dis water many moons!",
  "Hu-man come, fish go. Stomp hu-man!",
  "Me bruddahs come! Many bruddahs!",
];
/* The ocean family's own yells (user ask 2026-10-30): same grievances, saltier
   water. */
const OCEAN_TROLL_LINES = [
  "Fishies be mine, leave dem fishies!",
  "Me smell fishies on you!",
  "Dis OCEAN ours, hu-man!",
  "Stomp da land-walker!",
  "Tasty pinkies! Come here!",
  "You take our fishies, we take YOU!",
  "Read da name. OCEAN troll.",
  "Me live IN da deep water, hu-man!",
  "Puny pinky can't swim!",
  "Me count, us many, you one.",
  "Dis OUR tide-pool, leave!",
  "Me nose know you took da fish!",
  "Me tummy want da shrimps!",
  "Me FIRST to da fishies!",
  "Go back to you hut, pinky!",
  "Me guard dis sea many moons!",
  "Hu-man come, fish go. Stomp hu-man!",
  "Me bruddahs come! Many bruddahs!",
];
let riverTrollTimer = 1200 + Math.random() * 900;
/* Shared identity pool for troll waves (multiplayer sync, user ask
   2026-10-27): every locally spawned troll carries a real spawn index in the
   reserved 40000..43999 band - rivers 40000..41999, oceans 42000..43999 -
   tier-encoded (base + tier*500 + slot), so the
   creature census carries it to neighbours and their clients mirror the same
   body (see creatureStateBatch below and applyNpcStates' remote creation).
   The band never collides with the spawn table (a few thousand) or the
   0xffff "not from the table" previews. */
let riverTrollSalt = (Math.random() * 500) | 0;
function riverTrollIx(ti) {
  const ix = 40000 + Math.max(0, Math.min(3, ti)) * 500 + (riverTrollSalt++ % 500);
  if (riverTrollSalt > 1e9) riverTrollSalt = 0;
  return ix;
}
/* Ocean twin of the identity pool (user ask 2026-10-30): 42000..43999, same
   tier encoding, so a neighbour's ocean wave mirrors back blue (see
   applyNpcStates). */
function oceanTrollIx(ti) {
  const ix = 42000 + Math.max(0, Math.min(3, ti)) * 500 + (riverTrollSalt++ % 500);
  if (riverTrollSalt > 1e9) riverTrollSalt = 0;
  return ix;
}
function tickRiverTrollEvent(dt) {
  const p = Game.player;
  if (!p || p.dead) return;
  const world = Game.world;
  if (!world) return;
  /* The cay is a no-troll box (user ask 2026-10-30): no wave rises for a
     walker inside it, and strays of either family found inside it are culled
     on the spot. */
  const inSafe = inTutCaySafe(p.x, p.z);
  /* The pack never shuts up: every living troll re-yells on its own clock
     while the player is close enough to read it. */
  for (let i = Game.npcs.length - 1; i >= 0; i--) {
    const n = Game.npcs[i];
    if (n.dead || !TROLL_TYPES.includes(n.type)) continue;
    if (inTutCaySafe(n.x, n.z)) {
      Game.npcs.splice(i, 1);
      const ei = Game.entities.indexOf(n);
      if (ei >= 0) Game.entities.splice(ei, 1);
      if (n.ch && n.ch.group && n.ch.group.parent) n.ch.group.parent.remove(n.ch.group);
      continue;
    }
    if (Math.abs(n.x - p.x) + Math.abs(n.z - p.z) > 15) continue;
    n.yellTimer = (n.yellTimer == null ? 6 + Math.random() * 8 : n.yellTimer) - dt;
    if (n.yellTimer <= 0) {
      n.yellTimer = 7 + Math.random() * 9;
      const lines = OCEAN_TROLL_TYPES.includes(n.type) ? OCEAN_TROLL_LINES : RIVER_TROLL_LINES;
      sayOverhead(n, lines[(Math.random() * lines.length) | 0]);
    }
  }
  riverTrollTimer -= dt;
  if (riverTrollTimer > 0) return;
  riverTrollTimer = 2700 + Math.random() * 2700;
  if (inSafe) return;
  let living = 0;
  for (const n of Game.npcs) {
    if (!n.dead && TROLL_TYPES.includes(n.type) && ++living >= 8) return;
  }
  const px = Math.floor(p.x), pz = Math.floor(p.z);
  /* The wave only rises for a walker standing at the water's edge - within
     two tiles of it - and the water decides the family (user ask 2026-10-30):
     river water raises river trolls, ocean water raises ocean trolls, rivers
     winning when both are near. Anywhere else the water keeps its secret and
     checks again shortly, so walking down to the bank is what summons them. */
  let atRiver = false, atOcean = false;
  for (let dz = -2; dz <= 2 && !(atRiver && atOcean); dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (world.isWaterTile(px + dx, pz + dz)) {
        if (world.isOceanTile(px + dx, pz + dz)) atOcean = true;
        else atRiver = true;
      }
    }
  }
  if (!atRiver && !atOcean) {
    riverTrollTimer = 45 + Math.random() * 45;
    return;
  }
  const oceanWave = !atRiver;
  const types = oceanWave ? OCEAN_TROLL_TYPES : RIVER_TROLL_TYPES;
  const lines = oceanWave ? OCEAN_TROLL_LINES : RIVER_TROLL_LINES;
  const ixFn = oceanWave ? oceanTrollIx : riverTrollIx;
  const waters = [];
  for (let dz = -14; dz <= 14; dz++) {
    for (let dx = -14; dx <= 14; dx++) {
      if (!world.isWaterTile(px + dx, pz + dz)) continue;
      if (world.isOceanTile(px + dx, pz + dz) !== oceanWave) continue;
      waters.push([px + dx, pz + dz]);
    }
  }
  if (!waters.length) return;
  /* The wave scales to the walker who summoned it: the base tier is their
     own combat level's bracket, and every troll rolls its own level around
     it - mostly the base, sometimes a runt, sometimes worse. */
  const cb = Game.ps && Game.ps.skills ? combatLevel(Game.ps.skills) : 3;
  const base = cb >= 110 ? 3 : cb >= 91 ? 2 : cb >= 61 ? 1 : 0;
  const n = 5 + ((Math.random() * 16) | 0);
  /* The alpha is one per wave at most: a high-level summoner always draws
     it, a 91-109 one sometimes does, below that never. */
  const alphaIdx = base >= 3 ? (Math.random() * n) | 0 : base === 2 && Math.random() < 0.25 ? (Math.random() * n) | 0 : -1;
  const sb = Math.min(base, 2);
  for (let i = 0; i < n; i++) {
    const w = waters[(Math.random() * waters.length) | 0];
    const spot = nearestWalkable(world, w[0], w[1], 8);
    if (!spot) continue;
    const r = Math.random();
    const ti = i === alphaIdx ? 3 : r < 0.62 ? sb : r < 0.85 ? Math.max(0, sb - 1) : Math.min(2, sb + 1);
    const troll = createNpc(world, Game.view, {
      type: types[ti],
      x: spot.x,
      z: spot.z,
      dir: Math.atan2(p.x - (spot.x + 0.5), p.z - (spot.z + 0.5)),
      radius: 5,
      spawnIx: ixFn(ti),
      noRespawn: true,
    });
    troll.spawnCB = cb;
    troll.yellTimer = 6 + Math.random() * 8;
    Game.npcs.push(troll);
    Game.entities.push(troll);
    Gfx.play(111, {
      x: troll.x, z: troll.z, height: 70, dir: troll.dir || 0,
      target: troll, reverse: true, seconds: 1.3,
    });
    sayOverhead(troll, lines[(Math.random() * lines.length) | 0]);
  }
}
/* Test-only trigger for the random event below: drops the timer to zero so the
   next tick runs the real emergence path (water search, tier pick, splash,
   yells). Reached as ::trolls (src/ui.js). */
export function forceRiverTrollEvent() {
  riverTrollTimer = 0;
}
export function updateNpcs(dt) {
  const { world, view } = Game;
  tickRiverTrollEvent(dt);
  for (const npc of Game.npcs) {
    if (npc.dead) {
      /* The body itself is drawn by the render loop while the death sequence
         plays (src/game.js#updateVisuals); all that is left here is the spawn
         timer. The entity is still frozen first, so that the little bit of
         bookkeeping that does read the render origin (drops, tooltips, the
         camera's own neighbours) sees it where it fell rather than mid-step. */
      freezeEntity(npc);
      /* The minigame dungeon's private cast never comes back (src/minigame.js):
         the corpse falls, the body leaves with the death sequence, and that is
         the end of it. */
      if (npc.noRespawn) continue;
      npc.respawn = (npc.respawn || 0) + dt;
      if (npc.respawn >= (npc.respawnTicks || 20) * TICK_S) {
        npc.dead = false;
        npc.corpse = false;
        npc.respawn = 0;
        npc.hp = npc.stats.hp;
        npc.poison = null;
        npc.waitTimer = 1 + Math.random() * 3;
        npc.turnHomeAt = 0;
        /* A respawn is a new life: no fight state survives it. The kill
           already dropped target and aggroed, but a lure - or a calm, retal
           or flinch fuse - taken on the fatal tick outlives the corpse, and
           a neutral creature must come back passive (the user's rule). An
           aggressive one re-acquires through the ordinary tick below. */
        npc.target = null;
        npc.aggroed = null;
        npc.lureTgt = null;
        npc.lureTimer = 0;
        npc.calm = 0;
        npc.retal = 0;
        npc.retalEnded = false;
        npc.flinch = 0;
        npc.ppGrace = 0;
        if (npc.ch) {
          if (npc.ch.resetAnim) npc.ch.resetAnim();
          npc.ch.group.visible = true;
        }
        placeEntity(npc, npc.home.x + 0.5, npc.home.z + 0.5);
        /* Come back facing the spawn-table direction - the Wise Old Man posts
           facing the new-player spawn tile (src/world.js), so a respawn must
           not keep the direction he happened to die in. */
        if (npc.homeDir != null) npc.dir = npc.homeDir;
      }
      continue;
    }
    /* A creature with no path array at all must not take the whole frame loop
       down with it: this runs inside the render callback, so one bad entity
       would stop the game dead rather than just misbehaving. */
    if (!npc.path) npc.path = [];
    npc.netGlide = false;
    npc.attackAnim = Math.max(0, npc.attackAnim - dt * 3);
    tickCastAnim(npc, dt);
    /* Bind, Snare and Entangle root the creature where it stands: it keeps
       fighting, but it cannot take a step until the spell expires. */
    if (npc.boundTicks > 0) {
      /* frozen exactly where it stands - see freezeEntity: clearing the path
         without collapsing the interpolation origin makes the renderer replay
         the step it was part-way through on every tick */
      freezeEntity(npc);
      continue;
    }
    if (npc.playerHitTicks > 0) npc.playerHitTicks -= 1;
    if (npc.netTicks > 0) npc.netTicks -= 1;
    /* The pickpocket mark's grace (the user's rule): ten ticks after a theft
       before the thief can attack, counted down with the other per-tick
       fuses above. */
    if (npc.ppGrace > 0) npc.ppGrace -= 1;
    /* Low-health flight (OSRS wiki, Retreat): a chicken or seagull losing its
       fight runs instead of standing to die. `fleeing` gates the strike in
       tickCombat and turns the drawn facing back to the step below (see
       desiredYawOf), so the bird runs facing away; the chase branch is skipped
       while it holds. */
    const fleeT = (npc.target && !npc.target.dead) ? npc.target : null;
    npc.fleeing = !!(fleeT && FLEE_TYPES[npc.type] && npc.stats && npc.hp <= Math.ceil(npc.stats.hp / 4));
    if (npc.fleeing) {
      npc.path = linearFleeSteps(npc, world, Math.round(fleeT.x - 0.5), Math.round(fleeT.z - 0.5));
    }
    if (npc.target && !npc.target.dead && !npc.fleeing) {
      const t = npc.target;
      /* A chase answers a lure: the attacker walked into range, so the
         backing-away (below) ends and the ordinary hunt takes over. */
      npc.lureTimer = 0;
      npc.lureTgt = null;
      /* A creature that fights in melee has to reach one of its victim's four
         **side** tiles, exactly as the player's own melee does (src/combat.js's
         note on `reachDistance`): its blow is measured orthogonally, so a chase
         that stopped on a diagonal would stand there out of reach for good. The
         distances are read off tiles - the same ones `tickCombat`'s reach test
         floors - so the walk can never stop where the blow cannot land. Every
         other creature keeps the plain Chebyshev ring and the raw-position
         distance it always had. */
      const tx = Math.round(t.x - 0.5);
      const tz = Math.round(t.z - 0.5);
      const melee = Game.npcMelee ? Game.npcMelee(npc.type) : false;
      /* A melee creature's own distance to its victim is measured to the
         victim's tile from **its own floor**, not from the tile its feet happen
         to be on: a 3x3 demon reaches a player standing beside its body, and
         stopping the chase there is what keeps it from shuffling its anchor
         round until the player is next to that one tile (the user's big-monster
         rule, 2026-09-24 - the same box the player's own blow is measured to,
         src/combat.js#reachTo). A 1x1 creature's floor is its tile, so its
         distance is exactly the old anchor-to-anchor number. */
      const d = melee
        ? footDistance(tx, tz, npcFootBox(npc)).orth
        : Math.max(Math.abs(npc.x - t.x), Math.abs(npc.z - t.z));
      /* A wide body can never strike from inside its own footprint: a victim
         standing on its floor is untargetable until the floor backs out to a
         tile with the victim in the 1-tile ring outside it (the user's rule,
         2026-10-01). So d === 0 on a big melee body plans a retreat, not a
         stand - the nearest corner with the victim orthogonally beside the new
         floor - re-pathed like any chase until one is reached. */
      const backedOn = melee && (npc.foot > 1) && d === 0;
      /* A melee blow needs a clear face as well as a side tile
         (world.js#swingBlocked): a creature that has arrived on a walled side
         keeps chasing instead of parking there mute, and the ring it chases
         only offers sides the swing can land from. */
      const walledHere = melee && world.swingBlocked
        ? world.swingBlocked(floorTiles(npcFootBox(npc)), [{ x: tx, z: tz }])
        : false;
      /* A caster or archer with no line of sight walks right up to its victim
         instead of holding a blind ring tile mute: sight clears as it closes,
         and its strike fires from underneath exactly as the player's own bow
         does (world.js#losBlocked - faces only, so trees never force this). */
      const sightChase = !melee && world.losBlocked
        ? world.losBlocked(floorTiles(npcFootBox(npc)), [{ x: tx, z: tz }])
        : false;
      if ((d > 1 || backedOn || walledHere || sightChase)) {
        /* Calm deliberately does NOT gate the chase (the user's rule,
           2026-10-09): the flinch delay holds the creature's *strikes*, never
           its feet - a victim that runs a few tiles is followed at once, and
           the calm clears the tick the chase arrives back in range. Gating the
           plan here is what made a creature stand mute for the whole calm
           after every step-out before trying again. */
        /* A back-out runs one whole move to completion before anything new is
           planned: re-pathed only when the route is spent and the two-tick
           wait is out, so a step is always finalized - moved, landed - before
           the next try (the user's rule, 2026-10-01). An ordinary chase keeps
           the old mid-route repath. */
        const repathDue = backedOn
          ? (!npc.path.length && (Game.tickCount % 3 === 0))
          : (!npc.path.length || npc.repathTimer <= 0);
        if (repathDue) {
          if (backedOn) npcStepOut(npc, world, tx, tz);
          /* Straight at the victim, never round the walls: one linear step
             toward their tile (see linearChaseStep). A sealed line queues an
             empty path, so the creature stands pressing the wall and facing
             them - the strike gates above (reach, swing faces, sight line)
             still decide when a blow may land. */
          else npc.path = linearChaseStep(npc, world, tx, tz);
          /* An ordinary chase re-paths on its 0.6s rhythm; a back-out runs on
             the tick parity above instead, so no timer is set for it here. */
          if (!backedOn) npc.repathTimer = 0.6;
        }
        /* Backing out faces the victim the whole way - recorded here, re-aimed
           after the step below turns the body along its walk. */
        npc.backedOn = backedOn;
      } else {
        npc.path.length = 0;
        npc.backedOn = false;
        npc.dir = Math.atan2(t.x - npcDrawCX(npc), t.z - npcDrawCZ(npc));
      }
      npc.repathTimer = (npc.repathTimer || 0) - dt;
    }
    /* Lured (see combat.js#provokeNpc): struck from beyond the aggression
       range, the creature knows it is being hit but will not march across
       the map. It backs away facing its attacker - one step per repath,
       never past the wander disc's edge, holding and facing when shut -
       trying to draw the attacker into its own ground. Walk into range and
       the chase above takes over; wait it out and the wander below walks it
       home like anything left out. */
    else if (npc.lureTimer > 0 && npc.lureTgt && !npc.talking) {
      const lt = npc.lureTgt;
      if (lt.dead || lt.dying) { npc.lureTimer = 0; npc.lureTgt = null; }
      else {
        npc.dir = Math.atan2(lt.x - npcDrawCX(npc), lt.z - npcDrawCZ(npc));
        npc.lureTimer -= dt;
        if (npc.lureTimer <= 0) { npc.lureTimer = 0; npc.lureTgt = null; }
        else if (!npc.path.length || npc.repathTimer <= 0) {
          const steps = linearFleeSteps(npc, world, Math.round(lt.x - 0.5), Math.round(lt.z - 0.5));
          let step = steps.length ? steps[0] : null;
          if (step && npc.home && (npc.radius || 0) > 0) {
            const htx = Math.floor(npc.home.x);
            const htz = Math.floor(npc.home.z);
            if (Math.max(Math.abs(step.x - htx), Math.abs(step.z - htz)) > npc.radius) step = null;
          }
          npc.path = step ? [step] : [];
          npc.repathTimer = 0.6;
        }
        npc.repathTimer = (npc.repathTimer || 0) - dt;
      }
    } else if (npc.netTicks > 0 && !npc.talking) {
      /* A creature somebody else is looking at (src/game.js#applyNpcStates):
         this client draws its copy where that client says it is, instead of
         letting it live its own life. A body that is already where it was
         reported costs nothing - the position is compared before anything is
         planned - and a body that is not walks there through the ordinary
         pathfinder, so it arrives by a route rather than sliding. */
      const tx = npc.netTx;
      const tz = npc.netTz;
      const ndx = tx - npc.x;
      const ndz = tz - npc.z;
      const nd = Math.hypot(ndx, ndz);
      if (nd > 0.12) {
        npc.netGlide = false;
        if (!npc.path.length || npc.repathTimer <= 0) {
          walkTo(npc, world, Math.floor(tx), Math.floor(tz), 0, null, false, null);
          npc.repathTimer = 0.6;
        }
      } else {
        npc.netGlide = false;
        npc.stepPts = null;
        npc.px = npc.x;
        npc.pz = npc.z;
        npc.moving = false;
        npc.path.length = 0;
      }
      npc.repathTimer = (npc.repathTimer || 0) - dt;
    } else if (npc.wander && !npc.talking) {
      /* Left far outside the wander disc - a finished chase, a retreat - the
         walk back is straight home, not a roam: the picks below only land
         inside npc.radius, so anything further out is a walk-back. */
      const htx = npc.home ? Math.floor(npc.home.x) : null;
      const htz = npc.home ? Math.floor(npc.home.z) : null;
      const fromHome = (htx == null) ? 0 : Math.max(Math.abs(Math.round(npc.x - 0.5) - htx), Math.abs(Math.round(npc.z - 0.5) - htz));
      if (htx != null && (npc.radius || 0) > 0 && fromHome > (npc.radius || 0)) {
        if (!npc.path.length || npc.repathTimer <= 0) {
          npc.path = linearChaseStep(npc, world, htx, htz);
          npc.repathTimer = 0.6;
        }
        npc.repathTimer = (npc.repathTimer || 0) - dt;
      } else {
        npc.waitTimer -= dt;
        if (!npc.path.length && npc.waitTimer <= 0) {
          npc.waitTimer = 1.5 + Math.random() * 5;
          const p = pickWanderTarget(world, npc, null);
          if (p) npc.path = p;
        }
      }
    }
    /* A creature being spoken to holds its ground and turns to face the speaker
       (the `talking` flag, set and cleared by src/dialogue.js). Without this an
       NPC wandered off mid-conversation and kept its back to you while its
       dialogue box was open. */
    if (npc.talking && Game.player) {
      if (npc.path.length) npc.path.length = 0;
      npc.dir = Math.atan2(Game.player.x - npcDrawCX(npc), Game.player.z - npcDrawCZ(npc));
    }
    /* The Wise Old Man's post: ten ticks after a conversation ends he turns
       back to face the tile new players spawn into (his spawn-table facing,
       src/world.js). Spoken to from another angle he stays facing that
       speaker for the conversation and ten ticks after it, then comes back. */
    if (npc.type === "wise_old_man" && !npc.talking && npc.turnHomeAt && Game.tickCount >= npc.turnHomeAt) {
      npc.turnHomeAt = 0;
      npc.dir = npc.homeDir != null ? npc.homeDir : Math.atan2(62.5 - npc.x, 57.5 - npc.z);
    }
    if (npc.type === "gas_goblin" && !npc.dead && !npc.talking) {
      npc.shoutTimer = (npc.shoutTimer == null ? 6 + Math.random() * 15 : npc.shoutTimer) - dt;
      if (npc.shoutTimer <= 0) {
        npc.shoutTimer = 15 + Math.random() * 30;
        const p = Game.player;
        if (p && !p.dead && Math.hypot(p.x - npc.x, p.z - npc.z) < 16) {
          sayOverhead(npc, GAS_SHOUTS[(Math.random() * GAS_SHOUTS.length) | 0]);
        }
      }
    }
    /* Imps blink (see impTeleport above): the roll comes every 30-120 seconds
       with a 25% chance, and only while the imp is idle - never mid-fight, mid-
       lure, mid-conversation, under another client's eyes, or sworn to the god
       (his glade's assailants hold their ground). */
    if (npc.type === "imp" && !npc.dead && !npc.talking && !npc.godFoe) {
      npc.teleTimer = (npc.teleTimer == null ? 15 + Math.random() * 30 : npc.teleTimer) - dt;
      if (npc.teleTimer <= 0) {
        npc.teleTimer = 30 + Math.random() * 90;
        if (Math.random() < 0.25 && !npc.target && !npc.lureTgt && !npc.fleeing && !(npc.netTicks > 0)) impTeleport(npc);
      }
    }
    npc.moveAcc = (npc.moveAcc || 0) + 1;
    if (!npc.netGlide && npc.moveAcc >= (npc.moveEvery || 1)) {
      npc.moveAcc = 0;
      /* Flight runs: a fleeing bird covers two tiles a tick (see linearFleeSteps). */
      stepEntity(npc, npc.fleeing ? 2 : 1);
    }
    if (npc.backedOn && npc.target && !npc.target.dead) {
      const t = npc.target;
      npc.dir = Math.atan2(t.x - npcDrawCX(npc), t.z - npcDrawCZ(npc));
    }
  }
}

/* The camera's zoom-out stop: the distance at which the map has just dissolved
   into the fog (scene.js fog runs 48 to 118, fully fogged past it) - checked
   live from the square at the default pitch and several yaws: 100 still reads
   foreground, 115 still reads rooftops facing inland, 125 is ghosts, 130 is
   sky. The zoom-in end needs nothing: the wheel already floors at 0. */
const CAM_MAX_DIST = 125;
function clampCamDist(d) {
  return Math.min(CAM_MAX_DIST, Math.max(0, d));
}

/* The seed the world is built from. **Every player of this generator must use
   the same one**, because the map is not downloaded - it is *built*, and it is
   built identically on every client from this number (src/world.js runs the same
   noise and the same seeded placement, and its output was verified to be
   byte-identical across builds). That is the whole reason the world can be
   shared at all: the ledger sends a felled tree as a tile and expects every
   client to have the same tree standing on it.

   The value is the generator's own config (`main.pjs`'s `worldSeed`), which is
   the one place all clients read, so there is exactly one map in the world. It
   is coerced to a number rather than trusted, and falls back to the baked
   default: a *string* seed would not throw - `seed ^ k` coerces, but `seed + i`
   concatenates - it would silently build a different map on the clients that
   read it as text, which is the one failure this whole scheme cannot survive. */
const DEFAULT_WORLD_SEED = 2007;
function worldSeed() {
  const configured = typeof root !== "undefined" && root ? Number(root.worldSeed) : NaN;
  return Number.isFinite(configured) ? configured : DEFAULT_WORLD_SEED;
}

export function boot(canvas) {
  const world = createWorld(worldSeed());
  const view = new View(canvas, world);
  Game.world = world;
  Game.view = view;
  /* spell graphics live in the world view; they need its scene to add
     themselves to and its world's terrain heights to sit on */
  Gfx.setView(view);
  StatueSwirl.setView(view);
  loadHandPlaced(world, view);

  const pch = makePlayerCharacter();

  const player = {
    kind: "player",
    ch: pch,
    x: 62.5,
    z: 57.5,
    px: 62.5,
    pz: 57.5,
    dir: Math.PI,
    phase: 0,
    rphase: 0,
    actionAnim: 0,
    castAnim: null,
    castLeft: 0,
    castId: 0,
    /* whether a looping work pose is entered at its sequence's final frame -
       see src/game.js#playCastAnim and src/actions.js#workAnim */
    castTail: false,
    /* the item a work pose is performed with, held in place of the weapon
       (src/game.js#wornKeysFor) - see playCastAnim */
    castTool: null,
    emoteAnim: null,
    emoteLeft: 0,
    emoteId: 0,
    running: false,
    runClick: null,
    path: [],
    moving: false,
  };
  Game.player = player;
  view.scene.add(pch.group);
  player.rot = yawToRot(player.dir || 0);
  player.targetRot = player.rot;
  player.turnDiff = 0;
  updateEntityTransform(view, player, 0);

  const ps = createPlayerState(window.generatorName || "Player");
  ps.x = player.x;
  ps.z = player.z;
  Game.ps = ps;
  player.ps = ps;
  /* The character's levels and its starting kit are part of the character, not
     of the boot: src/player.js#createPlayerState builds both from the config in
     main.pjs, and src/save.js#applyState re-grants the kit to a character that
     was saved before it existed. */

  Game.npcs = spawnNpcs(world, view);
  Game.entities = [player, ...Game.npcs];

  view.resize();
  window.addEventListener("resize", () => view.resize());
  Fx.init({ canvas: document.getElementById("fxLayer"), camera: view.camera });

  const el = canvas;
  let pointerDown = null;
  let rightDown = null;
  let menuFromPress = false;
  /* One-button hold state: a pending left-press timer plus whether it fired.
     `leftDefer` marks a one-button press whose action waits for the release
     (see pointerdown/pointerup): two-button mode acts on the press instead. */
  let leftHoldTimer = 0;
  let leftHoldFired = false;
  let leftDefer = false;
  const clearLeftHold = () => {
    if (leftHoldTimer) { clearTimeout(leftHoldTimer); leftHoldTimer = 0; }
  };
  const openLeftMenu = (x, y) => {
    const pick = Game.pickAll(x, y);
    if (Game.hooks.onRightClickWorld) {
      Game.hooks.onRightClickWorld(x, y, pick);
      menuFromPress = true;
    }
  };
  let touchPts = new Map();
  let touchTap = null;
  let touchOrbit = null;
  let touchPinch = null;
  let touchHoldTimer = 0;
  const clearTouchHold = () => {
    if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = 0; }
  };
  const endTouch = () => {
    clearTouchHold();
    touchPts.clear();
    touchTap = null;
    touchOrbit = null;
    touchPinch = null;
  };
  const touchDown = (e) => {
    noteModifiers(e);
    touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPts.size >= 2) {
      clearTouchHold();
      touchTap = null;
      touchOrbit = null;
      const pts = [...touchPts.values()];
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      touchPinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, target: Game.targetDist };
      return;
    }
    touchTap = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, menu: false };
    touchHoldTimer = setTimeout(() => {
      touchHoldTimer = 0;
      const cur = touchPts.get(touchTap ? touchTap.id : -1);
      if (!touchTap || !cur) return;
      if (Math.abs(cur.x - touchTap.x) + Math.abs(cur.y - touchTap.y) > 10) return;
      touchTap.menu = true;
      const pick = Game.pickAll(touchTap.x, touchTap.y);
      if (Game.hooks.onRightClickWorld) {
        Game.hooks.onRightClickWorld(touchTap.x, touchTap.y, pick);
        menuFromPress = true;
      }
    }, 400);
  };
  const touchMove = (e) => {
    if (!touchPts.has(e.pointerId)) return;
    touchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPinch && touchPts.size >= 2 && !Game.cayCamLock) {
      const pts = [...touchPts.values()];
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      Game.targetDist = touchPinch.target * touchPinch.dist / d;
      Game.targetDist = clampCamDist(Game.targetDist);
      return;
    }
    if (touchTap && e.pointerId === touchTap.id) {
      const moved = Math.abs(e.clientX - touchTap.x) + Math.abs(e.clientY - touchTap.y);
      if (moved > 10 || touchTap.menu) {
        clearTouchHold();
        touchOrbit = { id: e.pointerId, x: e.clientX, y: e.clientY };
        touchTap = null;
      } else return;
    }
    if (touchOrbit && e.pointerId === touchOrbit.id) {
      const dx = e.clientX - touchOrbit.x;
      const dy = e.clientY - touchOrbit.y;
      touchOrbit.x = e.clientX;
      touchOrbit.y = e.clientY;
      /* The wash-up opening holds the camera for its stand (src/actions.js):
         the anchor still tracks the finger so nothing jumps on release. */
      if (Game.cayCamLock) return;
      Game.yaw -= dx * 0.008;
      Game.pitch = Math.min(1.42, Math.max(0.34, Game.pitch + dy * 0.005));
    }
  };
  const touchUp = (e) => {
    clearTouchHold();
    touchPts.delete(e.pointerId);
    if (touchPinch) {
      if (touchPts.size < 2) endTouch();
      return;
    }
    if (touchTap && e.pointerId === touchTap.id) {
      const cur = { x: touchTap.x, y: touchTap.y, menu: touchTap.menu };
      touchTap = null;
      touchOrbit = null;
      if (!cur.menu) handleClick(cur.x, cur.y, e);
      return;
    }
    if (touchOrbit && e.pointerId === touchOrbit.id) touchOrbit = null;
  };
  /* Per-press drag budget: raised while the player is walking/running (see
     below), so tracking wiggles cost nothing extra when the hand is already
     following a moving target. */
  let rightCancelAt = 12;

  el.addEventListener("contextmenu", (e) => e.preventDefault());

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") { touchDown(e); return; }
    noteModifiers(e);
    if (e.button === 0) {
      pointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), button: 0 };
      Game.input.moved = 0;
      /* One-button mouse mode (options panel "Mouse buttons: 1"): a held left
         press opens the right-click menu after menuHoldMs (default 300ms,
         adjustable in additional settings), and shift+left-click opens it at
         once. The hold is cancelled by moving more than a few pixels. A plain
         press acts on the RELEASE, not the press - so a hold that becomes a
         menu does not also walk, and a press that moves is not an action
         either. Two-button mode is unchanged: it still acts on the press. */
      if (leftHoldTimer) { clearTimeout(leftHoldTimer); leftHoldTimer = 0; }
      leftHoldFired = false;
      leftDefer = false;
      const wantMenu = Game.input.oneButton && e.target === el;
      if (wantMenu && (e.shiftKey || Game.input.keys.shift)) {
        openLeftMenu(e.clientX, e.clientY);
        leftHoldFired = true;
        pointerDown = null;
        return;
      }
      if (wantMenu) {
        leftDefer = true;
        const sx = e.clientX, sy = e.clientY;
        const ms = Math.max(100, Math.min(1000, Math.floor(Number(Game.input.menuHoldMs) || 300)));
        leftHoldTimer = setTimeout(() => {
          leftHoldTimer = 0;
          if (!pointerDown || (Game.input.moved || 0) > 10) return;
          leftHoldFired = true;
          pointerDown = null;
          openLeftMenu(sx, sy);
        }, ms);
      } else {
        /* A two-button left click acts on the press, not the release - the
           same rule the right click follows (its menu opens on pointerdown).
           The mark and the routing therefore happen here; pointerup only
           clears the press. */
        handleClick(e.clientX, e.clientY, e);
      }
    } else if (e.button === 2 || e.button === 1) {
      Game.input.dragging = true;
      Game.input.movedRight = 0;
      /* Motion-aware budget: a press made while the player is walking or
         running gets 20px before it counts as a drag (and cancels a
         press-opened menu), instead of the standing 12px. The hand is tracking
         a target that is itself sliding under the cursor, so the same wiggle
         must not cost the menu. Snapshot per press, so the budget cannot shift
         mid-drag if the player stops or starts mid-gesture. */
      rightCancelAt = (Game.player && Game.player.path && Game.player.path.length) ? 20 : 12;
      rightDown = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, pid: e.pointerId };
      Game.input.lastX = e.clientX;
      Game.input.lastY = e.clientY;
      if (e.button === 2) {
        /* The press opens the menu as it always did - whether or not
           right-drag rotation is on. A press that becomes a rotation still
           turns the view (see pointermove), and the drag past the budget
           cancels the press-opened menu as it goes, so a rotation never leaves
           a stale menu behind it. A clean release after a press that opened
           nothing (a compass drag via camDragFrom) still earns its menu on the
           way up (see pointerup). */
        const pick = Game.pickAll(e.clientX, e.clientY);
        if (Game.hooks.onRightClickWorld) {
          Game.hooks.onRightClickWorld(e.clientX, e.clientY, pick);
          menuFromPress = true;
        }
      }
    }
  });

  Game.camDragFrom = (clientX, clientY, pid) => {
    Game.input.dragging = true;
    Game.input.movedRight = 0;
    rightCancelAt = (Game.player && Game.player.path && Game.player.path.length) ? 20 : 12;
    rightDown = { x: clientX, y: clientY, t: performance.now(), button: 2, pid, noMenu: true };
    Game.input.lastX = clientX;
    Game.input.lastY = clientY;
    menuFromPress = false;
  };

  window.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "touch") { touchUp(e); return; }    if (!Game.input.dragging) return;
    if (e.pointerId != null && rightDown && rightDown.pid != null && e.pointerId !== rightDown.pid) return;
    Game.input.dragging = false;
    rightDown = null;
    menuFromPress = false;
  });
  window.addEventListener("blur", () => {
    endTouch();
    Game.input.dragging = false;
    rightDown = null;
    menuFromPress = false;
  });
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") { touchMove(e); return; }
    /* the last known cursor position over the world, for the top-left hover
       text (see updateWorldHover in src/ui.js) */
    if (e.target === el) Game.pointer = { x: e.clientX, y: e.clientY };
    if (Game.input.dragging) {
      if (e.pointerId != null && rightDown && rightDown.pid != null && e.pointerId !== rightDown.pid) return;
      const dx = e.clientX - Game.input.lastX;
      const dy = e.clientY - Game.input.lastY;
      Game.input.lastX = e.clientX;
      Game.input.lastY = e.clientY;
      const inMenuHold = Game.hooks.ctxMenuExclusion && Game.hooks.ctxMenuExclusion(e.clientX, e.clientY);
      if (!inMenuHold) Game.input.movedRight = (Game.input.movedRight || 0) + Math.abs(dx) + Math.abs(dy);
      if (menuFromPress && (Game.input.movedRight || 0) >= rightCancelAt) {
        if (Game.hooks.ctxMenuContains && Game.hooks.ctxMenuContains(e.clientX, e.clientY, 2)) {
          menuFromPress = false;
        } else {
          menuFromPress = false;
          if (Game.hooks.onRightClickCancel) Game.hooks.onRightClickCancel();
        }
      }
      /* The two halves of the camera disagreed for a while and both were
         flipped at least once, which is why the drag has its own note. The
         arrows are the half the user has now signed off on ("ok so you have
         the nav arrows correct"), and the drag is the half that was still
         reading backwards ("somehow, in the process, you made the
         mousewheelclickdrag and the rightclickdrag look around inverted"), so
         the drag was flipped on BOTH axes. The rule the two halves follow:

           the ARROWS slide the *ground*; the DRAG moves the *view*.

         A drag therefore pans the way you drag, which is ordinary mouse-look -
         drag right and you look right (the ground slides left), drag down and
         you look down (the camera tips towards the top-down angle, so the
         ground slides up). The arrows are the same picture seen from the other
         side: `arrowright` slides the ground right, which is the view turning
         LEFT, and `arrowup` slides the ground up, which is looking DOWN. So the
         two halves carry opposite signs on yaw (`-= dx` here, `+= ` on
         `arrowright`) and, since pitch measures the camera's HEIGHT rather than
         the look direction, "look down" and "ground up" are the same sign - a
         drag down and `arrowup` both raise the pitch. Both of the drag's axes
         are independent: if one of them alone reads backwards, only its sign
         below needs changing.

         `View.setCamera` measures yaw so the camera orbits from +Z towards +X
         as yaw grows: at yaw 0 it sits south of the player looking north, and
         increasing yaw carries it round to the east (so on screen the map
         swings clockwise and the ground slides right). Pitch increasing raises
         the camera towards the top-down view. */
      /* Deadzone: the drag only moves the camera once it has also travelled
         far enough to count as a drag (the same budget that cancels a
         press-opened menu above). Before that the pointer is still a potential
         click - tracking wiggles included - and rotating from the very first
         pixel slides the target out from under the cursor. */
      if (!inMenuHold && (Game.input.movedRight || 0) >= rightCancelAt) {
        const spin = rightDown && (rightDown.button !== 2 || Game.input.rightRotate || e.ctrlKey);
        if (spin && !Game.cayCamLock) {
          Game.yaw -= dx * 0.008;
          Game.pitch = Math.min(1.42, Math.max(0.34, Game.pitch + dy * 0.005));
        }
      }
    } else if (pointerDown) {
      Game.input.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
      /* A held left press stops being a menu candidate once it moves. */
      if (leftHoldTimer && pointerDown && pointerDown.button === 0 &&
          Math.abs(e.clientX - pointerDown.x) + Math.abs(e.clientY - pointerDown.y) > 10) {
        clearLeftHold();
      }
    }
  });

  el.addEventListener("pointerleave", () => { Game.pointer = null; });

  window.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") { touchUp(e); return; }
    noteModifiers(e);
    if (Game.input.dragging) {
      /* A deferred right press earns its menu on a clean release: the press
         opened nothing (it might have become a rotation), so a release with
         no drag behind it is a plain right click. A gesture that rotated, a
         drag that started on the menu itself, and the middle button earn
         nothing. */
      const rd = rightDown;
      const wasMenu = menuFromPress;
      Game.input.dragging = false;
      rightDown = null;
      menuFromPress = false;
      if (!wasMenu && rd && !rd.noMenu && rd.button === 2 && (Game.input.movedRight || 0) < rightCancelAt) {
        if (e.target === el && Game.hooks.onRightClickWorld) {
          const pick = Game.pickAll(e.clientX, e.clientY);
          Game.hooks.onRightClickWorld(e.clientX, e.clientY, pick);
        }
      }
      return;
    }
    if (e.button === 0 && pointerDown) {
      /* A deferred one-button press acts here, on the release: no menu fired,
         barely moved, and still over the world. Anything else - a hold that
         became a menu, a press that travelled, a release off the canvas - is
         not an action. Two-button mode never defers, so its press already
         acted above and this only clears it. */
      if (leftDefer && !leftHoldFired && (Game.input.moved || 0) <= 10 && e.target === el && pointerDown.button === 0) {
        handleClick(e.clientX, e.clientY, e);
      }
      pointerDown = null;
    }
    if (e.button === 0) {
      clearLeftHold();
      leftHoldFired = false;
      leftDefer = false;
    }
  });

  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (Game.cayCamLock) return;
    /* Write the target, not `dist` itself: `dist` is the smoothed value the
       render loop lerps towards the target every frame, so a wheel event that
       wrote `dist` directly would just be dragged back immediately. The step
       scales with the distance so zooming stays comfortable at both ends, and
       the distance is clamped at the top by the fog (CAM_MAX_DIST) so nobody
       can strand themselves out in the sky, and floored at 0 - you can still
       pull the camera all the way down onto the character. */
    const step = Math.max(0.6, Game.targetDist * 0.18);
    Game.targetDist = clampCamDist(Game.targetDist + Math.sign(e.deltaY) * step);
  }, { passive: false });

  /* The modifier map, reconciled from the event itself rather than from which
     key it was. `keys["shift"]`/`keys["ctrl"]` are the map's run-invert entry
     (see `walkTo`), and a map written only by keydown/keyup can be left lying:
     a shift whose keyup never arrives stays "down" for the rest of the session,
     and every menu walk that reads it walks while the orb reads on. Every
     keydown/keyup *and every pointer event* now writes the modifiers from its
     own `shiftKey`/`ctrlKey` flags - so a latch can never be staler than the
     player's last click, which is the only moment the map is read. `e.shiftKey`
     on a keyup is the state *after* the release, so the Shift key's own keyup
     correctly writes false. */
  const noteModifiers = (e) => {
    const k = Game.input.keys;
    k.shift = !!e.shiftKey;
    k.ctrl = !!e.ctrlKey;
  };

  window.addEventListener("keydown", (e) => {
    Game.input.keys[e.key.toLowerCase()] = true;
    noteModifiers(e);
  });
  window.addEventListener("keyup", (e) => {
    Game.input.keys[e.key.toLowerCase()] = false;
    noteModifiers(e);
  });
  /* A key whose keyup the page never receives - the tab or the window losing
     focus, or the OS swallowing it - would otherwise stay latched down for the
     rest of the session, and the map is read by real logic (a latched shift
     used to invert run for every later click). Losing focus is exactly when the
     release goes missing, so that is when the map is emptied. */
  const releaseKeys = () => { Game.input.keys = {}; };
  window.addEventListener("blur", releaseKeys);
  /* A hidden tab runs no frames while the socket keeps delivering: every state
     packet, spell graphic and one-shot pose that lands in the meantime piles up
     unseen, and without this the first visible frame replays all of it at once -
     ghosts gliding in from minutes-old tiles, a burst of stale teleports. Coming
     back drops the backlog instead: ghosts snap to the latest tile they were told
     about, latched ghost poses are cleared (live work poses re-announce within
     seconds), in-flight graphics are discarded, and the sim restarts clean. The
     overhead chat needs nothing - it runs on the wall clock, so old lines have
     already expired by the time they could be read. Local bodies get the same
     treatment (their cast/emote clocks freeze with the frames while the sim
     keeps ticking behind them, so without this every frozen pose would play out
     on return): poses are dropped, health bars unlit, and Fx splats cleared. */
  const resyncForeground = () => {
    Game.backlog = 0;
    for (const g of Game.ghosts.values()) {      g.x = g.px = g.tx;
      g.z = g.pz = g.tz;
      g.lrx = null; g.lrz = null;
      g.rdist = 0;
      g.moving = false;
      g.castLeft = 0; g.castAnim = null; g.castLoop = false; g.castTail = false; g.castClamp = false; g.castTool = null;
      g.emoteLeft = 0; g.emoteAnim = null;
      if (g.ch && Game.view) updateEntityTransform(Game.view, g, 0);
    }
    for (const e of (Game.entities || [])) {
      e.castLeft = 0; e.castAnim = null; e.castLoop = false; e.castTail = false; e.castClamp = false; e.castTool = null;
      e.emoteLeft = 0; e.emoteAnim = null;
      e.hpBarUntil = 0;
    }
    if (Gfx && Gfx.clear) Gfx.clear();
    if (Fx && Fx.clear) Fx.clear();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseKeys();
    else { Game.foldBacklog = true; resyncForeground(); }
  });
  Game.resyncForeground = resyncForeground;

  Game.pickTile = (clientX, clientY) => {
    const rect = el.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const plane = player.plane || 0;
    let ground = view.rayToGround(ndcX, ndcY);
    /* Upstairs the floor is the slab, not the terrain: the ray meets the
       slab's own plane, and a click that lands on it resolves to that tile.
       A click anywhere else - through the walls, at the sky - is dead, since
       there is nowhere up there to walk to. */
    if (plane === 1 && world.upstairs) {
      const up = world.upstairs;
      const slabY = world.heightAt(up.x0 + 0.5, up.z0 + 0.5, 1);
      const hit = view.rayToSlabPlane(ndcX, ndcY, slabY);
      if (hit && hit.x >= up.x0 && hit.x < up.x1 + 1 && hit.z >= up.z0 && hit.z < up.z1 + 1) ground = hit;
      else return null;
    }
    /* An object standing on a tile hides the ground behind it, so a click
       anywhere on a rock or a tree has to resolve to the object's own tile - that tile is what carries the Mine/Chop/Prospect/Examine options
       and what a picked spell is cast at. The two exceptions are walls and lit
       fires. A wall is never the thing a click means: it carries no verb rows,
       only an Examine, so landing on its tile just drops the walk on the wall
       and nearestWalkable defaults it inside - instead the ray sees straight
       through the wall mesh to the tile behind it, whatever that tile happens
       to be (interior ground when aimed in, street when aimed out), and the
       walk routes there honestly. Lit fires never win either: at a low camera
       angle the logs and the flame wall off the tiles behind them, and a walk
       click meant for those tiles would land on the fire's own tile instead -
       so the ray sees straight through them to the ground. (Right-click still
       lists Examine Wall / Examine Fire: the menu reads the unfiltered list,
       only this left-click/hover pick skips them.) */
    const maxD = ground ? ground.dist + 0.05 : 80;
    /* Only the clicker's own level answers: the stairs below never steal a
       click from the stairs above, and nothing downstairs does either. */
    const loc = view.rayLocs(ndcX, ndcY, maxD, true).find((h) => (h.obj.plane || 0) === plane && h.obj.t !== "fire" && h.obj.t !== "wall") || null;
    if (loc && (!ground || loc.dist <= ground.dist + 0.05)) {
      const cx = loc.tx + 0.5;
      const cz = loc.tz + 0.5;
      return { tx: loc.tx, tz: loc.tz, point: { x: cx, y: world.heightAt(cx, cz, plane), z: cz, dist: loc.dist }, obj: loc.obj };
    }
    if (!ground) return null;
    const tx = Math.floor(ground.x);
    const tz = Math.floor(ground.z);
    if (!world.inBounds(tx, tz)) return null;
    return { tx, tz, point: ground };
  };

  /* Which creatures' *models* are under the cursor, and which of them is
     nearest. Two stages:

     1. The ray is tested against each character's own mesh, so a click on a
        limb or a tail counts even though the model is not a box. A
        triangle-accurate test alone makes the clickable area exactly the
        silhouette though, so a click that lands between a chicken's legs or in
        the gap under a cow does nothing at all.
     2. So each creature also gets a click *box* - the model's own bounding box,
        taken from the bake's `bounds`, rotated by the body's facing and tested
        with a slab clip. That is what the client itself picks with (its
        `getModelAtMouse` tests the model's projected box, not its triangles),
        and it is the box that makes a whole creature clickable.

     The box is the model's real extent, *not* the geometry's bounding sphere:
     that sphere has to cover the biggest animated pose a model can reach (a
     spell burst scales itself 10x), which is several times the creature, and
     because it is centred on the feet the old sphere test ended up with its
     centre half a body *above* the model - a rat's clickbox sat 0.32 tiles up
     with a 0.7-tile radius, so its real, 0.1-tile-tall body could not be
     clicked where it was drawn. */
  const ndc = new THREE.Vector2();
  const pickRay = new THREE.Raycaster();
  const pickAllFrom = (clientX, clientY, list) => {
    const found = [];
    if (!list || !list.length) return found;
    const rect = el.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    pickRay.setFromCamera(ndc, view.camera);
    /* A body culled by the tile stack is not drawn, but it is still standing
       there and is still offered: the hover text and the menu name it, and a
       left click walks to it or talks to it, exactly as if it were visible (the
       user's ask - *"youre culling their visibility but not their npc tag from
       the rightclick menu"*). `e.stackHidden` is the one flag that says the
       invisibility is only about the drawing; every other kind of invisible
       body stays unpickable. */
    const pickable = (e, ch) => !!(ch && ch.group && (ch.group.visible || e.stackHidden));
    const meshes = [];
    for (const e of list) {
      const ch = e.ch;
      const pm = ch && (ch.mesh || ch.plane);
      if (!ch || !pm || !pickable(e, ch)) continue;
      if (e.dead || e.corpse) continue;
      meshes.push(pm);
      if (ch.pickProxies) for (const p of ch.pickProxies) meshes.push(p);
    }
    /* One hit per creature is all any caller needs: which limb, or how far
       along that limb, is not a thing a menu row can use. */
    const best = new Map();
    if (meshes.length) {
      for (const h of pickRay.intersectObjects(meshes, false)) {
        const e = h.object.userData._ent;
        if (!e) continue;
        if (!best.has(e) || h.distance < best.get(e)) best.set(e, h.distance);
      }
    }
    for (const [ent, dist] of best) found.push({ ent, dist });
    found.sort((a, b) => a.dist - b.dist);
    return found;
  };
  /* The nearest of a list, which is all a left click or the hover text needs. */
  const pickFrom = (clientX, clientY, list) => {
    const a = pickAllFrom(clientX, clientY, list);
    return a.length ? a[0].ent : null;
  };
  Game.pickFrom = pickFrom;
  Game.reviewHeadgear = (opts) => runHeadgearReview(Game.view, opts || {});
  Game.openHeadgearReview = (startHelm) => openHeadgearReview(Game.view, startHelm);
  /* How long a recently-hovered creature still counts as the click's target, and
     how far its live anchor may sit from the press (see the (c) step in
     `forgivePick`). Short on purpose: a longer memory starts winning clicks the
     cursor has genuinely moved on from. */
  const CLICK_GRACE_MS = 150;
  const CLICK_GRACE_PX = 40;
  /* Miss recovery shared by the left-click and right-click paths (see
     Game.pickAll): the camera pans under the cursor while the player walks,
     and the target interpolates tile to tile, so a press a pixel off a narrow
     silhouette must not silently become a walk (left) or a bare "Walk here"
     menu (right). The first two fallbacks run only when the direct test found
     no creature at all, and all three reuse its pickability (no corpses, no
     hidden bodies):
     (a) same-tile - a creature drawn on the ground tile the ray reached is
     taken (a click between a chicken's legs is still a click on the chicken);
     (b) screen-near - otherwise the nearest creature within 14 screen pixels
     of the press is taken, so a one-frame offset on a fast mover still names
     it. Either way a direct hit keeps its place: these append. */
  const forgivePick = (clientX, clientY, rect, ground, npcs, players) => {
    if (npcs.length || players.length) return;
    /* Only the clicker's own level forgives: a keeper on the floor below is
       not standing on the upstairs tile above them. */
    const plane = player.plane || 0;
    const sameTile = (e) => {
      if ((e.plane || 0) !== plane) return false;
      const ch = e.ch;
      const pm = ch && (ch.mesh || ch.plane);
      if (!pm || !(ch.group.visible || e.stackHidden) || e.dead || e.corpse) return false;
      const r = renderPos(e);
      return ground && Math.floor(r.x) === ground.tx && Math.floor(r.z) === ground.tz;
    };
    for (const e of Game.npcs) if (sameTile(e)) npcs.push({ ent: e, dist: 1e9 });
    if (Game.ghosts && Game.ghosts.size) {
      for (const e of [...Game.ghosts.values()]) if (sameTile(e)) players.push({ ent: e, dist: 1e9 });
    }
    if (npcs.length || players.length) return;
    const wpx = rect.width, hpx = rect.height;
    const px = clientX - rect.left, py = clientY - rect.top;
    const v = new THREE.Vector3();
    let best = null, bestD = 14;
    const consider = (e, list) => {
      if ((e.plane || 0) !== plane) return;
      const ch = e.ch;
      const pm = ch && (ch.mesh || ch.plane);
      if (!pm || !(ch.group.visible || e.stackHidden) || e.dead || e.corpse) return;
      const g = ch.group.position;
      for (const yo of [0, 1.5]) {
        v.set(g.x, g.y + yo, g.z).project(view.camera);
        if (v.z > 1) continue;
        const d = Math.hypot((v.x * 0.5 + 0.5) * wpx - px, (-v.y * 0.5 + 0.5) * hpx - py);
        if (d < bestD) { bestD = d; best = { e, list }; }
      }
    };
    for (const e of Game.npcs) consider(e, npcs);
    if (Game.ghosts && Game.ghosts.size) for (const e of [...Game.ghosts.values()]) consider(e, players);
    if (best) best.list.push({ ent: best.e, dist: 1e9 });
    /* (c) click grace - the cursor's own time memory. Whatever the hover held
       within the last CLICK_GRACE_MS still counts if its live-projected anchor
       is within CLICK_GRACE_PX of the press: the press beat the ray by a frame
       while the target ran on. Runs only when everything above found nothing,
       so a direct hit always keeps its place. Invalidated when the memory is
       stale, dead, gone from the world, or has run out of the grace radius -
       and it never fires for a target the cursor never held. */
    if (!npcs.length && !players.length) {
      const mem = Game.hoverMemory;
      const e = mem && mem.ent;
      if (e && (e.plane || 0) === plane && performance.now() - mem.t < CLICK_GRACE_MS && !e.dead && !e.corpse) {
        const alive = Game.npcs.includes(e) ? npcs
          : (Game.ghosts && [...Game.ghosts.values()].includes(e)) ? players : null;
        if (alive) {
          const ch = e.ch;
          const pm = ch && (ch.mesh || ch.plane);
          if (pm && (ch.group.visible || e.stackHidden) && Game.distToEnt
            && Game.distToEnt(e, clientX, clientY) < CLICK_GRACE_PX) {
            alive.push({ ent: e, dist: 1e9 });
          }
        }
      }
    }
  };
  /* Screen-space anchors for hover hysteresis (see ui.js#updateWorldHover). The
     hover label is display-only - clicks always re-pick at press time - so the
     label may lag the ray by a few pixels to stop it flickering between two
     neighbours while the camera pans under a running player. Both project the
     target's anchor through the camera and answer in CSS pixels (Infinity when
     behind the camera); one scratch vector serves, since each caller reads the
     number out before asking again. */
  const projScratch = new THREE.Vector3();
  const screenDist = (wx, wy, wz, clientX, clientY) => {
    const rect = el.getBoundingClientRect();
    projScratch.set(wx, wy, wz).project(view.camera);
    if (projScratch.z > 1) return Infinity;
    return Math.hypot(
      (projScratch.x * 0.5 + 0.5) * rect.width - (clientX - rect.left),
      (-projScratch.y * 0.5 + 0.5) * rect.height - (clientY - rect.top));
  };
  Game.distToEnt = (e, clientX, clientY) => {
    const ch = e && e.ch;
    const g = ch && ch.group && ch.group.position;
    if (!g) return Infinity;
    const r = renderPos(e, _rpScratch);
    return screenDist(r.x, g.y + 1, r.z, clientX, clientY);
  };
  Game.distToTile = (tx, tz, clientX, clientY) => {
    const cx = tx + 0.5, cz = tz + 0.5;
    return screenDist(cx, world.heightAt(cx, cz) + 0.75, cz, clientX, clientY);
  };
  Game.pickEntity = (clientX, clientY) => {    const plane = player.plane || 0;
    const samePlane = (e) => (e.plane || 0) === plane;
    const npcs = pickAllFrom(clientX, clientY, Game.npcs).filter((h) => samePlane(h.ent));
    const players = Game.ghosts && Game.ghosts.size ? pickAllFrom(clientX, clientY, [...Game.ghosts.values()]).filter((h) => samePlane(h.ent)) : [];
    /* The left click gets the same miss recovery as the right-click menu, so
       a press a pixel off the mesh still lands on the creature. */
    const rect = el.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    let floorHit = view.rayToGround(ndcX, ndcY);
    if (plane === 1 && world.upstairs) {
      const up = world.upstairs;
      const slabY = world.heightAt(up.x0 + 0.5, up.z0 + 0.5, 1);
      const hit = view.rayToSlabPlane(ndcX, ndcY, slabY);
      if (hit && hit.x >= up.x0 && hit.x < up.x1 + 1 && hit.z >= up.z0 && hit.z < up.z1 + 1) floorHit = hit;
      else floorHit = null;
    }
    const ftx = floorHit ? Math.floor(floorHit.x) : null;
    const ftz = floorHit ? Math.floor(floorHit.z) : null;
    const ground = floorHit && world.inBounds(ftx, ftz) ? { tx: ftx, tz: ftz } : null;
    forgivePick(clientX, clientY, rect, ground, npcs, players);
    if (!players.length) return npcs.length ? npcs[0].ent : null;
    if (!npcs.length) return players[0].ent;
    return players[0].dist < npcs[0].dist ? players[0].ent : npcs[0].ent;
  };
  /* Everything under the cursor, for the right-click menu (actions.js
     `worldMenuOptions`). Picking a single thing is the wrong shape for a menu:
     the client stacks *everything* the cursor is over into one list, which is
     why a banker standing behind a bank booth offers "Talk-to Banker" beside
     the booth's own rows.

       * `locs`    - every object whose tile box the ray enters, nearest first
                     (src/scene.js#rayLocs). A convex box projects to exactly
                     those pixels whose rays meet it, so this is the set of
                     objects drawn under the cursor, and it is the set the
                     client's own projected-box scan collects.
       * `npcs`    - the creatures under the cursor, nearest first, and
       * `players` - the other players under the cursor. Ghosts are entities
                     with a real body and a real click box (src/game.js#addGhost)
                     and are simply not in `npcs`, which is what keeps the sim
                     from treating them as targets.
       * `ground`  - the ground tile the ray reaches: where the cursor points as
                     far as the floor is concerned. Out of bounds is dropped
                     rather than clamped, since a ray that sails past the world's
                     edge has no tile to walk to.
       * `primary` - the one tile the click is *on*, read the way handleClick
                     reads it: the creature (then a player), then the object, then
                     the floor. It carries the ground items and the "Walk here"
                     row, so a click on a single thing behaves exactly as it did.

     One deliberate omission. An open door's box is the whole doorway, however
     far the leaf has swung clear of it, so a ray that merely passes *through*
     the opening - looking into the bank from outside, say - would stack the
     door's Open/Close rows onto whatever the cursor is really over. A swung door
     is kept only when the cursor's ground tile is the doorway itself, i.e. when
     the click really is aimed at the opening. */
  Game.pickAll = (clientX, clientY) => {
    const rect = el.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const plane = player.plane || 0;
    let floorHit = view.rayToGround(ndcX, ndcY);
    if (plane === 1 && world.upstairs) {
      const up = world.upstairs;
      const slabY = world.heightAt(up.x0 + 0.5, up.z0 + 0.5, 1);
      const hit = view.rayToSlabPlane(ndcX, ndcY, slabY);
      if (hit && hit.x >= up.x0 && hit.x < up.x1 + 1 && hit.z >= up.z0 && hit.z < up.z1 + 1) floorHit = hit;
      else floorHit = null;
    }
    const ftx = floorHit ? Math.floor(floorHit.x) : null;
    const ftz = floorHit ? Math.floor(floorHit.z) : null;
    const ground = floorHit && world.inBounds(ftx, ftz) ? { tx: ftx, tz: ftz, dist: floorHit.dist } : null;
    const samePlane = (e) => (e.plane || 0) === plane;
    const npcs = pickAllFrom(clientX, clientY, Game.npcs).filter((h) => samePlane(h.ent));
    const players = Game.ghosts.size ? pickAllFrom(clientX, clientY, [...Game.ghosts.values()]).filter((h) => samePlane(h.ent)) : [];
    /* Miss recovery shared with the left click (see forgivePick above). */
    forgivePick(clientX, clientY, rect, ground, npcs, players);
    const locs = view.rayLocs(ndcX, ndcY, floorHit ? floorHit.dist + 0.05 : 80, true)
      .filter((h) => (h.obj.plane || 0) === plane)
      .filter((h) => !(h.obj.t === "door" && h.obj.open && (!ground || h.tx !== ground.tx || h.tz !== ground.tz)));
    const first = npcs[0] || players[0];
    const primary = first ? { tx: Math.floor(first.ent.x), tz: Math.floor(first.ent.z) }
      : locs.length ? { tx: locs[0].tx, tz: locs[0].tz }
      : ground;
    return { locs, npcs, players, ground, primary };
  };

  Game.handleClick = handleClick;

  function handleClick(clientX, clientY, mods) {
    /* The dead click nothing: no walks, no attacks, no interactions until the
       respawn puts the body back on its feet. */
    if (player.dying) return;
    let npc = Game.pickEntity(clientX, clientY);
    const hit = Game.pickTile(clientX, clientY);
    /* The ray's own creature pick, without the miss recovery: a body the ray
       met is in front, and Use mode lets it keep the click no matter what is
       in the hand (see src/actions.js#useOnWorld). Stashed for the tile
       handler, which has no ray of its own. */
    Game.clickDirect = pickFrom(clientX, clientY, Game.npcs);
    if (npc && hit && hit.obj && Game.hooks.aimPreferScenery && Game.hooks.aimPreferScenery(npc, hit.obj, npc === Game.clickDirect)) npc = null;
    /* Above the horizon the ray found neither a creature nor a tile: either
       the scenery up there is examined, or the click is dead (see
       src/actions.js#skyClick) - there is nothing to walk to. */
    if (!hit && !npc) {
      if (Game.hooks.onClickSky && Game.hooks.onClickSky(clientX, clientY)) return;
      return;
    }
    /* A click on the world is the player asking to move or act, and it ends
       whatever they were looking at - the shop window closes and a conversation
       in the chatbox is torn down (see src/ui.js#closeOnWalk, which is what the
       ui installs here). It runs before the click is routed, so the interface is
       already gone by the time the walk or the interaction answers. */
    if (Game.hooks.onMoveCommand) Game.hooks.onMoveCommand();
    /* Any click the player makes on the world ends a follow: the client's
       Follow is a standing instruction to chase somebody, and clicking
       anywhere else cancels it (src/game.js#followPlayer) - faceEnt with
       it, or the body would keep facing the old leader after walking away.
       A click ON the followed leader themselves is the exception: sharing
       their tile (or misclicking them point-blank) must not end it, and the
       click still walks toward them underneath. */
    const clickedLeader = npc && npc.kind === "ghost" && Game.follow && Game.follow.id != null && npc.id === Game.follow.id;
    if (!clickedLeader) stopFollowing();
    const tx = npc ? Math.floor(npc.x) : hit.tx;
    const tz = npc ? Math.floor(npc.z) : hit.tz;
    /* The click cross is a screen overlay (Fx), not something painted on the
       ground - see src/fx.js - and it is drawn at the cursor, exactly where the
       mouse came up. It is not the tile the click resolved to and not a point
       on the ground: a click on a wall has to leave the cross on the wall, and
       a creature's click box is wider than its tile, so snapping it anywhere
       moves the cross out from under the cursor. Its colour is what the click
       resolved to: red for attacking, picking up, or any object interaction,
       yellow for a plain walk. */
    /* The creature the ray actually picked is handed to the tile handler as
       well as its tile: the tile alone cannot say *which* creature was clicked
       when two of them have moved close together, and resolving the tile a
       second time here (once by ray, once by tile centre) is what used to let
       a click land on a different cow than the one under the cursor. The same
       goes for the *object*: `hit.obj` is the loc whose model the ray met (see
       view.rayLoc), and null when the cursor was over the ground of a footprint
       tile whose model it missed - handing that through is what makes a tap on
       the grass beside a trunk walk instead of chopping (src/actions.js#
       onClickTile). */
    const colour = Game.hooks.onClickTile ? Game.hooks.onClickTile(tx, tz, npc, hit && hit.obj ? hit.obj : null) : false;
    if (colour) {
      Fx.setMarkerScreen(clientX, clientY, colour);
      return;
    }
    if (!hit) return;
    const wplane = player.plane || 0;
    const dest = world.isWalkable(hit.tx, hit.tz, wplane) ? { x: hit.tx, z: hit.tz } : nearestWalkable(world, hit.tx, hit.tz, 14, null, wplane);
    if (!dest) return;
    Fx.setMarkerScreen(clientX, clientY, MARK_WALK);
    if (walkTo(player, world, dest.x, dest.z, 0, mods)) view.setDest(player.destX, player.destZ);
  }

  /* Trail another player until standing beside them - the client's Follow to
     the wiki spec. Called from the tick, never from a frame: a follow that
     ran while the sim was paused would move the player behind an open
     interface's back. */
  function tickFollow() {
    let g = Game.follow;
    /* Re-key a stale leader by id: a reconnect rebuilds ghost objects, so the
       live one is resolved every tick instead of chasing a dead object's
       frozen tiles - which also ends follows the world has genuinely lost.
       The menu compares by id for the same reason. */
    if (g && g.id != null) {
      const live = Game.ghosts.get(g.id);
      if (!live) { stopFollowing(); if (player) player.runClick = null; return; }
      if (live !== g) { g = Game.follow = live; if (player) player.faceEnt = live; }
    }
    /* A leader on the other level cannot be followed there: the stairs are a
       click, not a chase, so the follow ends instead of parking underneath. */
    if ((g.plane || 0) !== (player.plane || 0)) { stopFollowing(); if (player) player.runClick = null; return; }
    /* NPC-style facing for the whole follow: re-pinned every tick, so the
       follower turns constantly toward the leader exactly the way a creature
       turns toward its victim (stepSim + desiredYawOf read faceEnt, and
       stepEntity leaves a faced body's dir to them). */
    if (player.faceEnt !== g) player.faceEnt = g;
    const tx = Math.floor(g.x);
    const tz = Math.floor(g.z);
    const px = Math.floor(player.x);
    const pz = Math.floor(player.z);
    const key = tx + "," + tz;
    const dist = Math.max(Math.abs(px - tx), Math.abs(pz - tz));
    /* Arrive only beside a STATIONARY leader. A moving leader is chased even
       from adjacent tiles, so the follower never sits down while the leader
       runs past - it keeps catching up to their tile every tick. Standing on
       the ring of a moving leader plans a no-op step (walkTo's goal is
       already met), which stepEntity consumes without moving. */
    if (dist <= 1 && !g.moving) {
      /* Beside them: stop where you are and turn to face them. The route is
         dropped rather than left to finish, because the tile it was walking to
         is theirs and the follow has already arrived - the walker would
         otherwise take one more step and jostle into the space they are
         occupying, which reads as a walk that overshot.

         `player.moving` is deliberately *not* cleared here - and this is the
         whole of the "my legs stop for the last step of a follow" bug. The
         plan runs before `stepEntity` in the same tick, so clearing the path
         is enough on its own: stepEntity finds no route, moves nothing and
         sets the flag false itself, while the step taken on the tick before
         has already finished being walked. The melee chase
         (src/combat.js#chaseTarget) has always worked this way; the follow was
         the one place that shoved the flag down mid-step. */
      if (player.path && player.path.length) player.path.length = 0;
      player.dir = Math.atan2(g.x - player.x, g.z - player.z);
      if (view.dest) view.clearDest();
      g.followTile = key;
      return;
    }
    /* A stale route is dropped the moment the leader leaves its tile: the
       re-plan below runs even mid-path, so the follower tracks the leader
       tile-for-tile instead of finishing a walk to where they were and only
       then starting after where they are. A leader standing still costs one
       string comparison per tick. */
    if (g.followTile === key && (player.path.length || player.moving)) return;
    g.followTile = key;
    /* A route that cannot be planned is not re-planned on the very next tick:
       the target has walked somewhere unreachable (a shut room, the far side
       of water), and a full pathfind every tick is both wasted work and a
       jittery destination flag. The follower stands its ground, facing the
       target, and tries again a few ticks later - which is also what the wait
       looks like in the client. */
    if (g.followFailCd > 0) {
      g.followFailCd--;
      player.dir = Math.atan2(g.x - player.x, g.z - player.z);
      return;
    }
    if (walkTo(player, world, tx, tz, 1, NO_MODS, false, { adjacent: true })) {
      if (view.dest) view.setDest(player.destX, player.destZ);
      /* Run mirrors the leader through the run orb (RS Wiki "Follow"): a
         running leader pulls a run-on follower into a run, a walking leader
         is trailed at a walk, and a run-off follower always walks - even when
         left behind. A run-on follower past arm's reach sprints even when the
         leader walks, so the chase never degrades to a walk a tile behind a
         runner. Toggling the orb never cancels the
         follow. `runClick` is the per-walk override (see walkTo): setting it
         after the plan keeps it for exactly this chase, the arrival branch
         stops planning so stepSim clears it the tick the walk ends, and the
         energy gate and drain below treat it like any other run. No range
         limit: the follow keeps planning at any distance until cancelled. */
      if (player.ps) player.runClick = (player.ps.runEnabled && (g.gaitRun || dist > 1)) ? true : null;
    } else {
      g.followFailCd = 3;
      player.dir = Math.atan2(g.x - player.x, g.z - player.z);
      if (view.dest) view.clearDest();
    }
  }

  Game.cameraTarget = new THREE.Vector3(player.x, 0, player.z);

  let last = performance.now();
  let frames = 0;
  let fpsAcc = 0;

  /* The sim's single source of truth is the wall clock, not the frame rate.
     requestAnimationFrame stops entirely in a background tab (and hitches
     anywhere), which used to stall damage, shortcuts and everything else on
     the tick until the tab came back. Both drivers below - the frame loop
     and the 1s background interval - funnel through here, and each claims
     only the time since the sim last ran, so they can never double-count:
     visible tabs advance on rAF, hidden ones on the interval (at the ~1s
     granularity browsers allow background timers), and a returning tab finds
     the world where wall-clock time says it should be rather than where the
     frames left it. Ticks beyond MAX_DEBT_S (2h) are folded into Game.time
     instead of stepped, so a days-long absence cannot hang the tab. */
  let lastSimSec = 0;
  const RENDER_STEPS = 5;
  const BULK_STEPS = 200;
  const MAX_DEBT_S = 7200;
  /* A tab that was hidden long enough for the browser to throttle its timers
     comes back owing minutes of sim, and stepping all of it would freeze the
     page for seconds per minute owed (205 full world ticks in a single frame
     costs ~2.5s). Nobody watched those minutes, so on a tab return anything
     past a few seconds is folded into Game.time instead of stepped - the same
     rule as MAX_DEBT_S above, at a scale where the clocks stay true but the
     page never freezes. Short hitches step through exactly as before. */
  const FOLD_AFTER_S = 9;
  function advanceSim(nowSec) {
    if (Game.paused) { lastSimSec = nowSec; return; }
    if (!lastSimSec) lastSimSec = nowSec;
    let delta = nowSec - lastSimSec;
    lastSimSec = nowSec;
    if (!(delta > 0)) return;
    if (Game.foldBacklog) {
      Game.foldBacklog = false;
      const owed = delta + Game.backlog;
      if (owed > FOLD_AFTER_S) {
        Game.time += owed - FOLD_AFTER_S;
        Game.backlog = 0;
        delta = FOLD_AFTER_S;
      }
    }
    if (delta > MAX_DEBT_S) {
      Game.time += delta - MAX_DEBT_S;
      delta = MAX_DEBT_S;
    }
    Game.backlog += delta;
    let steps = 0;
    while (Game.backlog >= TICK_S && steps < RENDER_STEPS + BULK_STEPS) {
      Game.backlog -= TICK_S;
      steps++;
      Game.tickCount++;
      stepSim(TICK_S);
    }
  }
  setInterval(() => {
    if (!document.hidden || Game.paused) return;
    try { advanceSim(performance.now() / 1000); } catch (e) {}
  }, 1000);

  function frame(now) {
    /* The render clock stays clamped - a hitch must never teleport the
       camera - but the SIM runs on the raw wall clock (advanceSim below):
       tabbing out, a hitch, or a throttled preview must stall neither damage
       nor shortcuts. */
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    Game.frameCount++;
    frames++;
    fpsAcc += dt;
    if (fpsAcc > 0.5) {
      Game.fps = frames / fpsAcc;
      frames = 0;
      fpsAcc = 0;
    }
    /* A pre-game screen - the welcome screen, the character-design screen, the
       name step - covers the frame with an opaque interface and marks the frame
       root with `titleup` (src/titlescreen.js#show, src/design.js#show,
       src/charname.js#show). Nothing behind that cover can be seen, so nothing
       behind it is drawn: the per-frame skinning pass and the world's own draw
       are skipped for as long as it is up, which is the whole of the frame's
       GPU cost on a screen the player is only reading.

       Three things deliberately keep running through it:
         * the **simulation** ticks, so the world is exactly where it was going
           to be when the player walks in (a creature mid-wander does not freeze
           and then teleport);
         * **hooks.onFrame** - the socket, the presence heartbeat and the other
           players' ghosts all ride that hook, and a player sitting on the
           welcome screen must not fall off the world server;
         * **hooks.beforeRender**, which paints into its own backing store (the
           design screen's swaying preview, the worn-equipment paper-doll) and is
           the one thing on these screens that has to animate. */
    const covered = !!(Frame.root && Frame.root.classList.contains("titleup")) && !Frame.showWorld;
    if (!Game.paused) {
      /* Wall-clock truth: whoever drives - this frame or the background
         interval below - claims only the time since the sim last ran, so the
         two can never double-count and the sim can never stall. */
      advanceSim(now / 1000);
      Game.tickProgress = Math.min(1, Math.max(0, Game.backlog / TICK_S));
      if (!covered) {
        updateVisuals(dt);
        Gfx.update(dt);
        StatueSwirl.tick(dt);
        Fx.update();
      }
      if (Game.hooks.onFrame) Game.hooks.onFrame(dt);
    }
    /* anything that has to paint into the frame's own backing store before the
       world view is drawn over it (the worn-equipment paper-doll) */
    if (Game.hooks.beforeRender) Game.hooks.beforeRender();
    if (!covered) {
      view.render();
      Fx.render(view.camera, Game.entities, Game.cameraTarget);
    }
    requestAnimationFrame(frame);
  }

  function stepSim(dt) {
    Game.time += dt;
    /* Nothing to apply here for prayers: a click takes effect the instant it is
       made (src/prayer.js#togglePrayer), so the set every blow and swing reads
       is already the player's own. The only piece of praying left on the tick is
       the drain, which src/combat.js#tickCombat runs. */
    const agi = ps.skills.agility.level;

    /* The follow plans FIRST, so its route and runClick feed this same tick's
       gait and steps: planning after stepEntity delayed every re-plan a full
       tick, which read as the follower starting everything - a new chase, the
       run itself - one beat late. Skipped while stunned: walkTo refuses a
       stunned planner, and the fail wait would burn down for nothing. */
    if (Game.follow && !(ps.stunTicks > 0)) tickFollow();

    /* Run mode: the run orb's toggle is the norm, and a shift/ctrl click
       overrides it for that one destination (see walkTo). Run cannot be used at
       all below 1% energy, and switches itself off when it hits zero - the real
       rules, in src/run.js. */
    const wantRun = player.runClick == null ? !!ps.runEnabled : !!player.runClick;
    player.running = wantRun && ps.runEnergy >= RUN_ON_THRESHOLD;

    /* A failed pickpocket roots the player to the spot for the published nine
       ticks (src/items.js#PICKPOCKET_STUN_MOVE). While the stun runs the route
       is thrown away every tick and no step is taken, so the click that landed
       with the stun cannot walk you off; the shorter eight-tick lock-out on the
       act itself counts down here too. See src/actions.js#stunPlayer. */
    const stunned = ps.stunTicks > 0;
    if (stunned) {
      ps.stunTicks = Math.max(0, ps.stunTicks - 1);
      if (player.path && player.path.length) player.path.length = 0;
      player.runClick = null;
      player.moving = false;
      if (view.dest) view.clearDest();
    }
    if (ps.pickpocketCd > 0) ps.pickpocketCd -= 1;
    /* The food's own cooldown ("eat delay"): three ticks for standard food,
       one for the first slice of a pizza or apple pie, two for a half. It rides
       the same tick as the stun because both are "clicks you may not make yet".
       src/items.js#FOOD_BITES carries the per-food number. */
    if (ps.eatCd > 0) ps.eatCd -= 1;
    if (ps.emoteLockTicks > 0) ps.emoteLockTicks -= 1;
    /* A leap in progress (src/actions.js#leapTo) lasts exactly one tick: the
       arc is drawn across the step the leap made, so the countdown happens here,
       before anything else touches the player, and the frame that follows this
       tick is the last one that lifts them off the ground. */
    if (player.airT > 0) player.airT -= 1;

    /* Nothing opens a door here any more. A door is strictly a toggle (the
       user's rule, standing preference P3), so no route can
       cross a shut leaf in the first place - a shut door is a wall to
       `pathfind.js#findPath` for the player exactly as it is for a creature -
       and the click on the leaf is the only thing that swings it. */

    const before = { x: player.x, z: player.z };
    /* Stepping out from under a victim faces it for the whole walk, and so does
       a chase (src/combat.js sets it on the click and every tick after): aimed
       before the steps so the turn starts at once, and re-aimed after them so
       the body strafes looking at the target all the way round. It is cleared
       only here for a dead victim and in combat's target setter for every
       ended fight - never for distance, or the walk-in would keep dropping
       back to facing its feet between ticks. */
    if (player.faceEnt && !player.faceEnt.dead) {
      player.dir = Math.atan2(npcDrawCX(player.faceEnt) - player.x, npcDrawCZ(player.faceEnt) - player.z);
    }
    const steps = stunned ? 0 : stepEntity(player, player.running ? 2 : 1);
    if (player.faceEnt) {
      const f = player.faceEnt;
      if (f.dead || f.corpse) player.faceEnt = null;
      else player.dir = Math.atan2(npcDrawCX(f) - player.x, npcDrawCZ(f) - player.z);
    }

    /* The gait the *animation* plays follows the ground actually covered, not
       the run orb. Running to a destination that is one tile away - or the last
       tile of a long route, where only one step is left - covers a single tile,
       and the client walks that tile: the run orb only makes a step a run when
       the step really took two. The locomotion clock is advanced by distance
       covered (see models3d.js#update), so playing the run cycle for a 1-tile
       step would advance it by half, and the character would visibly run on the
       spot in slow motion. This is the same rule the energy drain below uses. */
    player.gaitRun = player.running && steps > 1;

    /* A tick that moved nothing while a route is still queued and the player is
       neither moving nor at the destination is a stale plan - the world changed
       under it (an entity was moved, terrain was edited) - so it is planned
       again rather than left to sit. Characters are walk-through as of
       2026-09-20, so a body in the way no longer produces this state on its
       own; this is the general safety net for any other way a route can go
       stale. Only such a tick pays for it (a few ms), and `keepRunOverride`
       carries the click's own run override across the
       re-plan. */
    if (steps === 0 && player.moving === false && (player.path || []).length > 0 && player.destX != null) {
      if (walkTo(player, world, player.destX, player.destZ, 0, null, true) && view.dest) {
        view.setDest(player.destX, player.destZ);
      }
    }

    /* The follow planned at the top of this tick (see above); nothing to do
       here but spend what it planned. */

    /* Energy only drains on a tick the player actually *ran*: walking a single
       tile to your destination costs nothing, even with run switched on. */
    if (player.running && steps > 1) {
      ps.runEnergy = Math.max(0, ps.runEnergy - runDrainPerTick(totalWeight(ps), agi));
      if (ps.runEnergy <= 0) { ps.runEnabled = false; player.runClick = null; }
    } else {
      ps.runEnergy = Math.min(RUN_UNITS, ps.runEnergy + runRegenPerTick(agi) * energyRecoveryFactor(ps));
    }
    player.actionAnim = Math.max(0, (player.actionAnim || 0) - dt * 3);
    /* the casting pose runs for exactly as long as its sequence does (the
       model module latches the one-shot from this flag, so clearing it at the
       end of the sequence rather than on a fixed timer never cuts a cast
       short) - see playCastAnim */
    tickCastAnim(player, dt);
    ps.x = player.x;
    ps.z = player.z;
    if (before.x !== player.x || before.z !== player.z) ps.lastMoveTick = Game.tickCount;

    /* The per-click run override (a shift-click inverting the toggle) lives
       exactly as long as its own walk: the moment the walk is over - no route
       left, not merely a blocked tick with the route still queued - it is
       dropped. It must not outlive the walk: a leaked `false` silently pins run
       off for good, because `wantRun` above reads the override instead of the
       run-orb toggle whenever it is not null. That leak is what made the run
       orb look broken. */
    if (!player.moving && !(player.path && player.path.length)) player.runClick = null;
    /* the walk is over once there is no path left - drop the tile highlight, the
       destination flag and the minimap flag together. A blocked tick is not the
       end of the walk, so the route must be empty as well, or the flag would
       flicker out mid-walk whenever someone stepped in the way. */
    if (view.dest && !player.moving && !(player.path && player.path.length)) view.clearDest();

    updateNpcs(dt);

    if (Game.hooks.onTick) Game.hooks.onTick(dt);
  }

  function updateVisuals(dt) {
    const k = Game.input.keys;
    /* The camera is the arrows only. It used to answer to q/e (turn) and w/s
       (pitch) as well, but every printable key now starts a chat line
       (ui.js#initUI), and a letter cannot both turn the camera and be the
       first letter of a message - so the letters belong to the chatbox and the
       arrows (which always did the same four things) keep the camera.

       The four keys slide the *world* in the direction pressed. So the left
       arrow slides the ground left, which is the view turning right and yaw
       *decreasing*; and the up arrow slides the ground up, which is pitch
       increasing towards the top-down view. These are the user's own
       directions, reported twice ("the camera controls are still completely
       inverted", then "the camera controls for the nav arrows are still
       inverted"); both signs were the other way round until then, and the user
       then confirmed this half is right ("ok so you have the nav arrows
       correct"). The mouse drag is deliberately the MIRROR of these four (it
       swings the view rather than the ground) - see the long note in the
       pointermove handler, which is the single place that pair is described. */
    let rotSpeed = 0;
    if (k["arrowleft"]) rotSpeed = -1;
    if (k["arrowright"]) rotSpeed = 1;
    if (rotSpeed && !Game.cayCamLock) Game.yaw += rotSpeed * dt * 1.6;
    else if (Frame.root.classList.contains("titleup")) Game.yaw += dt * 0.07;
    if (!Game.cayCamLock && (k["arrowup"] || k["arrowdown"])) {
      /* Ctrl turns the up/down arrows into the zoom: same step as the wheel
         (see the wheel handler), applied smoothly while held. Without Ctrl
         they keep their signed-off pitch behaviour. */
      const dir = k["arrowup"] ? -1 : 1;
      if (k.ctrl) {
        const step = Math.max(0.6, Game.targetDist * 0.18);
        Game.targetDist = clampCamDist(Game.targetDist + dir * step * Math.min(1, dt * 3));
      } else if (k["arrowup"]) Game.pitch = Math.min(1.42, Game.pitch + dt * 0.6);
      else Game.pitch = Math.max(0.34, Game.pitch - dt * 0.6);
    }

    const camX = Game.cameraTarget.x, camZ = Game.cameraTarget.z;
    /* --------------------------------------------------------- tile stacking

       A character body that a higher-ranked body is drawn on top of is not
       drawn. The client has no collision between characters (see `isPlayerBody`
       above: two player bodies never block each other, which is what lets a
       crowd share a bank tile), but it does draw the bodies on a tile over one
       another and the later one completely covers the earlier - so on the screen
       a tile with two players on it shows one body, and a player standing on
       another player's tile hides them. This re-creates that: one winner per
       tile, and the losers are not drawn at all. The local player always wins
       its own tile ("only your character sprite ... takes precedent", the user's
       rule), then the other players by their network id, then the world's own
       creatures by sequence - see `bodyStackRank`, which also explains why the
       order is stable. Bodies are ordered by their *drawn* position
       (`renderPos`), the same point `updateEntityTransform` puts the model at
       this frame.

       **This is every character body, not just the players.** It began as
       players only, and the user's report of 2026-09-22 is why it does not end
       there: creatures are walk-through, so a player can walk *onto* a
       creature's tile ("you need to be able to stand underneath npcs"), and two
       bodies drawn at exactly the same point in a depth-buffered scene do not
       overlap cleanly - they z-fight. The vision check of the reported case
       found the player's and the skeleton's limbs chopped into each other in an
       unreadable patchwork, which is what prompted this. One body per tile is
       also what the *client* shows (its scene draws a tile's actors over one
       another, and exactly-coincident ones are the same picture with a clean
       edge).

       **Timing (the user's two follow-ups, both 2026-09-22).** "Losing the tile"
       is not the same as "being covered": a tile is 1.0 wide and two bodies can
       share it while being drawn clearly apart (a walker mid-step onto it, or
       crossing it). So the test is `COINCIDENT` - the loser goes only when the
       winner is drawn on top of it, within 0.18 tiles - and that one constant is
       symmetric about the tile centre, which is what makes both halves of the
       report come out right. Arriving: *"it makes the npc disappear just a
       little slightly more instantaneously than we want … only a very brief
       instant right before you actually fully land in place on the tile"* - the
       body it lands on stays visible through the whole approach and goes as the
       two meet. Leaving: *"same thing when it de-culls when you move off of the
       tile"* - the body it was standing on comes back the instant the walker
       steps off it, instead of most of a tile later. (Keying straight off the
       drawn tile, as the first version did, handed the tile over at the
       *midpoint* of the step - half a tile early on the way in, and half a tile
       late on the way out.)

       One consequence, the client's own and deliberate: a walker crossing a tile
       somebody is standing on shows both bodies overlapping for the crossing
       (the way the client draws it), rather than blinking the occupant out for
       the whole step.

       **The body that loses the tile is still there to be pointed at** (the
       thirty-seventh report, 2026-09-23). It used to lose its clickability with
       its drawing, which stood in for the client's standing-under-a-creature
       trick - but the user's reading is the right one: standing on a creature
       hides the *model*, it does not hide the creature. `e.stackHidden` is set
       by the branch below and read by `pickAllFrom`, so the hover text in the
       top-left still names what you are standing on and the right-click menu
       still offers its rows, while the body itself stays undrawn. A body that is
       invisible for a real reason - dead and fallen, hidden in a crate, or past
       the LOD range - is still unpickable, because `stackHidden` is set in this
       one place only.

       Still characters only: ground items and scenery are never stacked (a pile
       of items on a tile all shows, exactly as it does in the game - the user
       called that out by name), and a **corpse** is left out entirely, because
       its death fall is stepped every frame and must not be hidden mid-fall by
       somebody standing on it. */
    /* ------------------------------------------------------- visibility cull

       Everything below is *drawing*, and the world is 241 characters spread
       over 128x128 tiles: at the game's own camera (a close chase camera at
       ~15 tiles) only about a dozen of them are on the screen at any moment.
       The rest were still being skinned - `ch.update` rewrites the character's
       whole vertex buffer, ~0.1 ms each - which measured live on 2026-09-22 at
       3.65 ms every frame for ~36 characters, the single largest CPU item in
       the frame.

       The distance LOD below cannot answer this by itself: it is a *pixel size*
       decision (how small the character is drawn), not a visibility one, and its
       outermost tier reaches 38 tiles, which is far past the edge of what a
       pitched-down camera can see. The camera's own frustum is the right test,
       and three.js already culls the *drawing* by it (`mesh.frustumCulled`), so
       this only stops the CPU spending a vertex pass on a mesh that is about to
       be thrown away.

       The margin is deliberately generous (CULL_MARGIN tiles, plus a sphere
       radius round the body): a character that is off by a tile or two keeps
       being skinned, so nothing pops a stale pose as it crosses the edge, and
       the test is against the camera as of the *previous* frame (the camera is
       re-lerped at the foot of this function), which the margin absorbs. A
       corpse is never culled - its death sequence has to keep stepping - and
       neither is the local player, whose body the equipment doll and the camera
       both read. */
    let cullReady = false;
    const cam = view.camera;
    if (cam && cam.projectionMatrix) {
      cam.updateMatrixWorld();
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      _cullMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _cullFrustum.setFromProjectionMatrix(_cullMat);
      for (const pl of _cullFrustum.planes) pl.constant += CULL_MARGIN;
      cullReady = true;
    }

    const topBody = _topBody;
    topBody.clear();
    /* Your own level, once: the stacking pass below and the draw pass after it
       both measure bodies against it, so a body on any other level is simply
       not in this world. */
    const eyePlane = (Game.player && Game.player.plane) | 0;
    for (const e of Game.entities) {
      if (!e.ch || !e.ch.isModel || e.hidden || e.dead || e.corpse) continue;
      /* A player standing on another level takes no tile here: without this an
         upstairs body standing over a ground-floor one would steal its tile in
         the stacking pass below and hide a body it is nowhere near. */
      if (e.kind === "ghost" && ((e.plane | 0) !== eyePlane)) continue;
      const r = renderPos(e, _rpScratch);
      /* The tile the body is DRAWN on - the middle of its floor, not its
         south-west tile - so a player sharing any tile of a dragon's ground
         with it contests the body where the two pictures meet (see the
         COINCIDENT rule below), and a walker crossing the ground merely shares
         the key without meeting it. */
      const sx = npcDrawCX(e, r.x);
      const sz = npcDrawCZ(e, r.z);
      const key = Math.floor(sx) * 4096 + Math.floor(sz);
      e._stackKey = key;
      e._stackX = sx;
      e._stackZ = sz;
      const rank = bodyStackRank(e);
      const cur = topBody.get(key);
      if (!cur || rank < cur._rank) { topBody.set(key, e); e._rank = rank; }
    }
    for (const e of Game.entities) {
      updateEntityTransform(view, e, dt);
      /* A player on another level is not drawn at all: without this an
         upstairs body stands in mid-air over the ground floor. Every overhead
         mark keys off the group's visibility (bars in renderBars, the anchor
         in overlayAnchor, splats in render), so this one gate takes the name,
         the bar, the prayer icon, the spoken line and the hitsplats with it -
         and the picker never offered another level anyway (the same-level rule
         in the pick paths), so nothing clickable is lost. The ghost itself
         keeps tracking its player and steps back into view on the climb up. */
      if (e.kind === "ghost" && e.ch && e.ch.group && ((e.plane | 0) !== eyePlane)) {
        e.ch.group.visible = false;
        /* Fresh like everything else below: a body that climbed away mid-stack
           must not keep its loser flag into the invisibility (the picker reads
           it). Its emote clock simply pauses while it is gone. */
        e.stackHidden = false;
        continue;
      }
      /* Whether this body was culled *by the stack*, as opposed to hidden for
         one of the real reasons (see the branch below and `pickAllFrom`). Fresh
         every frame, so a body that steps out from under another is pickable
         and clickable again on the same frame it is drawn again. */
      e.stackHidden = false;
      /* An emote ends the moment the character does anything else with an
         animation of its own - a step, a swing, a cast, a skilling action - and
         it also simply runs out. This is the whole rule (src/game.js#playEmote),
         and it runs for *every* entity, before the LOD decision below, so a
         ghost that emoted and then walked out of the near range still stops. */
      if (e.emoteLeft > 0) {
        e.emoteLeft = Math.max(0, e.emoteLeft - dt);
        if (e.emoteLeft === 0 || e.moving
          || (e.castLeft || 0) > 0
          || (e.kind === "player" ? (e.actionAnim || 0) : (e.attackAnim || 0)) > 0) {
          e.emoteLeft = 0;
          e.emoteAnim = null;
        }
      }
      if (e.ch.isModel) {
        /* `Math.sqrt` of the squares rather than `Math.hypot`: the hypot builtin
           guards against overflow at magnitudes a 128-tile map can never reach,
           and pays for it on every one of ~240 entities every frame. */
        const ddx = e.rx - camX, ddz = e.rz - camZ;
        const d = Math.sqrt(ddx * ddx + ddz * ddz);
        /* A dying NPC keeps its model on screen while the cache's death
           sequence plays: the fall is stepped every frame just below, and the
           body is only taken away once the sequence has reached the lying pose
           it holds forever (`fallDone`, set by models3d.js#update) - then it
           waits out its spawn timer invisible, as a death always did here
           (src/combat.js#killNpc). `fallDone` is false forever on anything that
           is not dying, so this only ever fires on a corpse. */
        if (e.corpse && e.ch.fallDone) { e.ch.group.visible = false; continue; }
        /* A player hidden in a crate is not drawn at all (src/actions.js#
           hideInCrate): you are in the box, so the box is all there is to see.
           The flag is dropped the moment anything moves them or starts an
           activity, so a hidden player can never be invisible anywhere else. */
        if (e.hidden) { e.ch.group.visible = false; continue; }
        /* A body that lost its tile to a higher-ranked one is not drawn at all -
           see the tile-stacking note at the top of updateVisuals. Losing the
           tile is necessary but not sufficient: the higher-ranked body has to be
           drawn *on top of* this one (`COINCIDENT`), so a walker that is merely
           crossing this tile - or is caught mid-step beside it - leaves it
           showing, and the body goes only as the two actually meet. That is the
           whole of the timing rule, and it is symmetric: the arriving walker
           hides the body it lands on in the last instant of the step, and the
           departing walker uncovers the body it was standing on in the first
           instant of its own. (A corpse is not in `topBody` and is never hidden
           here: its fall is stepped every frame.) */
        const win = topBody.get(e._stackKey);
        /* Any body hides what it stands on. This began as players-only (a
           player always lost to another player, and a creature lost to any
           person - which is what put the player on top of the NPC it stood on),
           and the user extended it to the lot (2026-09-24: *"if 2 npcs are
           stacked on top of each other only the top one gets rendered, just the
           same as how we have when the player is stacked on top of an npc right
           now"*). So two creatures on one tile hide each other too, and which
           one goes is `bodyStackRank` - the lower rank wins the tile, so a
           creature of an earlier spawn keeps its body and the one that walked
           onto it is not drawn. (The winner is the *only* one drawn for that
           tile: the loser is skipped entirely, exactly as before.) */
        if (!e.dead && !e.corpse && win !== e) {
          const dx = e._stackX - win._stackX, dz = e._stackZ - win._stackZ;
          /* Players share the rule with everything else: two players standing
             on top of each other hide exactly the way two 1-tile NPCs do - one
             body drawn per tile once the two pictures coincide (the user's
             rule). The local player always wins its own tile (`bodyStackRank`
             gives it -1), so your own body is the one thing this can never
             take from you; every loser stays pickable through `stackHidden`. */
          if (dx * dx + dz * dz < COINCIDENT * COINCIDENT) {
            e.ch.group.visible = false;
            /* Culled from the *drawing*, but not from the world: the body is
               still standing on that tile, and the user's ask is explicit -
               the hover text and the right-click menu must still offer it
               ("youre culling their visibility but not their npc tag"). The
               flag is what tells the picker to keep it (`pickAllFrom`), and it
               is set here and nowhere else: the other reasons a group goes
               invisible - a corpse that has finished falling, a player in a
               crate, a body past the LOD range - are all cases where the body
               really is not there to be clicked. Cleared by every path that
               reaches the draw below. */
            e.stackHidden = true;
            continue;
          }
        }
        /* CPU skinning is per-vertex, so demote far-away characters instead of
           reskinning all ~35 of them every single frame. A dying one is never
           demoted, or its fall would stutter. */
        const every = e.corpse ? 1 : (d < 13 ? 1 : d < 24 ? 2 : d < 38 ? 3 : 0);
        /* off-screen entirely: drop the distance accrued while hidden, so the
           gait phase doesn't lurch when the character re-enters the LOD range */
        if (every === 0) { e.ch.group.visible = false; e.rdist = 0; continue; }
        /* Out of the camera's view volume: the mesh is left exactly where the
           transform above put it and three.js skips drawing it. Nothing is
           re-posed, but nothing needs to be - the next frame that finds it on
           screen skins it again from the same animation clock (see the cull note
           above, and `mdt`, which measures the real elapsed time rather than the
           frame's own dt precisely so a skipped frame cannot stall a pose). */
        if (cullReady && e.kind !== "player" && !e.corpse) {
          _cullSphere.center.set(e.rx, (e.ch.group.position.y || 0) + 1, e.rz);
          if (!_cullFrustum.intersectsSphere(_cullSphere)) continue;
        }
        /* The local player's kit is re-merged from the live equipment every
           frame, and a ghost's from the kit its own client sent - `setWorn` only
           rebuilds when the list really changed, so this is one signature
           comparison. It is also what takes the weapon and the shield out of a
           **skillcape pose**'s model and puts them back when the pose ends
           (src/game.js#wornKeysFor): nothing is unequipped, the models are just
           not drawn while the cape's own prop is on screen. It runs after the
           cull (and so only for a body that can be seen): a ghost whose kit
           changed while it was off the screen is simply rebuilt on the frame it
           comes back, rather than every frame of however long it was away. */
        if (e.kind === "player" && e.ch.setWorn) e.ch.setWorn(playerWornKeys(), playerWornOpts());
        else if (e.kind === "ghost" && e.ch.setWorn && e.wornEq) {
          e.ch.setWorn(wornKeysFor(e.wornEq, emoteAnimOf(e), e.castTool), wornOptsFor(e.wornEq, emoteAnimOf(e), e.castTool));
        }
        e.ch.group.visible = true;
        /* The blob shadow hugs the slope it stands on (see tiltBlobToGround):
           a flat quad on a hillside only shows its downhill sliver, which
           reads as a streak trailing off the feet. Visible bodies only - the
           culled and the stacked never reach this line. */
        const blob = e.ch._blob !== undefined ? e.ch._blob : (e.ch._blob = findBlobShadow(e.ch));
        if (blob) {
          if (blob.position.y !== 0) blob.position.y = 0;
          tiltBlobToGround(blob, world, e.rx != null ? e.rx : e.x, e.rz != null ? e.rz : e.z, e.plane || 0, e.ch.group.rotation.y);
        }
        const now = performance.now();
        const phase = ((e.x + e.z) | 0) % 6;
        /* a dying NPC must be redrawn every frame regardless of LOD, or the
           fall would stutter - and the same goes for a dying player */
        const skip = every > 1 && !e.dead && !e.dying && (Game.frameCount + phase) % every !== 0;
        if (skip) continue;
        const mdt = e.ch._lastT ? Math.min(0.5, (now - e.ch._lastT) / 1000) : dt;
        e.ch._lastT = now;
        /* One options object per character, refilled in place rather than a fresh
           literal every frame (~36 of them a frame, every frame, forever). The
           model keeps a reference to whatever object it is handed (`_lastOpts`,
           which `repose` replays when the geometry under a character is swapped),
           so handing it the *same* object is not just a saving: it is the only
           hazard here, and it is harmless because the values it reads back are
           this character's own, written immediately before the call. */
        const o = e.ch._fopts || (e.ch._fopts = {});
        o.moving = !!e.moving;
        /* Both kinds of body report the gait the same way: the local player from
           its own `gaitRun`, a ghost from the peer's running bit (see `addGhost`).
           This used to be pinned to the local player, which meant a ghost's
           `gaitRun` was read by nobody and every other player ran at a walk. */
        o.running = !!e.gaitRun;
        o.attack = e.kind === "player" ? (e.actionAnim || 0) : (e.attackAnim || 0);
        o.attackAnim = e.kind === "player" ? (e.popAnim || playerAttackAnim()) : (e.popAnim || "attack");
        o.attackToken = e.swingId || null;
        o.cast = e.kind === "player" ? playerCastAnim() : entityCastAnim(e);
        o.castToken = e.castId || null;
        /* A ghost has the same pose machinery the local player does - a spell's
           gather, a swing, and (since S_ACT) the looping work pose of the
           activity it is standing in, src/game.js#ghostAction - so these three
           are read off the entity rather than pinned to the local player. They
           were pinned while a ghost could only carry a one-shot pose, and the
           `loop` half is exactly what a work pose needs: it is what makes the
           model hold the chop and wrap it instead of playing one swing and
           resting the axe. */
        o.castLoop = !!e.castLoop;
        o.castTail = !!e.castTail;
        o.castClamp = !!e.castClamp;
        /* Scully's grave-pop (src/actions.js#attemptTakeTutHat arms it): a
           reversed one-shot death. All three default to false, so every other
           character's poses are untouched. */
        o.reverse = !!e.popReverse;
        o.hold = !!e.popHold;
        /* A one-shot played slower (or faster) than authored: the wash-up rise
           (src/actions.js#cayPlayRise) sets e.popRate, everything else leaves it
           unset and plays at authored speed. */
        if (e.popRate) o.rate = e.popRate;
        o.emote = emoteAnimOf(e);
        o.emoteToken = e.emoteId || null;
        o.death = (e.kind === "npc" && e.dead) || (e.kind === "player" && (e.dying || e.washedUp || false));
        o.turn = turnAnimFor(e, !!e.moving, e.turnDiff || 0);
        o.dir = e.ch.group.rotation.y;
        o.camYaw = Game.yaw;
        o.camPitch = Game.pitch;
        o.dist = e.rdist || 0;
        e.ch.update(mdt, o);
        e.rdist = 0;
        e.ch.flash(e.hitFlash || 0);
        /* The shield hit flash rides beside the red one: seconds left plus the
           hitsplat it landed for, fed every rendered frame, and the mesh burns
           the time down itself. */
        if (e.ch.setShieldFlash) e.ch.setShieldFlash(e.shieldFlash || 0, e.shieldFlashDmg || 0);
      } else if (e.ch.isSprite) {
        e.ch.anim(e.rphase || 0, !!e.moving, e.kind === "player" ? e.actionAnim || 0 : e.attackAnim || 0);
        e.ch.flash(e.hitFlash || 0);
      } else {
        animateCharacter(e.ch, dt, {
          speed: e.moving ? 1 : 0,
          phase: e.rphase || 0,
          attack: e.kind === "player" ? (e.actionAnim || 0) : (e.attackAnim || 0),
        });
      }
    }

    const rx = player.rx == null ? player.x : player.rx;
    const rz = player.rz == null ? player.z : player.rz;
    /* The camera looks at the height the player is DRAWN at, not the terrain
       under them: `updateEntityTransform` has just put the body on its leap arc
       (if it is mid-hop) and left that height on `ry`, and reading the ground
       instead would drag the camera down to the river bed and back on every
       stepping-stone hop. Outside a leap the two numbers are identical. The
       fallback covers only the first frames, before the entity loop has run
       once. */
    const ty = player.ry == null ? view.world.heightAt(rx, rz) : player.ry;
    const lerp = Math.min(1, dt * 7);
    if (Game.authPan) {
      /* The login screen's own camera: a slow orbit round the town square
         (one minute a lap, four tiles out), gliding over on the same lerp, so
         the backdrop is generic scenery with nobody standing in it rather than
         the player's own last position. The yaw drift that plays over it is
         the title screen's own (see the top of updateVisuals). */
      const pa = Game.time * (Math.PI * 2 / 60);
      const px = 62.5 + Math.cos(pa) * 4;
      const pz = 51 + Math.sin(pa) * 4;
      const py = view.world.heightAt(px, pz);
      Game.cameraTarget.x += (px - Game.cameraTarget.x) * lerp;
      Game.cameraTarget.z += (pz - Game.cameraTarget.z) * lerp;
      Game.cameraTarget.y += (py - Game.cameraTarget.y) * lerp;
    } else {
      Game.cameraTarget.x += (rx - Game.cameraTarget.x) * lerp;
      Game.cameraTarget.z += (rz - Game.cameraTarget.z) * lerp;
      Game.cameraTarget.y += (ty - Game.cameraTarget.y) * lerp;
    }
    Game.dist += (Game.targetDist - Game.dist) * Math.min(1, dt * 6);

    view.setCamera(Game.cameraTarget, Game.yaw, Game.pitch, Game.dist);
    const bx = Game.authPan ? Math.floor(Game.cameraTarget.x) : Math.floor(rx);
    const bz = Game.authPan ? Math.floor(Game.cameraTarget.z) : Math.floor(rz);
    const insideBd = world.isInsideBuilding(bx, bz) ? buildingAt(bx, bz) : null;
    view.setRoofVisibility(insideBd);
    /* The upper floor draws only where it can be seen (see
       scene.js#setUpstairsVisibility): on its own level, or from outside
       the building - and only when roofs are on. A top floor lives on the
       roof plane, so the options-tab "Remove Roofs" toggle takes it off
       too: with roofs hidden the building reads single-storey from
       outside, the way every other building loses its top. The one
       exception is standing on it: climbing up into a hidden room would
       leave the player in invisible walls, so plane 1 always shows. */
    view.setUpstairsVisibility(((player.plane || 0) === 1) || (!view.roofsHidden && insideBd !== world.upstairs));
    view.setCaveSky(inKinshra(bx, bz) || inUnderbelly(bx, bz) || inMinigame(bx, bz), dt);
    view.update(dt);
    tickSurf(dt);
  }

  function buildingAt(x, z) {
    for (const b of world.buildings) {
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b;
    }
    return null;
  }

  Game.buildingAt = buildingAt;
  window.Game = Game;
  requestAnimationFrame(frame);
  return Game;
}
