import { useCallback, useRef, useState } from 'react';

interface DropZoneProps {
  readonly onFiles: (files: File[]) => void;
  readonly disabled?: boolean;
}

function pickPdfs(list: FileList | null): File[] {
  if (list === null) return [];
  return [...list].filter(
    (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name),
  );
}

export function DropZone({ onFiles, disabled = false }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      if (disabled) return;
      const files = pickPdfs(event.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [disabled, onFiles],
  );

  const open = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  return (
    <div
      className={`dropzone${dragging ? ' dropzone--active' : ''}${disabled ? ' dropzone--disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="选择或拖入 PDF 文件"
    >
      <svg className="dropzone__icon" viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M24 32V12m0 0-7 7m7-7 7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 30v4a6 6 0 0 0 6 6h20a6 6 0 0 0 6-6v-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="dropzone__title">把 PDF 拖到这里，或点击选择</p>
      <p className="dropzone__hint">支持多选 · 文件不会离开这台电脑</p>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        // 不阻止冒泡的话，input.click() 会再次触发外层 div 的 onClick，
        // 文件选择器被打开两次，第一个会被第二个顶掉
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const files = pickPdfs(e.target.files);
          if (files.length > 0) onFiles(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
