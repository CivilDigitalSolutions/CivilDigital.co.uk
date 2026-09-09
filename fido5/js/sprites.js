/* ==========================================================================
   FiDo-5 — Sprite factory.
   All artwork is original and generated at boot into offscreen canvases:
   hand-authored pixel art for the characters (strings of palette keys), and
   procedural pixel drawing for props, tiles and icons where a palette swap
   is all that separates the variants.
   Nothing here touches game state.
   ========================================================================== */

import { PAL, DRONE_SKINS } from './data.js';

/* ---- Low-level helpers -------------------------------------------------- */

function surface(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return { c, x, w: c.width, h: c.height };
}

/* Turn an array of equal-length strings into a canvas. `map` optionally
   remaps a sprite's semantic characters (H/h/T/I/V) onto palette keys. */
function fromRows(rows, map) {
  const w = rows[0].length, h = rows.length;
  const s = surface(w, h);
  const px = s.x.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      let ch = row[x];
      if (map && map[ch] !== undefined) ch = map[ch];
      const hex = PAL[ch];
      if (!hex) continue;
      const i = (y * w + x) * 4;
      px.data[i]     = parseInt(hex.slice(1, 3), 16);
      px.data[i + 1] = parseInt(hex.slice(3, 5), 16);
      px.data[i + 2] = parseInt(hex.slice(5, 7), 16);
      px.data[i + 3] = 255;
    }
  }
  s.x.putImageData(px, 0, 0);
  return s;
}

/* Validate at build time — a mis-counted row is otherwise a silent shear. */
function rows(name, list) {
  const w = list[0].length;
  for (let i = 0; i < list.length; i++) {
    if (list[i].length !== w) {
      throw new Error(`sprite "${name}" row ${i} is ${list[i].length} wide, expected ${w}`);
    }
  }
  return list;
}

function flip(src) {
  const s = surface(src.w, src.h);
  s.x.translate(src.w, 0);
  s.x.scale(-1, 1);
  s.x.drawImage(src.c, 0, 0);
  return s;
}

/* ---- Character art ------------------------------------------------------ */
/* The operative is drawn as a shared upper body plus swappable legs, so the
   run cycle stays consistent and the art stays small. */

const BODY = rows('body', [
  '....KKKKK.......',
  '...KWWWWWK......',
  '..KWLLLLWK......',
  '..KWCCCCCK......',
  '..KWCCCCWK......',
  '..KWWWWWK.......',
  '...KMSSMK.......',
  '..KMSPPSMK......',
  '.KLSSPPSSLKK....',
  '.KLSSPPSSLKBBBK.',
  '.KLSMSSMSLKBBBK.',
  '.KMSSSSSSMKKBKK.',
  '..KMSSSSMK......',
  '..KMSSSSMK......',
  '...KMSSMK.......',
]);

/* Taking a hit: the visor and the chest plate flash red. */
const BODY_HURT = rows('body_hurt', [
  '....KKKKK.......',
  '...KWWWWWK......',
  '..KWLLLLWK......',
  '..KWRRRRRK......',
  '..KWRRRRWK......',
  '..KWWWWWK.......',
  '...KMSSMK.......',
  '..KMSRRSMK......',
  '.KLSSRRSSLKK....',
  '.KLSSRRSSLKBBBK.',
  '.KLSMSSMSLKBBBK.',
  '.KMSSSSSSMKKBKK.',
  '..KMSSSSMK......',
  '..KMSSSSMK......',
  '...KMSSMK.......',
]);

/* Four leg frames, drawn light enough that the run cycle actually reads
   against a dark street. */
const LEGS = [
  rows('legs0', [
    '...KSSKKSSK.....',
    '..KSSK..KSSK....',
    '..KSK....KSK....',
    '.KSK......KSK...',
    '.KSK......KSK...',
    '.KMK......KMK...',
    '.KMMK....KMMK...',
    'KLLLK....KLLLK..',
    'KKKKK....KKKKK..',
  ]),
  rows('legs1', [
    '....KSSKSSK.....',
    '....KSSKSSK.....',
    '...KSK..KSK.....',
    '...KSK..KSK.....',
    '..KSK...KSK.....',
    '..KMK...KMK.....',
    '..KMMK..KMK.....',
    '.KLLLK..KLK.....',
    '.KKKKK..KKK.....',
  ]),
  rows('legs2', [
    '....KSSKKSSK....',
    '...KSSK..KSSK...',
    '...KSK....KSK...',
    '..KSK......KSK..',
    '..KSK......KSK..',
    '..KMK......KMK..',
    '..KMMK....KMMK..',
    '.KLLLK....KLLLK.',
    '.KKKKK....KKKKK.',
  ]),
  rows('legs3', [
    '.....KSSKSSK....',
    '.....KSSKSSK....',
    '.....KSK.KSK....',
    '....KSK..KSK....',
    '....KSK..KSK....',
    '....KMK..KMK....',
    '....KMK..KMMK...',
    '....KLK.KLLLK...',
    '....KKK.KKKKK...',
  ]),
];

