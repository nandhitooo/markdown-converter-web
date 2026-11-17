// Pengukuran & tata letak teks pengganti (retext / celltext).
// Dipakai bersama oleh tampilan (preview) dan ekspor PDF supaya hasilnya identik.
import { PDFDocument, StandardFonts } from "pdf-lib";

const F = StandardFonts;
const NAMES = {
  sans: [F.Helvetica, F.HelveticaBold, F.HelveticaOblique, F.HelveticaBoldOblique],
  serif: [F.TimesRoman, F.TimesRomanBold, F.TimesRomanItalic, F.TimesRomanBoldItalic],
  mono: [F.Courier, F.CourierBold, F.CourierOblique, F.CourierBoldOblique],
};

export const MIN_SCALE = 0.6; // batas terkecil saat diperkecil otomatis
const SOFT_SCALE = 0.75; // di bawah ini lebih baik membungkus baris dulu
const LINE_H = 1.2;
const ASC = 0.95;
const DESC = 0.25;

let fonts = null;
let supported = null;

// Font standar dimuat sekali; layout memakai metrik yang sama dengan hasil ekspor.
export const metricsReady = (async () => {
  const doc = await PDFDocument.create();
  const map = new Map();
  for (const n of new Set(Object.values(NAMES).flat())) map.set(n, await doc.embedFont(n));
  supported = new Set(map.get(F.Helvetica).getCharacterSet());
  fonts = map;
})().catch(() => {});

export const fontNameOf = ({ family = "sans", bold = false, italic = false } = {}) =>
  (NAMES[family] || NAMES.sans)[(bold ? 1 : 0) + (italic ? 2 : 0)];

// Ganti karakter yang tidak didukung font standar (WinAnsi) dengan "?".
export function sanitize(text) {
  let out = "";
  let replaced = 0;
  for (const ch of String(text ?? "").replace(/\r/g, "")) {
    const cp = ch.codePointAt(0);
    if (cp === 10) out += ch;
    else if (cp === 9) out += "    ";
    else if (!supported || supported.has(cp)) out += ch;
    else {
      out += "?";
      replaced += 1;
    }
  }
  return { text: out, replaced };
}

export function measureText(text, style, size) {
  if (!text) return 0;
  const f = fonts?.get(fontNameOf(style));
  const s = sanitize(text).text.replace(/\n/g, "");
  if (!f) return s.length * size * 0.52;
  try {
    return f.widthOfTextAtSize(s, size);
  } catch {
    return s.length * size * 0.52;
  }
}

