# 📝 Markdown Converter (md-converter)

Aplikasi berbasis web modern untuk mengonversi dokumen **DOCX** dan **PDF** menjadi format **Markdown** (`.md`) secara instan, aman, dan langsung di peramban (client-side).

---

## ✨ Fitur Utama

- 📄 **Dukungan Format DOCX & PDF**: Unggah berkas dokumen Word (`.docx`) atau PDF (`.pdf`) untuk diekstrak teks dan strukturnya.
- 🔒 **100% Client-Side (Privasi Aman)**: Semua proses ekstraksi dan konversi dilakukan langsung di peramban pengguna tanpa mengirim berkas ke server pihak ketiga.
- ⚡ **Pemrosesan Cepat**: Ekstraksi teks otomatis yang mengubah judul, paragraf, dan daftar poin (bullet & numbered list) menjadi format Markdown yang rapi.
- ✏️ **Live Editor**: Tinjau dan edit hasil konversi Markdown secara langsung di aplikasi.
- 📋 **Copy to Clipboard**: Salin hasil Markdown ke clipboard hanya dengan satu kali klik.
- 💾 **Download Berkas `.md`**: Unduh dokumen hasil konversi secara langsung sebagai file `.md`.
- 🎨 **Antarmuka Modern & Responsif**: Tampilan UI yang bersih, responsif, dan mudah digunakan di berbagai perangkat.

---

## 🛠️ Teknologi yang Digunakan

- **[React 19](https://react.dev/)**: Framework antarmuka pengguna berbasis komponen.
- **[Vite 8](https://vitejs.dev/)**: Build tool dan dev server ultra-cepat.
- **[Mammoth.js](https://github.com/mwilliamson/mammoth.js)**: Ekstraksi teks dan struktur dari dokumen `.docx`.
- **[PDF.js (pdfjs-dist)](https://mozilla.github.io/pdf.js/)**: Ekstraksi teks dari berkas `.pdf`.
- **Vanilla CSS**: Pemodelan tampilan UI yang kustom, fleksibel, dan responsif.

---

## 🚀 Cara Memulai

### Prasyarat

Pastikan Anda telah menginstal lingkungan berikut di komputer Anda:
- **Node.js** (Versi 18 atau lebih baru)
- **npm** (biasanya disertakan saat menginstal Node.js)

### Langkah Instalasi

1. **Clone atau unduh repositori ini:**
   ```bash
   git clone <URL_REPOSITORI_ANDA>
   cd md-converter
   ```

2. **Instal dependensi proyek:**
   ```bash
   npm install
   ```

3. **Jalankan server pengembangan (Dev Server):**
   ```bash
   npm run dev
   ```

4. **Buka aplikasi di peramban:**
   Buka tautan yang ditampilkan di terminal (biasanya `http://localhost:5173`).

---

## 📜 Skrip yang Tersedia

Di dalam direktori proyek, Anda dapat menjalankan skrip berikut:

- `npm run dev`: Menjalankan aplikasi dalam mode pengembangan dengan dukungan HMR (Hot Module Replacement).
- `npm run build`: Membangun (build) aplikasi untuk produksi ke dalam folder `dist`.
- `npm run preview`: Menjalankan preview lokal dari hasil build produksi.
- `npm run lint`: Memeriksa potensi kesalahan kode menggunakan ESLint.

---

## 📂 Struktur Proyek

```text
md-converter/
├── public/              # Berkas statis
├── src/
│   ├── assets/          # Aset gambar/ikon
│   ├── components/      # Komponen UI React
│   │   ├── MarkdownEditor.jsx  # Component editor & aksi copy/download
│   │   └── UploadZone.jsx      # Component area drag & drop unggah berkas
│   ├── utils/
│   │   └── documentUtils.js    # Logika ekstraksi PDF, DOCX, dan parser ke Markdown
│   ├── App.jsx          # Komponen utama aplikasi
│   ├── App.css          # Styling utama aplikasi
│   ├── index.css        # Reset CSS & styling global
│   └── main.jsx         # Entry point React
├── package.json         # Dependensi dan skrip proyek
└── vite.config.js       # Konfigurasi Vite
```

---

## 🤝 Lisensi & Kontribusi

Proyek ini dibuat untuk kebutuhan pengolahan dokumen menjadi Markdown secara cepat dan efisien. Kontribusi, masukan, maupun pelaporan bug sangat dipersilakan!

