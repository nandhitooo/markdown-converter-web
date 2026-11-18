// Deteksi garis & sel tabel dari operator list pdf.js (tanpa dependensi pdf.js,
// supaya mudah diuji). Semua koordinat dalam point, sistem tampilan (kiri-atas, y ke bawah).

const MOVE = 0;
const LINE = 1;
const CURVE = 2;
const QUAD = 3;
const CLOSE = 4;

const POS_TOL = 1.5; // garis dengan posisi selisih <= ini dianggap sebaris
const GAP_TOL = 2.5; // celah antar potongan garis yang masih dianggap menyambung
const COVER_TOL = 2; // toleransi ujung garis terhadap sudut sel
const MIN_LEN = 3;
const MAX_SEGMENTS = 8000;
const MAX_REGIONS = 60000;

const mul = (m1, m2) => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];

function decodeSubpaths(chunks, ctm) {
  const out = [];
  for (const data of chunks) {
    let cur = null;
    let i = 0;
    while (i < data.length) {
      const op = data[i++];
      if (op === MOVE || op === LINE) {
        const x = data[i];
        const y = data[i + 1];
        i += 2;
        const p = [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
        if (op === MOVE || !cur) {
          cur = { pts: [p], closed: false, curved: false };
          out.push(cur);
        } else {
          cur.pts.push(p);
        }
      } else if (op === CURVE) {
        i += 6;
        if (cur) cur.curved = true;
      } else if (op === QUAD) {
        i += 4;
        if (cur) cur.curved = true;
      } else if (op === CLOSE) {
        if (cur) cur.closed = true;
      } else {
        break;
      }
    }
  }
  return out;
}

// Ambil segmen garis horizontal/vertikal (dari stroke maupun persegi tipis yang di-fill).
export function extractSegments(opList, OPS, vpTransform) {
  const hs = [];
  const vs = [];
  const stack = [];
  let ctm = vpTransform.slice();

  const STROKE = new Set([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  const FILL = new Set([
    OPS.fill,
    OPS.eoFill,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);

  const addLine = (x0, y0, x1, y1) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    if (dy <= 0.8 && dx >= MIN_LEN) hs.push({ pos: (y0 + y1) / 2, a: Math.min(x0, x1), b: Math.max(x0, x1) });
    else if (dx <= 0.8 && dy >= MIN_LEN) vs.push({ pos: (x0 + x1) / 2, a: Math.min(y0, y1), b: Math.max(y0, y1) });
  };

  for (let k = 0; k < opList.fnArray.length; k += 1) {
    const fn = opList.fnArray[k];
    const args = opList.argsArray[k];
    if (hs.length + vs.length > MAX_SEGMENTS) return { hs: [], vs: [], tooComplex: true };

    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      if (stack.length) ctm = stack.pop();
    } else if (fn === OPS.transform) {
      ctm = mul(ctm, args);
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (args && args[0]) ctm = mul(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) {
      if (stack.length) ctm = stack.pop();
    } else if (fn === OPS.constructPath) {
      const paint = args?.[0];
      if (typeof paint !== "number") continue;
      const isStroke = STROKE.has(paint);
      const isFill = FILL.has(paint);
      if (!isStroke && !isFill) continue;
      const raw = args[1];
      if (!raw) continue;
      const chunks = typeof raw[0] === "number" ? [raw] : raw;
      for (const sp of decodeSubpaths(chunks, ctm)) {
        if (sp.curved || sp.pts.length < 2) continue;
        if (isStroke) {
          for (let i = 1; i < sp.pts.length; i += 1) {
            addLine(sp.pts[i - 1][0], sp.pts[i - 1][1], sp.pts[i][0], sp.pts[i][1]);
          }
          if (sp.closed && sp.pts.length > 2) {
            const f = sp.pts[0];
            const l = sp.pts[sp.pts.length - 1];
            addLine(l[0], l[1], f[0], f[1]);
          }
        }
        if (isFill && !isStroke && (sp.pts.length === 4 || sp.pts.length === 5)) {
          const xs = sp.pts.map((p) => p[0]);
          const ys = sp.pts.map((p) => p[1]);
          const x0 = Math.min(...xs);
          const x1 = Math.max(...xs);
          const y0 = Math.min(...ys);
          const y1 = Math.max(...ys);
          const corner = sp.pts.every(
            (p) => (Math.abs(p[0] - x0) < 0.3 || Math.abs(p[0] - x1) < 0.3) && (Math.abs(p[1] - y0) < 0.3 || Math.abs(p[1] - y1) < 0.3),
          );
          if (!corner) continue;
          const bw = x1 - x0;
          const bh = y1 - y0;
          if (bh <= 2.5 && bw >= MIN_LEN) hs.push({ pos: (y0 + y1) / 2, a: x0, b: x1 });
          else if (bw <= 2.5 && bh >= MIN_LEN) vs.push({ pos: (x0 + x1) / 2, a: y0, b: y1 });
        }
      }
    }
  }
  return { hs, vs, tooComplex: false };
}

// Satukan garis yang sebaris & saling menyambung. Hasil: [{pos, a, b}].
export function mergeLines(segs) {
  const sorted = [...segs].sort((p, q) => p.pos - q.pos);
  const groups = [];
  for (const s of sorted) {
    const g = groups[groups.length - 1];
    if (g && s.pos - g.last <= POS_TOL) {
      g.items.push(s);
      g.last = s.pos;
    } else {
      groups.push({ items: [s], last: s.pos });
    }
  }
  const out = [];
  for (const g of groups) {
    const pos = g.items.reduce((n, s) => n + s.pos, 0) / g.items.length;
    const byA = g.items.sort((p, q) => p.a - q.a);
    let cur = { pos, a: byA[0].a, b: byA[0].b };
    for (let i = 1; i < byA.length; i += 1) {
      if (byA[i].a <= cur.b + GAP_TOL) cur.b = Math.max(cur.b, byA[i].b);
      else {
        out.push(cur);
        cur = { pos, a: byA[i].a, b: byA[i].b };
      }
    }
    out.push(cur);
  }
  return out.filter((l) => l.b - l.a >= MIN_LEN);
}

const uniqueSorted = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const out = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > 1e-6) out.push(v);
  return out;
};

// Bangun sel dari grid garis. Sel gabungan (tanpa garis pemisah) otomatis jadi satu sel.
export function buildCells(hLines, vLines, W, H) {
  const xs = uniqueSorted(vLines.map((l) => l.pos));
  const ys = uniqueSorted(hLines.map((l) => l.pos));
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  if (nx < 1 || ny < 1 || nx * ny > MAX_REGIONS) return [];

  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));

  // vCov[i][j]: garis vertikal di xs[i] menutup rentang ys[j]..ys[j+1]
  const vCov = xs.map(() => new Uint8Array(ny));
  for (const l of vLines) {
    const i = xi.get(l.pos);
    for (let j = 0; j < ny; j += 1) {
      if (ys[j] >= l.a - COVER_TOL && ys[j + 1] <= l.b + COVER_TOL) vCov[i][j] = 1;
    }
  }
  // hCov[j][i]: garis horizontal di ys[j] menutup rentang xs[i]..xs[i+1]
  const hCov = ys.map(() => new Uint8Array(nx));
  for (const l of hLines) {
    const j = yi.get(l.pos);
    for (let i = 0; i < nx; i += 1) {
      if (xs[i] >= l.a - COVER_TOL && xs[i + 1] <= l.b + COVER_TOL) hCov[j][i] = 1;
    }
  }

  const parent = Array.from({ length: nx * ny }, (_, k) => k);
  const find = (k) => {
    while (parent[k] !== k) {
      parent[k] = parent[parent[k]];
      k = parent[k];
    }
    return k;
  };
  const union = (p, q) => {
    const a = find(p);
    const b = find(q);
    if (a !== b) parent[b] = a;
  };
  const id = (i, j) => j * nx + i;
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      if (i + 1 < nx && !vCov[i + 1][j]) union(id(i, j), id(i + 1, j));
      if (j + 1 < ny && !hCov[j + 1][i]) union(id(i, j), id(i, j + 1));
    }
  }

  const comps = new Map();
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const r = find(id(i, j));
      const c = comps.get(r) || { i0: i, i1: i, j0: j, j1: j, n: 0 };
      c.i0 = Math.min(c.i0, i);
      c.i1 = Math.max(c.i1, i);
      c.j0 = Math.min(c.j0, j);
      c.j1 = Math.max(c.j1, j);
      c.n += 1;
      comps.set(r, c);
    }
  }

  const cells = [];
  for (const c of comps.values()) {
    if (c.n !== (c.i1 - c.i0 + 1) * (c.j1 - c.j0 + 1)) continue; // harus persegi panjang utuh
    let closed = true;
    for (let i = c.i0; i <= c.i1 && closed; i += 1) closed = !!(hCov[c.j0][i] && hCov[c.j1 + 1][i]);
    for (let j = c.j0; j <= c.j1 && closed; j += 1) closed = !!(vCov[c.i0][j] && vCov[c.i1 + 1][j]);
    if (!closed) continue;
    const x0 = xs[c.i0];
    const x1 = xs[c.i1 + 1];
    const y0 = ys[c.j0];
    const y1 = ys[c.j1 + 1];
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 4 || h < 4) continue;
    if (w * h > 0.4 * W * H) continue; // bingkai halaman / area sisa, bukan sel
    cells.push({ x0, y0, x1, y1 });
  }
  cells.sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0);
  return cells;
}

