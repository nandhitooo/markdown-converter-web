import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  clipBoxOf,
  layoutText,
  loadPageStructure,
  pageDisplaySize,
  rotationOf,
  sampleColors,
  uid,
} from "../utils/pdfEditUtils";
import { fontCss } from "../utils/fonts";
import { mapStructure } from "../utils/stretch";

const fontStyle = (a) => ({
  fontFamily: fontCss(a.family),
  fontWeight: a.bold ? 700 : 400,
  fontStyle: a.italic ? "italic" : "normal",
});

const ASC = 0.95; // posisi baseline dalam kotak baris (sama dengan ekspor)
const clamp = (n) => Math.min(1, Math.max(0, n));
const pathD = (points, w, h) => {
  const pts = points.length === 1 ? [points[0], [points[0][0] + 0.0001, points[0][1]]] : points;
  return pts.map(([u, v], i) => `${i ? "L" : "M"}${u * w} ${v * h}`).join(" ");
};

export default function PdfPage({
  page,
  index,
  total,
  pdf,
  scale,
  tool,
  color,
  showCells,
  defaultFamily,
  onRemove,
  onMeta,
  selectedId,
  rootRef,
  onActivate,
  onAdd,
  onPatch,
  onSelect,
  onMove,
  onRotate,
  onDelete,
  onInsertBlank,
}) {
  const { W, H } = pageDisplaySize(page);
  const R = rotationOf(page);
  const pxW = W * scale;
  const pxH = H * scale;

  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const dragRef = useRef(null);
  const draftRef = useRef(null);
  const [draft, setDraftState] = useState(null);
  const [visible, setVisible] = useState(index < 2);
  const [structure, setStructure] = useState(null); // { items, cells } hasil deteksi (null = belum dimuat)
  // Struktur sumber dipetakan ke koordinat tampilan bila ada ruang yang disisipkan (Perbesar sel).
  const view = useMemo(() => mapStructure(structure, page.stretches), [structure, page.stretches]);
  const items = view ? view.items : null;
  const cells = view ? view.cells : [];
  const boxes = view?.boxes || [];
  const baseRef = useRef(null); // hasil render halaman asli (sebelum ruang disisipkan)
  const [baseTick, setBaseTick] = useState(0);
  const needStructure = tool === "edit" || tool === "text" || tool === "check";

  const setDraft = (d) => {
    draftRef.current = d;
    setDraftState(d);
  };

  // Render hanya halaman yang dekat dengan area terlihat.
  useEffect(() => {
    const el = wrapRef.current;
    const root = rootRef.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root,
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pdf || !page.srcId) return undefined;
    if (!visible) {
      baseRef.current = null;
      canvas.width = 1;
      canvas.height = 1;
      return undefined;
    }
    let cancelled = false;
    let task;
    (async () => {
      const p = await pdf.getPage(page.srcIndex + 1);
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = p.getViewport({ scale: scale * dpr, rotation: R });
      const base = document.createElement("canvas");
      base.width = Math.floor(viewport.width);
      base.height = Math.floor(viewport.height);
      task = p.render({ canvas: base, canvasContext: base.getContext("2d"), viewport });
      try {
        await task.promise;
        if (!cancelled) {
          baseRef.current = base;
          setBaseTick((t) => t + 1);
        }
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") console.error(err);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page.srcId, page.srcIndex, R, scale, visible]);

  // Susun kanvas tampilan: potongan halaman digeser ke bawah, celah diisi dengan garis tabel yang diregangkan.
  useEffect(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const w = base.width;
    const h = base.height;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    const sts = [...(page.stretches || [])].sort((x, y) => x.at - y.at);
    ctx.clearRect(0, 0, w, h);
    if (!sts.length) {
      ctx.drawImage(base, 0, 0);
      return;
    }
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    const strip = Math.max(1, Math.round(h / H)); // 1pt sumber diregangkan untuk mengisi celah
    let cum = 0; // px
    let from = 0; // px (sumber)
    const slice = (s0, s1) => {
      if (s1 > s0) ctx.drawImage(base, 0, s0, w, s1 - s0, 0, s0 + cum, w, s1 - s0);
    };
    for (const s of sts) {
      const at = Math.round(s.at * h);
      const gap = Math.round(s.d * h);
      slice(from, at);
      if (gap > 0) ctx.drawImage(base, 0, Math.max(0, at - strip), w, strip, 0, at + cum, w, gap);
      cum += gap;
      from = at;
    }
    slice(from, h);
  }, [baseTick, page.stretches, H, visible]);

  // Deteksi teks asli + tabel hanya saat mode "Edit teks" / "Tambah teks" dipakai.
  useEffect(() => {
    if (!needStructure || !pdf || !page.srcId) return undefined;
    let cancelled = false;
    setStructure(null);
    loadPageStructure(pdf, page.srcIndex, R)
      .then((res) => {
        if (!cancelled) setStructure(res);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStructure({ items: [], cells: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [needStructure, pdf, page.srcId, page.srcIndex, R]);

  useEffect(() => {
    if (structure && structure.contentBottom != null) onMeta?.(page.id, { contentBottom: structure.contentBottom });
  }, [structure]); // eslint-disable-line react-hooks/exhaustive-deps

  const point = (e) => {
    const r = overlayRef.current.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
  };

  // ---------- Membuat anotasi baru (teks / pensil / sorot / tutup) ----------
  const onOverlayDown = (e) => {
    onActivate(page.id);
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const [u, v] = point(e);

    if (tool === "select" || tool === "edit") {
      onSelect(null);
      return;
    }
    if (tool === "text") {
      onAdd({ id: uid("an"), type: "text", x: u, y: v, fs: 0.022, text: "Ketik teks", color, family: defaultFamily });
      return;
    }
    if (tool === "check") {
      const s = 0.024;
      onAdd({ id: uid("an"), type: "check", x: u - s / 2, y: v - (s * W) / H / 2, w: s, mark: "check", color, th: 0.13 });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "draw") setDraft({ kind: "path", points: [[u, v]] });
    else setDraft({ kind: "rect", x0: u, y0: v, x1: u, y1: v });
  };

  const onOverlayMove = (e) => {
    const d = draftRef.current;
    if (!d) return;
    const [u, v] = point(e);
    if (d.kind === "path") {
      const last = d.points[d.points.length - 1];
      if (Math.hypot((u - last[0]) * pxW, (v - last[1]) * pxH) < 2) return;
      setDraft({ ...d, points: [...d.points, [u, v]] });
    } else {
      setDraft({ ...d, x1: u, y1: v });
    }
  };

  const onOverlayUp = () => {
    const d = draftRef.current;
    if (!d) return;
    setDraft(null);
    if (d.kind === "path") {
      onAdd({ id: uid("an"), type: "path", points: d.points, th: 0.003, color });
      return;
    }
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    if (w * pxW < 4 && h * pxH < 4) return;
    onAdd(
      tool === "highlight"
        ? { id: uid("an"), type: "highlight", x, y, w, h, color: "#ffeb3b", opacity: 0.4 }
        : { id: uid("an"), type: "cover", x, y, w, h, color: "#ffffff", opacity: 1 },
    );
  };

  // ---------- Mengedit teks asli ----------
  const editItem = (e, item, i) => {
    e.stopPropagation();
    onActivate(page.id);
    const existing = page.annots.find((a) => a.type === "retext" && a.origIdx === i);
    if (existing) {
      onSelect(existing.id);
      return;
    }
    const { bg, fg } = sampleColors(canvasRef.current, item.x, item.y, item.x + item.w, item.y + item.h);
    onAdd({
      id: uid("an"),
      type: "retext",
      origIdx: i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      bx: item.bx,
      by: item.by,
      fs: item.fs,
      text: item.str,
      color: fg,
      bg,
      family: item.family,
      bold: item.bold,
      italic: item.italic,
      align: item.align,
      fit: "shrink",
      anc: item.anc,
      lim: item.lim,
      limB: item.limB,
      clip: item.clip,
      baseClip: item.clip,
      growSrcAt: item.cell >= 0 && R === 0 ? (cells[item.cell]?.splitSrc ?? cells[item.cell]?.splitY ?? null) : null,
    });
  };

  // ---------- Kotak centang: klik = centang, klik lagi = batal ----------
  const onBoxDown = (e, b) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    onActivate(page.id);
    const ex = page.annots.find((a) => a.type === "check" && a.boxKey === b.key);
    if (ex) {
      onRemove(ex.id);
      return;
    }
    const side = Math.max(b.w * W, b.h * H) * 1.3; // sedikit lebih besar dari kotaknya
    onAdd({
      id: uid("an"),
      type: "check",
      boxKey: b.key,
      x: b.x + b.w / 2 - side / W / 2,
      y: b.y + b.h / 2 - side / H / 2,
      w: side / W,
      mark: "check",
      color,
      th: 0.13,
    });
  };

  // ---------- Mengisi sel tabel kosong ----------
  const fillCell = (c) => {
    const canGrow = R === 0 && (c.splitSrc ?? c.splitY) != null;
    const ref = c.style.refItem >= 0 ? items[c.style.refItem] : null;
    const fg = ref ? sampleColors(canvasRef.current, ref.x, ref.y, ref.x + ref.w, ref.y + ref.h).fg : "#111827";
    onAdd({
      id: uid("an"),
      type: "celltext",
      cellKey: c.key,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      anc: { l: c.x + c.pad, c: c.x + c.w / 2, r: c.x + c.w - c.pad },
      lim: [c.x + c.pad, c.x + c.w - c.pad],
      fs: c.style.fs,
      text: "",
      color: fg,
      family: c.style.family,
      bold: false,
      italic: false,
      align: "left",
      baseH: c.h,
      growSrcAt: canGrow ? c.splitSrc ?? c.splitY : null,
      fit: canGrow ? "grow" : "shrink",
    });
  };

  const onCellDown = (e, c) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const existing = page.annots.find((a) => a.type === "celltext" && a.cellKey === c.key);
    if (existing) {
      e.stopPropagation();
      onActivate(page.id);
      onSelect(existing.id);
    } else if (c.items.length === 1 && tool === "edit") {
      editItem(e, items[c.items[0]], c.items[0]); // klik di mana saja dalam sel = edit teksnya
    } else if (c.items.length === 0) {
      e.stopPropagation();
      onActivate(page.id);
      fillCell(c);
    }
    // sel berisi banyak teks: biarkan klik diteruskan (pilih teks langsung / tambah teks bebas)
  };

  // ---------- Menggeser anotasi yang sudah ada ----------
  const startDrag = (e, a) => {
    e.stopPropagation();
    onActivate(page.id);
    onSelect(a.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    const [u, v] = point(e);
    dragRef.current = { id: a.id, u0: u, v0: v, orig: a, key: `drag:${a.id}:${Date.now()}` };
  };

  const moveDrag = (e, a) => {
    const d = dragRef.current;
    if (!d || d.id !== a.id) return;
    const [u, v] = point(e);
    const du = u - d.u0;
    const dv = v - d.v0;
    if (d.orig.type === "path") {
      onPatch(a.id, { points: d.orig.points.map(([pu, pv]) => [pu + du, pv + dv]) }, d.key);
    } else {
      onPatch(a.id, { x: d.orig.x + du, y: d.orig.y + dv }, d.key);
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const selectable = tool === "select";
  const handlers = (a) => ({
    onPointerDown: selectable ? (e) => startDrag(e, a) : undefined,
    onPointerMove: selectable ? (e) => moveDrag(e, a) : undefined,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  });
  const pe = { pointerEvents: selectable ? "auto" : "none" };

  const rectStyle = (a) => ({
    left: `${a.x * 100}%`,
    top: `${a.y * 100}%`,
    width: `${a.w * 100}%`,
    height: `${a.h * 100}%`,
    background: a.color,
    opacity: a.opacity,
  });

  const renderAnnot = (a) => {
    const sel = a.id === selectedId;
    const cls = `ann ann-${a.type}${sel ? " sel" : ""}`;

    if (a.type === "text") {
      return (
        <div
          key={a.id}
          className={cls}
          style={{
            left: `${a.x * 100}%`,
            top: `${a.y * 100}%`,
            fontSize: a.fs * pxW,
            color: a.color,
            ...fontStyle(a),
            ...pe,
          }}
          {...handlers(a)}
        >
          {a.text || " "}
        </div>
      );
    }
    if (a.type === "retext" || a.type === "celltext") {
      const lay = layoutText(a, W, H);
      const fsPx = lay.fs * pxW;
      const mode = a.fit || "shrink";
      const cb = clipBoxOf(a);
      const box = cb || { x: 0, y: 0, w: 1, h: 1 };
      const patchFit = (fit) => onPatch(a.id, { fit }, `fit:${a.id}`);
      const hasText = lay.lines.some((l) => l.text.trim());
      const showBar = sel && hasText && (lay.state === "overflow" || lay.small);
      const barLeft = Math.max(4, Math.min(lay.bbox.x0 * pxW, pxW - 300));
      return (
        <Fragment key={a.id}>
          <div
            className={cls}
            style={{
              left: `${a.x * 100}%`,
              top: `${a.y * 100}%`,
              width: `${a.w * 100}%`,
              height: `${a.h * 100}%`,
              background: a.type === "retext" ? a.bg : "transparent",
              pointerEvents: selectable || tool === "edit" ? "auto" : "none",
              cursor: "text",
            }}
            onPointerDown={(e) => {
              if (!selectable && tool !== "edit") return;
              e.stopPropagation();
              onActivate(page.id);
              onSelect(a.id);
            }}
          >
          </div>
          <div
            className="ann-clip"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
              overflow: cb ? "hidden" : "visible",
            }}
          >
            {lay.lines.map((ln, i) => (
              <div
                key={i}
                className="ann-retext-text"
                style={{
                  left: (ln.x - box.x) * pxW,
                  top: (ln.y - box.y) * pxH - ASC * fsPx,
                  fontSize: fsPx,
                  color: a.color,
                  ...fontStyle(a),
                }}
              >
                {ln.text}
              </div>
            ))}
          </div>
          {sel && hasText && (
            <>
              <div
                className="pe-fit-room"
                style={{
                  left: `${lay.room.x0 * 100}%`,
                  width: `${(lay.room.x1 - lay.room.x0) * 100}%`,
                  top: `${lay.bbox.y0 * 100}%`,
                  height: `${(lay.bbox.y1 - lay.bbox.y0) * 100}%`,
                }}
              />
              <div
                className={`pe-fit-bbox tone-${lay.state}`}
                style={{
                  left: `${lay.bbox.x0 * 100}%`,
                  width: `${Math.max(0, lay.bbox.x1 - lay.bbox.x0) * 100}%`,
                  top: `${lay.bbox.y0 * 100}%`,
                  height: `${(lay.bbox.y1 - lay.bbox.y0) * 100}%`,
                }}
              />
            </>
          )}
          {showBar && (
            <div
              className={`pe-fitbar${lay.state === "overflow" ? " bad" : ""}`}
              style={{ left: barLeft, top: lay.bbox.y1 * pxH + 6 }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span>
                {lay.state === "overflow"
                  ? lay.clipped
                    ? "Teks terlalu panjang, terpotong di garis sel"
                    : lay.overX > 0.6
                      ? `Melewati batas kanan ±${Math.ceil(lay.overX)}pt`
                      : `Melewati batas bawah ±${Math.ceil(lay.overY)}pt`
                  : `Teks diperkecil jadi ${Math.round(lay.scale * 100)}%`}
              </span>
              {mode !== "wrap" && <button type="button" onClick={() => patchFit("wrap")}>Bungkus baris</button>}
              {mode !== "shrink" && <button type="button" onClick={() => patchFit("shrink")}>Kecilkan</button>}
            </div>
          )}
        </Fragment>
      );
    }
    if (a.type === "check") {
      const size = a.w * pxW;
      const sw = a.th || 0.13;
      return (
        <div
          key={a.id}
          className={cls}
          style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: size, height: size, ...pe }}
          {...handlers(a)}
        >
          <svg width={size} height={size} viewBox="0 0 1 1" style={{ display: "block", overflow: "visible" }}>
            {(a.mark || "check") === "check" && (
              <polyline points="0.12,0.55 0.4,0.82 0.88,0.18" fill="none" stroke={a.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {a.mark === "cross" && (
              <path d="M0.15 0.15L0.85 0.85M0.85 0.15L0.15 0.85" fill="none" stroke={a.color} strokeWidth={sw} strokeLinecap="round" />
            )}
            {a.mark === "fill" && <rect x="0.15" y="0.15" width="0.7" height="0.7" fill={a.color} />}
          </svg>
        </div>
      );
    }
    if (a.type === "highlight" || a.type === "cover") {
      return <div key={a.id} className={cls} style={{ ...rectStyle(a), ...pe }} {...handlers(a)} />;
    }
    if (a.type === "image") {
      return (
        <img
          key={a.id}
          className={cls}
          src={a.dataUrl}
          alt=""
          draggable={false}
          style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, ...pe }}
          {...handlers(a)}
        />
      );
    }
    if (a.type === "path") {
      const d = pathD(a.points, pxW, pxH);
      const xs = a.points.map((p) => p[0] * pxW);
      const ys = a.points.map((p) => p[1] * pxH);
      return (
        <svg key={a.id} className="ann-svg" width={pxW} height={pxH}>
          <path
            d={d}
            fill="none"
            stroke={a.color}
            strokeWidth={a.th * pxW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {sel && (
            <rect
              x={Math.min(...xs) - 4}
              y={Math.min(...ys) - 4}
              width={Math.max(...xs) - Math.min(...xs) + 8}
              height={Math.max(...ys) - Math.min(...ys) + 8}
              fill="none"
              stroke="#4f46e5"
              strokeDasharray="4 3"
            />
          )}
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(a.th * pxW, 14)}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: selectable ? "stroke" : "none", cursor: "move", touchAction: "none" }}
            {...handlers(a)}
          />
        </svg>
      );
    }
    return null;
  };

  const hasAnnots = page.annots.length > 0;

  return (
    <div className="pe-page-block" style={{ width: pxW }}>
      <div className="pe-page-head">
        <span>
          Halaman {index + 1} / {total}
          {needStructure &&
            structure &&
            page.srcId &&
            (structure.items.length === 0 && structure.cells.length === 0
              ? " — tidak ada teks/tabel terdeteksi (mungkin hasil scan)"
              : structure.cells.length > 0
                ? ` — ${structure.cells.length} sel tabel terdeteksi`
                : "") +
              (structure.boxes?.length ? ` · ${structure.boxes.length} kotak centang` : "")}
        </span>
        <span className="pe-page-actions">
          <button type="button" title="Naikkan" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" title="Turunkan" disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
          <button
            type="button"
            title={hasAnnots ? "Rotasi hanya untuk halaman tanpa anotasi" : "Putar kiri"}
            disabled={hasAnnots}
            onClick={() => onRotate(-90)}
          >⟲</button>
          <button
            type="button"
            title={hasAnnots ? "Rotasi hanya untuk halaman tanpa anotasi" : "Putar kanan"}
            disabled={hasAnnots}
            onClick={() => onRotate(90)}
          >⟳</button>
          <button type="button" title="Sisipkan halaman kosong setelah ini" onClick={onInsertBlank}>＋</button>
          <button type="button" title="Hapus halaman" disabled={total === 1} onClick={onDelete}>✕</button>
        </span>
      </div>

      <div ref={wrapRef} className="pe-page" style={{ width: pxW, height: pxH }}>
        {page.srcId && <canvas ref={canvasRef} style={{ width: pxW, height: pxH }} />}

        <div
          ref={overlayRef}
          className={`pe-overlay tool-${tool}`}
          onPointerDown={onOverlayDown}
          onPointerMove={onOverlayMove}
          onPointerUp={onOverlayUp}
          onPointerCancel={onOverlayUp}
        >
          {needStructure &&
            cells.map((c) => {
              const filled =
                c.items.length > 0 ||
                page.annots.some((a) => a.type === "celltext" && a.cellKey === c.key && a.text);
              return (
                <div
                  key={`cell${c.key}`}
                  className={`pe-cell${showCells ? " show" : ""}${filled ? "" : " empty"}`}
                  title={filled ? undefined : "Klik untuk mengisi sel"}
                  style={{
                    left: `${c.x * 100}%`,
                    top: `${c.y * 100}%`,
                    width: `${c.w * 100}%`,
                    height: `${c.h * 100}%`,
                  }}
                  onPointerDown={(e) => onCellDown(e, c)}
                />
              );
            })}

          {(tool === "edit" || tool === "check") &&
            boxes.map((b) => {
              const on = page.annots.some((a) => a.type === "check" && a.boxKey === b.key);
              return (
                <div
                  key={`box${b.key}`}
                  className={`pe-box${on ? " on" : ""}${showCells ? " show" : ""}`}
                  title={on ? "Klik untuk membatalkan centang" : "Klik untuk mencentang"}
                  style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
                  onPointerDown={(e) => onBoxDown(e, b)}
                />
              );
            })}

          {page.annots.map(renderAnnot)}

          {tool === "edit" &&
            items?.map((it, i) =>
              it.glyphBox != null || page.annots.some((a) => a.type === "retext" && a.origIdx === i) ? null : (
                <div
                  key={`ti${i}`}
                  className="pe-textbox"
                  title={it.str}
                  style={{
                    left: `${it.x * 100}%`,
                    top: `${it.y * 100}%`,
                    width: `${it.w * 100}%`,
                    height: `${it.h * 100}%`,
                  }}
                  onPointerDown={(e) => editItem(e, it, i)}
                />
              ),
            )}

          {draft?.kind === "path" && (
            <svg className="ann-svg" width={pxW} height={pxH}>
              <path
                d={pathD(draft.points, pxW, pxH)}
                fill="none"
                stroke={color}
                strokeWidth={0.003 * pxW}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {draft?.kind === "rect" && (
            <div
              className="ann"
              style={{
                left: `${Math.min(draft.x0, draft.x1) * 100}%`,
                top: `${Math.min(draft.y0, draft.y1) * 100}%`,
                width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
                height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
                background: tool === "highlight" ? "#ffeb3b" : "#ffffff",
                opacity: tool === "highlight" ? 0.4 : 0.85,
                outline: "1px dashed #4f46e5",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