const LEGS_JUMP = rows('legs_jump', [
  '...KSSKKSSK.....',
  '..KSSK..KSSK....',
  '..KSK....KSSK...',
  '.KSK......KSK...',
  '.KMK.......KK...',
  '.KMMK...........',
  'KLLLK...........',
  'KKKKK...........',
  '................',
]);

const LEGS_FALL = rows('legs_fall', [
  '...KSSK.KSSK....',
  '...KSK...KSK....',
  '...KSK...KSK....',
  '...KSK...KSK....',
  '...KMK...KMK....',
  '...KMK...KMK....',
  '..KMMK..KMMK....',
  '.KLLLK.KLLLK....',
  '.KKKKK.KKKKK....',
]);

/* Sliding: low, feet first, rifle still pointing down the track. */
const SLIDE = rows('slide', [
  '..........KKKKK.....',
  '.........KWWWWWK....',
  '........KWWLLLWK....',
  '........KWCCCCCK....',
  '...KKKKKKWWWWWK.....',
  '.KKSSSSSSSSSSK......',
  'KLSSSPPSSSSSSK......',
  'KLSSSSPPSSSSSSKKKK..',
  'KLSSSSSSSSSSSSKNNNK.',
  'KMSSSSSSSSSSSMKKNKK.',
  '.KKKKKKKKKKKKK......',
  '....................',
  '....................',
]);

const DEAD = rows('dead', [
  '....................',
  '....................',
  '....................',
  '...........KKKKK....',
  '....KKKKK.KWWWWWK...',
  '..KKSSSSSKKWLRRLWK..',
  '.KMSSPPSSSKWWWWWK...',
  'KMSSSPPSSSSKKKKK....',
  'KMSSSSSSSSSSSMK.....',
  'KKSNNNNKSSSMKK......',
  '.KKKKKKKKKKKK.......',
  '....................',
  '....................',
]);

/* FiDo-5. H/h = hull shades, T = trim, I = light, V = vent — all remapped
   per skin, so a new skin is data only. */
const DRONE = rows('drone', [
  '....KKKKKKK....',
  '...KHHHHHHHK...',
  '..KHHhhhhhHHK..',
  '.KKHHhIIIhHHKK.',
  'KTTKHhIIIhHKTTK',
  'KTIIKHhhhHKIITK',
  'KTTKKHHHHHKKTTK',
  '.KK.KVVVVVK.KK.',
  '.....KVVVK.....',
  '......KVK......',
  '.......V.......',
]);

/* Scanning: the eye opens wide and the pods flare. */
const DRONE_SCAN = rows('drone_scan', [
  '....KKKKKKK....',
  '...KHHHHHHHK...',
  '..KHHhhhhhHHK..',
  '.KKHhIIIIIhHKK.',
  'KTTKhIIIIIhKTTK',
  'KTIIKIIIIIKIITK',
  'KTTKKHIIIHKKTTK',
  '.KK.KVVVVVK.KK.',
  '.....KVVVK.....',
  '......KVK......',
  '.......V.......',
]);

/* Combat: a stubby barrel drops from the underside. */
const DRONE_FIRE = rows('drone_fire', [
  '....KKKKKKK....',
  '...KHHHHHHHK...',
  '..KHHhhhhhHHK..',
  '.KKHHhIIIhHHKK.',
  'KTTKHhIIIhHKTTK',
  'KTIIKHhhhHKIITK',
  'KTTKKHHHHHKKTTK',
  '.KK.KVTTTVK.KK.',
  '....KTTTTTK....',
  '...KKTTTKK.....',
  '.....KTK.......',
]);

/* Enemies travel right-to-left, so their front is their left edge and any
   weapon or shield is drawn on that side. */
const E_SCOUT = rows('scout', [
  '.....KKKK.....',
  '...KKMMMMKK...',
  '..KMSSSSSSMK..',
  '.KMSSrRRrSSMK.',
  'KLMSRRRRRRSMLK',
  'KLKMSSSSSSMKLK',
  '.K.KMSSSSMK.K.',
  '....KKMMKK....',
  '......KK......',
]);

/* The shield plate is bolted to the front by a visible strut, so it reads as
   part of the machine rather than a floating bar. */
const E_SHIELD = rows('shield', [
  '.......KKKKK......',
  '.....KKMMMMMKK....',
  '...KKMSSSSSSSMK...',
  '.KKKMSSSSSSSSSMK..',
  'KCCKMSrRRRRRrSMK..',
  'KCCKMSRRRRRRRSMK..',
  'KCCKKMSSSSSSSSMK..',
  'KCCK.KMSSSSSSMK...',
  'KCCK..KKMSSSMKK...',
  'KCCK....KKMMKK....',
  'KCCK......KK......',
  '.KKK..............',
  '..................',
  '..................',
  '..................',
]);

const E_BOMBER = rows('bomber', [
  '......KKKKK......',
  '....KKMMMMMKK....',
  '..KKMSSSSSSSMKK..',
  '.KMSSSoOOOoSSSMK.',
  'KLMSSoOOOOOoSSMLK',
  'KLMSSOOOOOOOSSMLK',
  'KKMSSSoOOOoSSSMKK',
  '.KMSSSSSSSSSSSMK.',
  '..KKMSSSSSSSMKK..',
  '....KKMOOOMKK....',
  '......KOOOK......',
  '.......KOK.......',
  '........O........',
]);

