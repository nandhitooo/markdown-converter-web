import { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { analyzePage } from "./pageStructure";
import { layoutText, metricsReady } from "./textFit";

export { layoutText, metricsReady };

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export const A4 = { w: 595.28, h: 841.89 };

let counter = 0;
export const uid = (prefix = "id") => `${prefix}${++counter}`;

// Rotasi total halaman (derajat, searah jarum jam) = rotasi bawaan PDF + rotasi dari editor.
export const rotationOf = (page) => (((page.baseRot || 0) + page.extra) % 360 + 360) % 360;

// Ukuran halaman sebagaimana tampil (dalam point), setelah rotasi.
export function pageDisplaySize(page) {
  return rotationOf(page) % 180 === 0
    ? { W: page.uw, H: page.uh }
    : { W: page.uh, H: page.uw };
}

export async function openPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  let pdf;
  try {
    // pdf.js memindahkan buffer ke worker, jadi kirim salinannya.
    pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  } catch (err) {
    if (err?.name === "PasswordException") {
      throw new Error("PDF ini dilindungi password, belum didukung.");
    }
    throw new Error("File PDF tidak bisa dibaca.");
  }

  let lib;
  try {
    lib = await PDFDocument.load(bytes);
  } catch {
    throw new Error("PDF ini terenkripsi atau rusak, tidak bisa diedit.");
  }

  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const p = await pdf.getPage(i);
    const vp = p.getViewport({ scale: 1, rotation: 0 }); // ukuran tanpa rotasi
    pages.push({
      srcIndex: i - 1,
      uw: vp.width,
      uh: vp.height,
      baseRot: ((p.rotate % 360) + 360) % 360,
    });
  }
  return { bytes, pdf, lib, pages, name: file.name };
}

// Gambar -> data URL (dikecilkan maksimal `max` px). JPEG tetap JPEG, selainnya jadi PNG.
export async function fileToImage(file, max = 1600) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const mime = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  return { dataUrl: canvas.toDataURL(mime, 0.92), mime, ar: h / w };
}


// Deteksi struktur halaman: teks asli, garis, dan sel tabel. Hasil dinormalisasi ke
// koordinat tampilan (0..1, kiri-atas). Lihat pageStructure.js untuk detailnya.
export async function loadPageStructure(pdf, srcIndex, R) {
  const page = await pdf.getPage(srcIndex + 1);
  const vp = page.getViewport({ scale: 1, rotation: R });
  let opList = { fnArray: [], argsArray: [] };
  try {
    opList = await page.getOperatorList(); // juga memastikan font termuat (untuk deteksi bold/italic)
  } catch {
    /* abaikan */
  }
  const tc = await page.getTextContent();

  const fontInfo = (fontName) => {
    let name = "";
    try {
      if (page.commonObjs.has(fontName)) name = page.commonObjs.get(fontName)?.name || "";
    } catch {
      /* font belum ter-resolve */
    }
    const css = tc.styles?.[fontName]?.fontFamily || "";
    let family = "sans";
    if (/courier|mono|consolas/i.test(name) || /monospace/i.test(css)) family = "mono";
    else if (
      (/times|serif|georgia|garamond|cambria|minion|palatino|bookman/i.test(name) && !/sans/i.test(name)) ||
      css === "serif"
    ) {
      family = "serif";
    }
    return {
      family,
      bold: /bold|black|heavy|semibold|demi/i.test(name),
      italic: /italic|oblique/i.test(name),
    };
  };

  return analyzePage({ tc, opList, vp, Util: pdfjsLib.Util, OPS: pdfjsLib.OPS, fontInfo });
}

