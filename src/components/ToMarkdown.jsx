import { useState } from "react";
import { convertDocumentToMarkdown } from "../utils/documentUtils";
import { baseName, downloadText } from "../utils/fileUtils";
import { useFileDrop } from "../hooks/useFileDrop";

export default function ToMarkdown() {
  const [markdown, setMarkdown] = useState("");
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setLoading(true);
    setStatus("");
    try {
      setMarkdown(await convertDocumentToMarkdown(file));
      setFileName(file.name);
      setStatus(`Berhasil: ${file.name}`);
    } catch (err) {
      setMarkdown("");
      setStatus(err.message || "Konversi gagal.");
    } finally {
      setLoading(false);
    }
  };

  const { dragging, dropProps } = useFileDrop(handleFile);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus("Tersalin ke clipboard.");
    } catch {
      setStatus("Gagal menyalin, pakai Unduh .md saja.");
    }
  };

  return (
    <section {...dropProps} className={dragging ? "dropping" : ""}>
      <div className="toolbar">
        <label className="btn">
          {loading ? "Memproses…" : "Pilih .docx / .pdf"}
          <input
            type="file"
            accept=".docx,.pdf"
            hidden
            disabled={loading}
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button className="btn" disabled={!markdown} onClick={copy}>
          Salin
        </button>
        <button
          className="btn primary"
          disabled={!markdown}
          onClick={() =>
            downloadText(markdown, `${baseName(fileName)}.md`, "text/markdown")
          }
        >
          Unduh .md
        </button>
        <span className="status">{status}</span>
      </div>
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        placeholder="Drag & drop file .docx / .pdf ke halaman ini, atau pakai tombol Pilih."
      />
    </section>
  );
}
