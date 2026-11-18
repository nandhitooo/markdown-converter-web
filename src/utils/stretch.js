// "Perbesar sel": menyisipkan ruang vertikal pada halaman (isi di bawah baris bergeser ke bawah).
// Stretch disimpan pada koordinat SUMBER (PDF asli): { at, d } ternormalisasi (0..1, atas-bawah).
// Anotasi selalu disimpan pada koordinat TAMPILAN, jadi saat ruang berubah, anotasi di bawahnya digeser.

const EPS = 1e-9;
export const sortedStretches = (st) => [...(st || [])].sort((a, b) => a.at - b.at);

// koordinat sumber -> tampilan
export function mapY(st, y) {
  let cum = 0;
  for (const s of sortedStretches(st)) if (s.at <= y + EPS) cum += s.d;
  return y + cum;
}

export function mapRect(st, y, h) {
  const t = mapY(st, y);
  return { y: t, h: mapY(st, y + h) - t };
}

// Posisi (tampilan) tepi atas celah milik stretch di `at` — jumlah stretch sebelumnya saja.
export function gapTop(st, at) {
  let cum = 0;
  for (const s of sortedStretches(st)) if (s.at < at - EPS) cum += s.d;
  return at + cum;
}

export function mapStructure(structure, st) {
  if (!structure || !st || !st.length) return structure;
  const mr = (o) => (o ? { ...o, ...mapRect(st, o.y, o.h) } : o);
  return {
    ...structure,
    items: structure.items.map((it) => ({
      ...it,
      ...mapRect(st, it.y, it.h),
      by: mapY(st, it.by),
      limB: mapY(st, it.limB),
      clip: mr(it.clip),
    })),
    cells: structure.cells.map((c) => ({
      ...c,
      ...mapRect(st, c.y, c.h),
      splitSrc: c.splitSrc ?? c.splitY,
      splitY: c.splitY == null ? null : mapY(st, c.splitY),
    })),
    boxes: (structure.boxes || []).map((b) => ({ ...b, ...mapRect(st, b.y, b.h) })),
  };
}

const annotTop = (a) => {
  if (a.type === "path") return Math.min(...a.points.map((p) => p[1]));
  return a.y;
};

function shiftAnnot(a, dv) {
  const n = { ...a };
  if (a.type === "path") n.points = a.points.map(([u, v]) => [u, v + dv]);
  else if (typeof a.y === "number") n.y = a.y + dv;
  if (typeof a.by === "number") n.by = a.by + dv;
  if (typeof a.limB === "number") n.limB = a.limB + dv;
  if (a.clip) n.clip = { ...a.clip, y: a.clip.y + dv };
  if (a.baseClip) n.baseClip = { ...a.baseClip, y: a.baseClip.y + dv };
  return n;
}

const isGrow = (a) => a.fit === "grow" && a.growSrcAt != null;

/**
 * Hitung ulang stretch semua halaman dari anotasi bermode "grow".
 * Mengembalikan array yang sama bila tidak ada perubahan.
 * deps: { layoutText, pageDisplaySize, rotationOf }
 */
export function applyGrow(pages, deps) {
  let changed = false;
  const out = pages.map((p) => {
    const np = growPage(p, deps);
    if (np !== p) changed = true;
    return np;
  });
  return changed ? out : pages;
}

function growPage(p, deps) {
  const growers = p.annots.filter(isGrow);
  const hadBase = p.annots.some((a) => a.baseH != null || a.baseClip);
  if (!growers.length && !(p.stretches && p.stretches.length) && !hadBase) return p;
  const { W, H } = deps.pageDisplaySize(p);
  const rotated = deps.rotationOf(p) !== 0;

  // kebutuhan tinggi per baris (kelompok `at` yang sama)
  const groups = new Map();
  const keyOf = (at) => Math.round(at * H);
  for (const a of growers) {
    const need = rotated ? 0 : deps.layoutText(a, W, H).growPt || 0;
    const k = keyOf(a.growSrcAt);
    const g = groups.get(k) || { at: a.growSrcAt, need: 0 };
    g.need = Math.max(g.need, need);
    groups.set(k, g);
  }
  for (const s of p.stretches || []) {
    const k = keyOf(s.at);
    if (!groups.has(k)) groups.set(k, { at: s.at, need: 0 });
  }

  const cb = p.meta?.contentBottom;
  let free = cb == null ? 0 : Math.max(0, H * (1 - cb) - 6);
  let stretches = [...(p.stretches || [])];
  let annots = p.annots;
  let touched = false;

  for (const g of [...groups.values()].sort((x, y) => x.at - y.at)) {
    const allowed = Math.max(0, Math.min(g.need, free));
    free -= allowed;
    const d = allowed / H;
    const idx = stretches.findIndex((s) => keyOf(s.at) === keyOf(g.at));
    const oldD = idx >= 0 ? stretches[idx].d : 0;
    const diff = d - oldD;
    if (Math.abs(diff * H) < 0.05) continue;
    touched = true;
    const top = gapTop(stretches, g.at);
    annots = annots.map((a) => (annotTop(a) >= top - 1e-6 ? shiftAnnot(a, diff) : a));
    if (d <= 1e-9) stretches.splice(idx, 1);
    else if (idx >= 0) stretches[idx] = { ...stretches[idx], d };
    else stretches.push({ at: g.at, d });
  }

  // Sesuaikan tinggi kotak anotasi yang berada di baris yang membesar.
  const dOf = (at) => stretches.find((s) => keyOf(s.at) === keyOf(at))?.d || 0;
  let boxesChanged = false;
  annots = annots.map((a) => {
    if (a.type === "celltext" && a.baseH != null) {
      const h = a.baseH + (isGrow(a) ? dOf(a.growSrcAt) : 0);
      if (Math.abs(h - a.h) > 1e-9) {
        boxesChanged = true;
        return { ...a, h };
      }
    } else if (a.type === "retext" && a.baseClip) {
      const h = a.baseClip.h + (isGrow(a) ? dOf(a.growSrcAt) : 0);
      if (!a.clip || Math.abs(h - a.clip.h) > 1e-9) {
        boxesChanged = true;
        return { ...a, clip: { ...a.baseClip, h } };
      }
    }
    return a;
  });

  if (!touched && !boxesChanged) return p;
  return { ...p, annots, stretches };
}
