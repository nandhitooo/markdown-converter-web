import { useState } from "react";
import "./App.css";
import UploadZone from "./components/UploadZone";
import MarkdownEditor from "./components/MarkdownEditor";
import { convertDocumentToMarkdown } from "./utils/documentUtils";

function App() {
  const [markdown, setMarkdown] = useState("");
  const [fileName, setFileName] = useState("No file selected");
  const [status, setStatus] = useState(
    "Upload a .docx or .pdf file to turn it into clean Markdown.",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleFile = async (file) => {
    if (!file) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const convertedMarkdown = await convertDocumentToMarkdown(file);
      setMarkdown(convertedMarkdown);
      setFileName(file.name);
      setStatus(`Converted ${file.name} to Markdown.`);
    } catch (err) {
      setMarkdown("");
      setFileName(file.name);
      setErrorMessage(
        err.message || "Conversion failed. Please try another file.",
      );
      setStatus("Conversion failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!markdown) {
      return;
    }

    try {
      await navigator.clipboard.writeText(markdown);
      setStatus("Markdown copied to your clipboard.");
    } catch {
      setStatus(
        "Copy failed. You can still download the Markdown file instead.",
      );
    }
  };

  const handleDownload = () => {
    if (!markdown) {
      return;
    }

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(fileName || "document").replace(/\.[^.]+$/, "") || "document"}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Markdown downloaded.");
  };

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Markdown converter</p>
          <h1>Turn DOCX and PDF files into clean Markdown.</h1>
          <p className="hero-description">
            Upload a document, extract the text, and export a polished Markdown
            version in seconds.
          </p>
        </div>

        <UploadZone onFileSelected={handleFile} isLoading={isLoading} />
      </section>

      <section className="info-bar">
        <div>
          <strong>Current file</strong>
          <p>{fileName}</p>
        </div>
        <div>
          <strong>Status</strong>
          <p>{isLoading ? "Extracting text…" : status}</p>
        </div>
      </section>

      {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

      <section className="workspace">
        <MarkdownEditor
          markdown={markdown}
          onChange={setMarkdown}
          onCopy={handleCopy}
          onDownload={handleDownload}
          isLoading={isLoading}
          disabled={!markdown}
        />
      </section>
    </main>
  );
}

export default App;
