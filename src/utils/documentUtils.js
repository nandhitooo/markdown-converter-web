import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function convertTextToMarkdown(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  const paragraph = [];
  const listItems = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(paragraph.join(" "));
      paragraph.length = 0;
    }
  };

  const flushList = () => {
    if (listItems.length) {
      blocks.push(listItems.map((item) => `- ${item}`).join("\n"));
      listItems.length = 0;
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push(`${headingMatch[1]} ${headingMatch[2]}`);
      return;
    }

    const listMatch = line.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[2]);
      return;
    }

    if (listItems.length) {
      flushList();
    }

    paragraph.push(line);
  });

  flushParagraph();
  flushList();

  return blocks.join("\n\n");
}

export async function extractPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }

  return pages.join("\n\n");
}

export async function convertDocumentToMarkdown(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (extension === "docx") {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return convertTextToMarkdown(result.value);
  }

  if (extension === "pdf") {
    const text = await extractPdfText(buffer);
    return convertTextToMarkdown(text);
  }

  throw new Error("Please upload a .docx or .pdf file.");
}

