import { useRef, useState } from "react";

// Hook drag & drop file. Pasang `dropProps` di elemen pembungkus.
export function useFileDrop(onFile) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0); // hitung enter/leave agar tidak berkedip di elemen anak
  const hasFiles = (e) => e.dataTransfer?.types?.includes("Files");

  const dropProps = {
    onDragEnter(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver(e) {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave(e) {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop(e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
  };

  return { dragging, dropProps };
}