// Ambil perkiraan warna latar & warna teks dari canvas hasil render pada area (u0,v0)-(u1,v1).
export function sampleColors(canvas, u0, v0, u1, v1) {
  const fallback = { bg: "#ffffff", fg: "#000000" };
  try {
    if (!canvas || canvas.width < 8) return fallback;
    const x = Math.max(0, Math.floor(u0 * canvas.width));
    const y = Math.max(0, Math.floor(v0 * canvas.height));
    const w = Math.max(2, Math.min(canvas.width - x, Math.ceil((u1 - u0) * canvas.width)));
    const h = Math.max(2, Math.min(canvas.height - y, Math.ceil((v1 - v0) * canvas.height)));
    const data = canvas.getContext("2d").getImageData(x, y, w, h).data;
    const at = (i, j) => (j * w + i) * 4;

    // Latar = warna paling sering di tepi kotak.
    const buckets = new Map();
    const add = (i, j) => {
      const k = at(i, j);
      const key = ((data[k] >> 4) << 8) | ((data[k + 1] >> 4) << 4) | (data[k + 2] >> 4);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n += 1;
      b.r += data[k];
      b.g += data[k + 1];
      b.b += data[k + 2];
      buckets.set(key, b);
    };
    for (let i = 0; i < w; i += 1) {
      add(i, 0);
      add(i, h - 1);
    }
    for (let j = 0; j < h; j += 1) {
      add(0, j);
      add(w - 1, j);
    }
    let best = null;
    for (const b of buckets.values()) if (!best || b.n > best.n) best = b;
    const bg = [best.r / best.n, best.g / best.n, best.b / best.n];

    // Teks = rata-rata piksel yang paling jauh dari warna latar.
    const dist = (k) => Math.abs(data[k] - bg[0]) + Math.abs(data[k + 1] - bg[1]) + Math.abs(data[k + 2] - bg[2]);
    let max = 0;
    for (let k = 0; k < data.length; k += 4) max = Math.max(max, dist(k));
    let fg = [0, 0, 0];
    if (max > 60) {
      let n = 0;
      const sum = [0, 0, 0];
      for (let k = 0; k < data.length; k += 4) {
        if (dist(k) > 0.8 * max) {
          sum[0] += data[k];
          sum[1] += data[k + 1];
          sum[2] += data[k + 2];
          n += 1;
        }
      }
      fg = sum.map((v) => v / n);
    } else {
      fg = bg.map((v) => (v > 128 ? 0 : 255));
    }
    const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    return { bg: hex(bg), fg: hex(fg) };
  } catch {
    return fallback;
  }
}

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// Titik (u,v) pada tampilan (0..1, kiri-atas) -> koordinat ruang PDF (tanpa rotasi, y ke atas).
function makeMapper(cb, R) {
  const { x: cx, y: cy, width: w, height: h } = cb;
  return (u, v) => {
    switch (R) {
      case 90:
        return [cx + v * w, cy + u * h];
      case 180:
        return [cx + w - u * w, cy + v * h];
      case 270:
        return [cx + w - v * w, cy + h - u * h];
      default:
        return [cx + u * w, cy + h - v * h];
    }
  };
}

