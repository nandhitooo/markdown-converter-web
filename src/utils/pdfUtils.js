import { marked } from "marked";
import documentCss from "../styles/document.css?raw";

marked.setOptions({ gfm: true, breaks: false });

// Mermaid di-load lazy: hanya diunduh kalau memang ada blok ```mermaid.
let mermaidPromise;
function loadMermaid() {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      // Label SVG murni (bukan foreignObject) supaya aman saat dicetak ke PDF.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      fontFamily: "system-ui, -apple-system, Arial, sans-serif",
    });
    return mermaid;
  });
  return mermaidPromise;
}

const MERMAID_RE = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;
const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let mermaidCounter = 0;

export async function markdownToHtml(markdown) {
  const html = marked.parse(markdown || "");
  const matches = [...html.matchAll(MERMAID_RE)];
  if (matches.length === 0) return html;

  const mermaid = await loadMermaid();
  const rendered = [];
  for (const match of matches) {
    const code = decode(match[1]);
    const id = `mmd-${++mermaidCounter}`;
    try {
      const { svg } = await mermaid.render(id, code);
      rendered.push(`<div class="mermaid-block">${svg}</div>`);
    } catch (err) {
      // Mermaid kadang meninggalkan elemen sementara di body saat error.
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(id)?.remove();
      rendered.push(
        `<pre class="mermaid-error">${escapeHtml(
          `Mermaid error: ${err?.message || err}\n\n${code}`,
        )}</pre>`,
      );
    }
  }
  let i = 0;
  return html.replace(MERMAID_RE, () => rendered[i++]);
}

// Cetak lewat iframe tersembunyi -> dialog print browser -> "Save as PDF".
// Hasilnya PDF asli (teks bisa diseleksi), dengan pagination yang benar.
export async function printMarkdownAsPdf(markdown, title = "dokumen") {
  const bodyHtml = await markdownToHtml(markdown);
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${title.replace(/[<>&]/g, "")}</title>
<style>
@page { size: A4; margin: 20mm; }
body { margin: 0; }
${documentCss}
</style></head>
<body><main class="md-body">${bodyHtml}</main></body></html>`);
  doc.close();

  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  const run = () => {
    iframe.contentWindow.focus();
    iframe.contentWindow.addEventListener("afterprint", cleanup);
    iframe.contentWindow.print();
  };

  // Tunggu gambar (jika ada) selesai dimuat sebelum print.
  const images = [...doc.images];
  if (images.length === 0) {
    setTimeout(run, 50);
  } else {
    Promise.all(
      images.map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }),
      ),
    ).then(run);
  }
}
