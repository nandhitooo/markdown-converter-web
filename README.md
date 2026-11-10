# Markdown Converter

Aplikasi web untuk mengonversi dokumen DOCX/PDF menjadi Markdown, serta menampilkan Markdown dan mencetaknya sebagai PDF. Pemrosesan berkas berjalan di browser; berkas tidak diunggah ke server.

## Fitur

- **DOCX/PDF → Markdown**: pilih atau seret berkas `.docx` atau `.pdf`. Aplikasi mengekstrak teks dan menyusunnya menjadi Markdown.
- **Edit Markdown**: tinjau dan ubah hasil konversi di editor.
- **Salin dan unduh Markdown**: salin hasil ke clipboard atau simpan sebagai berkas `.md`.
- **Markdown → PDF**: buka berkas `.md`, `.markdown`, atau `.txt`, atau ketik Markdown di editor.
- **Preview langsung**: pratinjau Markdown menggunakan GitHub Flavored Markdown. Blok kode Mermaid dirender sebagai diagram.
- **Cetak sebagai PDF**: pilih **Unduh PDF** untuk membuka dialog cetak browser, lalu pilih **Save as PDF**.
- **Drag and drop**: seret berkas ke area aplikasi untuk membukanya.

> Konversi DOCX/PDF mengekstrak teks, bukan tata letak dokumen. PDF hasil pindai yang tidak memiliki lapisan teks mungkin tidak menghasilkan teks.

## Teknologi

- React 19 dan Vite 8
- Mammoth untuk ekstraksi teks DOCX
- PDF.js (`pdfjs-dist`) untuk ekstraksi teks PDF
- Marked untuk merender Markdown
- Mermaid untuk diagram
- CSS

## Menjalankan aplikasi

Prasyarat: Node.js yang didukung oleh Vite 8 dan npm.

```bash
git clone https://github.com/nandhitooo/markdown-converter-web.git
cd markdown-converter-web
npm install
npm run dev
```

Buka URL yang ditampilkan Vite di terminal.

## Skrip

- `npm run dev`: jalankan server pengembangan.
- `npm run build`: buat build produksi di `dist/`.
- `npm run preview`: sajikan build produksi secara lokal.
- `npm run lint`: jalankan ESLint.

## Struktur proyek

```text
md-converter/
├── public/                 # Aset statis
├── src/
│   ├── assets/             # Gambar dan aset
│   ├── components/
│   │   ├── ToMarkdown.jsx  # Konversi DOCX/PDF ke Markdown
│   │   ├── ToPdf.jsx       # Editor, preview, dan cetak PDF
│   │   ├── MarkdownEditor.jsx
│   │   └── UploadZone.jsx
│   ├── hooks/
│   │   └── useFileDrop.js  # Penanganan drag and drop
│   ├── styles/
│   │   └── document.css    # Gaya dokumen untuk preview/cetak
│   ├── utils/
│   │   ├── documentUtils.js
│   │   ├── fileUtils.js
│   │   └── pdfUtils.js
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   └── main.jsx
├── index.html
├── package.json
└── vite.config.js
```