const E_TURRET = rows('turret', [
  '.......KKKKKK.....',
  '......KMSSSSMK....',
  '.....KMSSSSSSMK...',
  'KKKKKMSSSSSSSSMK..',
  'KBBBBMSrRRRRrSMK..',
  'KBBBBMSRRRRRRSMK..',
  'KKKKKMSSSSSSSSMK..',
  '.....KMSSSSSSMK...',
  '....KMSSSSSSSSMK..',
  '...KMSSSSSSSSSSMK.',
  '..KMSSSSSSSSSSSSMK',
  '..KMLLLLLLLLLLLLMK',
  '..KMSSSSSSSSSSSSMK',
  '..KMMMMMMMMMMMMMMK',
  '..KKKKKKKKKKKKKKKK',
  '..................',
  '..................',
  '..................',
]);

/* ---- Boss: The Warden ---------------------------------------------------
   A walker, so it reads as heavy and slow: wide stance, low head, a lit core
   in the chest that is the thing you are actually shooting at. 40x34, drawn
   facing left, mirrored at build time for the other direction. */
const B_WARDEN = rows('warden', [
  '........................................',
  '........................................',
  '............................KKK..KKK....',
  '...........................KAAAKKAAAK...',
  '...........................KMMMKKMMMK...',
  '...........................KMSMKKMSMK...',
  '...............KKKKKKKKKKKKKMMMKKMMMK...',
  '............KKKMMMMMMMMMMMMMMSMKKMSMK...',
  '....KKKKKKKKMMMMMMMMMMMMMMMMMMMMMMMMK...',
  '...KMMMMMMMMMMMSSSSSSSSSMSSSSSSSSSSMK...',
  '...KMMMMMMMMMMMMMMMSSSSSMSSLSSLSSLSMK...',
  '...KSMSSSSSSSSSSSSMSSSSSMSSSSSSSSSSMK...',
  '...KSSSrrrrRRRrrrrSSSSSSMMMMMMMMMMMMMK..',
  '...KSSrrrRRRRRRRrrrSSSSSSSSSSSSSSSMMMMK.',
  '...KSrrrRRRRRRRRRrrrSSSSSSSSSSSSSSSMMMK.',
  '...KSrrYYYYEEYYYYYrrSSSSSSSSSSSSSSSMMMK.',
  '...KSrrrRRRRRRRRRrrrSSSSSSSSSSSSSSSMMMK.',
  '...KSSrrrRRRRRRRrrrSSSSSSSSSSSSSSSMMMMK.',
  '....KSSrrrrRRRrrrrSSSSSSSSSSSSSSSSMMMK..',
  '.....KSSSSrrrrrSSSSSSSSSSSSSSSSSMMMMK...',
  '....KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMK....',
  '....KANNAANNAANNAANNAANNAANNAANNAANK....',
  '....KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMK....',
  '.....KKKKKKKKKKMMMMMMMMMMMMMKKKKKKK.....',
  '..........KMMMMMKKKKKKKKMMMMMK..........',
  '..........KMMMMMK......KMMMMMK..........',
  '..........KMMMMMK......KMMMMMK..........',
  '.........KSSSSSSSK....KSSSSSSSK.........',
  '.........KSSASASSK....KSSASASSK.........',
  '.........KSMMMMMSK....KSMMMMMSK.........',
  '.........KKMMMMMKK....KKMMMMMKK.........',
  '........KSSSSSSSSSK..KSSSSSSSSSK........',
  '........KLLLLLLLLLK..KLLLLLLLLLK........',
  '.........KKKKKKKKK....KKKKKKKKK.........',
]);

const B_HEXCELL = rows('hexcell', [
  '..............................',
  '.............KKK..............',
  '.........KKKKPPPKKKKK.........',
  '........KMMMMFFFMMMMMK........',
  '........KMMMMMMMMMMMMK........',
  '.......KMMSSSSSSSSSSMMK.......',
  '......KMMNSSSSSSSSSSNMMK......',
  '......KMMNSSSSSSSSSSNMMK......',
  '....KKMMSNSSSSSSSSSSNSMMKK....',
  '...KNNNNNNNNNNNNNNNNNNNNNNK...',
  '....KMMSSNSSSSSSSSSSNSSMMK....',
  '...KMMSSSNSSCCCCCCSSNSSSMMK...',
  '...KMMSSSNSCCccccCCSNSSSMMK...',
  '..KMMSSSSNCCccccccCCNSSSSMMK..',
  '.KMMSSSSSNCEEEEEEEECNSSSSSMMK.',
  '.KMMSSSSSNCCWWWWWWCCNSSSSSMMK.',
  '..KMMSSSSNCCccccccCCNSSSSMMK..',
  '...KMMSSSNSCCccccCCSNSSSMMK...',
  '...KMMSSSNSSCCCCCCSSNSSSMMK...',
  '....KMMSSNSSSSSSSSSSNSSMMK....',
  '..KKNNNNNNNNNNNNNNNNNNNNNNKK..',
  '.KPPPKMMSNSSSSSSSSSSNSMMKPPPK.',
  '.KFFFKKMMNSSSSSSSSSSNMMKKFFFK.',
  '..KKK.KMMNSSSSSSSSSSNMMK.KKK..',
  '.......KMMSSSSSSSSSSMMK.......',
  '........KMMMMMMMMMMMMK........',
  '........KMMMMMMMMMMMMK........',
  '.........KKKKKKKKKKKK.........',
  '..............................',
  '..............................',
]);

