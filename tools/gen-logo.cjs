// Burnwatch logo generator — pixel-art robot on fire.
//
// The art is a character grid (one char per pixel, palette below), encoded to
// PNG by a from-scratch encoder (zlib deflate + hand-built chunks/CRC) and to
// ICO by wrapping a 256px PNG. No image libraries involved.
//
// Outputs:
//   assets/logo.png            32x32   title-bar logo
//   assets/tray-icon.png       32x32   static tray fallback
//   assets/icon.ico            256px   window/installer icon
//   assets/burnwatch-hero.png  512px   README hero (detailed 64x64 art at 8x)
//
// Run: node tools/gen-logo.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- minimal PNG encoder ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function encodeICO(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = 0; entry[1] = 0;
  entry[4] = 1; entry[6] = 32;
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuf]);
}

// ---- palette ----
const P = {
  '.': null,
  R: [229, 72, 61, 255],    // flame red
  O: [255, 140, 26, 255],   // flame orange
  Y: [255, 210, 63, 255],   // flame yellow
  W: [255, 248, 214, 255],  // white-hot core
  D: [42, 47, 58, 255],     // dark outline
  S: [199, 205, 214, 255],  // robot silver
  H: [232, 236, 242, 255],  // silver highlight
  M: [148, 156, 170, 255],  // silver shade
  E: [53, 224, 255, 255],   // cyan eye
  L: [214, 246, 255, 255],  // eye glint
  G: [24, 28, 36, 255],     // grill / dark slots
  N: [255, 92, 74, 255],    // gauge needle red
  // psychic sprite colours
  K: [237, 190, 149, 255],  // skin
  k: [214, 163, 120, 255],  // skin shade
  P: [139, 92, 246, 255],   // turban purple
  p: [104, 63, 205, 255],   // turban shade
  C: [53, 224, 255, 255],   // psionic cyan
  F: [217, 70, 239, 255],   // psionic fuchsia
  U: [255, 255, 255, 255]   // eye white
};

// ---- 32x32 base art ----
const ART = [
  '................................',
  '..........R.....R...............',
  '.......R..O..R..O....R..........',
  '.......O..O..O..O.R..O..........',
  '....R..O.RO..OR.O.O.RO..R.......',
  '....O.RO.OY..YO.OYO.OO..O.......',
  '....O.OO.OYR.YOOYYOROYR.O.......',
  '...RO.OYOYYO.YYYYYYOYYO.OR......',
  '...OO.OYYYYYYYWYYWYYYYYOOO......',
  '...OYOYYWWYYWYWWYWWYWYYYOYO.....',
  '..ROYYYWWWYYWWWWWWWYWWYYYOOR....',
  '..OYYWWWDDDDDDDDDDDDDDWWYYYO....',
  '..OYWWDDSSSSSSSSSSSSSSDDWYYO....',
  '..RYWDSSSSSSSSSSSSSSSSSSDWYR....',
  '...ODSSSSSSSSSSSSSSSSSSSSDO.....',
  '...DSSSDDDSSSSSSSSSSDDDSSSD.....',
  '..RDSSDEEDSSSSSSSSSSDEEDSSDR....',
  '..ODSSDEEDSSSSSSSSSSDEEDSSDO....',
  '...DSSSDDSSSSSSSSSSSSDDSSSD.....',
  '...DSSSSSSSSSSSSSSSSSSSSSSD.....',
  '...DMSSDGGGGGGGGGGGGGGDSSMD.....',
  '...DMSSDGDGDGDGDGDGDGGDSSMD.....',
  '...DMSSSDDDDDDDDDDDDDDSSSMD.....',
  '....DMSSSSSSSSSSSSSSSSSSMD......',
  '.....DDDDDDDDDDDDDDDDDDDD.......',
  '....DSSDDSSSSSSSSSSSSDDSSD......',
  '...DSSSD.DSSSSSSSSSSD.DSSSD.....',
  '...DSMSD.DSSSSSSSSSSD.DSMSD.....',
  '...DSMSD.DMSSSSSSSSMD.DSMSD.....',
  '...DDDD..DMMSSSSSSMMD..DDDD.....',
  '..........DDDDDDDDDD............',
  '................................'
];

