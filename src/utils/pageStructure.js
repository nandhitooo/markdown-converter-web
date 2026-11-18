// Analisis satu halaman: teks asli (digabung per baris), garis, sel tabel, dan "ruang"
// yang tersedia bagi tiap teks. Bebas dependensi pdf.js (Util/OPS disuntikkan) agar mudah diuji.
import { detectCells, groupTables } from "./tableDetect.js";

const MARGIN = 10; // batas aman dari tepi halaman (pt)
const INSET = 1; // inset sel agar garis tabel tidak tertimpa
const BOX_GLYPH = /^[\u2610\u2611\u2612\u25A1\u25A2\u25FB\u2B1C\u2B1A\u274F-\u2752]$/; // ☐ ☑ ☒ □ ▢ dll.

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// ---- 1) Baca & gabungkan potongan teks per baris ----
function readItems(tc, vp, Util, fontInfo) {
  const raw = [];
  for (const it of tc.items) {
    if (!("str" in it) || !it.str.trim() || !(it.width > 0)) continue;
    const t = Util.transform(vp.transform, it.transform);
    const h = Math.hypot(t[2], t[3]);
    // Hanya teks yang tampil tegak/horizontal.
    if (!(t[0] > 0 && t[3] < 0 && Math.abs(t[1]) < 0.05 * t[0]) || h < 2) continue;
    raw.push({ str: it.str, x: t[4], y: t[5], w: it.width, h, fontName: it.fontName });
  }
  const merged = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && last.fontName === r.fontName) {
      const gap = r.x - (last.x + last.w);
      if (
        Math.abs(last.y - r.y) < 0.2 * r.h &&
        Math.abs(last.h - r.h) < 0.15 * r.h &&
        gap > -0.2 * r.h &&
        gap < 0.6 * r.h
      ) {
        const needSpace = gap > 0.12 * r.h && !/\s$/.test(last.str) && !/^\s/.test(r.str);
        last.str += (needSpace ? " " : "") + r.str;
        last.w = r.x + r.w - last.x;
        continue;
      }
    }
    merged.push({ ...r });
  }
  return merged.map((m) => ({ ...m, ...fontInfo(m.fontName) }));
}