const B_RELAY = rows('relay', [
  '............',
  '...KKKKKK...',
  '.KKMSSSSMKK.',
  'KFKMSSSSMKFK',
  '.KMSSSSSSMK.',
  '.KMSPEPPSMK.',
  '.KMSppEpSMK.',
  '.KMSSSSSSMK.',
  'KFKMSSSSMKFK',
  '.KKMSSSSMKK.',
  '...KKKKKK...',
  '............',
]);

const B_CONVOY = rows('convoy', [
  '.........................KKKKKKKKKKKKKKK.....',
  '........................KMMMMMMMMMMMMMMMK....',
  '.........................KKMMMMMMMMMMMMMK....',
  '..........................KKKMMMMMMMMMMMKKK..',
  '..............K...KKKKKKKKMMMMSSSSSSSSSMrrrK.',
  '............KKNKKKNMMMNMMMNSSMSSSSSSSSSMrRRAK',
  '....KKKKKKKKMMMMMMMMMMMMMMMMMMSSSSSSSSSMrrrK.',
  '.KKKcCEECCCcSSNSSSNSSSNSSSNSSMSSSSSSSSSMKKK..',
  'KMMMcCCCCCCcSSNSSSNSSSNSSSNSSMSSSSSSSSSMrrrK.',
  'KSSScCCCCCCcSSNSSSNSSSNSSSNSSMSSSSSSSSSMrRRAK',
  'KMMMccccccccSSNSSSNSSSNSSSNSSMSSSSSSSSSMrrrK.',
  '.KKKKMMMMMMMSSNSSSNSSSNSSSNSSMSSSSSSSSSMKKK..',
  '.....KKKKKKKMMNMMMNSSSNSSSNSSMSSSSSSSSSMrrrK.',
  '............KKNKKKNMMMNMMMNSSMSSSSSSSSSMrRRAK',
  '..............K.KKKKKKKKKKMMMMSSSSSSSSSMrrrK.',
  '...............KMSSSSSSSSSSSMMMMMMMMMMMMKKK..',
  '...............KMSSSSSSSSSSSMKKKKKKKKKKK.....',
  '...............KMMMAAMAAMAAMMK...............',
  '................KKKKKKKKKKKKK................',
]);

const B_CHOIR = rows('choir', [
  '.KMMMMMMMMMMMMK.',
  '.KMSSSSSSSSSSMK.',
  '.KMSSSSSSSSSSMK.',
  '.KMSSSSSSSSSSMK.',
  '.KMMMMMMMMMMMMK.',
  '..KKKMSSSSMKKK..',
  '....KMSSSSMK....',
  '...KKMSSSSMKK...',
  '..KMMMMMMMMMMK..',
  '..KNNNNNNNNNNK..',
  '...KKMSSSSMKK...',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '...KKMSSSSMKK...',
  '..KMMMMMMMMMMK..',
  '..KNNNNNNNNNNK..',
  '...KKMSSSSMKK...',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '...KKMSSSSMKK...',
  '..KMMMMMMMMMMK..',
  '..KNNNNNNNNNNK..',
  '...KKMSSSSMKK...',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '...KKMSSSSMKK...',
  '..KMMMMMMMMMMK..',
  '..KNNNNNNNNNNK..',
  '...KKMFFFFMKK...',
  '....KFFFFFFK....',
  '....KFFFFFFK....',
  '...KFFFPPFFFK...',
  '...KFFPPPPFFK...',
  '...KFFPPPPFFK...',
  '..KFFPPPPPPFFK..',
  '..KFPPPPPPPPFK..',
  '..KFPPPPPPPPFK..',
  '..KFPPPPPPPPFK..',
  '..KFPppppppPFK..',
  '..KFPppppppPFK..',
  '..KFPpEEEEpPFK..',
  '..KFPppppppPFK..',
  '..KFPppppppPFK..',
  '..KFPPPPPPPPFK..',
  '..KFPPPPPPPPFK..',
  '..KFPPPPPPPPFK..',
  '..KFFPPPPPPFFK..',
  '...KFFPPPPFFK...',
  '...KFFPPPPFFK...',
  '...KFFFPPFFFK...',
  '..KMMFFFFFFMMK..',
  '..KNNFFFFFFNNK..',
  '...KKMFFFFMKK...',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '...KKMSSSSMKK...',
  '..KMMMMMMMMMMK..',
  '..KNNNNNNNNNNK..',
  '...KKMSSSSMKK...',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '...KKMSSSSMKK...',
  '..KMMMMMMMMMMK..',
  '..KNNNNNNNNNNK..',
  '...KKMSSSSMKK...',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '...KKMSSSSMKK...',
  '..KMMMMMMMMMMK..',
  '..KNNNNNNNNNNK..',
  '...KKMSSSSMKK...',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '....KMSSSSMK....',
  '...KKMSSSSMKK...',
  '..KMMMMMMMMMMK..',
  '..KNNNNNNNNNNK..',
  '...KKMSSSSMKK...',
  '.KKKKMSSSSMKKKK.',
  'KMMMMMMMMMMMMMMK',
  'KMSSSSSSSSSSSSMK',
  'KMSSSSSSSSSSSSMK',
  'KMSSSSSSSSSSSSMK',
]);

