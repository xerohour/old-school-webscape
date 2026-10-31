/* Old School Webscape - GitHub Pages port shim (classic script).
 *
 * On Perchance the global `root` is provided by the platform: it exposes the
 * main.pjs list values (gameTitle, worldSeed, startAttack, ...) plus the
 * imported plugins (kv, createServerSocket, commentsPlugin). Every consumer
 * guards with `typeof root !== "undefined"`, so this file recreates that
 * surface for static hosting:
 *
 * - main.pjs config values, with the same JS types the readers expect
 *   (numbers for cfgNum, arrays for cfgIds, {selectAll:[{evaluateItem}]}
 *   list nodes for the name words).
 * - `kv`: a localStorage-backed shim exposing per-folder {get,set,delete}
 *   async functions under the "webscape" folder the game uses.
 * - No `createServerSocket`: net.js then takes its DESIGNED offline path
 *   (Net.status = "offline" - single-player).
 * - No `commentsPlugin`: board.js reports the board "unavailable" (v1).
 */
(function () {
  "use strict";

  var KV_PREFIX = "osw-kv:";

  function makeFolder(folder) {
    function key(k) { return KV_PREFIX + folder + ":" + String(k); }
    return {
      get: function (k) {
        return new Promise(function (resolve) {
          try {
            var raw = window.localStorage.getItem(key(k));
            resolve(raw == null ? null : JSON.parse(raw));
          } catch (e) { resolve(null); }
        });
      },
      set: function (k, v) {
        return new Promise(function (resolve) {
          try { window.localStorage.setItem(key(k), JSON.stringify(v)); } catch (e) {}
          resolve();
        });
      },
      "delete": function (k) {
        return new Promise(function (resolve) {
          try { window.localStorage.removeItem(key(k)); } catch (e) {}
          resolve();
        });
      }
    };
  }

  function listNode(words) {
    return { selectAll: words.map(function (w) { return { evaluateItem: w }; }) };
  }

  var NAME_FIRST = ["Iron", "Steel", "Mithril", "Adamant", "Rune", "Dragon", "Shadow", "Storm", "Frost", "Ember", "Thorn", "Raven", "Wolf", "Bear", "Hawk", "Fox", "Oak", "Willow", "Ash", "Stone", "Flint", "River", "Vale", "Wild", "Dark", "Bright", "Swift", "Grim", "Bold", "Silent", "Lucky", "Misty", "Amber", "Jade", "Onyx", "Ruby", "Copper", "Silver", "Blade", "Shield", "Arrow", "Night", "Dawn", "Dusk", "Moon", "Star", "Blood", "Bone", "Ice", "Wind", "Sea", "Sky", "Cloud", "Rain", "Mist", "Ghost", "Spirit", "Soul", "Heart", "Lion", "Tiger", "Falcon", "Eagle", "Viper", "Cobra", "Phoenix", "Griffin", "Titan", "Giant", "Dwarf", "Elf", "Troll", "Goblin", "Wizard", "Mage", "Ranger", "Knight", "Squire", "Baron", "Duke", "King", "Queen", "Prince", "Sage", "Seer", "Bard", "Druid", "Warden", "Hunter", "Scout", "Pirate", "Viking"];
  var NAME_SECOND = ["wolf", "blade", "slayer", "knight", "archer", "mage", "ranger", "warrior", "hunter", "warden", "seeker", "wanderer", "hawk", "wind", "fire", "storm", "shield", "stone", "shadow", "fang", "claw", "wing", "heart", "soul", "song", "spell", "bow", "axe", "spear", "helm", "cloak", "walker", "rider", "born", "might", "craft", "forge", "guild", "crown", "lord", "lore", "wise", "bane", "guard", "bringer", "breaker", "striker", "hound", "feather", "light", "gaze", "step", "fall", "rise", "singer", "keeper", "weaver", "dreamer", "stalker", "watcher", "whisper", "thunder", "ember", "thorn", "root", "leaf", "breeze", "tide", "wave", "stride"];
  var START_CARRIED = ["abyssal_whip", "dragonfire_shield", "helm_of_neitiznot", "fighter_torso", "dragon_platelegs", "barrows_gloves", "amulet_of_fury", "berserker_ring", "fire_cape", "dharoks_greataxe", "karils_coif", "karils_leathertop", "karils_leatherskirt", "karils_crossbow", "bolt_rack", "magic_shortbow", "rune_arrow", "ranger_boots", "ahrims_robetop", "ahrims_robeskirt", "ahrims_staff", "ancient_staff", "mystic_boots", "saradomin_cape", "seers_ring", "shark", "super_attack_3", "super_strength_3", "air_rune", "fire_rune", "death_rune", "bronze_axe", "bronze_pickaxe", "tinderbox", "small_fishing_net"];

  window.root = {
    /* --- game identity / config (main.pjs) --- */
    gameTitle: "Old School Webscape",
    worldSeed: 2007,
    walkSpeed: 1.75,
    runSpeed: 3.5,
    tickMs: 600,
    startAttack: 99,
    startStrength: 99,
    startDefence: 99,
    startHitpoints: 99,
    startRanged: 99,
    startMagic: 99,
    startOtherSkills: 99,
    startCoins: 100000,
    startKit: [[]],
    startCarried: [START_CARRIED],
    /* --- board / community --- */
    boardChannel: "webscape-board",
    boardTitle: "Message Board",
    discordInvite: "https://discord.gg/BBp4pfAh6",
    writerHash: "9d50bd928acf4b55b3b97cb5aa1c7ba26c21baaace499b708b6721a1c4a9e184",
    commentsAdminHash: "a5ded64c250f547cecc2af7ae192b6a5080f7503520a89d2d38cb5448d9eb321",
    modAccount: "gamemaker",
    modBadge: "https://user.uploads.dev/file/847bb03c8da62399d2463f66e2de98fc.png",
    /* --- name word lists (perchance list-node shape) --- */
    nameFirst: listNode(NAME_FIRST),
    nameSecond: listNode(NAME_SECOND),
    /* --- storage plugin shim (localStorage) --- */
    kv: { webscape: makeFolder("webscape") }
    /* NOTE: no createServerSocket (offline single-player by design),
       no commentsPlugin (message board reports unavailable). */
  };

  /* The generator name the platform normally provides (used for save
     namespacing and the view counter). */
  window.generatorName = "old-school-webscape";
})();
