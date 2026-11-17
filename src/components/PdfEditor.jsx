import { useEffect, useRef, useState } from "react";
import "../styles/pdf-editor.css";
import PdfPage from "./PdfPage";
import { useFileDrop } from "../hooks/useFileDrop";
import { baseName, downloadBlob } from "../utils/fileUtils";
import { FONTS, ensureFace, fontCss, fontOf } from "../utils/fonts";
import {
  A4,
  exportPdf,
  fileToImage,
  ensureMetrics,
  layoutText,
  metricsReady,
  openPdf,
  pageDisplaySize,
  uid,
} from "../utils/pdfEditUtils";

const TOOLS = [
  { id: "edit", label: "Edit teks" },
  { id: "select", label: "Pilih" },
  { id: "text", label: "Tambah teks" },
  { id: "draw", label: "Pensil" },
  { id: "highlight", label: "Sorot" },
  { id: "cover", label: "Tutup" },
];

const TOOL_HINTS = {
  edit: "Klik teks atau sel tabel di PDF untuk mengubah / mengisinya.",
  select: "Klik anotasi untuk memilih, seret untuk memindahkan.",
  text: "Klik halaman untuk menambah teks. Klik sel tabel kosong untuk mengisinya.",
  draw: "Tahan dan seret untuk menggambar / tanda tangan.",
  highlight: "Seret untuk menyorot area.",
  cover: "Seret untuk menutup area dengan kotak (default putih).",
};

const TEXT_TYPES = ["text", "retext", "celltext"];
const FONT_GROUPS = ["Standar", "Sans-serif", "Serif", "Monospace"];

// Gaya (font + variasi) yang dipakai oleh semua teks di dokumen.
const usedStyles = (pages, extraFamily) => {
  const m = new Map();
  for (const p of pages) {
    for (const a of p.annots) {
      if (!TEXT_TYPES.includes(a.type)) continue;
      const st = { family: a.family || "sans", bold: !!a.bold, italic: !!a.italic };
      m.set(`${st.family}|${st.bold}|${st.italic}`, st);
    }
  }
  if (extraFamily) m.set(`${extraFamily}|false|false`, { family: extraFamily, bold: false, italic: false });
  return [...m.values()];
};

const FIT_MODES = [
  { id: "shrink", label: "Kecilkan", title: "Perkecil ukuran huruf otomatis agar muat" },
  { id: "wrap", label: "Bungkus", title: "Pindahkan kelebihan teks ke baris berikutnya" },
  { id: "free", label: "Bebas", title: "Biarkan apa adanya (bisa melewati batas)" },
];
const ALIGNS = [
  { id: "left", label: "Kiri" },
  { id: "center", label: "Tengah" },
  { id: "right", label: "Kanan" },
];

// Ringkasan status kecocokan teks untuk panel.
function describeFit(lay) {
  const pct = Math.round(lay.scale * 100);
  let r;
  if (lay.state === "overflow") {
    const where =
      lay.overX > 0.6 ? `melewati batas kanan ±${Math.ceil(lay.overX)}pt` : `melewati batas bawah ±${Math.ceil(lay.overY)}pt`;
    r = { tone: "bad", text: `Teks ${where}. Coba Kecilkan, Bungkus, atau persingkat teks.` };
  } else if (lay.small) {
    r = { tone: "warn", text: `Diperkecil ke ${pct}% — cukup kecil, pertimbangkan Bungkus atau persingkat teks.` };
  } else if (lay.state === "wrapped") {
    r = { tone: "info", text: `Dibungkus jadi ${lay.lines.length} baris${pct < 100 ? ` (${pct}%)` : ""}.` };
  } else if (lay.state === "shrunk") {
    r = { tone: "info", text: `Diperkecil otomatis ke ${pct}% (${Math.round(lay.fsPt * 10) / 10}pt).` };
  } else {
    r = { tone: "ok", text: "✓ Muat di area." };
  }
  if (lay.unsupported) r.text += ` ${lay.unsupported} karakter tidak didukung font standar (jadi “?”).`;
  return r;
}