const B_POD = rows('pod', [
  '......KKKKK.....',
  '.....KMMMMMK....',
  '....KMSSSSSMK...',
  '...KMSRYYYRSMK..',
  'KKKMSSRRRRRSMMK.',
  'ANNNNMMSSSSSSMK.',
  'AMMMMMMSSSSSMMK.',
  'KKMMSSSSSSSSMMK.',
  '.KMSSMSSSSSMSMK.',
  '.KMSSSMMMMMSSMK.',
  '.KMSASSSASSASMK.',
  '.KMSSSSSSSSSSMK.',
  'KMMMMMMMMMMMMMMK',
  'KMMMMMMMMMMMMMMK',
  '.KKKKKKKKKKKKKK.',
]);

const B_RIPPER = rows('ripper', [
  '...........KKKK..KKKK..KKKK..KKKK.......',
  '..........KSSSSKKSSSSKKSSSSKKSSSSK......',
  '..........KSSSSKKSSSSKKSSSSKKSSSSK......',
  '...........KMMK..KMMKKKKMMK..KMMK.......',
  '..........KKMMKKKMMMMMMMMMKKKKMMK.......',
  '.KKKK....KMMMMMMNMMMNMMMMMMMNMMMMK......',
  'KRrrrKKKKSSSNSSSNSSSNSSSNSSSNSSSSSKKKKK.',
  'KrrrrMMMMMMSNSSSNSSSNSSSNSSSNSSSSMMMMMMK',
  '.KMMMRRRRRRRNSSSNSSSNSSSNSSSNSSSSMAAAAMK',
  '..KKKRYYYYYRNSSSNSSSNSSSNSSSNSSSSMAAAAMK',
  '.KMMMRRRRRRRNSSSNSSSNSSSNSSSNSSSSMAAAAMK',
  'KrrrrMMMMMMSNSSSNSSSNSSSNSSSNSSSSMMMMMMK',
  'KRrrrKKKKSSSNSSSNSSSNSSSNSSSNSSSSSKKKKK.',
  '.KKKK....KKKMMMMNMMMNSSSMMMMNMMMKK......',
  '...........KMMKKKMMMMMMMMMKKKKMMK.......',
  '...........KMMK..KMMKKKKMMK..KMMK.......',
  '..........KSSSSKKSSSSKKSSSSKKSSSSK......',
  '..........KSSSSKKSSSSKKSSSSKKSSSSK......',
  '...........KKKK..KKKK..KKKK..KKKK.......',
]);

const B_PRIME = rows('prime', [
  '..............KKKKKKKKKKK.............',
  '.............KMMMMMMMMMMMK............',
  '.............KMSSSSSSSSSMK............',
  '.............KMSRRRRRRRSMK............',
  '............KKMSRYYYYYRSMKK...........',
  '..........KKMMMSRRRRRRRSMMMKK.........',
  '.KKKKKKKKKMMMMMSSSSSSSSSMMMMMKKKKKKKKK',
  'KMMMMMMMMMMMMMMSSSSSSSSSMMMMMMMMMMMMMM',
  'KMSSSSSSSMMMSSMMMMMMMMMMMSSMMMSSSSSSSM',
  'KMSSSSSSSMMMMMMMMMMMMMMMMMMMMMSSSSSSSM',
  'KMSSSSSSSMMMMMMMMMMMMMMMMMMMMMSSSSSSSM',
  'KMSFFFFFSMSSSSSSSSSSSSSSSSSSSMSFFFFFSM',
  'KMSFFFFFSMSSSSSSSSFFFSSSSSSSSMSFFFFFSM',
  'KMSFFFFFSMSSSSSSFFFFFFFSSSSSSMSFFFFFSM',
  'KMSFFFFFSMSSSSSFFPPPPPFFSSSSSMSFFFFFSM',
  'KMSFFFFFSMSSSSSFPpppppPFSSSSSMSFFFFFSM',
  'KMSSSSSSSMSSSSFFPpEpEpPFFSSSSMSSSSSSSM',
  'KMSSSSSSSMSSSSSFPpppppPFSSSSSMSSSSSSSM',
  'KMSSSSSSSMSSSSSFFPPPPPFFSSSSSMSSSSSSSM',
  'KMMMMMMMMMSSSSSSFFFFFFFSSSSSSMMMMMMMMM',
  '.KKKSSASSSSASSSSASFFFASSSSASSSSASSSKKK',
  '...KSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSK..',
  '...KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMK..',
  '...KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMK..',
  '....KKKKKKMMMMMMSSSSSSSMMMMMMKKKKKK...',
  '.......KMMMMMMMMMMMMMMMMMMMMMMK.......',
  '.......KMMMMMMMMMMMMMMMMMMMMMMK.......',
  '.......KMMMMMMKKKKKMKKKKMMMMMMK.......',
  '.......KMMMMMMK....K...KMMMMMMK.......',
  '......KSSSSSSSSK......KSSSSSSSSK......',
  '......KSSASSASSK......KSSASSASSK......',
  '......KSSSSSSSSK......KSSSSSSSSK......',
  '......KSMMMMMMSK......KSMMMMMMSK......',
  '.......KMMMMMMK........KMMMMMMK.......',
  '......KKMMMMMMKK......KKMMMMMMKK......',
  '.....KSSSSSSSSSSK....KSSSSSSSSSSK.....',
  '.....KSSSSSSSSSSK....KSSSSSSSSSSK.....',
  '.....KLLLLLLLLLLK....KLLLLLLLLLLK.....',
  '......KKKKKKKKKK......KKKKKKKKKK......',
]);

