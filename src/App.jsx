import { useState } from "react";
import "./App.css";
import "./styles/document.css";
import ToMarkdown from "./components/ToMarkdown";
import ToPdf from "./components/ToPdf";
import PdfEditor from "./components/PdfEditor";

const TABS = [
  { id: "pdf", label: "Markdown → PDF" },
  { id: "md", label: "DOCX / PDF → Markdown" },
  { id: "edit", label: "Editor PDF" },
];

export default function App() {
  const [tab, setTab] = useState("pdf");

  return (
    <main className="app">
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {/* Semua tab tetap ter-mount agar isi tidak hilang saat pindah tab */}
      <div hidden={tab !== "pdf"}><ToPdf /></div>
      <div hidden={tab !== "md"}><ToMarkdown /></div>
      <div hidden={tab !== "edit"}><PdfEditor active={tab === "edit"} /></div>
    </main>
  );
}

