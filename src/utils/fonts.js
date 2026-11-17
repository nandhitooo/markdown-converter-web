// Daftar font untuk editor PDF. Font standar PDF tidak perlu di-embed; font lainnya (woff, subset Latin)
// dimuat saat dipakai: untuk tampilan lewat FontFace, untuk ekspor di-embed lewat fontkit.

import roboto_r from "@fontsource/roboto/files/roboto-latin-400-normal.woff?url";
import roboto_ri from "@fontsource/roboto/files/roboto-latin-400-italic.woff?url";
import roboto_b from "@fontsource/roboto/files/roboto-latin-700-normal.woff?url";
import roboto_bi from "@fontsource/roboto/files/roboto-latin-700-italic.woff?url";
import opensans_r from "@fontsource/open-sans/files/open-sans-latin-400-normal.woff?url";
import opensans_ri from "@fontsource/open-sans/files/open-sans-latin-400-italic.woff?url";
import opensans_b from "@fontsource/open-sans/files/open-sans-latin-700-normal.woff?url";
import opensans_bi from "@fontsource/open-sans/files/open-sans-latin-700-italic.woff?url";
import lato_r from "@fontsource/lato/files/lato-latin-400-normal.woff?url";
import lato_ri from "@fontsource/lato/files/lato-latin-400-italic.woff?url";
import lato_b from "@fontsource/lato/files/lato-latin-700-normal.woff?url";
import lato_bi from "@fontsource/lato/files/lato-latin-700-italic.woff?url";
import montserrat_r from "@fontsource/montserrat/files/montserrat-latin-400-normal.woff?url";
import montserrat_ri from "@fontsource/montserrat/files/montserrat-latin-400-italic.woff?url";
import montserrat_b from "@fontsource/montserrat/files/montserrat-latin-700-normal.woff?url";
import montserrat_bi from "@fontsource/montserrat/files/montserrat-latin-700-italic.woff?url";
import poppins_r from "@fontsource/poppins/files/poppins-latin-400-normal.woff?url";
import poppins_ri from "@fontsource/poppins/files/poppins-latin-400-italic.woff?url";
import poppins_b from "@fontsource/poppins/files/poppins-latin-700-normal.woff?url";
import poppins_bi from "@fontsource/poppins/files/poppins-latin-700-italic.woff?url";
import inter_r from "@fontsource/inter/files/inter-latin-400-normal.woff?url";
import inter_ri from "@fontsource/inter/files/inter-latin-400-italic.woff?url";
import inter_b from "@fontsource/inter/files/inter-latin-700-normal.woff?url";
import inter_bi from "@fontsource/inter/files/inter-latin-700-italic.woff?url";
import nunito_r from "@fontsource/nunito/files/nunito-latin-400-normal.woff?url";
import nunito_ri from "@fontsource/nunito/files/nunito-latin-400-italic.woff?url";
import nunito_b from "@fontsource/nunito/files/nunito-latin-700-normal.woff?url";
import nunito_bi from "@fontsource/nunito/files/nunito-latin-700-italic.woff?url";
import merriweather_r from "@fontsource/merriweather/files/merriweather-latin-400-normal.woff?url";
import merriweather_ri from "@fontsource/merriweather/files/merriweather-latin-400-italic.woff?url";
import merriweather_b from "@fontsource/merriweather/files/merriweather-latin-700-normal.woff?url";
import merriweather_bi from "@fontsource/merriweather/files/merriweather-latin-700-italic.woff?url";
import playfair_r from "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url";
import playfair_ri from "@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff?url";
import playfair_b from "@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url";
import playfair_bi from "@fontsource/playfair-display/files/playfair-display-latin-700-italic.woff?url";
import sourcecode_r from "@fontsource/source-code-pro/files/source-code-pro-latin-400-normal.woff?url";
import sourcecode_ri from "@fontsource/source-code-pro/files/source-code-pro-latin-400-italic.woff?url";
import sourcecode_b from "@fontsource/source-code-pro/files/source-code-pro-latin-700-normal.woff?url";
import sourcecode_bi from "@fontsource/source-code-pro/files/source-code-pro-latin-700-italic.woff?url";

const STD_CSS = {
  sans: 'Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'Consolas, "Courier New", monospace',
};