// Bungkus satu baris menjadi beberapa baris selebar `width` (pt).
export function wrapLine(line, width, size, style) {
  if (!line || !line.trim()) return [""];
  const lines = [];
  let cur = "";
  for (const word of line.trim().split(/\s+/)) {
    const test = cur ? `${cur} ${word}` : word;
    if (measureText(test, style, size) <= width) {
      cur = test;
      continue;
    }
    if (cur) lines.push(cur);
    if (measureText(word, style, size) <= width) {
      cur = word;
      continue;
    }
    // kata tunggal lebih lebar dari area: potong per karakter
    let chunk = "";
    for (const ch of word) {
      if (chunk && measureText(chunk + ch, style, size) > width) {
        lines.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    cur = chunk;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Hitung posisi & ukuran teks agar muat di area yang tersedia.
 * a: anotasi retext/celltext (koordinat ternormalisasi); W,H: ukuran halaman (pt).
 * Hasil: { fs, lines:[{text,x,y,w}], bbox, room, state, scale, overX, overY, unsupported, ... }
 *   state: "ok" | "shrunk" | "wrapped" | "overflow"
 */
export function layoutText(a, W, H) {
  const align = a.align || "left";
  const mode = a.fit || "shrink";
  const isCell = a.type === "celltext";
  const base = a.fs * W;
  const fallback = a.bx ?? a.x;
  const anc = a.anc || { l: fallback, c: fallback, r: fallback };
  const ax = (align === "center" ? anc.c : align === "right" ? anc.r : anc.l) * W;
  const lim0 = (a.lim ? a.lim[0] : 0) * W;
  const lim1 = (a.lim ? a.lim[1] : 1) * W;
  const availW = Math.max(
    6,
    align === "left" ? lim1 - ax : align === "right" ? ax - lim0 : lim1 - lim0,
  );
  const topLim = isCell ? a.y * H : -Infinity;
  const botLim = isCell ? (a.y + a.h) * H : a.limB != null ? a.limB * H : Infinity;

  const { text: clean, replaced } = sanitize(a.text ?? "");
  const raw = String(a.text ?? "").replace(/\r/g, "").split("\n");
  const m = (s, f) => measureText(s, a, f);
  const widest = (ls, f) => ls.reduce((mx, l) => Math.max(mx, m(l, f)), 0);
  const wrapAll = (f) => raw.flatMap((l) => wrapLine(l, availW, f, a));

  // Posisi vertikal: retext memakai baseline asli, celltext diletakkan di tengah sel.
  const place = (n, f) => {
    if (!isCell) {
      const b1 = a.by * H;
      return { b1, top: b1 - ASC * f, bottom: b1 + DESC * f + (n - 1) * LINE_H * f };
    }
    const cellTop = a.y * H;
    const cellH = a.h * H;
    const block = n * LINE_H * f;
    let top = cellTop + (cellH - block) / 2;
    if (n > 1) top = cellTop + Math.min(2.5, Math.max(0, (cellH - block) / 2));
    if (block >= cellH) top = cellTop;
    return { b1: top + ASC * f, top, bottom: top + block };
  };
  const okW = (ls, f) => widest(ls, f) <= availW + 0.4;
  const okH = (n, f) => {
    const p = place(n, f);
    return p.bottom <= botLim + 0.6 && p.top >= topLim - 0.6;
  };

  let fs = base;
  let lines = raw;

  if (mode === "wrap") {
    lines = wrapAll(base);
  } else if (mode === "shrink") {
    const w0 = widest(raw, base);
    const sw = w0 > availW ? (availW / w0) * 0.997 : 1;
    let done = false;
    const tryShrink = (floor) => {
      for (let s = sw; s >= floor - 1e-6 && !done; s -= 0.02) {
        if (okW(raw, base * s) && okH(raw.length, base * s)) {
          fs = base * s;
          lines = raw;
          done = true;
        }
      }
    };
    const tryWrap = (from, to) => {
      for (let s = from; s >= to - 1e-6 && !done; s -= 0.05) {
        const ls = wrapAll(base * s);
        if (okH(ls.length, base * s)) {
          fs = base * s;
          lines = ls;
          done = true;
        }
      }
    };
    tryShrink(SOFT_SCALE); // 1) cukup diperkecil sedikit
    tryWrap(1, 0.85); // 2) bungkus pada ukuran hampir asli
    tryShrink(MIN_SCALE); // 3) perkecil sampai batas
    tryWrap(0.8, MIN_SCALE); // 4) bungkus + kecil
    if (!done) {
      fs = base * MIN_SCALE;
      lines = wrapAll(fs); // terpaksa: tetap dibungkus, akan ditandai melebihi
    }
  }

  const p = place(lines.length, fs);
  const rows = lines.map((text, i) => {
    const w = m(text, fs);
    let x = align === "left" ? ax : align === "right" ? ax - w : ax - w / 2;
    if (align !== "left" && w <= lim1 - lim0) x = Math.min(Math.max(x, lim0), lim1 - w);
    return { text, x, y: p.b1 + i * LINE_H * fs, w };
  });
  const minX = rows.length ? Math.min(...rows.map((r) => r.x)) : ax;
  const maxX = rows.length ? Math.max(...rows.map((r) => r.x + r.w)) : ax;

  const overX = Math.max(0, widest(lines, fs) - availW, lim0 - minX, maxX - lim1);
  const overY = Math.max(0, p.bottom - botLim, topLim - p.top);
  const overflow = overX > 0.6 || overY > 0.6;
  const scale = fs / base;
  const wrapped = lines.length > raw.length;
  const state = overflow ? "overflow" : wrapped ? "wrapped" : scale < 0.999 ? "shrunk" : "ok";

  return {
    fs: fs / W,
    fsPt: fs,
    lines: rows.map((r) => ({ text: r.text, x: r.x / W, y: r.y / H, w: r.w / W })),
    bbox: { x0: minX / W, x1: maxX / W, y0: p.top / H, y1: p.bottom / H },
    room: { x0: lim0 / W, x1: lim1 / W },
    state,
    scale,
    wrapped,
    small: !overflow && scale < SOFT_SCALE,
    overX,
    overY,
    unsupported: replaced,
    sanitized: clean,
  };
}
