function UploadZone({ onFileSelected, isLoading }) {
  const handleDrop = (event) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      onFileSelected(droppedFile);
    }
  };

  const handleInputChange = (event) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      onFileSelected(selectedFile);
    }
  };

  return (
    <label
      className="dropzone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".docx,.pdf"
        onChange={handleInputChange}
        disabled={isLoading}
      />
      <span className="dropzone-title">Drop a document here</span>
      <span className="dropzone-subtitle">
        or click to browse for a .docx or .pdf file
      </span>
    </label>
  );
}

export default UploadZone;