// ---- hero: 2x upscale of the base art + a detail pass ----
function buildHeroGrid() {
  const g = [];
  for (const rowStr of ART) {
    const row = [];
    for (const ch of rowStr) { row.push(ch, ch); }
    g.push(row, [...row]);
  }
  const put = (r, c, ch) => { if (g[r] && g[r][c] !== undefined) g[r][c] = ch; };

  // Eye glints — a bright pixel in each eye's upper-left
  put(32, 14, 'L'); put(32, 15, 'L'); put(33, 14, 'L');
  put(32, 40, 'L'); put(32, 41, 'L'); put(33, 40, 'L');

  // Head sheen — diagonal highlight streak across the upper faceplate
  for (let i = 0; i < 9; i++) {
    put(27 + Math.floor(i / 3), 12 + i, 'H');
    put(28 + Math.floor(i / 3), 13 + i, 'H');
  }

  // Extra flame tongues above the blaze
  const extraFlames = [
    [0, 21, 'R'], [0, 22, 'R'], [1, 33, 'R'], [0, 41, 'R'],
    [2, 12, 'R'], [1, 13, 'O'], [3, 45, 'O'], [2, 44, 'R'],
    [4, 8, 'R'], [5, 9, 'O'], [4, 49, 'R'], [5, 48, 'O']
  ];
  for (const [r, c, ch] of extraFlames) put(r, c, ch);

  // Chest gauge — Burnwatch keeps a meter on its own burn
  const gauge = [
    '..DDDD..',
    '.DHHHHD.',
    'DHWWWWHD',
    'DHWNNWHD',
    'DHWWNWHD',
    '.DHHNHD.',
    '..DDDD..'
  ];
  const gr = 51, gc = 28;
  for (let r = 0; r < gauge.length; r++) {
    for (let c = 0; c < gauge[r].length; c++) {
      if (gauge[r][c] !== '.') put(gr + r, gc + c, gauge[r][c]);
    }
  }

  // Shoulder rivets
  put(51, 12, 'M'); put(51, 51, 'M');

  return g.map((row) => row.join(''));
}

// ---- the psychic (graph forecast toggle) ----
// Idle: eyes open, staring at you. On: eyes closed, psionic beams.
const PSYCHIC_IDLE = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.........DDDDDD.........',
  '.......DDPPPPPPDD.......',
  '......DPPPPPPPPPPD......',
  '.....DPPPPYYPPPPPPD.....',
  '.....DPPPPYYPPPPPPD.....',
  '.....DPpPPPPPPPPpPD.....',
  '......DppPPPPPPppD......',
  '......DKKKKKKKKKKD......',
  '.....DKKKKKKKKKKKKD.....',
  '.....DKUDDKKKKUDDKD.....',
  '.....DKUDDKKKKUDDKD.....',
  '.....DKKKKKKKKKKKKD.....',
  '.....DKKKKKkkKKKKKD.....',
  '......DKKkDDDDkKKD......',
  '.......DKKKKKKKKD.......',
  '......DDpPPPPPPpDD......',
  '.....DpPPPPPPPPPPpD.....',
  '....DpPPPPPPPPPPPPpD....',
  '....DDDDDDDDDDDDDDDD....'
];

const PSYCHIC_ON = [
  '..C....F....C....F......',
  '...C...F...C...F........',
  '.C..C..F..C..F..C..F....',
  '..C..C.F.C..F..C..F.....',
  '...C..CFC..F..C..F......',
  '....C..DDDDDD..F........',
  '.......DDPPPPPPDD.......',
  '......DPPPPPPPPPPD......',
  '.....DPPPPYYPPPPPPD.....',
  '.....DPPPPYYPPPPPPD.....',
  '.....DPpPPPPPPPPpPD.....',
  '......DppPPPPPPppD......',
  '......DKKKKKKKKKKD......',
  '.....DKKKKKKKKKKKKD.....',
  '.....DKDDDKKKKDDDKD.....',
  '.....DKKKKKKKKKKKKD.....',
  '.....DKKKKKKKKKKKKD.....',
  '.....DKKKKKkkKKKKKD.....',
  '......DKKkDDDDkKKD......',
  '.......DKKKKKKKKD.......',
  '......DDpPPPPPPpDD......',
  '.....DpPPPPPPPPPPpD.....',
  '....DpPPPPPPPPPPPPpD....',
  '....DDDDDDDDDDDDDDDD....'
];