const B_SHARD = rows('shard', [
  '.....KKKKK....',
  '....KSSSSSK...',
  '...KSSSMSSSK..',
  '.KKSMMMMMMMSKK',
  'KSSSMFFFFFMSSS',
  'KASSMFPEPFMSSA',
  'KSSSMFFFFFMSSS',
  '.KKSMMMMMMMSKK',
  '...KSSSMSSSK..',
  '....KSSSSSK...',
  '.....KKKKK....',
]);

const E_TANK = rows('tank', [
  '.........KKKKKK...........',
  '........KMRRRRMK..........',
  '.......KMSSSSSSMK.........',
  '......KMSSSSSSSSMK........',
  'KKKKKKMSSSSSSSSSSMKKK.....',
  'KBBBBMSSSSSSSSSSSSSSMKK...',
  'KBBBBMSSSSSSSSSSSSSSSMK...',
  'KKKKKMSSSSSSSSSSSSSSSMK...',
  '....KMSSSSSSSSSSSSSSSSMK..',
  '...KMSSSSSSSSSSSSSSSSSSMK.',
  '..KMSSSSSSSSSSSSSSSSSSSSMK',
  '..KMLLLLLLLLLLLLLLLLLLLLMK',
  '..KMMMMMMMMMMMMMMMMMMMMMMK',
  '..KKMbMKKMbMKKMbMKKMbMKKK.',
  '...KKKKK.KKKKK.KKKKK.KKK..',
  '..........................',
  '..........................',
  '..........................',
]);

/* ---- Procedural props --------------------------------------------------- */

function px(x, k, cx, cy, w = 1, h = 1) {
  const hex = PAL[k];
  if (!hex) return;
  x.fillStyle = hex;
  x.fillRect(cx | 0, cy | 0, w | 0, h | 0);
}

/* A crate: box, panel seams, rarity band and a lock face. Rarity is the only
   thing that varies, so all four come from one routine. */
function makeCrate(body, colour, accent, opened) {
  const w = 16, h = 15;
  const s = surface(w, h);
  const x = s.x;
  // silhouette
  px(x, 'K', 0, 1, w, h - 2);
  px(x, 'K', 1, 0, w - 2, h);
  // body, tinted by rarity so the four read apart at a glance
  px(x, 'K', 1, 1, w - 2, h - 2);
  px(x, body, 2, 2, w - 4, h - 4);
  // top and bottom rails
  px(x, colour, 2, 2, w - 4, 2);
  px(x, colour, 2, h - 4, w - 4, 2);
  // corner bolts
  for (const [bx, by] of [[3, 3], [w - 4, 3], [3, h - 4], [w - 4, h - 4]]) px(x, accent, bx, by, 1, 1);
  // rarity band across the middle
  px(x, colour, 2, 6, w - 4, 3);
  px(x, accent, 2, 7, w - 4, 1);
  if (opened) {
    px(x, 'b', 2, 6, w - 4, 3);
    px(x, 'K', 2, 2, w - 4, 4);
    px(x, 'N', 3, 1, w - 6, 2);
  } else {
    // lock plate
    px(x, 'K', 7, 5, 3, 5);
    px(x, accent, 8, 6, 1, 3);
  }
  return s;
}

/* Coin: four frames of a spin, drawn as narrowing ellipse bands. */
function makeCoin(frame) {
  const w = 8, h = 8, s = surface(w, h), x = s.x;
  const widths = [6, 4, 2, 4];
  const cw = widths[frame];
  const left = ((w - cw) / 2) | 0;
  px(x, 'o', left, 1, cw, 6);
  px(x, 'A', left, 1, cw, 5);
  px(x, 'Y', left + (cw > 2 ? 1 : 0), 2, Math.max(1, cw - 2), 3);
  if (cw >= 4) px(x, 'E', left + 1, 2, 1, 2);
  // outline top and bottom
  px(x, 'K', left, 0, cw, 1);
  px(x, 'K', left, 7, cw, 1);
  return s;
}

/* Key: a chunky sci-fi keycard. */
function makeKey() {
  const s = surface(11, 8), x = s.x;
  px(x, 'K', 0, 1, 11, 6);
  px(x, 'A', 1, 2, 9, 4);
  px(x, 'Y', 1, 2, 9, 1);
  px(x, 'K', 7, 0, 4, 8);
  px(x, 'A', 8, 1, 2, 2);
  px(x, 'A', 8, 5, 2, 2);
  px(x, 'E', 2, 3, 3, 1);
  return s;
}

