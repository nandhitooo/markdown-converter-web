function MarkdownEditor({
  markdown,
  onChange,
  onCopy,
  onDownload,
  isLoading,
  disabled,
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Markdown output</h2>
        <div className="actions">
          <button
            type="button"
            onClick={onCopy}
            disabled={disabled || isLoading}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={disabled || isLoading}
          >
            Download .md
          </button>
        </div>
      </div>
      <textarea
        value={markdown}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Your converted Markdown will appear here."
      />
    </div>
  );
}

export default MarkdownEditor;
