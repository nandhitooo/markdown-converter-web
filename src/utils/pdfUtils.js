import { marked } from "marked";
import documentCss from "../styles/document.css?raw";

marked.setOptions({ gfm: true, breaks: false });

export function markdownToHtml(markdown) {
  return marked.parse(markdown || "");
}

// Cetak lewat iframe tersembunyi -> dialog print browser -> "Save as PDF".
// Hasilnya PDF asli (teks bisa diseleksi), dengan pagination yang benar.
export function printMarkdownAsPdf(markdown, title = "dokumen") {
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
<body><main class="md-body">${markdownToHtml(markdown)}</main></body></html>`);
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
