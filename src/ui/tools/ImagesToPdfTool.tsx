import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { safeBaseName } from '../../core/util/filename.ts';
import { imagesToPdf } from '../../core/pdfgen/images-to-pdf.ts';
import type { ImagesToPdfOptions, Rotation } from '../../core/pdfgen/images-to-pdf.ts';
import type { ImagePageSize, PageMargin, PageOrientation } from '../../core/pdfgen/page-layout.ts';
import type { ImageQuality } from '../../core/pdfgen/raster.ts';
import { useI18n } from '../../i18n/index.tsx';
import type { MessageKey } from '../../i18n/index.tsx';
import { DropZone } from '../DropZone.tsx';
import { formatSize } from '../format.ts';
import { Segmented } from '../OptionsPanel.tsx';
import { useFileSink, useShell } from '../shell.tsx';
import { isImageFile } from '../tools.ts';
import type { Tool } from '../tools.ts';

interface Item {
  readonly id: string;
  readonly file: File;
  readonly url: string;
  readonly rotation: Rotation;
  readonly width?: number;
  readonly height?: number;
}

interface Result {
  readonly url: string;
  readonly fileName: string;
  readonly size: number;
  readonly pages: number;
}

type Options = Omit<ImagesToPdfOptions, 'title'>;

const DEFAULT: Options = { pageSize: 'fit', orientation: 'auto', margin: 'none', quality: 'auto' };
const PAGE_SIZES: readonly ImagePageSize[] = ['fit', 'a4', 'letter'];
const ORIENTATIONS: readonly PageOrientation[] = ['auto', 'portrait', 'landscape'];
const MARGINS: readonly PageMargin[] = ['none', 'small', 'normal'];
const QUALITIES: readonly ImageQuality[] = ['auto', 'lossless', 'compact'];

let seq = 0;

interface ImagesToPdfToolProps {
  readonly tool: Tool;
  readonly active: boolean;
  readonly onBusy: (busy: boolean) => void;
}

/**
 * 图片转 PDF 的合成器：缩略图按添加顺序排开，拖动调顺序、单张旋转，
 * 纸张和质量设置常驻在下面，点一下生成。
 */