/* Health / energy / shield pickup pods share a shape. */
function makePod(colour, glyph) {
  const s = surface(11, 11), x = s.x;
  px(x, 'K', 1, 0, 9, 11);
  px(x, 'K', 0, 1, 11, 9);
  px(x, 'N', 1, 1, 9, 9);
  px(x, colour, 2, 2, 7, 7);
  px(x, 'E', 3, 3, 5, 5);
  px(x, colour, 4, 4, 3, 3);
  if (glyph === 'cross') { px(x, 'E', 5, 3, 1, 5); px(x, 'E', 3, 5, 5, 1); }
  if (glyph === 'bolt')  { px(x, 'K', 6, 3, 1, 2); px(x, 'K', 5, 4, 1, 2); px(x, 'K', 4, 6, 2, 1); px(x, 'K', 6, 5, 1, 3); }
  if (glyph === 'ring')  { px(x, colour, 4, 4, 3, 3); px(x, 'E', 5, 5, 1, 1); }
  return s;
}

/* Power-up canister: colour plus a simple pictogram, so new power-ups only
   need a colour and an icon key. */
function makePower(colour, icon) {
  const s = surface(13, 13), x = s.x;
  px(x, 'K', 2, 0, 9, 13);
  px(x, 'K', 0, 2, 13, 9);
  px(x, 'K', 1, 1, 11, 11);
  px(x, 'N', 2, 2, 9, 9);
  px(x, colour, 3, 3, 7, 7);
  px(x, 'K', 4, 4, 5, 5);
  const g = 'E';
  switch (icon) {
    case 'rapid':  px(x, g, 4, 5, 5, 1); px(x, g, 4, 7, 5, 1); px(x, g, 8, 4, 1, 1); px(x, g, 8, 8, 1, 1); break;
    case 'shield': px(x, g, 5, 4, 3, 1); px(x, g, 4, 5, 5, 2); px(x, g, 5, 7, 3, 1); px(x, g, 6, 8, 1, 1); break;
    case 'magnet': px(x, g, 4, 4, 2, 5); px(x, g, 7, 4, 2, 5); px(x, g, 4, 4, 5, 1); px(x, 'R', 4, 8, 2, 1); px(x, 'R', 7, 8, 2, 1); break;
    case 'bolt':   px(x, g, 7, 4, 2, 2); px(x, g, 6, 5, 2, 2); px(x, g, 4, 6, 3, 1); px(x, g, 5, 7, 2, 2); px(x, g, 7, 6, 1, 2); break;
    case 'missile':px(x, g, 6, 4, 1, 5); px(x, g, 5, 5, 3, 3); px(x, 'R', 5, 8, 1, 1); px(x, 'R', 7, 8, 1, 1); break;
    case 'skull':  px(x, g, 4, 4, 5, 4); px(x, 'K', 5, 5, 1, 2); px(x, 'K', 7, 5, 1, 2); px(x, g, 5, 8, 3, 1); px(x, 'K', 6, 8, 1, 1); break;
    case 'inf':    px(x, g, 4, 5, 2, 1); px(x, g, 7, 5, 2, 1); px(x, g, 4, 7, 2, 1); px(x, g, 7, 7, 2, 1); px(x, g, 4, 6, 1, 1); px(x, g, 8, 6, 1, 1); px(x, g, 6, 6, 1, 1); break;
  }
  return s;
}

/* HUD gadget icons, drawn at 15x15 so they double as touch-button glyphs. */
function makeGadgetIcon(kind) {
  const s = surface(15, 15), x = s.x;
  if (kind === 'shield') {
    px(x, 'C', 3, 1, 9, 2); px(x, 'C', 2, 3, 11, 5); px(x, 'C', 3, 8, 9, 2);
    px(x, 'C', 5, 10, 5, 2); px(x, 'C', 6, 12, 3, 1);
    px(x, 'E', 4, 3, 7, 1); px(x, 'E', 6, 5, 3, 3);
  } else if (kind === 'emp') {
    px(x, 'Y', 6, 1, 3, 5); px(x, 'Y', 3, 6, 9, 3); px(x, 'Y', 6, 9, 3, 5);
    px(x, 'E', 7, 3, 1, 8); px(x, 'E', 5, 7, 5, 1);
    px(x, 'C', 1, 6, 1, 3); px(x, 'C', 13, 6, 1, 3);
  } else {
    px(x, 'B', 6, 0, 3, 8); px(x, 'R', 6, 1, 3, 2);
    px(x, 'B', 4, 4, 2, 5); px(x, 'B', 9, 4, 2, 5);
    px(x, 'A', 6, 8, 3, 2); px(x, 'O', 5, 10, 5, 3); px(x, 'Y', 6, 11, 3, 2);
  }
  return s;
}

/* Hover traffic: little background vehicles, three silhouettes. */
/* Hover traffic. They travel leftwards, so the nose tapers to the left and
   the running lights sit accordingly. */
