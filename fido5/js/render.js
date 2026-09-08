/* ==========================================================================
   FiDo-5 — Renderer.
   Draws the whole run onto a 480x270 canvas which is then scaled up with
   nearest-neighbour, so the result is honest pixel art rather than a blurry
   downscale. The parallax city is generated once into offscreen strips and
   tiled, which is what keeps a phone at frame rate.

   Readability rules that are deliberate, not incidental:
     - barriers carry a chevron marking as well as a colour, so "jump this"
       and "slide under this" never depend on hue
     - the playable deck is always the brightest thing on screen
     - background detail is capped by the quality setting before anything
       that matters to gameplay is
   ========================================================================== */

import { WORLD, PAL } from './data.js';
import { S } from './sprites.js';
import { makeRng } from './world.js';

const W = WORLD.viewW, H = WORLD.viewH;

/* ---- Pixel font ---------------------------------------------------------
   3x5 glyphs in a 4x6 cell. Used for damage numbers, loot labels, FiDo-5's
   dialogue and the contextual prompts. */
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['#.#', '###', '###', '###', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '###', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['...', '...', '...', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  "'": ['.#.', '.#.', '...', '...', '...'],
  '=': ['...', '###', '...', '###', '...'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '(': ['.#.', '#..', '#..', '#..', '.#.'],
  ')': ['.#.', '..#', '..#', '..#', '.#.'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
  '*': ['...', '#.#', '.#.', '#.#', '...'],
  ' ': ['...', '...', '...', '...', '...'],
};

export const GLYPH_W = 4, GLYPH_H = 6;

export function textWidth(str, scale = 1) {
  return str.length * GLYPH_W * scale;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    canvas.width = W;
    canvas.height = H;
    this.quality = 1;
    this.hiContrast = false;
    this.textCache = new Map();
    this.buildBackdrop(1337);
  }

  setQuality(q) { this.quality = q; }
  setContrast(on) { this.hiContrast = on; }

  /* ---- Text ------------------------------------------------------------- */

  /* Strings are rendered once into a tiny canvas and reused; a firefight can
     put a lot of damage numbers on screen at once. */
  _textCanvas(str, colour, outline) {
    const key = str + '|' + colour + '|' + (outline ? 1 : 0);
    let c = this.textCache.get(key);
    if (c) return c;
    const pad = outline ? 1 : 0;
    const cv = document.createElement('canvas');
    cv.width = str.length * GLYPH_W + pad * 2;
    cv.height = GLYPH_H + pad * 2;
    const x = cv.getContext('2d');
    const draw = (dx, dy, col) => {
      x.fillStyle = col;
      for (let i = 0; i < str.length; i++) {
        const g = GLYPHS[str[i].toUpperCase()] || GLYPHS[' '];
        for (let r = 0; r < 5; r++) {
          const row = g[r];
          for (let cc = 0; cc < 3; cc++) {
            if (row[cc] === '#') x.fillRect(dx + i * GLYPH_W + cc, dy + r, 1, 1);
          }
        }
      }
    };
    if (outline) {
      const dark = PAL.K;
      for (const [ox, oy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) draw(ox, oy, dark);
    }
    draw(pad, pad, PAL[colour] || colour);
    if (this.textCache.size > 160) {
      // Cheap eviction: drop the oldest insertion.
      const first = this.textCache.keys().next().value;
      this.textCache.delete(first);
    }
    this.textCache.set(key, cv);
    return cv;
  }

  text(str, x, y, colour = 'E', scale = 1, align = 'left', outline = true) {
    if (!str) return;
    const cv = this._textCanvas(String(str), colour, outline);
    let dx = x;
    if (align === 'center') dx = x - (cv.width * scale) / 2;
    if (align === 'right') dx = x - cv.width * scale;
    this.ctx.drawImage(cv, Math.round(dx), Math.round(y), cv.width * scale, cv.height * scale);
  }

  /* ---- Backdrop --------------------------------------------------------- */

  /* Three tiling strips: distant towers, mid blocks with lit windows, and a
     near layer of gantries. Generated once from a seed. */
  buildBackdrop(seed) {
    const rng = makeRng(seed);
    // Heights are chosen so the whole skyline sits behind the rooftop deck and
    // meets the street, leaving the three playable levels clear of clutter.
    const street = WORLD.tierY[0];
    this.far  = this._towerStrip(rng, 640, street - 24, ['#0e1229', '#111635'], 0.07, false);
    this.mid  = this._towerStrip(rng, 480, street - 52, ['#141a38', '#181f45'], 0.30, true);
    this.near = this._gantryStrip(rng, 400, street - 86);
    this.signs = this._signStrip(rng, 480);
    this.skyCache = null;
  }

  /* One definition of the parallax stack, shared by the run and the menu. */
  _layers() {
    const street = WORLD.tierY[0];
    return [
      { img: this.far,   k: 0.10, y: 24 },
      { img: this.mid,   k: 0.30, y: 52 },
      { img: this.signs, k: 0.30, y: 68, skipLow: true },
      { img: this.near,  k: 0.60, y: 86, skipLow: true },
    ];
  }

  _towerStrip(rng, w, h, cols, litChance, neon) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    let cx = 0;
    while (cx < w) {
      const bw = 16 + Math.floor(rng() * 34);
      const bh = 18 + Math.floor(rng() * Math.max(8, h - 20));
      const top = h - bh;
      x.fillStyle = cols[Math.floor(rng() * cols.length)];
      x.fillRect(cx, top, bw, bh);
      // A slightly lighter left face gives the block some form.
      x.fillStyle = 'rgba(255,255,255,0.045)';
      x.fillRect(cx, top, Math.max(1, (bw * 0.28) | 0), bh);
      // Aerials and roof boxes.
      if (rng() < 0.4) {
        x.fillStyle = cols[0];
        const aw = 3 + Math.floor(rng() * 6);
        x.fillRect(cx + ((bw - aw) / 2) | 0, top - (3 + Math.floor(rng() * 9)), aw, 10);
      }
      // Windows.
      for (let wy = top + 4; wy < h - 4; wy += 5) {
        for (let wx = cx + 3; wx < cx + bw - 3; wx += 4) {
          if (rng() > litChance) continue;
          const warm = rng();
          x.fillStyle = warm < 0.18 ? 'rgba(255,226,109,0.42)'
            : warm < 0.42 ? 'rgba(53,208,255,0.36)'
            : warm < 0.6 ? 'rgba(183,148,255,0.34)'
            : 'rgba(207,214,247,0.20)';
          x.fillRect(wx, wy, 2, 2);
        }
      }
      if (neon && rng() < 0.35) {
        // A vertical neon strip up one edge.
        x.fillStyle = rng() < 0.5 ? 'rgba(255,61,104,0.30)' : 'rgba(53,208,255,0.30)';
        x.fillRect(cx + (rng() < 0.5 ? 1 : bw - 2), top + 4, 1, bh - 10);
      }
      cx += bw + 1 + Math.floor(rng() * 6);
    }
    return cv;
  }

  _gantryStrip(rng, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    let cx = 0;
    while (cx < w) {
      const gap = 62 + Math.floor(rng() * 96);
      const pw = 6 + Math.floor(rng() * 5);
      x.fillStyle = '#0e1329';
      x.fillRect(cx, 0, pw, h);
      x.fillStyle = '#151c3a';
      x.fillRect(cx + 1, 0, 2, h);
      // Cross braces.
      x.fillStyle = '#0e1329';
      for (let y = 9; y < h; y += 16) x.fillRect(cx - 5, y, pw + 10, 2);
      cx += gap;
    }
    return cv;
  }

  _signStrip(rng, w) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = 26;
    const x = cv.getContext('2d');
    const hues = ['#ff3d68', '#35d0ff', '#b794ff', '#ffb238', '#2ee6a6'];
    let cx = 10;
    while (cx < w - 40) {
      const bw = 11 + Math.floor(rng() * 20);
      const bh = 8 + Math.floor(rng() * 14);
      const col = hues[Math.floor(rng() * hues.length)];
      const y = Math.floor(rng() * (26 - bh));
      x.fillStyle = '#0a0d1c';
      x.fillRect(cx - 1, y - 1, bw + 2, bh + 2);
      x.fillStyle = col;
      x.globalAlpha = 0.16;
      x.fillRect(cx, y, bw, bh);
      x.globalAlpha = 1;
      // Frame plus a couple of glyph-like bars so it reads as signage.
      x.fillRect(cx, y, bw, 1);
      x.fillRect(cx, y + bh - 1, bw, 1);
      for (let i = 0; i < 3; i++) {
        if (rng() < 0.6) x.fillRect(cx + 2 + i * 4, y + 3, 2, Math.max(2, bh - 6));
      }
      cx += bw + 22 + Math.floor(rng() * 66);
    }
    return cv;
  }

  /* ---- Frame ------------------------------------------------------------ */

  draw(g) {
    const x = this.ctx;
    const cam = g.run.camX;

    this._sky(x, g);
    if (this.quality > 0.34) this._parallax(x, cam, g);
    this._traffic(x, g);
    // Push the city back. Nothing behind this line is gameplay, and the
    // brief is explicit that readability beats visual density.
    x.globalAlpha = 0.44;
    x.fillStyle = '#0a0d1c';
    x.fillRect(0, 0, W, H);
    x.globalAlpha = 1;
    this._world(x, cam, g);
    this._crates(x, cam, g);
    this._coins(x, cam, g);
    this._pickups(x, cam, g);
    this._enemies(x, cam, g);
    this._blasts(x, cam, g);
    this._incoming(x, cam, g);
    this._bullets(x, cam, g);
    this._drone(x, cam, g);
    this._player(x, cam, g);
    this._particles(x, cam, g);
    this._arcs(x, cam, g);
    this._floaters(x, cam, g);
    this._overlay(x, g);
  }

  _sky(x, g) {
    if (!this.skyCache) {
      const cv = document.createElement('canvas');
      cv.width = 1; cv.height = H;
      const c = cv.getContext('2d');
      const grd = c.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#070a18');
      grd.addColorStop(0.42, '#141a3a');
      grd.addColorStop(0.66, '#2a2154');
      grd.addColorStop(0.84, '#4b2560');
      grd.addColorStop(1, '#1a1030');
      c.fillStyle = grd;
      c.fillRect(0, 0, 1, H);
      this.skyCache = cv;
    }
    x.drawImage(this.skyCache, 0, 0, 1, H, 0, 0, W, H);

    // Stars, fixed to the sky rather than the world.
    if (this.quality > 0.34) {
      x.fillStyle = 'rgba(223,228,255,0.5)';
      for (let i = 0; i < 26; i++) {
        const sx = (i * 71) % W;
        const sy = (i * 37) % 46;
        if ((i * 13) % 7 === 0) continue;
        x.fillRect(sx, sy, 1, 1);
      }
    }
  }

  _parallax(x, cam, g) {
    for (const L of this._layers()) {
      if (this.quality < 0.7 && L.skipLow) continue;
      const w = L.img.width;
      let off = -((cam * L.k) % w);
      if (off > 0) off -= w;
      for (let dx = off; dx < W; dx += w) x.drawImage(L.img, Math.round(dx), Math.round(L.y));
    }
  }

  _traffic(x, g) {
    for (const c of g.run.traffic) {
      const img = S.car[c.v];
      x.globalAlpha = c.a;
      x.drawImage(img.c, Math.round(c.x), Math.round(c.y));
      x.globalAlpha = 1;
    }
  }

  /* Street, walkway and rooftop decks, plus the barriers on them. */
  _world(x, cam, g) {
    const world = g.world;
    const M = WORLD.metre;
    const c0 = world.colOfX(cam) - 1;
    const c1 = world.colOfX(cam + W) + 1;

    // --- street ---------------------------------------------------------
    const sY = WORLD.tierY[0];
    x.fillStyle = '#0a0d1c';
    x.fillRect(0, sY, W, H - sY);

    for (let c = c0; c <= c1; c++) {
      const sx = Math.round(c * M - cam);
      if (world.hasPlatform(c, 0)) {
        x.fillStyle = '#1d2447';
        x.fillRect(sx, sY, M, H - sY);
        x.fillStyle = '#333c70';
        x.fillRect(sx, sY + 1, M, 2);
        x.fillStyle = '#8792ce';
        x.fillRect(sx, sY, M, 1);
        // Lane dashes and a wet sheen line.
        if ((c & 1) === 0) {
          x.fillStyle = 'rgba(143,154,210,0.30)';
          x.fillRect(sx + 2, sY + 17, 7, 1);
        }
        x.fillStyle = 'rgba(53,208,255,0.14)';
        x.fillRect(sx, sY + 7, M, 1);
      } else {
        // A gap: a lit void with hazard chevrons on the lip.
        x.fillStyle = '#05070f';
        x.fillRect(sx, sY, M, H - sY);
        x.fillStyle = 'rgba(255,61,104,0.5)';
        x.fillRect(sx, sY, M, 1);
        if (!world.hasPlatform(c - 1, 0)) {
          x.fillStyle = 'rgba(255,178,56,0.5)';
          for (let i = 0; i < 3; i++) x.fillRect(sx + 1 + i * 4, sY + 3 + i, 3, 1);
        }
      }
    }

    // --- raised decks ---------------------------------------------------
    for (let t = 1; t < WORLD.tierCount; t++) {
      const y = WORLD.tierY[t];
      const edge = t === 1 ? '#35d0ff' : '#b794ff';
      for (let c = c0; c <= c1; c++) {
        if (!world.hasPlatform(c, t)) continue;
        const sx = Math.round(c * M - cam);
        // A solid slab, lit on top. Only the walking surface is bright: an
        // edge highlight on both sides made it read as an empty outline.
        x.fillStyle = '#232a52';
        x.fillRect(sx, y, M, 9);
        x.fillStyle = '#3a4374';
        x.fillRect(sx, y + 1, M, 3);
        x.fillStyle = '#9aa4d8';
        x.fillRect(sx, y, M, 1);
        x.fillStyle = '#12172f';
        x.fillRect(sx, y + 6, M, 3);
        // A dim service strip along the underside, the only accent colour.
        x.globalAlpha = 0.5;
        x.fillStyle = edge;
        x.fillRect(sx, y + 6, M, 1);
        x.globalAlpha = 1;
        // Shadow cast below the deck, so it separates from the city behind.
        x.globalAlpha = 0.5;
        x.fillStyle = '#05070f';
        x.fillRect(sx, y + 9, M, 3);
        x.globalAlpha = 1;
        // Panel seam.
        if ((c & 1) === 0) { x.fillStyle = '#2c3462'; x.fillRect(sx + M - 1, y + 1, 1, 5); }
        // Supports at the span ends and every few columns.
        const startsHere = !world.hasPlatform(c - 1, t);
        const endsHere = !world.hasPlatform(c + 1, t);
        if (startsHere || endsHere || c % 4 === 0) {
          x.fillStyle = '#181e3d';
          x.fillRect(sx + (startsHere ? 1 : M - 4), y + 9, 3, t === 1 ? 16 : 20);
          x.fillStyle = '#252d59';
          x.fillRect(sx + (startsHere ? 1 : M - 4), y + 9, 1, t === 1 ? 16 : 20);
        }
        // End caps mark where a level runs out, which is information the
        // player needs before they get there.
        if (startsHere || endsHere) {
          const capX = startsHere ? sx : sx + M - 2;
          x.fillStyle = '#0a0d1c';
          x.fillRect(capX, y, 2, 9);
          x.fillStyle = edge;
          x.fillRect(capX, y, 2, 2);
          x.globalAlpha = 0.6;
          x.fillRect(capX, y + 2, 2, 4);
          x.globalAlpha = 1;
        }
      }
    }

    // --- barriers -------------------------------------------------------
    for (let c = c0; c <= c1; c++) {
      for (let t = 0; t < WORLD.tierCount; t++) {
        const kind = world.obstacleAt(c, t);
        if (!kind) continue;
        const sx = Math.round(c * M - cam);
        const surface = WORLD.tierY[t];
        if (kind === 1) this._blockSprite(x, sx, surface - 24, M, 24);
        else this._lowSprite(x, sx, surface - 28, M, 13);
      }
    }
  }

  /* A full-height barrier. Hazard stripes plus an up-chevron: the shape says
     "jump" without relying on the colour. */
  _blockSprite(x, sx, sy, w, h) {
    x.fillStyle = '#080a12';
    x.fillRect(sx, sy, w, h);
    x.fillStyle = '#3b4472';
    x.fillRect(sx + 1, sy + 1, w - 2, h - 2);
    x.fillStyle = '#252c52';
    x.fillRect(sx + 2, sy + 2, w - 4, h - 4);
    // diagonal hazard stripes
    x.fillStyle = '#ffb238';
    for (let i = -h; i < w + h; i += 5) {
      for (let r = 0; r < h - 4; r++) {
        const px = sx + 2 + i + r;
        if (px >= sx + 2 && px < sx + w - 2) x.fillRect(px, sy + 2 + r, 2, 1);
      }
    }
    x.fillStyle = '#080a12';
    x.fillRect(sx + 2, sy + 2, w - 4, 1);
    x.fillRect(sx + 2, sy + h - 3, w - 4, 1);
    // up chevron
    x.fillStyle = '#dfe4ff';
    const cx = sx + (w >> 1);
    for (let i = 0; i < 4; i++) x.fillRect(cx - i, sy + 6 + i, 1, 1);
    for (let i = 0; i < 4; i++) x.fillRect(cx + i, sy + 6 + i, 1, 1);
  }

  /* A low bar with clear air underneath, and a down-chevron for "slide". */
  _lowSprite(x, sx, sy, w, h) {
    x.fillStyle = '#080a12';
    x.fillRect(sx, sy, w, h);
    x.fillStyle = '#4a5280';
    x.fillRect(sx + 1, sy + 1, w - 2, h - 2);
    x.fillStyle = '#ff3d68';
    for (let i = 0; i < w; i += 4) x.fillRect(sx + 1 + i, sy + 2, 2, h - 4);
    x.fillStyle = '#080a12';
    x.fillRect(sx + 1, sy + 1, w - 2, 1);
    x.fillRect(sx + 1, sy + h - 2, w - 2, 1);
    // down chevron
    x.fillStyle = '#dfe4ff';
    const cx = sx + (w >> 1);
    for (let i = 0; i < 3; i++) x.fillRect(cx - i, sy + h - 4 - i, 1, 1);
    for (let i = 0; i < 3; i++) x.fillRect(cx + i, sy + h - 4 - i, 1, 1);
  }

  /* ---- Entities --------------------------------------------------------- */

  _crates(x, cam, g) {
    g.pools.crates.each((c) => {
      const sx = Math.round(c.x - cam);
      if (sx < -30 || sx > W + 30) return;
      const img = c.opened ? S.crateOpen[c.rarity] : S.crate[c.rarity];
      const bob = c.opened ? 0 : Math.sin(c.bob) * 1.5;
      const sy = Math.round(c.y - img.h + bob);
      // A rarity halo, kept subtle so it never outshines the deck.
      if (!c.opened) {
        const glow = c.rarity === 'vault' ? '#ffb238' : c.rarity === 'epic' ? '#b794ff' : c.rarity === 'rare' ? '#35d0ff' : '#9aa4c8';
        x.globalAlpha = 0.18 + Math.sin(c.bob * 2) * 0.06;
        x.fillStyle = glow;
        x.fillRect(sx - 3, sy - 3, img.w + 6, img.h + 6);
        x.globalAlpha = 1;
      }
      // A tractor tether up to the drone, so carrying reads as deliberate.
      if (c.carried) {
        x.globalAlpha = 0.45;
        x.strokeStyle = '#35d0ff';
        x.beginPath();
        x.moveTo(sx + img.w / 2, sy);
        x.lineTo(Math.round(g.drone.x - cam), Math.round(g.drone.y));
        x.stroke();
        x.globalAlpha = 1;
      }
      x.drawImage(img.c, sx, sy);
      // Scan progress, drawn as a filling bar so it is not colour-only.
      if (c.state === 'opening' && !c.opened) {
        const p = 1 - Math.max(0, c.scan) / c.scanTime;
        x.fillStyle = '#080a12';
        x.fillRect(sx - 1, sy - 7, img.w + 2, 4);
        x.fillStyle = '#35d0ff';
        x.fillRect(sx, sy - 6, Math.max(1, Math.round(img.w * p)), 2);
      }
      if (c.rarity === 'vault' && !c.opened) {
        x.drawImage(S.key.c, sx + img.w - 4, sy - 10);
      }
    });
  }

  _coins(x, cam, g) {
    g.pools.coins.each((c) => {
      const sx = Math.round(c.x - cam);
      if (sx < -12 || sx > W + 12) return;
      const img = S.coin[Math.floor(c.t) % 4];
      x.drawImage(img.c, sx - 4, Math.round(c.y - 4));
    });
  }

  _pickups(x, cam, g) {
    g.pools.pickups.each((p) => {
      const sx = Math.round(p.x - cam);
      if (sx < -20 || sx > W + 20) return;
      const img = p.kind === 'power' ? S.power[p.id] : S.pod[p.kind] || S.pod.health;
      if (!img) return;
      x.globalAlpha = 0.22;
      x.fillStyle = '#dfe4ff';
      x.fillRect(sx - img.w / 2 - 2, Math.round(p.y) - img.h / 2 - 2, img.w + 4, img.h + 4);
      x.globalAlpha = 1;
      x.drawImage(img.c, Math.round(sx - img.w / 2), Math.round(p.y - img.h / 2));
    });
  }

  _enemies(x, cam, g) {
    g.pools.enemies.each((e) => {
      const sx = Math.round(e.x - cam);
      const img = S.enemy[e.def.id];
      if (!img) return;
      const w = img.w * e.scale, h = img.h * e.scale;
      if (sx < -w - 20 || sx > W + w + 20) return;
      const dx = Math.round(sx - w / 2);
      const dy = Math.round(e.y - h / 2);

      // Turret warning: a beam along its own level, well before it fires.
      if (e.state === 'charge') {
        const frac = 1 - e.charge / e.def.chargeTime;
        const y = Math.round(e.y);
        x.globalAlpha = 0.25 + frac * 0.5;
        x.fillStyle = '#ff3d68';
        x.fillRect(0, y, dx, 1);
        x.globalAlpha = 1;
        // A pip marching along the beam makes the timing legible.
        x.fillStyle = '#ffe66d';
        x.fillRect(Math.round(dx * (1 - frac)), y - 1, 3, 3);
      }

      if (e.dying > 0) {
        // Brief white-out on death before the pool takes it back.
        x.globalAlpha = Math.max(0, e.dying / 0.28);
        x.drawImage(img.c, dx, dy, w, h);
        x.globalAlpha = 1;
        return;
      }

      if (e.stun > 0 && ((e.t * 14) | 0) % 2 === 0) x.globalAlpha = 0.6;
      x.drawImage(img.c, dx, dy, w, h);
      x.globalAlpha = 1;

      if (e.flash > 0) {
        x.globalAlpha = Math.min(0.85, e.flash * 8);
        x.fillStyle = '#ffffff';
        x.fillRect(dx, dy, w, h);
        x.globalAlpha = 1;
      }
      if (e.burnT > 0) {
        x.globalAlpha = 0.5;
        x.fillStyle = '#ff7a29';
        x.fillRect(dx, dy + h - 3, w, 2);
        x.globalAlpha = 1;
      }

      // Elite marker: a chevron and a bar, so it is not just "purple".
      if (e.elite) {
        x.fillStyle = '#b794ff';
        const cxp = dx + (w >> 1);
        for (let i = 0; i < 4; i++) { x.fillRect(cxp - i, dy - 6 + i, 1, 1); x.fillRect(cxp + i, dy - 6 + i, 1, 1); }
      }
      // Health bar for anything that takes more than a couple of shots.
      if (e.maxHp > 24 || e.elite) {
        const bw = Math.max(10, Math.round(w));
        x.fillStyle = '#080a12';
        x.fillRect(dx, dy - 4, bw, 3);
        x.fillStyle = e.elite ? '#b794ff' : '#2ee6a6';
        x.fillRect(dx + 1, dy - 3, Math.max(0, Math.round((bw - 2) * (e.hp / e.maxHp))), 1);
      }
    });
  }

  _blasts(x, cam, g) {
    g.pools.blasts.each((b) => {
      const sx = Math.round(b.x - cam);
      const sy = Math.round(b.y);
      if (b.life < 0) {
        // Arming ring: dashed, pulsing, unmistakable.
        const pulse = 0.4 + 0.6 * Math.abs(Math.sin(b.life * 12));
        x.globalAlpha = pulse * 0.8;
        x.strokeStyle = '#ffb238';
        x.lineWidth = 1;
        x.beginPath();
        x.arc(sx + 0.5, sy + 0.5, b.maxR, 0, Math.PI * 2);
        x.stroke();
        x.globalAlpha = 1;
        x.fillStyle = '#ff3d68';
        x.fillRect(sx - 2, sy - 2, 4, 4);
        return;
      }
      const p = b.life / b.max;
      x.globalAlpha = Math.max(0, 1 - p);
      x.fillStyle = PAL[b.colour] || '#ffb238';
      const r = Math.round(b.r);
      x.beginPath();
      x.arc(sx + 0.5, sy + 0.5, r, 0, Math.PI * 2);
      x.fill();
      x.globalAlpha = Math.max(0, 0.8 - p);
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.arc(sx + 0.5, sy + 0.5, Math.max(1, r * 0.55), 0, Math.PI * 2);
      x.fill();
      x.globalAlpha = 1;
    });
  }

  /* Missile salvo markers: the player can see where the strike will land. */
  _incoming(x, cam, g) {
    for (const m of g.run.incoming) {
      const sx = Math.round(m.x - cam);
      const sy = Math.round(m.y);
      x.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(m.t * 18));
      x.strokeStyle = '#ff7a29';
      x.beginPath();
      x.arc(sx + 0.5, sy + 0.5, m.radius * 0.6, 0, Math.PI * 2);
      x.stroke();
      x.globalAlpha = 1;
      x.fillStyle = '#ffe66d';
      x.fillRect(sx - 1, sy - m.radius, 2, 6);
    }
  }

  _bullets(x, cam, g) {
    g.pools.bullets.each((b) => {
      const sx = Math.round(b.x - cam);
      if (sx < -20 || sx > W + 20) return;
      const sy = Math.round(b.y);
      const col = PAL[b.colour] || '#ffb238';
      if (b.from === 'player' || b.from === 'drone') {
        // A short tracer trailing behind the head reads as speed.
        x.globalAlpha = 0.45;
        x.fillStyle = col;
        x.fillRect(sx - b.w * 2, sy - (b.h >> 1), b.w * 2, Math.max(1, b.h));
        x.globalAlpha = 1;
        x.fillStyle = b.crit ? '#ffffff' : col;
        x.fillRect(sx, sy - (b.h >> 1), b.w, Math.max(1, b.h));
      } else {
        x.fillStyle = '#080a12';
        x.fillRect(sx - 1, sy - 1, b.w + 2, b.h + 2);
        x.fillStyle = col;
        x.fillRect(sx, sy, b.w, b.h);
      }
    });
  }

  _drone(x, cam, g) {
    const d = g.drone;
    const sheet = S.drone[d.skin] || S.drone.standard;
    let img = sheet.idle;
    if (d.rescuePhase) img = sheet.fire;
    else if (d.scanning > 0 || d.state === 'crate') img = sheet.scan;
    else if (d.state === 'engage' && d.lock <= 0) img = sheet.fire;

    const sx = Math.round(d.x - cam - img.w / 2);
    const sy = Math.round(d.y - img.h / 2 + Math.sin(d.bob) * 1.6);

    // Rescue shield bubble, drawn behind the drone.
    if (d.rescuePhase === 'deploy') {
      const p = g.player;
      const px = Math.round(p.x - cam), py = Math.round(p.midY);
      x.globalAlpha = 0.30 + 0.2 * Math.abs(Math.sin(d.rescueT * 20));
      x.fillStyle = sheet.glow;
      x.beginPath();
      x.arc(px + 0.5, py + 0.5, 16, 0, Math.PI * 2);
      x.fill();
      x.globalAlpha = 0.9;
      x.strokeStyle = '#ffffff';
      x.beginPath();
      x.arc(px + 0.5, py + 0.5, 16, 0, Math.PI * 2);
      x.stroke();
      x.globalAlpha = 1;
    }

    // Targeting reticle while acquiring — the drone visibly "decides".
    if (d.state === 'engage' && d.target && d.lock > 0) {
      const t = d.target;
      const tx = Math.round(t.x - cam), ty = Math.round(t.y);
      const r = 3 + d.lock * 16;
      x.globalAlpha = 0.8;
      x.strokeStyle = sheet.glow;
      x.strokeRect(Math.round(tx - r), Math.round(ty - r), Math.round(r * 2), Math.round(r * 2));
      x.globalAlpha = 1;
    } else if (d.state === 'engage' && d.target) {
      const t = d.target;
      const tx = Math.round(t.x - cam), ty = Math.round(t.y);
      x.fillStyle = sheet.glow;
      for (const [ox, oy] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) x.fillRect(tx + ox, ty + oy, 2, 2);
    }

    // Scan sweep.
    if (d.scanning > 0) {
      x.globalAlpha = 0.20 * (d.scanning / 0.7);
      x.fillStyle = sheet.glow;
      const reach = 100;
      x.beginPath();
      x.moveTo(sx + img.w / 2, sy + img.h / 2);
      x.lineTo(sx + img.w / 2 + reach, sy + img.h / 2 - 18);
      x.lineTo(sx + img.w / 2 + reach, sy + img.h / 2 + 18);
      x.closePath();
      x.fill();
      x.globalAlpha = 1;
    }

    x.drawImage(img.c, sx, sy);

    if (d.flash > 0) {
      x.globalAlpha = Math.min(0.8, d.flash * 4);
      x.fillStyle = '#ff3d68';
      x.fillRect(sx, sy, img.w, img.h);
      x.globalAlpha = 1;
    }

    // Rescue readiness pip, so its availability is never a mystery.
    if (!d.rescuePhase) {
      const ready = d.rescueCool <= 0;
      x.fillStyle = ready ? '#2ee6a6' : '#5c6480';
      x.fillRect(sx + img.w / 2 - 1, sy - 4, 2, 2);
      if (!ready) {
        const frac = 1 - d.rescueCool / Math.max(0.001, g.run.drone.rescueCooldown);
        x.fillStyle = '#8f9ad2';
        x.fillRect(sx + 1, sy - 3, Math.round((img.w - 2) * frac), 1);
      }
    }

    // Dialogue, in the drone's own colour, above it.
    if (d.line) {
      const str = d.line.toUpperCase().replace(/[’]/g, "'");
      const cw = str.length * GLYPH_W;
      let bx = Math.round(sx + img.w / 2 - cw / 2);
      bx = Math.max(4, Math.min(W - cw - 5, bx));
      const by = Math.max(4, sy - 16);
      x.globalAlpha = 0.78;
      x.fillStyle = '#080a12';
      x.fillRect(bx - 3, by - 2, cw + 6, GLYPH_H + 4);
      x.globalAlpha = 1;
      x.fillStyle = sheet.glow;
      x.fillRect(bx - 3, by - 2, 1, GLYPH_H + 4);
      this.text(str, bx, by, 'W', 1, 'left', false);
    }
  }

  _player(x, cam, g) {
    const p = g.player;
    const sx = Math.round(p.x - cam);
    const baseY = Math.round(p.y);

    // Ground shadow, so height off the deck is readable.
    const surface = WORLD.tierY[p.tier];
    if (!p.dead) {
      const airGap = Math.max(0, surface - p.y);
      const shw = Math.max(4, 12 - airGap / 7);
      x.globalAlpha = Math.max(0.08, 0.34 - airGap / 180);
      x.fillStyle = '#000000';
      x.fillRect(Math.round(sx - shw / 2), surface - 1, Math.round(shw), 2);
      x.globalAlpha = 1;
    }

    const flashing = p.hurtFlash > 0 && ((p.hurtFlash * 22) | 0) % 2 === 0;
    const invulnBlink = p.invuln > 0 && !p.dead && ((p.invuln * 14) | 0) % 2 === 0;

    if (p.dead) {
      const img = S.dead;
      x.drawImage(img.c, Math.round(sx - img.w / 2), baseY - img.h + 1);
      return;
    }

    if (p.state === 'slide') {
      const img = S.slide;
      if (invulnBlink) x.globalAlpha = 0.55;
      x.drawImage(img.c, Math.round(sx - img.w / 2 + 2), baseY - img.h);
      x.globalAlpha = 1;
      if (flashing) this._tint(x, Math.round(sx - img.w / 2 + 2), baseY - img.h, img.w, img.h);
      // Friction sparks.
      return;
    }

    const body = flashing ? S.bodyHurt : S.body;
    let legs;
    if (!p.grounded) legs = p.vy < 0 ? S.legsJump : S.legsFall;
    else legs = S.legs[p.frame];

    const bx = Math.round(sx - body.w / 2);
    const legY = baseY - legs.h;
    const bodyY = legY - body.h + 1;

    if (invulnBlink) x.globalAlpha = 0.55;
    x.drawImage(legs.c, bx, legY);
    x.drawImage(body.c, bx, bodyY);
    x.globalAlpha = 1;

    // Muzzle flash, drawn procedurally so it can animate with the recoil.
    if (p.recoil > 0.45) {
      const m = p.muzzle();
      const mx = Math.round(m.x - cam), my = Math.round(m.y);
      x.fillStyle = '#ffffff';
      x.fillRect(mx, my - 1, 4, 3);
      x.fillStyle = '#ffe66d';
      x.fillRect(mx + 3, my, 3, 1);
      x.fillRect(mx + 1, my - 2, 1, 1);
      x.fillRect(mx + 1, my + 2, 1, 1);
    }

    if (flashing) this._tint(x, bx, bodyY, body.w, legs.h + body.h);

    // Personal shield bubble.
    if (p.shield > 0 || p.powerInvuln) {
      x.globalAlpha = p.powerInvuln ? 0.34 : 0.18;
      x.strokeStyle = p.powerInvuln ? '#35d0ff' : '#b794ff';
      x.beginPath();
      x.arc(sx + 0.5, Math.round(p.midY) + 0.5, 13, 0, Math.PI * 2);
      x.stroke();
      x.globalAlpha = 1;
    }
  }

  _tint(x, dx, dy, w, h) {
    x.globalAlpha = 0.45;
    x.fillStyle = '#ff3d68';
    x.fillRect(dx, dy, w, h);
    x.globalAlpha = 1;
  }

  _particles(x, cam, g) {
    g.particles.pool.each((p) => {
      const sx = Math.round(p.x - cam);
      if (sx < -8 || sx > W + 8) return;
      const a = p.fade ? Math.max(0, p.life / p.max) : 1;
      x.globalAlpha = p.kind === 'smoke' ? a * 0.4 : a;
      x.fillStyle = PAL[p.colour] || p.colour;
      x.fillRect(sx, Math.round(p.y), p.size, p.size);
      x.globalAlpha = 1;
    });
  }

  _arcs(x, cam, g) {
    for (const a of g.run.arcs) {
      x.globalAlpha = Math.max(0, a.life / 0.12);
      x.strokeStyle = '#35d0ff';
      x.beginPath();
      // A jagged path rather than a straight line.
      const steps = 4;
      x.moveTo(a.x1 - cam, a.y1);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        x.lineTo(a.x1 + (a.x2 - a.x1) * t - cam + (Math.random() - 0.5) * 8,
                 a.y1 + (a.y2 - a.y1) * t + (Math.random() - 0.5) * 8);
      }
      x.lineTo(a.x2 - cam, a.y2);
      x.stroke();
      x.globalAlpha = 1;
    }
  }

  _floaters(x, cam, g) {
    g.pools.floaters.each((f) => {
      const a = Math.max(0, f.life / f.max);
      x.globalAlpha = a;
      this.text(f.text, Math.round(f.x - cam), Math.round(f.y), f.colour, f.size > 1.1 ? 2 : 1, 'center');
      x.globalAlpha = 1;
    });
  }

  /* Screen-wide effects: hit vignette, EMP flash, rescue slow-motion wash. */
  _overlay(x, g) {
    const r = g.run;
    if (r.empFlash > 0) {
      x.globalAlpha = Math.min(0.5, r.empFlash * 1.6);
      x.fillStyle = '#35d0ff';
      x.fillRect(0, 0, W, H);
      x.globalAlpha = 1;
    }
    if (g.player.hurtFlash > 0) {
      const a = g.player.hurtFlash / 0.35;
      x.globalAlpha = a * 0.30;
      x.fillStyle = '#ff3d68';
      x.fillRect(0, 0, W, 5);
      x.fillRect(0, H - 5, W, 5);
      x.fillRect(0, 0, 5, H);
      x.fillRect(W - 5, 0, 5, H);
      x.globalAlpha = 1;
    }
    if (g.drone.rescuePhase) {
      x.globalAlpha = 0.14;
      x.fillStyle = '#35d0ff';
      x.fillRect(0, 0, W, H);
      x.globalAlpha = 1;
    }
    // A low-health warning that pulses on the edges rather than tinting the
    // whole screen, so the road stays readable.
    const hp = g.player.health / g.player.maxHealth;
    if (hp < 0.3 && !g.player.dead) {
      x.globalAlpha = 0.18 + 0.16 * Math.abs(Math.sin(g.run.time * 5));
      x.fillStyle = '#ff3d68';
      x.fillRect(0, 0, W, 3);
      x.fillRect(0, H - 3, W, 3);
      x.globalAlpha = 1;
    }
    // Contextual onboarding prompt.
    if (r.prompt) {
      const str = r.prompt.text.toUpperCase();
      const sub = (r.prompt.sub || '').toUpperCase();
      const bw = Math.max(str.length, sub.length) * GLYPH_W + 12;
      const bx = Math.round(W / 2 - bw / 2);
      const by = 10;
      const bh = sub ? 20 : 12;
      x.globalAlpha = 0.82 * Math.min(1, r.promptT);
      x.fillStyle = '#080a12';
      x.fillRect(bx, by, bw, bh);
      x.fillStyle = '#8b5cf6';
      x.fillRect(bx, by, bw, 1);
      x.fillRect(bx, by + bh - 1, bw, 1);
      x.globalAlpha = Math.min(1, r.promptT);
      this.text(str, W / 2, by + 3, 'E', 1, 'center');
      if (sub) this.text(sub, W / 2, by + 11, 'C', 1, 'center');
      x.globalAlpha = 1;
    }
    if (this.hiContrast) {
      // Knock back the background so the play space separates harder.
      x.globalAlpha = 0.22;
      x.fillStyle = '#000000';
      x.fillRect(0, 0, W, WORLD.tierY[2] - 30);
      x.globalAlpha = 1;
    }
  }

  /* ---- Menu scene --------------------------------------------------------
     The same city, the same operative and the same drone as the run, drawn on
     the menu canvas so the menu is not a separate art style. Scrolls slowly
     and loops forever. */
  menu(t, skinId) {
    const x = this.ctx;
    const cam = t * 42;
    this._sky(x, null);

    for (const L of this._layers()) {
      const w = L.img.width;
      let off = -((cam * L.k) % w);
      if (off > 0) off -= w;
      for (let dx = off; dx < W; dx += w) x.drawImage(L.img, Math.round(dx), Math.round(L.y));
    }

    x.globalAlpha = 0.44;
    x.fillStyle = '#0a0d1c';
    x.fillRect(0, 0, W, H);
    x.globalAlpha = 1;

    // Hover traffic, deterministic so the menu never stutters.
    for (let i = 0; i < 4; i++) {
      const img = S.car[i % S.car.length];
      const sp = 26 + i * 15;
      const cx = W - ((t * sp + i * 137) % (W + 90));
      x.globalAlpha = 0.45 + i * 0.1;
      x.drawImage(img.c, Math.round(cx), 22 + i * 11);
      x.globalAlpha = 1;
    }

    // The street, scrolling.
    const M = WORLD.metre;
    const sY = WORLD.tierY[0];
    x.fillStyle = '#0a0d1c';
    x.fillRect(0, sY, W, H - sY);
    const c0 = Math.floor(cam / M) - 1;
    for (let c = c0; c <= c0 + W / M + 2; c++) {
      const sx = Math.round(c * M - cam);
      x.fillStyle = '#1d2447';
      x.fillRect(sx, sY, M, H - sY);
      x.fillStyle = '#333c70';
      x.fillRect(sx, sY + 1, M, 2);
      x.fillStyle = '#8792ce';
      x.fillRect(sx, sY, M, 1);
      if ((c & 1) === 0) { x.fillStyle = 'rgba(143,154,210,0.30)'; x.fillRect(sx + 2, sY + 17, 7, 1); }
      x.fillStyle = 'rgba(53,208,255,0.14)';
      x.fillRect(sx, sY + 7, M, 1);
    }

    // A walkway overhead for depth.
    const wY = WORLD.tierY[1];
    for (let c = c0; c <= c0 + W / M + 2; c++) {
      const sx = Math.round(c * M - cam * 1.0);
      if (((c % 26) + 26) % 26 > 7) continue;
      x.fillStyle = '#232a52'; x.fillRect(sx, wY, M, 9);
      x.fillStyle = '#3a4374'; x.fillRect(sx, wY + 1, M, 3);
      x.fillStyle = '#9aa4d8'; x.fillRect(sx, wY, M, 1);
      x.fillStyle = '#12172f'; x.fillRect(sx, wY + 6, M, 3);
      x.globalAlpha = 0.5; x.fillStyle = '#35d0ff'; x.fillRect(sx, wY + 6, M, 1); x.globalAlpha = 1;
    }

    // The operative, running on the spot.
    const px = Math.round(W * 0.80);
    const frame = Math.floor(t * 11) % 4;
    const legs = S.legs[frame];
    const body = S.body;
    const legY = sY - legs.h;
    x.globalAlpha = 0.3;
    x.fillStyle = '#000';
    x.fillRect(px - 5, sY - 1, 10, 2);
    x.globalAlpha = 1;
    x.drawImage(legs.c, px - (legs.w >> 1), legY);
    x.drawImage(body.c, px - (body.w >> 1), legY - body.h + 1);

    // FiDo-5, hovering behind and above with a live thruster flicker.
    const sheet = S.drone[skinId] || S.drone.standard;
    const dImg = (Math.sin(t * 1.7) > 0.86) ? sheet.scan : sheet.idle;
    const dx = px - 26 + Math.sin(t * 1.1) * 4;
    const dy = sY - 34 + Math.sin(t * 2.3) * 3;
    x.drawImage(dImg.c, Math.round(dx - dImg.w / 2), Math.round(dy - dImg.h / 2));
    x.globalAlpha = 0.5 + Math.random() * 0.3;
    x.fillStyle = sheet.glow;
    x.fillRect(Math.round(dx - 1), Math.round(dy + dImg.h / 2 - 1), 2, 2 + Math.round(Math.random() * 3));
    x.globalAlpha = 1;
  }
}