export function ImagesToPdfTool({ tool, active, onBusy }: ImagesToPdfToolProps) {
  const { t, tn } = useI18n();
  const { toast } = useShell();
  const [items, setItems] = useState<Item[]>([]);
  const [options, setOptions] = useState<Options>(DEFAULT);
  const [fileName, setFileName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; side: 'before' | 'after' } | null>(null);
  const controller = useRef<AbortController | null>(null);

  /** 结果只对生成时的图片和设置有效，动过就作废 */
  const invalidate = useCallback(() => {
    setResult((prev) => {
      if (prev !== null) URL.revokeObjectURL(prev.url);
      return null;
    });
    setError(null);
  }, []);

  const addFiles = useCallback(
    (files: readonly File[]): boolean => {
      const images = files.filter(isImageFile);
      const rejected = files.length - images.length;
      if (rejected > 0) toast(tn('drop.unsupported', rejected));
      if (images.length > 0) {
        invalidate();
        setItems((prev) => [
          ...prev,
          ...images.map((file) => ({
            id: `img-${seq++}`,
            file,
            url: URL.createObjectURL(file),
            rotation: 0 as Rotation,
          })),
        ]);
        if (!nameTouched)
          setFileName((name) => (name === '' ? safeBaseName(images[0].name) : name));
      }
      return files.length > 0;
    },
    [invalidate, nameTouched, tn, toast],
  );
  useFileSink(active, addFiles);

  const update = useCallback(
    (fn: (prev: Item[]) => Item[]) => {
      invalidate();
      setItems(fn);
    },
    [invalidate],
  );
  const setOption = <K extends keyof Options>(key: K, value: Options[K]): void => {
    invalidate();
    setOptions((o) => ({ ...o, [key]: value }));
  };

  const remove = (id: string): void =>
    update((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target !== undefined) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
  const rotate = (id: string): void =>
    update((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, rotation: ((i.rotation + 90) % 360) as Rotation } : i,
      ),
    );
  const move = (id: string, delta: number): void =>
    update((prev) => {
      const from = prev.findIndex((i) => i.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  const clear = (): void =>
    update((prev) => {
      for (const i of prev) URL.revokeObjectURL(i.url);
      return [];
    });
  const sortByName = (): void =>
    update((prev) =>
      [...prev].sort((a, b) =>
        a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' }),
      ),
    );
  const reverse = (): void => update((prev) => [...prev].reverse());

  const reorder = (draggedId: string, targetId: string, side: 'before' | 'after'): void =>
    update((prev) => {
      if (draggedId === targetId) return prev;
      const without = prev.filter((i) => i.id !== draggedId);
      const dragged = prev.find((i) => i.id === draggedId);
      if (dragged === undefined) return prev;
      const index = without.findIndex((i) => i.id === targetId);
      if (index < 0) return prev;
      without.splice(side === 'before' ? index : index + 1, 0, dragged);
      return without;
    });

  const onDragOver = (e: DragEvent<HTMLLIElement>, id: string): void => {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    if (dropAt === null || dropAt.id !== id || dropAt.side !== side) setDropAt({ id, side });
  };
  const onDrop = (e: DragEvent<HTMLLIElement>, id: string): void => {
    if (dragId === null) return;
    e.preventDefault();
    e.stopPropagation();
    reorder(dragId, id, dropAt?.id === id ? dropAt.side : 'before');
    setDragId(null);
    setDropAt(null);
  };

  const generate = async (): Promise<void> => {
    if (items.length === 0 || progress !== null) return;
    invalidate();
    const abort = new AbortController();
    controller.current = abort;
    setProgress({ done: 0, total: items.length });
    onBusy(true);
    const name = (fileName.trim() || 'images').replace(/\.pdf$/i, '');
    try {
      const out = await imagesToPdf(
        items.map((i) => ({ file: i.file, rotation: i.rotation })),
        { ...options, title: name },
        { signal: abort.signal, onProgress: (done, total) => setProgress({ done, total }) },
      );
      const blob = new Blob([out.bytes as BlobPart], { type: 'application/pdf' });
      setResult({
        url: URL.createObjectURL(blob),
        fileName: `${name}.pdf`,
        size: blob.size,
        pages: out.pages,
      });
    } catch (err) {
      if (!abort.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      controller.current = null;
      setProgress(null);
      onBusy(false);
    }
  };

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const total = useMemo(() => items.reduce((s, i) => s + i.file.size, 0), [items]);

  // 生成完把结果卡滚进视野：缩略图多的时候它在很下面
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result !== null)
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [result]);

  return (
    <div className="panel">
      <div className="panel__body">
        {items.length === 0 ? (
          <DropZone onFiles={addFiles} kind="images" accept={tool.accept} />
        ) : (
          <>
            <div className="composer__head">
              <div>
                <h2>
                  {tn('compose.count', items.length)} · {formatSize(total)}
                </h2>
                <p className="composer__hint">{t('compose.dragHint')}</p>
              </div>
              <div className="queue__actions">
                <button className="btn btn--ghost" type="button" onClick={sortByName}>
                  {t('compose.sortByName')}
                </button>
                <button className="btn btn--ghost" type="button" onClick={reverse}>
                  {t('compose.reverse')}
                </button>
                <button className="btn btn--ghost" type="button" onClick={clear}>
                  {t('compose.clear')}
                </button>
              </div>
            </div>
            <ul className="thumbs" onDragLeave={() => setDropAt(null)}>
              {items.map((item, index) => {
                const cls = [
                  'thumb',
                  dragId === item.id ? 'thumb--dragging' : '',
                  dropAt?.id === item.id ? `thumb--${dropAt.side}` : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <li
                    key={item.id}
                    className={cls}
                    draggable
                    onDragStart={(e) => {
                      setDragId(item.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', item.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropAt(null);
                    }}
                    onDragOver={(e) => onDragOver(e, item.id)}
                    onDrop={(e) => onDrop(e, item.id)}
                  >
                    <div className="thumb__frame">
                      <img
                        src={item.url}
                        alt=""
                        style={{ transform: `rotate(${item.rotation}deg)` }}
                        onLoad={(e) => {
                          const { naturalWidth, naturalHeight } = e.currentTarget;
                          setItems((prev) =>
                            prev.map((i) =>
                              i.id === item.id
                                ? { ...i, width: naturalWidth, height: naturalHeight }
                                : i,
                            ),
                          );
                        }}
                      />
                      <span className="thumb__index">{index + 1}</span>
                    </div>
                    <span className="thumb__name" title={item.file.name}>
                      {item.file.name}
                    </span>
                    <span className="thumb__meta">
                      {item.width !== undefined && item.height !== undefined
                        ? `${item.width} × ${item.height} · `
                        : ''}
                      {formatSize(item.file.size)}
                    </span>
                    <div className="thumb__tools">
                      <button
                        type="button"
                        title={t('compose.moveLeft')}
                        aria-label={t('compose.moveLeft')}
                        disabled={index === 0}
                        onClick={() => move(item.id, -1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        title={t('compose.rotate')}
                        aria-label={t('compose.rotate')}
                        onClick={() => rotate(item.id)}
                      >
                        ⟳
                      </button>
                      <button
                        type="button"
                        title={t('compose.remove')}
                        aria-label={t('compose.remove')}
                        onClick={() => remove(item.id)}
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        title={t('compose.moveRight')}
                        aria-label={t('compose.moveRight')}
                        disabled={index === items.length - 1}
                        onClick={() => move(item.id, 1)}
                      >
                        →
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <DropZone onFiles={addFiles} compact kind="images" accept={tool.accept} />
          </>
        )}
      </div>

      <div className="composer__settings">
        <div className="field__row">
          <span>{t('compose.pageSize')}</span>
          <Segmented
            compact
            values={PAGE_SIZES}
            value={options.pageSize}
            label={(v) => t(`compose.pageSize.${v}` as MessageKey)}
            hint={(v) => t(`compose.pageSize.${v}` as MessageKey)}
            onChange={(v) => setOption('pageSize', v)}
          />
        </div>
        <div className="field__row">
          <span>{t('compose.orientation')}</span>
          <Segmented
            compact
            values={ORIENTATIONS}
            value={options.orientation}
            label={(v) => t(`compose.orientation.${v}` as MessageKey)}
            hint={(v) => t(`compose.orientation.${v}` as MessageKey)}
            onChange={(v) => setOption('orientation', v)}
          />
        </div>
        <div className="field__row">
          <span>{t('compose.margin')}</span>
          <Segmented
            compact
            values={MARGINS}
            value={options.margin}
            label={(v) => t(`compose.margin.${v}` as MessageKey)}
            hint={(v) => t(`compose.margin.${v}` as MessageKey)}
            onChange={(v) => setOption('margin', v)}
          />
        </div>
        <div className="field__row">
          <span>{t('compose.quality')}</span>
          <Segmented
            compact
            values={QUALITIES}
            value={options.quality}
            label={(v) => t(`compose.quality.${v}` as MessageKey)}
            hint={(v) => t(`compose.quality.${v}.hint` as MessageKey)}
            onChange={(v) => setOption('quality', v)}
          />
        </div>
        <p className="field__hint composer__settings-hint">
          {t(`compose.quality.${options.quality}.hint` as MessageKey)}
        </p>
      </div>

      <div className="panel__bar panel__bar--solo composer__bar">
        <label className="composer__name">
          <span>{t('compose.fileName')}</span>
          <input
            type="text"
            value={fileName}
            placeholder="images"
            onChange={(e) => {
              setNameTouched(true);
              setFileName(e.target.value);
              invalidate();
            }}
          />
          <span className="composer__ext">.pdf</span>
        </label>
        {progress === null ? (
          <button
            className="btn btn--primary"
            type="button"
            disabled={items.length === 0}
            onClick={() => void generate()}
          >
            {t('compose.generate')}
          </button>
        ) : (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => controller.current?.abort()}
          >
            {t('compose.cancel')}
          </button>
        )}
      </div>

      {progress !== null && (
        <div className="composer__progress" role="status" aria-live="polite">
          <div className="bar">
            <div
              className="bar__fill"
              style={{
                width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
              }}
            />
          </div>
          <span>
            {t('compose.generating', {
              done: Math.min(progress.done + 1, progress.total),
              total: progress.total,
            })}
          </span>
        </div>
      )}
      {error !== null && (
        <div className="composer__result">
          <p className="composer__error">{t('compose.failed', { detail: error })}</p>
        </div>
      )}
      {result !== null && (
        <div className="composer__result" role="status" ref={resultRef}>
          <p>{t('compose.done', { pages: result.pages, size: formatSize(result.size) })}</p>
          <a className="btn btn--primary" href={result.url} download={result.fileName}>
            {t('compose.download')}
          </a>
        </div>
      )}
    </div>
  );
}
