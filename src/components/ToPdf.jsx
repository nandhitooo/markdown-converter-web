import { useMemo, useState } from "react";
import { markdownToHtml, printMarkdownAsPdf } from "../utils/pdfUtils";
import { baseName } from "../utils/fileUtils";

export default function ToPdf() {
  const [markdown, setMarkdown] = useState("");
  const [fileName, setFileName] = useState("dokumen.md");
  const html = useMemo(() => markdownToHtml(markdown), [markdown]);

  const loadFile = async (file) => {
    if (!file) return;
    setMarkdown(await file.text());
    setFileName(file.name);
  };

  return (
    <section>
      <div className="toolbar">
        <label className="btn">
          Buka file .md
          <input
            type="file"
            accept=".md,.markdown,.txt"
            hidden
            onChange={(e) => {
              loadFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="btn primary"
          disabled={!markdown.trim()}
          onClick={() => printMarkdownAsPdf(markdown, baseName(fileName))}
        >
          Unduh PDF
        </button>
        <span className="status">
          Di dialog print, pilih tujuan “Save as PDF”.
        </span>
      </div>
      <div className="split">
        <textarea
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          placeholder="Tempel atau ketik Markdown di sini, atau buka file .md."
        />
        <div
          className="preview md-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </section>
  );
}