function makeCar(variant, colour) {
  const w = [18, 14, 22][variant], h = 8;
  const s = surface(w, h), x = s.x;
  px(x, 'K', 1, 1, w - 2, 6);           // silhouette
  px(x, 'K', 0, 3, w, 3);               // tapered nose and tail
  px(x, 'N', 1, 2, w - 2, 4);
  px(x, colour, 2, 3, w - 4, 2);        // hull
  px(x, colour, 3, 2, w - 6, 1);
  px(x, 'D', 4, 2, Math.max(2, w - 10), 1);   // cabin
  px(x, 'C', 5, 2, Math.max(1, w - 12), 1);   // glass
  px(x, 'E', 1, 3, 1, 1);               // headlight, leading edge
  px(x, 'R', w - 2, 4, 1, 1);           // tail light
  px(x, 'c', 4, 6, w - 8, 1);           // thruster wash
  return s;
}

/* ---- Build -------------------------------------------------------------- */

export const S = {};       // name -> {c, w, h}

let built = false;

export function buildSprites() {
  if (built) return S;

  S.body = fromRows(BODY);
  S.bodyHurt = fromRows(BODY_HURT);
  S.legs = LEGS.map((r) => fromRows(r));
  S.legsJump = fromRows(LEGS_JUMP);
  S.legsFall = fromRows(LEGS_FALL);
  S.slide = fromRows(SLIDE);
  S.dead = fromRows(DEAD);

  // Left-facing copies. Mirrored once at boot rather than with a canvas
  // transform every frame.
  S.flip = {
    body: flip(S.body),
    bodyHurt: flip(S.bodyHurt),
    legs: S.legs.map(flip),
    legsJump: flip(S.legsJump),
    legsFall: flip(S.legsFall),
    slide: flip(S.slide),
    dead: flip(S.dead),
  };

  // Drone: one set of canvases per skin, per pose.
  S.drone = {};
  for (const skin of DRONE_SKINS) {
    const m = { H: skin.map.hull, h: skin.map.hull2, T: skin.map.trim, I: skin.map.light, V: skin.map.vent };
    S.drone[skin.id] = {
      idle: fromRows(DRONE, m),
      scan: fromRows(DRONE_SCAN, m),
      fire: fromRows(DRONE_FIRE, m),
      glow: skin.map.glow,
    };
  }

  S.enemy = {
    scout: fromRows(E_SCOUT),
    shield: fromRows(E_SHIELD),
    bomber: fromRows(E_BOMBER),
    turret: fromRows(E_TURRET),
    tank: fromRows(E_TANK),
  };

  // Bosses. Mirrored once at boot, the same way the player is.
  S.boss = {
    warden: fromRows(B_WARDEN), hexcell: fromRows(B_HEXCELL), convoy: fromRows(B_CONVOY),
    choir: fromRows(B_CHOIR), ripper: fromRows(B_RIPPER), prime: fromRows(B_PRIME),
  };
  S.bossFlip = {};
  for (const k in S.boss) S.bossFlip[k] = flip(S.boss[k]);
  // Boss parts — relays, pods, drones: anything mounted on or orbiting a boss
  // that has to be killed separately.
  S.bossPart = {
    relay: fromRows(B_RELAY), pod: fromRows(B_POD), shard: fromRows(B_SHARD),
  };
  // Turrets and tanks are ground-mounted and face left already; flying enemies
  // get a mirrored copy for the rare case they are drawn retreating.
  S.enemyFlip = {};
  for (const k in S.enemy) S.enemyFlip[k] = flip(S.enemy[k]);

  S.crate = {};
  S.crateOpen = {};
  // [body, rail/band, accent]
  const crateCols = {
    common: ['M', 'B', 'W'],
    rare:   ['c', 'C', 'E'],
    epic:   ['F', 'P', 'Y'],
    vault:  ['o', 'A', 'E'],
  };
  for (const k in crateCols) {
    const [b, c, a] = crateCols[k];
    S.crate[k] = makeCrate(b, c, a, false);
    S.crateOpen[k] = makeCrate(b, c, a, true);
  }

  S.coin = [0, 1, 2, 3].map(makeCoin);
  S.key = makeKey();
  S.pod = {
    health: makePod('G', 'cross'),
    energy: makePod('C', 'bolt'),
    shield: makePod('P', 'ring'),
    parts:  makePod('A', 'ring'),
  };

  S.power = {};
  const powerLook = {
    rapid: ['Y', 'rapid'], shield: ['C', 'shield'], magnet: ['A', 'magnet'],
    overcharge: ['P', 'bolt'], missile: ['R', 'missile'], berserk: ['R', 'skull'],
    magnetStorm: ['G', 'magnet'], infinite: ['C', 'inf'],
  };
  for (const k in powerLook) S.power[k] = makePower(powerLook[k][0], powerLook[k][1]);

  S.gadget = { shield: makeGadgetIcon('shield'), emp: makeGadgetIcon('emp'), missile: makeGadgetIcon('missile') };

  S.car = [
    makeCar(0, 'P'), makeCar(1, 'C'), makeCar(2, 'M'),
    makeCar(0, 'R'), makeCar(1, 'A'),
  ];

  built = true;
  return S;
}

/* Exposed for the loadout screen, which wants a big clean drone portrait. */
export function droneSheet(skinId) {
  return S.drone[skinId] || S.drone.standard;
}