const blankPage = (W, H) => ({
  id: uid("pg"),
  srcId: null,
  srcIndex: 0,
  uw: W,
  uh: H,
  baseRot: 0,
  extra: 0,
  annots: [],
});

export default function PdfEditor({ active }) {
  const [pages, setPages] = useState([]);
  const [sources, setSources] = useState({});
  const [tool, setTool] = useState("select");
  const [color, setColor] = useState("#111827");
  const [selected, setSelected] = useState(null); // { pageId, id }
  const [focusId, setFocusId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [fileName, setFileName] = useState("dokumen.pdf");
  const [status, setStatus] = useState("Buka PDF atau drag & drop file .pdf ke halaman ini.");
  const [busy, setBusy] = useState(false);
  const [showCells, setShowCells] = useState(true);
  const [defaultFamily, setDefaultFamily] = useState("sans");
  const [, setFontTick] = useState(0);
  const [metricsOk, setMetricsOk] = useState(false);

  const pagesRef = useRef([]);
  const history = useRef([]);
  const future = useRef([]);
  const lastKey = useRef({ key: null, t: 0 });
  const rootRef = useRef(null);
  const activePageId = useRef(null);
  const imageInput = useRef(null);
  const mergeInput = useRef(null);
  const textAreaRef = useRef(null);

  // ---------- State + riwayat (undo/redo) ----------
  const commit = (updater, key) => {
    const prev = pagesRef.current;
    const next = updater(prev);
    if (next === prev) return;
    const now = Date.now();
    const coalesce = key && lastKey.current.key === key && now - lastKey.current.t < 1000;
    if (!coalesce) {
      history.current.push(prev);
      if (history.current.length > 60) history.current.shift();
    }
    lastKey.current = { key, t: now };
    future.current = [];
    pagesRef.current = next;
    setPages(next);
  };

  const replaceAll = (next) => {
    history.current = [];
    future.current = [];
    lastKey.current = { key: null, t: 0 };
    pagesRef.current = next;
    setPages(next);
    setSelected(null);
  };

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    future.current.push(pagesRef.current);
    pagesRef.current = prev;
    lastKey.current = { key: null, t: 0 };
    setPages(prev);
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(pagesRef.current);
    pagesRef.current = next;
    lastKey.current = { key: null, t: 0 };
    setPages(next);
  };

  // ---------- Membuka / menggabung PDF ----------
  const loadPdf = async (file, append) => {
    setBusy(true);
    try {
      const src = await openPdf(file);
      const srcId = uid("src");
      const newPages = src.pages.map((p) => ({
        id: uid("pg"),
        srcId,
        ...p,
        extra: 0,
        annots: [],
      }));
      if (append) {
        setSources((prev) => ({ ...prev, [srcId]: src }));
        commit((ps) => [...ps, ...newPages]);
        setStatus(`Digabung: ${file.name} (+${newPages.length} halaman)`);
      } else {
        setSources({ [srcId]: src });
        replaceAll(newPages);
        setTool("edit");
        setFileName(file.name);
        setStatus(`Dimuat: ${file.name} (${newPages.length} halaman)`);
      }
    } catch (err) {
      setStatus(err.message || "Gagal membuka PDF.");
    } finally {
      setBusy(false);
    }
  };

  const isPdf = (file) => file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));

  const handleOpen = async (file) => {
    if (!file) return;
    if (!isPdf(file)) {
      setStatus("File harus berformat .pdf.");
      return;
    }
    if (history.current.length > 0 && !window.confirm("Buka PDF baru? Perubahan yang belum diunduh akan hilang.")) {
      return;
    }
    await loadPdf(file, false);
  };

  const handleMerge = async (file) => {
    if (!file) return;
    if (!isPdf(file)) {
      setStatus("File harus berformat .pdf.");
      return;
    }
    await loadPdf(file, true);
  };

  const startBlank = () => {
    setSources({});
    replaceAll([blankPage(A4.w, A4.h)]);
    setFileName("dokumen.pdf");
    setStatus("Dokumen kosong. Tambahkan teks, gambar, atau halaman.");
  };

  const { dragging, dropProps } = useFileDrop(handleOpen);

  // ---------- Operasi anotasi ----------
  const addAnnot = (pageId, annot) => {
    commit((ps) => ps.map((p) => (p.id === pageId ? { ...p, annots: [...p.annots, annot] } : p)));
    setSelected({ pageId, id: annot.id });
    if (annot.type === "text") {
      setFocusId(annot.id);
      setTool("select");
    } else if (annot.type === "retext" || annot.type === "celltext") {
      setFocusId(annot.id);
    }
  };

  const patchAnnot = (pageId, id, patch, key) =>
    commit(
      (ps) =>
        ps.map((p) =>
          p.id !== pageId
            ? p
            : { ...p, annots: p.annots.map((a) => (a.id === id ? { ...a, ...patch } : a)) },
        ),
      key,
    );

  const deleteAnnot = (pageId, id) => {
    commit((ps) =>
      ps.map((p) => (p.id === pageId ? { ...p, annots: p.annots.filter((a) => a.id !== id) } : p)),
    );
    setSelected(null);
  };

  // ---------- Operasi halaman ----------
  const movePage = (i, d) =>
    commit((ps) => {
      const j = i + d;
      if (j < 0 || j >= ps.length) return ps;
      const c = [...ps];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const rotatePage = (id, dir) =>
    commit((ps) => ps.map((p) => (p.id === id ? { ...p, extra: (p.extra + dir + 360) % 360 } : p)));

  const deletePage = (id) => {
    if (pagesRef.current.length <= 1) return;
    commit((ps) => ps.filter((p) => p.id !== id));
  };

  const insertBlankAfter = (index) =>
    commit((ps) => {
      const ref = ps[index];
      const { W, H } = ref ? pageDisplaySize(ref) : { W: A4.w, H: A4.h };
      const c = [...ps];
      c.splice(index + 1, 0, blankPage(W, H));
      return c;
    });

  // ---------- Gambar / tanda tangan ----------
  const handleImage = async (file) => {
    if (!file) return;
    try {
      const img = await fileToImage(file);
      const target =
        pagesRef.current.find((p) => p.id === activePageId.current) || pagesRef.current[0];
      if (!target) return;
      addAnnot(target.id, {
        id: uid("an"),
        type: "image",
        x: 0.35,
        y: 0.35,
        w: 0.3,
        ar: img.ar,
        dataUrl: img.dataUrl,
        mime: img.mime,
      });
      setTool("select");
    } catch {
      setStatus("Gambar tidak bisa dibaca.");
    }
  };

  // ---------- Unduh ----------
  const download = async () => {
    setBusy(true);
    setStatus("Menyusun PDF…");
    try {
      const { bytes, replaced } = await exportPdf(sources, pagesRef.current);
      const name = `${baseName(fileName)}-edit.pdf`;
      downloadBlob(new Blob([bytes], { type: "application/pdf" }), name);
      // Hitung teks yang masih melewati batas areanya supaya pengguna tahu sebelum dipakai.
      await Promise.all(usedStyles(pagesRef.current).map((st) => ensureMetrics(st)));
      let overflow = 0;
      for (const p of pagesRef.current) {
        const { W, H } = pageDisplaySize(p);
        for (const a of p.annots) {
          if ((a.type === "retext" || a.type === "celltext") && layoutText(a, W, H).state === "overflow") overflow += 1;
        }
      }
      const notes = [];
      if (replaced) notes.push(`${replaced} karakter tidak didukung font standar dan diganti “?”`);
      if (overflow) notes.push(`${overflow} teks masih melewati batas areanya — periksa hasilnya`);
      setStatus(notes.length ? `Selesai: ${name}. ${notes.join("; ")}.` : `Selesai: ${name}`);
    } catch (err) {
      console.error(err);
      setStatus(`Gagal membuat PDF: ${err.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- Seleksi ----------
  const selectedPage = selected && pages.find((p) => p.id === selected.pageId);
  const selectedAnnot = selectedPage?.annots.find((a) => a.id === selected.id) || null;
  const selectedSize = selectedPage ? pageDisplaySize(selectedPage) : { W: A4.w, H: A4.h };
  const selectedW = selectedSize.W;
  const isFitted = selectedAnnot?.type === "retext" || selectedAnnot?.type === "celltext";
  const fitLay = isFitted && metricsOk ? layoutText(selectedAnnot, selectedSize.W, selectedSize.H) : null;
  const fitMsg = fitLay ? describeFit(fitLay) : null;

  // Muat font yang dipakai (untuk tampilan & pengukuran), lalu gambar ulang setelah siap.
  useEffect(() => {
    let alive = true;
    const styles = usedStyles(pages, defaultFamily);
    Promise.all(styles.flatMap((st) => [ensureFace(st.family, st), ensureMetrics(st)])).then(() => {
      if (alive) setFontTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [pages, defaultFamily]);

  const changeFont = (family) => {
    setDefaultFamily(family);
    if (selected) patchAnnot(selected.pageId, selected.id, { family });
  };

  const applyFontToAll = (family) => {
    let n = 0;
    commit((ps) =>
      ps.map((p) => ({
        ...p,
        annots: p.annots.map((a) => {
          if (!TEXT_TYPES.includes(a.type) || a.family === family) return a;
          n += 1;
          return { ...a, family };
        }),
      })),
    );
    setDefaultFamily(family);
    setStatus(n ? `Font “${fontOf(family).label}” diterapkan ke ${n} teks.` : "Semua teks sudah memakai font ini.");
  };

  // Metrik font dimuat sekali; setelahnya semua perhitungan muat/tidak memakai ukuran sebenarnya.
  useEffect(() => {
    let alive = true;
    metricsReady.then(() => alive && setMetricsOk(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (focusId && selectedAnnot?.id === focusId && textAreaRef.current) {
      textAreaRef.current.focus();
      textAreaRef.current.select();
      setFocusId(null);
    }
  }, [focusId, selectedAnnot]);

  // ---------- Pintasan keyboard ----------
  const keyHandler = useRef();
  keyHandler.current = (e) => {
    if (!active) return;
    const el = e.target;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      deleteAnnot(selected.pageId, selected.id);
    } else if (e.key === "Escape") {
      setSelected(null);
      setTool("select");
    }
  };
  useEffect(() => {
    const fn = (e) => keyHandler.current(e);
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const scale = 1.33 * zoom;
  const hasPages = pages.length > 0;
  const key = (id) => `edit:${id}`;

  return (
    <section {...dropProps} className={dragging ? "dropping" : ""}>
      <div className="toolbar">
        <label className="btn">
          Buka PDF
          <input
            type="file"
            accept=".pdf,application/pdf"
            hidden
            disabled={busy}
            onChange={(e) => {
              handleOpen(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label className={`btn${hasPages ? "" : " is-disabled"}`}>
          Gabung PDF
          <input
            ref={mergeInput}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            disabled={busy || !hasPages}
            onChange={(e) => {
              handleMerge(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button className="btn" disabled={!hasPages || busy} onClick={() => imageInput.current?.click()}>
          Tambah gambar
        </button>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            handleImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button className="btn" disabled={!history.current.length} onClick={undo} title="Ctrl+Z">
          Undo
        </button>
        <button className="btn" disabled={!future.current.length} onClick={redo} title="Ctrl+Shift+Z">
          Redo
        </button>
        <button className="btn" disabled={!hasPages} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
          −
        </button>
        <span className="status">{Math.round(zoom * 100)}%</span>
        <button className="btn" disabled={!hasPages} onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}>
          +
        </button>
        <button className="btn primary" disabled={!hasPages || busy} onClick={download}>
          {busy ? "Memproses…" : "Unduh PDF"}
        </button>
      </div>

      {hasPages && (
        <div className="toolbar">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`btn${tool === t.id ? " primary" : ""}`}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
          <label className="pe-color" title="Warna teks / pensil">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <span className="status">{TOOL_HINTS[tool]}</span>
          {(tool === "edit" || tool === "text") && (
            <label className="pe-toggle" title="Tampilkan garis bantu sel tabel yang terdeteksi">
              <input type="checkbox" checked={showCells} onChange={(e) => setShowCells(e.target.checked)} />
              Sorot sel tabel
            </label>
          )}
        </div>
      )}

      {hasPages && (
        <div className="pe-panel">
          {selectedAnnot ? (
            <>
              {(selectedAnnot.type === "text" || isFitted) && (
                <>
                  <label className="pe-field">
                    Font
                    <select
                      className="pe-font-select"
                      value={selectedAnnot.family || "sans"}
                      style={{ fontFamily: fontCss(selectedAnnot.family) }}
                      onFocus={() => FONTS.forEach((f) => ensureFace(f.id))}
                      onChange={(e) => changeFont(e.target.value)}
                    >
                      {FONT_GROUPS.map((g) => (
                        <optgroup key={g} label={g}>
                          {FONTS.filter((f) => f.group === g).map((f) => (
                            <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                              {f.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn"
                    title="Pakai font ini untuk semua teks (di semua halaman)"
                    onClick={() => applyFontToAll(selectedAnnot.family || "sans")}
                  >
                    Font ini untuk semua teks
                  </button>
                  <textarea
                    ref={textAreaRef}
                    className="pe-text-input"
                    rows={1}
                    placeholder="Ketik isi sel…"
                    value={selectedAnnot.text}
                    onChange={(e) =>
                      patchAnnot(selected.pageId, selected.id, { text: e.target.value }, key(selected.id))
                    }
                  />
                  <label className="pe-field">
                    Ukuran {Math.round(selectedAnnot.fs * selectedW)}pt
                    {fitLay && fitLay.scale < 0.999 && ` → ${Math.round(fitLay.fsPt * 10) / 10}pt`}
                    <input
                      type="range"
                      min="0.008"
                      max="0.1"
                      step="0.001"
                      value={selectedAnnot.fs}
                      onChange={(e) =>
                        patchAnnot(selected.pageId, selected.id, { fs: +e.target.value }, key(selected.id))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={`btn pe-bi${selectedAnnot.bold ? " primary" : ""}`}
                    style={{ fontWeight: 700 }}
                    title="Tebal"
                    onClick={() => patchAnnot(selected.pageId, selected.id, { bold: !selectedAnnot.bold })}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    className={`btn pe-bi${selectedAnnot.italic ? " primary" : ""}`}
                    style={{ fontStyle: "italic" }}
                    title="Miring"
                    onClick={() => patchAnnot(selected.pageId, selected.id, { italic: !selectedAnnot.italic })}
                  >
                    I
                  </button>
                </>
              )}
              {isFitted && (
                <div className="pe-fitrow">
                  <span className="pe-seg" role="group" aria-label="Jika teks tidak muat">
                    <span className="pe-seg-label">Jika tidak muat</span>
                    {FIT_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        title={m.title}
                        className={`pe-seg-btn${(selectedAnnot.fit || "shrink") === m.id ? " on" : ""}`}
                        onClick={() => patchAnnot(selected.pageId, selected.id, { fit: m.id })}
                      >
                        {m.label}
                      </button>
                    ))}
                  </span>
                  <span className="pe-seg" role="group" aria-label="Perataan teks">
                    <span className="pe-seg-label">Rata</span>
                    {ALIGNS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`pe-seg-btn${(selectedAnnot.align || "left") === m.id ? " on" : ""}`}
                        onClick={() => patchAnnot(selected.pageId, selected.id, { align: m.id })}
                      >
                        {m.label}
                      </button>
                    ))}
                  </span>
                  {fitMsg && (
                    <span className={`pe-fitchip tone-${fitMsg.tone}`} role="status">
                      {fitMsg.text}
                    </span>
                  )}
                </div>
              )}
              {selectedAnnot.type === "path" && (
                <label className="pe-field">
                  Tebal
                  <input
                    type="range"
                    min="0.001"
                    max="0.02"
                    step="0.0005"
                    value={selectedAnnot.th}
                    onChange={(e) =>
                      patchAnnot(selected.pageId, selected.id, { th: +e.target.value }, key(selected.id))
                    }
                  />
                </label>
              )}
              {selectedAnnot.type === "image" && (
                <label className="pe-field">
                  Lebar
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.01"
                    value={selectedAnnot.w}
                    onChange={(e) =>
                      patchAnnot(selected.pageId, selected.id, { w: +e.target.value }, key(selected.id))
                    }
                  />
                </label>
              )}
              {selectedAnnot.type !== "image" && (
                <label className="pe-color" title="Warna">
                  <input
                    type="color"
                    value={selectedAnnot.color}
                    onChange={(e) =>
                      patchAnnot(selected.pageId, selected.id, { color: e.target.value }, key(selected.id))
                    }
                  />
                </label>
              )}
              {selectedAnnot.type === "retext" && (
                <label className="pe-field" title="Warna latar yang menutup teks asli">
                  Latar
                  <span className="pe-color">
                    <input
                      type="color"
                      value={selectedAnnot.bg}
                      onChange={(e) =>
                        patchAnnot(selected.pageId, selected.id, { bg: e.target.value }, key(`bg${selected.id}`))
                      }
                    />
                  </span>
                </label>
              )}
              {(selectedAnnot.type === "highlight" || selectedAnnot.type === "cover") && (
                <label className="pe-field">
                  Opasitas
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={selectedAnnot.opacity}
                    onChange={(e) =>
                      patchAnnot(selected.pageId, selected.id, { opacity: +e.target.value }, key(selected.id))
                    }
                  />
                </label>
              )}
              <button className="btn" onClick={() => deleteAnnot(selected.pageId, selected.id)}>
                {selectedAnnot.type === "retext" ? "Kembalikan asli" : "Hapus"}
              </button>
            </>
          ) : (
            <span className="status">Pilih teks atau anotasi untuk mengubah isi, ukuran, atau warnanya.</span>
          )}
        </div>
      )}

      {hasPages ? (
        <div ref={rootRef} className="pe-viewport">
          {pages.map((p, i) => (
            <PdfPage
              key={p.id}
              page={p}
              index={i}
              total={pages.length}
              pdf={p.srcId ? sources[p.srcId]?.pdf : null}
              scale={scale}
              tool={tool}
              color={color}
              showCells={showCells}
              defaultFamily={defaultFamily}
              rootRef={rootRef}
              selectedId={selected?.pageId === p.id ? selected.id : null}
              onActivate={(id) => {
                activePageId.current = id;
              }}
              onAdd={(annot) => addAnnot(p.id, annot)}
              onPatch={(id, patch, k) => patchAnnot(p.id, id, patch, k)}
              onSelect={(id) => setSelected(id ? { pageId: p.id, id } : null)}
              onMove={(d) => movePage(i, d)}
              onRotate={(d) => rotatePage(p.id, d)}
              onDelete={() => deletePage(p.id)}
              onInsertBlank={() => insertBlankAfter(i)}
            />
          ))}
        </div>
      ) : (
        <div className="pe-empty">
          <p>Belum ada dokumen.</p>
          <p className="status">{status}</p>
          <button className="btn" onClick={startBlank}>
            Mulai dari halaman kosong
          </button>
        </div>
      )}

      {hasPages && <p className="status pe-footer">{status}</p>}
    </section>
  );
}