export const FONTS = [
  { id: "sans", label: "Helvetica (standar PDF)", group: "Standar", css: STD_CSS.sans },
  { id: "serif", label: "Times (standar PDF)", group: "Standar", css: STD_CSS.serif },
  { id: "mono", label: "Courier (standar PDF)", group: "Standar", css: STD_CSS.mono },
  { id: "roboto", label: "Roboto", group: "Sans-serif", css: '"pe-roboto", sans-serif', files: { r: roboto_r, b: roboto_b, i: roboto_ri, bi: roboto_bi } },
  { id: "opensans", label: "Open Sans", group: "Sans-serif", css: '"pe-opensans", sans-serif', files: { r: opensans_r, b: opensans_b, i: opensans_ri, bi: opensans_bi } },
  { id: "lato", label: "Lato", group: "Sans-serif", css: '"pe-lato", sans-serif', files: { r: lato_r, b: lato_b, i: lato_ri, bi: lato_bi } },
  { id: "montserrat", label: "Montserrat", group: "Sans-serif", css: '"pe-montserrat", sans-serif', files: { r: montserrat_r, b: montserrat_b, i: montserrat_ri, bi: montserrat_bi } },
  { id: "poppins", label: "Poppins", group: "Sans-serif", css: '"pe-poppins", sans-serif', files: { r: poppins_r, b: poppins_b, i: poppins_ri, bi: poppins_bi } },
  { id: "inter", label: "Inter", group: "Sans-serif", css: '"pe-inter", sans-serif', files: { r: inter_r, b: inter_b, i: inter_ri, bi: inter_bi } },
  { id: "nunito", label: "Nunito", group: "Sans-serif", css: '"pe-nunito", sans-serif', files: { r: nunito_r, b: nunito_b, i: nunito_ri, bi: nunito_bi } },
  { id: "merriweather", label: "Merriweather", group: "Serif", css: '"pe-merriweather", serif', files: { r: merriweather_r, b: merriweather_b, i: merriweather_ri, bi: merriweather_bi } },
  { id: "playfair", label: "Playfair Display", group: "Serif", css: '"pe-playfair", serif', files: { r: playfair_r, b: playfair_b, i: playfair_ri, bi: playfair_bi } },
  { id: "sourcecode", label: "Source Code Pro", group: "Monospace", css: '"pe-sourcecode", monospace', files: { r: sourcecode_r, b: sourcecode_b, i: sourcecode_ri, bi: sourcecode_bi } },
];

export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));
export const fontOf = (family) => FONT_BY_ID[family] || FONT_BY_ID.sans;
export const fontCss = (family) => fontOf(family).css;
export const isCustomFont = (family) => !!fontOf(family).files;
export const variantKey = ({ bold, italic } = {}) => (bold ? "b" : "") + (italic ? "i" : "") || "r";
const fileOf = (family, style) => fontOf(family).files?.[style === "b" ? "b" : style === "i" ? "i" : style === "bi" ? "bi" : "r"];

// ---- Pemuatan untuk tampilan (FontFace) ----
const faceLoaded = new Map();
export function ensureFace(family, style = {}) {
  const f = fontOf(family);
  if (!f.files) return Promise.resolve();
  const v = variantKey(style);
  const k = `${f.id}|${v}`;
  if (!faceLoaded.has(k)) {
    const face = new FontFace(`pe-${f.id}`, `url(${fileOf(family, v)})`, {
      weight: v.includes("b") ? "700" : "400",
      style: v.includes("i") ? "italic" : "normal",
    });
    faceLoaded.set(
      k,
      face
        .load()
        .then((ff) => document.fonts.add(ff))
        .catch(() => {}),
    );
  }
  return faceLoaded.get(k);
}

// ---- Byte font untuk ekspor / pengukuran ----
const bytesCache = new Map();
export function fontBytes(family, style = {}) {
  const f = fontOf(family);
  if (!f.files) return Promise.resolve(null);
  const v = variantKey(style);
  const k = `${f.id}|${v}`;
  if (!bytesCache.has(k)) {
    bytesCache.set(
      k,
      fetch(fileOf(family, v)).then((r) => {
        if (!r.ok) throw new Error(`Font ${f.label} gagal dimuat`);
        return r.arrayBuffer();
      }),
    );
  }
  return bytesCache.get(k);
}

// Font standar PDF terdekat (untuk cadangan bila font belum termuat / gagal dimuat).
const GROUP_STD = { Standar: null, "Sans-serif": "sans", Serif: "serif", Monospace: "mono" };
export const stdFamilyOf = (family) => {
  const f = fontOf(family);
  return f.files ? GROUP_STD[f.group] || "sans" : f.id;
};