// ---- the foot (compact-mode toggle) ----
// Up: boot hovering over a pristine can. Down: boot stomped, can crushed.
const PRESS_UP = [
  '',
  '.........DDDDDD.........',
  '.........DkKKkD.........',
  '.........DkKKkD.........',
  '.........DkKKkD.........',
  '........DDkKKkDD........',
  '......DDkkKKKKkDD.......',
  '....DDkKKKKKKKKkDD......',
  '...DkKKKKKKKKKKKkD......',
  '...DMMMMMMMMMMMMMD......',
  '...DDDDDDDDDDDDDDD......',
  '',
  '',
  '',
  '........DDDDDDDD........',
  '.......DEEEEEEEED.......',
  '.......DEEEEEEEED.......',
  '.......DENNNNNNED.......',
  '.......DENNNNNNED.......',
  '.......DEEEEEEEED.......',
  '.......DEEEEEEEED.......',
  '.......DDDDDDDDDD.......',
  'DDDDDDDDDDDDDDDDDDDDDDDD',
  'DSSSSSSSSSSSSSSSSSSSSSSD'
];

const PRESS_DOWN = [
  '',
  '',
  '',
  '',
  '.........DDDDDD.........',
  '.........DkKKkD.........',
  '.........DkKKkD.........',
  '.........DkKKkD.........',
  '.........DkKKkD.........',
  '.........DkKKkD.........',
  '........DDkKKkDD........',
  '......DDkkKKKKkDD.......',
  '....DDkKKKKKKKKkDD......',
  '...DkKKKKKKKKKKKkD......',
  '...DMMMMMMMMMMMMMD......',
  '...DDDDDDDDDDDDDDD......',
  '..Y................Y....',
  '.Y..DDDDDDDDDDDD....Y...',
  '....DENEENEENEED........',
  '...DDEENEENEENEEDD......',
  '..DDDDDDDDDDDDDDDDDD....',
  'DDDDDDDDDDDDDDDDDDDDDDDD',
  'DSSSSSSSSSSSSSSSSSSSSSSD'
];

// ---- the pizazz clown (32px, detailed) ----
// Happy: rainbow hair, painted face, big grin. Jailed: sobbing behind bars,
// tears streaming down both cheeks.
const CLOWN_HAPPY = [
  '',
  '......RR.....CC.....FF..........',
  '.....RRRR...CCCC...FFFF.........',
  '....RRRRR..CCCCCC..FFFFF........',
  '....RORRRDDDDDDDDDDFFYFF........',
  '....RRRDDUUUUUUUUUUDDFFF........',
  '.....RDUUUUUUUUUUUUUUDF.........',
  '....DUUUUUUUUUUUUUUUUUUD........',
  '....DUUUDDDUUUUUUDDDUUUD........',
  '....DUUDDDDDUUUUDDDDDUUD........',
  '....DUUDUDDDUUUUDUDDDUUD........',
  '....DUUDDDDDUUUUDDDDDUUD........',
  '....DUUUDDDUUUUUUDDDUUUD........',
  '....DUUUUUUUNNNNUUUUUUUD........',
  '....DUUUUUUNNNNNNUUUUUUD........',
  '....DUUUUUUNNNNNNUUUUUUD........',
  '....DUUUUUUUNNNNUUUUUUUD........',
  '....DUUDUUUUUUUUUUUUDUUD........',
  '....DUUNDUUUUUUUUUUDNUUD........',
  '....DUUNNDDUUUUUUDDNNUUD........',
  '....DUUUNNNDDDDDDNNNUUUD........',
  '....DUUUUNNNNNNNNNNUUUUD........',
  '.....DUUUUUUUUUUUUUUUUD.........',
  '......DUUUUUUUUUUUUUUD..........',
  '.......DDUUUUUUUUUUDD...........',
  '.........DDDDDDDDDD.............',
  '........RRR......FFF............',
  '.......RRRRR....FFFFF...........',
  '........RRR......FFF............',
  ''
];