export async function exportPdf(sources, pages) {
  await metricsReady;
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const supported = new Set(font.getCharacterSet()); // WinAnsi: sama untuk semua font standar
  const fontCache = new Map();
  const getFont = async ({ family = "sans", bold = false, italic = false } = {}) => {
    const F = StandardFonts;
    const table = {
      sans: [F.Helvetica, F.HelveticaBold, F.HelveticaOblique, F.HelveticaBoldOblique],
      serif: [F.TimesRoman, F.TimesRomanBold, F.TimesRomanItalic, F.TimesRomanBoldItalic],
      mono: [F.Courier, F.CourierBold, F.CourierOblique, F.CourierBoldOblique],
    };
    const name = (table[family] || table.sans)[(bold ? 1 : 0) + (italic ? 2 : 0)];
    if (!fontCache.has(name)) fontCache.set(name, await out.embedFont(name));
    return fontCache.get(name);
  };
  let replaced = 0;

  const clean = (s) => {
    let res = "";
    for (const ch of s.replace(/\r/g, "")) {
      const cp = ch.codePointAt(0);
      if (cp === 10) res += ch;
      else if (cp === 9) res += "    ";
      else if (supported.has(cp)) res += ch;
      else {
        res += "?";
        replaced += 1;
      }
    }
    return res;
  };

  // Salin halaman per sumber sekaligus supaya resource bersama (font, dll.) tidak digandakan.
  const wanted = new Map();
  for (const p of pages) {
    if (!p.srcId) continue;
    if (!wanted.has(p.srcId)) wanted.set(p.srcId, []);
    wanted.get(p.srcId).push(p.srcIndex);
  }
  const copied = new Map();
  for (const [srcId, indices] of wanted) {
    const copies = await out.copyPages(sources[srcId].lib, indices);
    indices.forEach((ix, k) => copied.set(`${srcId}:${ix}`, copies[k]));
  }

  const imageCache = new Map();
  const getImage = async (a) => {
    if (!imageCache.has(a.dataUrl)) {
      const buf = await (await fetch(a.dataUrl)).arrayBuffer();
      imageCache.set(
        a.dataUrl,
        a.mime === "image/jpeg" ? await out.embedJpg(buf) : await out.embedPng(buf),
      );
    }
    return imageCache.get(a.dataUrl);
  };

  for (const p of pages) {
    const R = rotationOf(p);
    const page = p.srcId
      ? out.addPage(copied.get(`${p.srcId}:${p.srcIndex}`))
      : out.addPage([p.uw, p.uh]);
    page.setRotation(degrees(R));

    const cb = page.getCropBox();
    const toUser = makeMapper(cb, R);
    const dispW = R % 180 === 0 ? cb.width : cb.height; // lebar tampilan (pt)
    const dispH = R % 180 === 0 ? cb.height : cb.width;

    for (const a of p.annots) {
      if (a.type === "text") {
        const size = a.fs * dispW;
        const f = await getFont(a);
        clean(a.text || "")
          .split("\n")
          .forEach((line, i) => {
            if (!line.trim()) return;
            const [x, y] = toUser(a.x, a.y + (0.95 * size + i * 1.2 * size) / dispH);
            page.drawText(line, { x, y, size, font: f, color: hexToRgb(a.color), rotate: degrees(R) });
          });
      } else if (a.type === "retext" || a.type === "celltext") {
        if (a.type === "retext") {
          // Tutup teks asli dengan warna latar, lalu tulis teks pengganti.
          const [x1, y1] = toUser(a.x, a.y);
          const [x2, y2] = toUser(a.x + a.w, a.y + a.h);
          page.drawRectangle({
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1),
            color: hexToRgb(a.bg),
            borderWidth: 0,
          });
        }
        // Tata letak yang sama persis dengan tampilan: ukuran, perataan, pembungkusan.
        const lay = layoutText(a, dispW, dispH);
        const size = lay.fs * dispW;
        const f = await getFont(a);
        for (const ln of lay.lines) {
          const t = clean(ln.text);
          if (!t.trim()) continue;
          const [x, y] = toUser(ln.x, ln.y);
          page.drawText(t, { x, y, size, font: f, color: hexToRgb(a.color), rotate: degrees(R) });
        }
      } else if (a.type === "highlight" || a.type === "cover") {
        const [x1, y1] = toUser(a.x, a.y);
        const [x2, y2] = toUser(a.x + a.w, a.y + a.h);
        page.drawRectangle({
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          color: hexToRgb(a.color),
          opacity: a.opacity ?? 1,
          borderWidth: 0,
        });
      } else if (a.type === "path") {
        const thickness = Math.max(0.1, a.th * dispW);
        const color = hexToRgb(a.color);
        const pts = a.points.map(([u, v]) => toUser(u, v));
        if (pts.length === 1) {
          page.drawCircle({ x: pts[0][0], y: pts[0][1], size: thickness / 2, color });
        }
        for (let i = 1; i < pts.length; i += 1) {
          page.drawLine({
            start: { x: pts[i - 1][0], y: pts[i - 1][1] },
            end: { x: pts[i][0], y: pts[i][1] },
            thickness,
            color,
            lineCap: LineCapStyle.Round,
          });
        }
      } else if (a.type === "image") {
        const img = await getImage(a);
        const wPt = a.w * dispW;
        const hPt = wPt * a.ar;
        const [x, y] = toUser(a.x, a.y + hPt / dispH); // pojok kiri-bawah gambar
        page.drawImage(img, { x, y, width: wPt, height: hPt, rotate: degrees(R) });
      }
    }
  }

  return { bytes: await out.save(), replaced };
}