export function analyzePage({ tc, opList, vp, Util, OPS, fontInfo }) {
  const W = vp.width;
  const H = vp.height;
  const items = readItems(tc, vp, Util, fontInfo);

  let det = { cells: [], hLines: [], vLines: [], tables: [] };
  try {
    det = detectCells(opList, OPS, vp.transform, W, H);
  } catch (err) {
    console.warn("Deteksi tabel gagal:", err);
  }
  const { hLines, vLines } = det;

  // Kotak kecil (±4–22pt, hampir persegi) tanpa teks di dalamnya = kotak centang, bukan sel tabel.
  const insideText = (c) =>
    items.some((m) => {
      const cx = m.x + m.w / 2;
      const cy = m.y - 0.3 * m.h;
      return cx >= c.x0 && cx <= c.x1 && cy >= c.y0 && cy <= c.y1;
    });
  const boxRects = [];
  const rawCells = det.cells.filter((c) => {
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const small = w <= 22 && h <= 22 && Math.min(w, h) >= 4 && Math.min(w, h) / Math.max(w, h) >= 0.6;
    if (small && !insideText(c)) {
      boxRects.push(c);
      return false;
    }
    return w >= 6 && h >= 6;
  });
  const tables = groupTables(rawCells);

  // ---- 2) Pasangkan teks dengan sel (sel terkecil yang memuat titik tengah teks) ----
  const cellOf = items.map((m) => {
    const cx = m.x + m.w / 2;
    const cy = m.y - 0.3 * m.h;
    let best = -1;
    let area = Infinity;
    rawCells.forEach((c, i) => {
      if (cx >= c.x0 && cx <= c.x1 && cy >= c.y0 && cy <= c.y1) {
        const a = (c.x1 - c.x0) * (c.y1 - c.y0);
        if (a < area) {
          area = a;
          best = i;
        }
      }
    });
    return best;
  });

  // ---- 3) Ruang, perataan, dan kotak penutup tiap teks ----
  // Kotak centang berupa karakter (☐ dsb.): dicatat sebagai kotak, bukan teks yang diedit.
  const boxes = boxRects.map((c) => ({
    key: `r${Math.round(c.x0)}:${Math.round(c.y0)}`,
    x: c.x0 / W,
    y: c.y0 / H,
    w: (c.x1 - c.x0) / W,
    h: (c.y1 - c.y0) / H,
  }));
  const glyphBox = new Map();
  items.forEach((m, idx) => {
    if (!BOX_GLYPH.test(m.str.trim())) return;
    const side = 0.7 * m.h;
    const cx = m.x + m.w / 2;
    const cy = m.y - 0.35 * m.h;
    glyphBox.set(idx, boxes.length);
    boxes.push({
      key: `g${Math.round(m.x)}:${Math.round(m.y)}`,
      x: (cx - side / 2) / W,
      y: (cy - side / 2) / H,
      w: side / W,
      h: side / H,
    });
  });

  const outItems = items.map((m, idx) => {
    const cell = cellOf[idx] >= 0 ? rawCells[cellOf[idx]] : null;
    const cx = m.x + m.w / 2;
    const midY = m.y - 0.3 * m.h;
    const right = m.x + m.w;

    // tetangga di baris yang sama
    let prev = -Infinity;
    let next = Infinity;
    for (let k = 0; k < items.length; k += 1) {
      if (k === idx) continue;
      const o = items[k];
      if (Math.abs(o.y - m.y) >= 0.5 * m.h) continue;
      if (o.x + o.w <= m.x + 1) prev = Math.max(prev, o.x + o.w);
      else if (o.x >= right - 1) next = Math.min(next, o.x);
    }
    // garis vertikal yang melintasi baris ini
    let vl = -Infinity;
    let vr = Infinity;
    for (const v of vLines) {
      if (v.a - 1 > midY || v.b + 1 < midY) continue;
      if (v.pos <= m.x + 0.5) vl = Math.max(vl, v.pos);
      if (v.pos >= right - 0.5) vr = Math.min(vr, v.pos);
    }

    let lim0 = Math.max(MARGIN, prev + 3, vl + 2);
    let lim1 = Math.min(W - MARGIN, next - 3, vr - 2);
    if (cell) {
      lim0 = Math.max(lim0, cell.x0 + 2);
      lim1 = Math.min(lim1, cell.x1 - 2);
    }
    lim0 = Math.min(lim0, m.x);
    lim1 = Math.max(lim1, right);

    // batas bawah (untuk teks yang dibungkus jadi beberapa baris)
    let limB = H - MARGIN;
    for (const h of hLines) {
      if (h.pos >= m.y + 0.2 * m.h - 0.5 && cx >= h.a && cx <= h.b) limB = Math.min(limB, h.pos - 1.5);
    }
    for (let k = 0; k < items.length; k += 1) {
      if (k === idx) continue;
      const o = items[k];
      const top = o.y - 0.8 * o.h;
      if (top > m.y && o.x < right && o.x + o.w > m.x) limB = Math.min(limB, top - 1);
    }
    limB = Math.max(limB, m.y + 0.25 * m.h);

    // kotak penutup teks asli: jangan menimpa garis tabel
    let cl = m.x - 1.5;
    let cr = right + 1.5;
    let ct = m.y - 0.8 * m.h;
    let cb = m.y + 0.2 * m.h;
    if (cell) {
      cl = Math.max(cl, cell.x0 + INSET);
      cr = Math.min(cr, cell.x1 - INSET);
      ct = Math.max(ct, cell.y0 + INSET);
      cb = Math.min(cb, cell.y1 - INSET);
    }
    for (const v of vLines) {
      if (v.a > cb || v.b < ct) continue;
      if (v.pos > cl - 0.01 && v.pos < m.x + 0.5) cl = Math.max(cl, v.pos + 0.9);
      if (v.pos < cr + 0.01 && v.pos > right - 0.5) cr = Math.min(cr, v.pos - 0.9);
    }
    for (const h of hLines) {
      if (h.a > cr || h.b < cl) continue;
      if (h.pos > ct && h.pos < cb) {
        if (h.pos >= m.y - 0.2 * m.h) cb = Math.min(cb, h.pos - 0.9);
        else ct = Math.max(ct, h.pos + 0.9);
      }
    }
    cb = Math.max(cb, m.y + 0.05 * m.h);
    ct = Math.min(ct, m.y - 0.5 * m.h);

    // perataan: dibandingkan dengan wadahnya (sel, atau ruang antar tetangga)
    const cLeft = cell ? cell.x0 + 2 : lim0;
    const cRight = cell ? cell.x1 - 2 : lim1;
    const cw = cRight - cLeft;
    const cmid = (cLeft + cRight) / 2;
    let align = "left";
    if (Math.abs(cx - cmid) <= (cell ? 0.04 * cw + 1 : 4) && m.w < 0.95 * cw) align = "center";
    else if (Math.abs(right - cRight) <= 3 && m.x - cLeft > 0.15 * cw) align = "right";

    return {
      str: m.str,
      x: cl / W,
      y: ct / H,
      w: (cr - cl) / W,
      h: (cb - ct) / H,
      bx: m.x / W,
      by: m.y / H,
      fs: m.h / W,
      family: m.family,
      bold: m.bold,
      italic: m.italic,
      align,
      anc: { l: m.x / W, c: cx / W, r: right / W },
      lim: [lim0 / W, lim1 / W],
      limB: limB / H,
      cell: cellOf[idx],
      glyphBox: glyphBox.has(idx) ? glyphBox.get(idx) : null,
    };
  });

  // ---- 4) Sel keluaran + gaya bawaan untuk sel kosong ----
  const cellItems = rawCells.map(() => []);
  cellOf.forEach((ci, idx) => {
    if (ci >= 0) cellItems[ci].push(idx);
  });
  const pageFs = median(items.map((m) => m.h)) || 11;

  const cells = rawCells.map((c, i) => {
    const sameRow = rawCells
      .map((o, k) => ({ o, k }))
      .filter(
        ({ o, k }) =>
          k !== i &&
          tables[k] === tables[i] &&
          Math.abs(o.y0 - c.y0) < 3 &&
          Math.abs(o.y1 - c.y1) < 3 &&
          cellItems[k].length > 0,
      )
      .sort((p, q) => Math.abs(p.o.x0 - c.x0) - Math.abs(q.o.x0 - c.x0));
    const mate = sameRow[0];
    const mateItem = mate ? items[cellItems[mate.k][0]] : null;
    const tableFs = median(
      items.filter((_, idx) => cellOf[idx] >= 0 && tables[cellOf[idx]] === tables[i]).map((m) => m.h),
    );
    const padOf = mate && mateItem ? Math.min(6, Math.max(2, mateItem.x - mate.o.x0)) : 3;
    const style = {
      fs: (mateItem ? mateItem.h : tableFs || pageFs) / W,
      family: mateItem ? mateItem.family : "sans",
      refItem: mateItem ? cellItems[mate.k][0] : -1,
    };
    return {
      key: `${Math.round(c.x0)}:${Math.round(c.y0)}:${Math.round(c.x1)}:${Math.round(c.y1)}`,
      table: tables[i],
      x: (c.x0 + INSET) / W,
      y: (c.y0 + INSET) / H,
      w: (c.x1 - c.x0 - 2 * INSET) / W,
      h: (c.y1 - c.y0 - 2 * INSET) / H,
      pad: padOf / W,
      items: cellItems[i],
      style,
    };
  });

  return { items: outItems, cells, boxes, W, H };
}
