import { useEffect, useRef, useState } from "react";
import "../styles/pdf-editor.css";
import PdfPage from "./PdfPage";
import { useFileDrop } from "../hooks/useFileDrop";
import { baseName, downloadBlob } from "../utils/fileUtils";
import {
  A4,
  exportPdf,
  fileToImage,
  openPdf,
  pageDisplaySize,
  uid,
} from "../utils/pdfEditUtils";

const TOOLS = [
  { id: "select", label: "Pilih" },
  { id: "text", label: "Teks" },
  { id: "draw", label: "Pensil" },
  { id: "highlight", label: "Sorot" },
  { id: "cover", label: "Tutup" },
];

const TOOL_HINTS = {
  select: "Klik anotasi untuk memilih, seret untuk memindahkan.",
  text: "Klik di halaman untuk menaruh teks.",
  draw: "Tahan dan seret untuk menggambar / tanda tangan.",
  highlight: "Seret untuk menyorot area.",
  cover: "Seret untuk menutup area dengan kotak (default putih).",
};

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
      setStatus(
        replaced
          ? `Selesai: ${name}. ${replaced} karakter teks tidak didukung font standar dan diganti “?”.`
          : `Selesai: ${name}`,
      );
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
  const selectedW = selectedPage ? pageDisplaySize(selectedPage).W : A4.w;

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
        </div>
      )}

      {hasPages && (
        <div className="pe-panel">
          {selectedAnnot ? (
            <>
              {selectedAnnot.type === "text" && (
                <>
                  <textarea
                    ref={textAreaRef}
                    className="pe-text-input"
                    rows={1}
                    value={selectedAnnot.text}
                    onChange={(e) =>
                      patchAnnot(selected.pageId, selected.id, { text: e.target.value }, key(selected.id))
                    }
                  />
                  <label className="pe-field">
                    Ukuran {Math.round(selectedAnnot.fs * selectedW)}pt
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
                </>
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
                Hapus
              </button>
            </>
          ) : (
            <span className="status">Pilih anotasi untuk mengubah teks, ukuran, atau warnanya.</span>
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