const CLOWN_JAIL = [
  '',
  '......RR.....CC.....FF..........',
  '.....RRRR...CCCC...FFFF.........',
  '....RRRRR..CCCCCC..FFFFF........',
  '....RORRRDDDDDDDDDDFFYFF........',
  '....RRRDDUUUUUUUUUUDDFFF........',
  '.....RDUUUUUUUUUUUUUUDF.........',
  '....DUUUUUUUUUUUUUUUUUUD........',
  '....DUUDDDDUUUUUUDDDDUUD........',
  '....DUUUDDDDUUUUDDDDUUUD........',
  '....DUUDDDDDUUUUDDDDDUUD........',
  '....DUUDUDDDUUUUDDDUDUUD........',
  '....DUUCCDUUUUUUUUDCCUUD........',
  '....DUUCCUUUNNNNUUUCCUUD........',
  '....DUUCCUUNNNNNNUUCCUUD........',
  '....DUUCCUUNNNNNNUUCCUUD........',
  '....DUUCCUUUNNNNUUUCCUUD........',
  '....DUCCCUUUUUUUUUUCCCUD........',
  '....DUUCCUUUUUUUUUUCCUUD........',
  '....DUUCUUUDDDDDDUUUCUUD........',
  '....DUUUUDDNNNNNNDDUUUUD........',
  '....DUUUDNNNNNNNNNNDUUUD........',
  '.....DUUUDDDDDDDDDDUUUD.........',
  '......DUUUUUUUUUUUUUUD..........',
  '.......DDUUUUUUUUUUDD...........',
  '.........DDDDDDDDDD.............',
  '........CC........CC............',
  '.......CCC.......CCC............',
  '........C.........C.............',
  ''
];

// stamp thick jail bars in front of the sobbing clown
for (let r = 0; r < 30; r++) {
  const row = (CLOWN_JAIL[r] || '').padEnd(32, '.').split('');
  for (const c of [1, 2, 8, 9, 15, 16, 22, 23, 29, 30]) row[c] = 'G';
  if (r === 0 || r === 29) for (let c = 0; c < 32; c++) row[c] = 'G';
  CLOWN_JAIL[r] = row.join('');
}

// Rows may be ragged for readability — pad everything to an NxN grid
function padGrid(art, size) {
  const rows = art.map((row) => (row || '').padEnd(size, '.').slice(0, size));
  while (rows.length < size) rows.push('.'.repeat(size));
  return rows.slice(0, size);
}
const pad24 = (art) => padGrid(art, 24);

function artToRGBA(art, scale) {
  const h = art.length, w = art[0].length;
  const out = Buffer.alloc(w * scale * h * scale * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = P[art[y][x]];
      if (!px) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const idx = ((y * scale + sy) * w * scale + (x * scale + sx)) * 4;
          out[idx] = px[0]; out[idx + 1] = px[1]; out[idx + 2] = px[2]; out[idx + 3] = px[3];
        }
      }
    }
  }
  return out;
}

const assets = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(assets, 'logo.png'), encodePNG(32, 32, artToRGBA(ART, 1)));
fs.writeFileSync(path.join(assets, 'tray-icon.png'), encodePNG(32, 32, artToRGBA(ART, 1)));
fs.writeFileSync(path.join(assets, 'icon.ico'), encodeICO(encodePNG(256, 256, artToRGBA(ART, 8))));
const hero = buildHeroGrid();
fs.writeFileSync(path.join(assets, 'burnwatch-hero.png'), encodePNG(512, 512, artToRGBA(hero, 8)));
fs.writeFileSync(path.join(assets, 'psychic-idle.png'), encodePNG(24, 24, artToRGBA(PSYCHIC_IDLE, 1)));
fs.writeFileSync(path.join(assets, 'psychic-on.png'), encodePNG(24, 24, artToRGBA(PSYCHIC_ON, 1)));
fs.writeFileSync(path.join(assets, 'press-up.png'), encodePNG(24, 24, artToRGBA(pad24(PRESS_UP), 1)));
fs.writeFileSync(path.join(assets, 'press-down.png'), encodePNG(24, 24, artToRGBA(pad24(PRESS_DOWN), 1)));
fs.writeFileSync(path.join(assets, 'clown-happy.png'), encodePNG(32, 32, artToRGBA(padGrid(CLOWN_HAPPY, 32), 1)));
fs.writeFileSync(path.join(assets, 'clown-jail.png'), encodePNG(32, 32, artToRGBA(padGrid(CLOWN_JAIL, 32), 1)));
console.log('logo, tray-icon, icon.ico, hero, psychic, press + clown sprites written');