// Kelompokkan sel yang bersentuhan menjadi satu tabel (id 0,1,2,...).
export function groupTables(cells) {
  const parent = cells.map((_, i) => i);
  const find = (k) => {
    while (parent[k] !== k) {
      parent[k] = parent[parent[k]];
      k = parent[k];
    }
    return k;
  };
  const T = 2;
  for (let a = 0; a < cells.length; a += 1) {
    for (let b = a + 1; b < cells.length; b += 1) {
      const p = cells[a];
      const q = cells[b];
      if (p.x0 <= q.x1 + T && q.x0 <= p.x1 + T && p.y0 <= q.y1 + T && q.y0 <= p.y1 + T) {
        parent[find(b)] = find(a);
      }
    }
  }
  const ids = new Map();
  return cells.map((_, i) => {
    const r = find(i);
    if (!ids.has(r)) ids.set(r, ids.size);
    return ids.get(r);
  });
}

export function detectCells(opList, OPS, vpTransform, W, H) {
  const { hs, vs, tooComplex } = extractSegments(opList, OPS, vpTransform);
  if (tooComplex) return { cells: [], hLines: [], vLines: [], tables: [] };
  const hLines = mergeLines(hs);
  const vLines = mergeLines(vs);
  const cells = buildCells(hLines, vLines, W, H);
  return { cells, hLines, vLines, tables: groupTables(cells) };
}
