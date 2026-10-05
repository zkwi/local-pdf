import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImageNote } from '../../core/image/compress.ts';
import { decodeWithImage } from '../../core/image/dom-decode.ts';
import { canEncode } from '../../core/image/encode.ts';
import { directoryOf, limitPlan, outputName, planResize } from '../../core/image/plan.ts';
import type {
  BackgroundMode,
  EncodeFormat,
  ExactFit,
  ImageJobOptions,
  OutputChoice,
  QualityPreset,
  ResizeMode,
} from '../../core/image/plan.ts';
import { displaySize, sniffImage } from '../../core/image/sniff.ts';
import type { ImageHeader, SourceFormat } from '../../core/image/sniff.ts';
import { renderSvg, svgIntrinsicSize } from '../../core/image/svg.ts';
import { useI18n } from '../../i18n/index.tsx';
import type { MessageKey } from '../../i18n/index.tsx';
import { probeCapabilities } from '../capabilities.ts';
import { DropZone } from '../DropZone.tsx';
import { relativePathOf } from '../files.ts';
import { formatSize } from '../format.ts';
import { ImageJobError, processInWorker } from '../image-client.ts';
import type { ImageFailure } from '../../worker/image-protocol.ts';
import { Segmented } from '../OptionsPanel.tsx';
import { PanelMore } from '../PanelMore.tsx';
import { useStored } from '../persist.ts';
import { useFileSink, useShell } from '../shell.tsx';
import { acceptsFile } from '../tools.ts';
import type { ImageToolId, Tool, ToolActivity } from '../tools.ts';
import { triggerDownload, zipBlobs } from '../zip.ts';
import { CompareDialog } from './CompareDialog.tsx';

/** 界面上的设置：目标大小拆成开关 + 数值，关掉时数值还记着 */
interface ImageSettings extends Omit<ImageJobOptions, 'targetBytes' | 'keepUnchanged'> {
  readonly target: boolean;
  /** KB */
  readonly targetKb: number;
}

const BASE: ImageSettings = {
  output: 'keep',
  quality: 'standard',
  target: false,
  targetKb: 500,
  resize: 'none',
  size: 1920,
  percent: 50,
  exactWidth: 1080,
  exactHeight: 1080,
  fit: 'cover',
  background: 'keep',
  color: '#ffffff',
  dpi: 0,
};

/** 三个工具的默认设置：压缩保持格式、转换默认出 JPG、改尺寸默认限制长边 */
const IMAGE_DEFAULTS: Record<ImageToolId, ImageSettings> = {
  'compress-images': BASE,
  'convert-images': { ...BASE, output: 'jpeg', quality: 'high' },
  'resize-images': { ...BASE, quality: 'high', resize: 'long' },
};

type Row = 'output' | 'quality' | 'target' | 'resize' | 'background' | 'dpi';

/**
 * 每个工具直接露出最相关的三项，其余收进「更多选项」：压缩先看画质和大小，转换先看格式和透明，改尺寸先看尺寸。
 */
const ROWS: Record<ImageToolId, { readonly main: readonly Row[]; readonly more: readonly Row[] }> =
  {
    'compress-images': {
      main: ['quality', 'target', 'output'],
      more: ['resize', 'background', 'dpi'],
    },
    'convert-images': {
      main: ['output', 'quality', 'background'],
      more: ['resize', 'target', 'dpi'],
    },
    'resize-images': {
      main: ['resize', 'output', 'quality'],
      more: ['background', 'dpi', 'target'],
    },
  };

/** 这一行的设置和默认值不同（目标大小没勾选时数值改了不算） */
function rowChanged(row: Row, settings: ImageSettings, defaults: ImageSettings): boolean {
  if (row === 'target') {
    return (
      settings.target !== defaults.target ||
      (settings.target && settings.targetKb !== defaults.targetKb)
    );
  }
  return ROW_KEYS[row].some((key) => settings[key] !== defaults[key]);
}

/** 这几项属于哪个设置行，用来判断收起的设置有没有改过 */
const ROW_KEYS: Record<Row, readonly (keyof ImageSettings)[]> = {
  output: ['output'],
  quality: ['quality'],
  target: ['target', 'targetKb'],
  resize: ['resize', 'size', 'percent', 'exactWidth', 'exactHeight', 'fit'],
  background: ['background', 'color'],
  dpi: ['dpi'],
};

const OUTPUTS: readonly OutputChoice[] = ['keep', 'jpeg', 'png', 'webp'];
const QUALITIES: readonly QualityPreset[] = ['high', 'standard', 'small'];
const RESIZES: readonly ResizeMode[] = ['none', 'long', 'width', 'height', 'percent', 'exact'];
const FITS: readonly ExactFit[] = ['cover', 'contain'];
const BACKGROUNDS: readonly BackgroundMode[] = ['keep', 'fill'];
const DPIS = ['0', '72', '96', '150', '300'] as const;
type DpiValue = (typeof DPIS)[number];
const SIZE_PRESETS = [1280, 1920, 2560, 3840];

const FORMAT_LABEL: Record<SourceFormat | EncodeFormat, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  bmp: 'BMP',
  avif: 'AVIF',
  heic: 'HEIC',
  tiff: 'TIFF',
  ico: 'ICO',
  svg: 'SVG',
  unknown: '?',
};

const ZIP_NAMES: Record<ImageToolId, string> = {
  'compress-images': 'compressed-images.zip',
  'convert-images': 'converted-images.zip',
  'resize-images': 'resized-images.zip',
};

/** 手机浏览器（尤其 iOS）单张画布约 1600 万像素就分配不出来 */
const MAX_PIXELS_DESKTOP = 50_000_000;
const MAX_PIXELS_MOBILE = 16_000_000;

const oneOf = <T,>(list: readonly T[], value: T, fallback: T): T =>
  list.includes(value) ? value : fallback;
const clamp = (value: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

function fixSettings(defaults: ImageSettings) {
  return (o: ImageSettings): ImageSettings => ({
    output: oneOf(OUTPUTS, o.output, defaults.output),
    quality: oneOf(QUALITIES, o.quality, defaults.quality),
    target: o.target,
    targetKb: clamp(o.targetKb, 10, 102_400, defaults.targetKb),
    resize: oneOf(RESIZES, o.resize, defaults.resize),
    size: clamp(o.size, 16, 16384, defaults.size),
    percent: clamp(o.percent, 1, 100, defaults.percent),
    exactWidth: clamp(o.exactWidth, 1, 16384, defaults.exactWidth),
    exactHeight: clamp(o.exactHeight, 1, 16384, defaults.exactHeight),
    fit: oneOf(FITS, o.fit, defaults.fit),
    background: oneOf(BACKGROUNDS, o.background, defaults.background),
    color: /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : defaults.color,
    dpi: oneOf([0, 72, 96, 150, 300], o.dpi, defaults.dpi),
  });
}

/** 压缩总要重新编码试一试；转换和改尺寸遇到不用改的图原样保留，不白白损失画质 */
function toJob(s: ImageSettings, tool: ImageToolId): ImageJobOptions {
  const { target, targetKb, ...rest } = s;
  return {
    ...rest,
    targetBytes: target ? Math.round(targetKb * 1024) : 0,
    keepUnchanged: tool !== 'compress-images',
  };
}

type Status = 'ready' | 'queued' | 'processing' | 'done' | 'kept' | 'skipped' | 'failed';

interface ItemResult {
  readonly blob: Blob;
  readonly url: string;
  readonly name: string;
  readonly format: EncodeFormat;
  readonly width: number;
  readonly height: number;
  readonly kept: boolean;
  readonly notes: readonly ImageNote[];
}

interface Item {
  readonly id: string;
  readonly file: File;
  /** 文件夹里的相对路径，单独选的文件为空串 */
  readonly path: string;
  readonly url: string;
  readonly header: ImageHeader | null;
  /** 浏览器能不能直接显示（缩略图和对比用） */
  readonly previewable: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly status: Status;
  readonly result?: ItemResult;
  readonly error?: ImageFailure;
  readonly detail?: string;
}

let seq = 0;

const isSvg = (item: Item): boolean =>
  item.header?.format === 'svg' || item.file.type === 'image/svg+xml';

/** 失败了值得再试一次的：内存不够、Worker 崩了、没见过的错误 */
const retryable = (error: ImageFailure | undefined): boolean =>
  error === 'memory' || error === 'crashed' || error === 'unknown' || error === 'encode';

/**
 * 数字输入：边输入边生效，但只接受范围内的值；离开输入框或按回车时再把越界的值收回范围。
 * 直接在 onChange 里夹取的话，想输 200 时敲下的「2」会立刻被改成下限 10。
 */
function NumberField({
  value,
  min,
  max,
  label,
  list,
  onCommit,
}: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly label: string;
  readonly list?: string;
  readonly onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const finish = (): void => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onCommit(clamp(n, min, max, value));
    setDraft(null);
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      list={list}
      aria-label={label}
      value={draft ?? String(value)}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text);
        if (text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) {
          onCommit(Math.round(n));
        }
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

interface ImageToolProps {
  readonly tool: Tool & { readonly id: ImageToolId };
  readonly active: boolean;
  readonly onActivity: (id: ImageToolId, activity: ToolActivity) => void;
}

/**
 * 图片压缩 / 格式转换 / 改尺寸：同一个组件，按工具换默认设置和设置项顺序。
 * 图片按添加顺序列出，点「开始」后在 Worker 里一张张处理；改了设置旧结果作废。
 */
export function ImageTool({ tool, active, onActivity }: ImageToolProps) {
  const { t, tn } = useI18n();
  const { toast } = useShell();
  const defaults = IMAGE_DEFAULTS[tool.id];
  const fix = useMemo(() => fixSettings(defaults), [defaults]);
  const [settings, setSettings] = useStored<ImageSettings>(`local-pdf.${tool.id}`, defaults, {
    fix,
  });
  // 上次改过收起的那几项，打开页面时直接展开，免得设置藏着不知道
  const [moreOpen, setMoreOpen] = useState(() =>
    ROWS[tool.id].more.some((row) => rowChanged(row, settings, defaults)),
  );
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [zipping, setZipping] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [webp, setWebp] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const sniffing = useRef<Promise<void>>(Promise.resolve());
  const caps = useMemo(() => probeCapabilities(), []);
  const maxPixels = caps.mobile ? MAX_PIXELS_MOBILE : MAX_PIXELS_DESKTOP;

  useEffect(() => {
    let alive = true;
    void canEncode('webp').then((ok) => {
      if (alive) setWebp(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const patch = useCallback((id: string, fn: (item: Item) => Item) => {
    setItems((prev) => prev.map((item) => (item.id === id ? fn(item) : item)));
  }, []);

  /** 设置改了：已有结果全部作废，回到待处理 */
  const invalidate = useCallback(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.status === 'skipped' || item.status === 'ready') return item;
        if (item.result !== undefined) URL.revokeObjectURL(item.result.url);
        return { ...item, status: 'ready', result: undefined, error: undefined, detail: undefined };
      }),
    );
  }, []);

  const set = <K extends keyof ImageSettings>(key: K, value: ImageSettings[K]): void => {
    if (settings[key] === value) return;
    invalidate();
    setSettings((o) => ({ ...o, [key]: value }));
  };

  const addFiles = useCallback(
    (files: readonly File[]): boolean => {
      const images = files.filter((file) => acceptsFile(tool, file));
      const rejected = files.length - images.length;
      if (rejected > 0) toast(tn('drop.unsupported', rejected));
      if (images.length === 0) return files.length > 0;
      const created: Item[] = images.map((file) => ({
        id: `img-${tool.id}-${seq++}`,
        file,
        path: relativePathOf(file),
        url: URL.createObjectURL(file),
        header: null,
        previewable: true,
        status: 'ready',
      }));
      setItems((prev) => [...prev, ...created]);
      // 只读文件头：格式、尺寸、是不是动图，列表里先显示出来。
      // 一张接一张读，几百张一起拖进来时不会同时占几百 MB 内存
      for (const item of created) {
        sniffing.current = sniffing.current.then(async () => {
          try {
            const buffer = await item.file.slice(0, 512 * 1024).arrayBuffer();
            const header = sniffImage(new Uint8Array(buffer));
            const shown = displaySize(header);
            patch(item.id, (current) => ({
              ...current,
              header,
              width: current.width ?? shown?.width,
              height: current.height ?? shown?.height,
              ...(header.animated && current.status === 'ready'
                ? { status: 'skipped' as const, error: 'animated' as const }
                : {}),
            }));
          } catch {
            /* 读不了的文件交给处理时再报错 */
          }
        });
      }
      return true;
    },
    [patch, tn, toast, tool],
  );
  useFileSink(active, addFiles);

  const remove = (id: string): void => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target !== undefined) {
        URL.revokeObjectURL(target.url);
        if (target.result !== undefined) URL.revokeObjectURL(target.result.url);
      }
      return prev.filter((item) => item.id !== id);
    });
    if (compareId === id) setCompareId(null);
  };

  const clear = (): void => {
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.url);
      if (item.result !== undefined) URL.revokeObjectURL(item.result.url);
    }
    setItems([]);
    setCompareId(null);
  };

  const start = useCallback(async (): Promise<void> => {
    if (controller.current !== null) return;
    const ids = itemsRef.current.filter((item) => item.status === 'ready').map((item) => item.id);
    if (ids.length === 0) return;
    const abort = new AbortController();
    controller.current = abort;
    const job = toJob(settings, tool.id);
    setRunning(true);
    setItems((prev) =>
      prev.map((item) => (ids.includes(item.id) ? { ...item, status: 'queued' } : item)),
    );
    setProgress({ done: 0, total: ids.length });
    let done = 0;
    for (const id of ids) {
      if (abort.signal.aborted) break;
      // 处理途中被移除的、读文件头后发现是动图的，跳过（第一张时列表快照里还是「待处理」，不能按「等待中」判断）
      const item = itemsRef.current.find((each) => each.id === id);
      if (item === undefined || item.status === 'skipped') {
        done++;
        setProgress({ done, total: ids.length });
        continue;
      }
      patch(id, (current) => ({ ...current, status: 'processing' }));
      try {
        let file: Blob = item.file;
        let rasterized: { format: SourceFormat; sized: boolean } | undefined;
        if (isSvg(item)) {
          // SVG 在主线程按最终尺寸画成 PNG，再交给 Worker 做格式、压缩这些
          const intrinsic = svgIntrinsicSize(await item.file.text());
          const plan = limitPlan(planResize(intrinsic, job, true), maxPixels);
          const canvas = await renderSvg(item.file, plan, intrinsic, abort.signal);
          file = await canvas.convertToBlob({ type: 'image/png' });
          canvas.width = 0;
          canvas.height = 0;
          rasterized = { format: 'svg', sized: true };
        }
        let result;
        try {
          result = await processInWorker(
            { file, options: job, maxPixels, rasterized },
            abort.signal,
          );
        } catch (error) {
          // Worker 解不了、但 <img> 也许能显示（Safari 的 HEIC、TIFF）：主线程画成 PNG 再试一次
          if (!(error instanceof ImageJobError && error.code === 'decode') || rasterized) {
            throw error;
          }
          const png = await decodeWithImage(item.file, maxPixels, abort.signal).catch(() => {
            throw error;
          });
          result = await processInWorker(
            {
              file: png,
              options: job,
              maxPixels,
              rasterized: { format: item.header?.format ?? 'unknown', sized: false },
            },
            abort.signal,
          );
        }
        const name = outputName(item.file.name, result.format);
        patch(id, (current) => ({
          ...current,
          status: result.kept ? 'kept' : 'done',
          width: current.width ?? result.sourceWidth,
          height: current.height ?? result.sourceHeight,
          result: {
            blob: result.blob,
            url: URL.createObjectURL(result.blob),
            name,
            format: result.format,
            width: result.width,
            height: result.height,
            kept: result.kept,
            notes: result.notes,
          },
        }));
      } catch (error) {
        if (abort.signal.aborted) {
          patch(id, (current) => ({ ...current, status: 'ready' }));
          break;
        }
        const code: ImageFailure =
          error instanceof ImageJobError ? error.code : isSvg(item) ? 'decode' : 'unknown';
        patch(id, (current) => ({
          ...current,
          status: code === 'animated' ? 'skipped' : 'failed',
          error: code,
          detail: error instanceof Error ? error.message : String(error),
        }));
      }
      done++;
      setProgress({ done, total: ids.length });
    }
    // 取消后还没轮到的放回待处理
    setItems((prev) =>
      prev.map((item) => (item.status === 'queued' ? { ...item, status: 'ready' } : item)),
    );
    controller.current = null;
    setRunning(false);
    setProgress(null);
  }, [maxPixels, patch, settings, tool.id]);

  const cancel = (): void => controller.current?.abort();

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const retry = (id: string): void => {
    patch(id, (current) => ({ ...current, status: 'ready', error: undefined, detail: undefined }));
  };

  const finished = items.filter((item) => item.result !== undefined);
  const pending = items.filter((item) => item.status === 'ready').length;
  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  const before = finished.reduce((sum, item) => sum + item.file.size, 0);
  const after = finished.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0);

  const downloadAll = async (): Promise<void> => {
    if (zipping || finished.length === 0) return;
    if (finished.length === 1) {
      const only = finished[0].result;
      if (only !== undefined) triggerDownload(only.url, only.name);
      return;
    }
    setZipping(true);
    try {
      const blob = await zipBlobs(
        finished.map((item) => ({
          name: directoryOf(item.path) + (item.result?.name ?? item.file.name),
          blob: item.result?.blob ?? item.file,
        })),
      );
      const url = URL.createObjectURL(blob);
      triggerDownload(url, ZIP_NAMES[tool.id]);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast(t('queue.zipFailed'));
    } finally {
      setZipping(false);
    }
  };

  useEffect(() => {
    onActivity(tool.id, { count: items.length, busy: running });
  }, [items.length, onActivity, running, tool.id]);

  const changed = JSON.stringify(settings) !== JSON.stringify(defaults);
  const compareItem = items.find((item) => item.id === compareId);

  const noteText = (note: ImageNote): string => {
    const p = note.params ?? {};
    switch (note.code) {
      case 'format-changed':
        return t('img.note.format', { format: FORMAT_LABEL[p.format as EncodeFormat] ?? '' });
      case 'alpha-filled':
        return t('img.note.alpha');
      case 'limited':
        return t('img.note.limited', { width: p.width, height: p.height });
      case 'target-shrunk':
        return t('img.note.shrunk', { width: p.width, height: p.height });
      case 'target-missed':
        return t('img.note.missed', { size: formatSize(Number(p.size)) });
      case 'dpi-ignored':
        return t('img.note.dpi');
      case 'palette':
        return t('img.note.palette', { colors: p.colors });
      case 'unchanged':
        return t('img.note.unchanged');
      case 'within-target':
        return t('img.note.withinTarget', { size: formatSize(Number(p.size)) });
      case 'not-smaller':
        return t('img.note.notSmaller');
    }
  };

  const errorText = (item: Item): string => {
    switch (item.error) {
      case 'animated':
        return t('img.error.animated');
      case 'decode':
      case 'svg':
        return item.header?.format === 'heic'
          ? t('img.error.heic')
          : t('img.error.decode', {
              format: FORMAT_LABEL[item.header?.format ?? 'unknown'],
            });
      case 'memory':
      case 'crashed':
        return t('img.error.memory');
      case 'encode':
        return t('img.error.encode');
      default:
        return t('img.error.unknown', { detail: item.detail ?? '' });
    }
  };

  const rows = ROWS[tool.id];
  const moreChanged = rows.more.some((row) => rowChanged(row, settings, defaults));
  const targetOn = settings.target;
  const qualityHint = targetOn
    ? t('img.quality.target')
    : t(`img.quality.${settings.quality}.hint` as MessageKey);

  const renderRow = (row: Row) => {
    switch (row) {
      case 'output':
        return (
          <div className="field__row" key={row}>
            <span>{t('img.output.label')}</span>
            <Segmented
              compact
              values={webp ? OUTPUTS : OUTPUTS.filter((v) => v !== 'webp')}
              value={!webp && settings.output === 'webp' ? 'keep' : settings.output}
              label={(v) => t(`img.output.${v}` as MessageKey)}
              hint={(v) => t(`img.output.${v}.hint` as MessageKey)}
              onChange={(v) => set('output', v)}
            />
          </div>
        );
      case 'quality':
        return (
          <div className={`field__row${targetOn ? ' field__row--muted' : ''}`} key={row}>
            <span>{t('img.quality.label')}</span>
            <Segmented
              compact
              values={QUALITIES}
              value={settings.quality}
              label={(v) => t(`img.quality.${v}` as MessageKey)}
              hint={(v) => t(`img.quality.${v}.hint` as MessageKey)}
              onChange={(v) => {
                set('quality', v);
                if (targetOn) set('target', false);
              }}
            />
          </div>
        );
      case 'target':
        return (
          <div className="field__row" key={row}>
            <span>{t('img.target.label')}</span>
            <label className="check">
              <input
                type="checkbox"
                checked={targetOn}
                onChange={(e) => set('target', e.target.checked)}
              />
              <span>{t('img.target.toggle')}</span>
            </label>
            <span className="unit-input">
              <NumberField
                min={10}
                max={102_400}
                value={settings.targetKb}
                label={t('img.target.value')}
                onCommit={(v) => {
                  set('targetKb', v);
                  if (!targetOn) set('target', true);
                }}
              />
              <span>KB</span>
            </span>
          </div>
        );
      case 'resize':
        return (
          <div
            className={`field__row${settings.resize === 'exact' ? ' field__row--wide' : ''}`}
            key={row}
          >
            <span>{t('img.resize.label')}</span>
            <select
              value={settings.resize}
              aria-label={t('img.resize.label')}
              onChange={(e) => set('resize', e.target.value as ResizeMode)}
            >
              {RESIZES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`img.resize.${mode}` as MessageKey)}
                </option>
              ))}
            </select>
            {(settings.resize === 'long' ||
              settings.resize === 'width' ||
              settings.resize === 'height') && (
              <span className="unit-input">
                <NumberField
                  min={16}
                  max={16384}
                  list={`${tool.id}-sizes`}
                  value={settings.size}
                  label={t(`img.resize.${settings.resize}` as MessageKey)}
                  onCommit={(v) => set('size', v)}
                />
                <span>px</span>
                <datalist id={`${tool.id}-sizes`}>
                  {SIZE_PRESETS.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </span>
            )}
            {settings.resize === 'percent' && (
              <span className="unit-input">
                <NumberField
                  min={1}
                  max={100}
                  value={settings.percent}
                  label={t('img.resize.percent')}
                  onCommit={(v) => set('percent', v)}
                />
                <span>%</span>
              </span>
            )}
            {settings.resize === 'exact' && (
              <>
                <span className="unit-input">
                  <NumberField
                    min={1}
                    max={16384}
                    value={settings.exactWidth}
                    label={t('img.resize.exactWidth')}
                    onCommit={(v) => set('exactWidth', v)}
                  />
                  <span>×</span>
                  <NumberField
                    min={1}
                    max={16384}
                    value={settings.exactHeight}
                    label={t('img.resize.exactHeight')}
                    onCommit={(v) => set('exactHeight', v)}
                  />
                  <span>px</span>
                </span>
                <Segmented
                  compact
                  values={FITS}
                  value={settings.fit}
                  label={(v) => t(`img.fit.${v}` as MessageKey)}
                  hint={(v) => t(`img.fit.${v}.hint` as MessageKey)}
                  onChange={(v) => set('fit', v)}
                />
              </>
            )}
          </div>
        );
      case 'background':
        return (
          <div className="field__row field__row--background" key={row}>
            <span>{t('img.background.label')}</span>
            <Segmented
              compact
              values={BACKGROUNDS}
              value={settings.background}
              label={(v) => t(`img.background.${v}` as MessageKey)}
              hint={(v) => t(`img.background.${v}.hint` as MessageKey)}
              onChange={(v) => set('background', v)}
            />
            <label className="swatch-field">
              <span className="swatch">
                <input
                  type="color"
                  value={settings.color}
                  onChange={(e) => set('color', e.target.value)}
                />
              </span>
              <span>{t('img.background.color')}</span>
            </label>
          </div>
        );
      case 'dpi':
        return (
          <div className="field__row" key={row}>
            <span>{t('img.dpi.label')}</span>
            <Segmented
              compact
              values={DPIS}
              value={String(settings.dpi) as DpiValue}
              label={(v) => (v === '0' ? t('img.dpi.none') : v)}
              hint={() => t('img.dpi.hint')}
              onChange={(v) => set('dpi', Number(v))}
            />
          </div>
        );
    }
  };

  const resizeHint =
    settings.resize === 'exact'
      ? t(`img.fit.${settings.fit}.hint` as MessageKey)
      : t(`img.resize.${settings.resize}.hint` as MessageKey);
  const outputHint = t(
    `img.output.${!webp && settings.output === 'webp' ? 'keep' : settings.output}.hint` as MessageKey,
  );

  const statusText = (item: Item): string => {
    switch (item.status) {
      case 'ready':
        return t('img.status.ready');
      case 'queued':
        return t('img.status.queued');
      case 'processing':
        return t('img.status.processing');
      case 'kept':
        return t('img.status.kept');
      case 'skipped':
        return t('img.status.skipped');
      case 'failed':
        return t('img.status.failed');
      case 'done': {
        if (isSvg(item)) return t('img.status.done');
        const size = item.result?.blob.size ?? 0;
        const change = Math.round((1 - size / Math.max(1, item.file.size)) * 100);
        return change >= 0 ? `−${change}%` : `+${-change}%`;
      }
    }
  };

  return (
    <div className="panel">
      <div className="panel__body">
        {items.length === 0 ? (
          <DropZone
            onFiles={addFiles}
            kind="image-tools"
            accept={tool.accept}
            folder={!caps.mobile}
          />
        ) : (
          <>
            <div className="composer__head">
              <div>
                <h2>
                  {tn('img.count', items.length)} · {formatSize(totalSize)}
                </h2>
                <p className="composer__hint">{t('img.listHint')}</p>
              </div>
              <div className="queue__actions">
                <button className="btn btn--ghost" type="button" onClick={clear} disabled={running}>
                  {t('compose.clear')}
                </button>
              </div>
            </div>
            <ul className="imglist">
              {items.map((item) => {
                const result = item.result;
                const dir = directoryOf(item.path);
                const vector = isSvg(item);
                // 矢量图和位图比体积没有意义，SVG 不显示增减
                const grew =
                  !vector &&
                  result !== undefined &&
                  !result.kept &&
                  result.blob.size > item.file.size;
                // SVG 一定会变成位图格式，「已改存为 PNG」不用再说
                const parts =
                  result?.notes
                    .filter((note) => !(vector && note.code === 'format-changed'))
                    .map(noteText) ?? [];
                if (vector && result !== undefined) {
                  parts.unshift(t('img.note.svg', { width: result.width, height: result.height }));
                }
                if (grew) parts.push(t('img.note.larger'));
                const failed = item.status === 'failed' || item.status === 'skipped';
                const message = failed ? errorText(item) : parts.join(' · ');
                const tone =
                  item.status === 'failed'
                    ? ' imgrow__note--bad'
                    : item.status === 'skipped' || grew
                      ? ' imgrow__note--warn'
                      : '';
                const sourceFormat = item.header?.format;
                return (
                  <li key={item.id} className={`imgrow imgrow--${item.status}`}>
                    <button
                      type="button"
                      className="imgrow__thumb"
                      disabled={result === undefined || result.kept || !item.previewable}
                      onClick={() => setCompareId(item.id)}
                      aria-label={t('img.compare.open', { name: item.file.name })}
                      title={
                        result !== undefined
                          ? t('img.compare.open', { name: item.file.name })
                          : undefined
                      }
                    >
                      {item.previewable ? (
                        <img
                          src={item.url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onLoad={(e) => {
                            const { naturalWidth, naturalHeight } = e.currentTarget;
                            if (item.width === naturalWidth && item.height === naturalHeight)
                              return;
                            patch(item.id, (current) => ({
                              ...current,
                              width: naturalWidth,
                              height: naturalHeight,
                            }));
                          }}
                          onError={() =>
                            patch(item.id, (current) => ({ ...current, previewable: false }))
                          }
                        />
                      ) : (
                        <span className="imgrow__badge">
                          {FORMAT_LABEL[sourceFormat ?? 'unknown']}
                        </span>
                      )}
                    </button>
                    <div className="imgrow__info">
                      <span className="imgrow__name" title={item.path || item.file.name}>
                        {dir !== '' && <span className="imgrow__dir">{dir}</span>}
                        {item.file.name}
                      </span>
                      <span className="imgrow__meta">
                        <span>
                          {[
                            sourceFormat !== undefined && sourceFormat !== 'unknown'
                              ? FORMAT_LABEL[sourceFormat]
                              : null,
                            item.width !== undefined && item.height !== undefined
                              ? `${item.width} × ${item.height}`
                              : null,
                            formatSize(item.file.size),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {result !== undefined && !result.kept && (
                          <>
                            <span className="imgrow__arrow" aria-hidden="true">
                              →
                            </span>
                            <span className="imgrow__out">
                              {FORMAT_LABEL[result.format]} · {result.width} × {result.height} ·{' '}
                              {formatSize(result.blob.size)}
                            </span>
                          </>
                        )}
                      </span>
                      {message !== '' && <span className={`imgrow__note${tone}`}>{message}</span>}
                    </div>
                    <div className="imgrow__side">
                      <span
                        className={`imgrow__status${item.status === 'done' && !grew ? ' imgrow__status--good' : ''}${grew ? ' imgrow__status--warn' : ''}`}
                        role={item.status === 'processing' ? 'status' : undefined}
                      >
                        {item.status === 'processing' && (
                          <span className="spinner" aria-hidden="true" />
                        )}
                        {statusText(item)}
                      </span>
                      <div className="imgrow__actions">
                        {result !== undefined && !result.kept && item.previewable && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() => setCompareId(item.id)}
                          >
                            {t('img.compare')}
                          </button>
                        )}
                        {result !== undefined && (
                          <a
                            className="btn btn--ghost btn--small"
                            href={result.url}
                            download={result.name}
                          >
                            {t('img.download')}
                          </a>
                        )}
                        {item.status === 'failed' && retryable(item.error) && !running && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() => retry(item.id)}
                          >
                            {t('job.retry')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn--icon"
                          disabled={item.status === 'processing'}
                          aria-label={t('img.remove', { name: item.file.name })}
                          title={t('compose.remove')}
                          onClick={() => remove(item.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <DropZone
              onFiles={addFiles}
              compact
              kind="image-tools"
              accept={tool.accept}
              folder={!caps.mobile}
            />
          </>
        )}
      </div>

      <fieldset className="composer__settings imgset" id={`${tool.id}-settings`} disabled={running}>
        <legend className="visually-hidden">{t('img.settings')}</legend>
        {rows.main.map(renderRow)}
        {moreOpen && rows.more.map(renderRow)}
        <div className="imgset__toggle">
          <PanelMore
            open={moreOpen}
            changed={moreChanged}
            controls={`${tool.id}-settings`}
            onToggle={() => setMoreOpen((v) => !v)}
          />
        </div>
        <p className="field__hint composer__settings-hint">
          {[outputHint, qualityHint, resizeHint].join(' ')}
          {changed && (
            <>
              {' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  invalidate();
                  setSettings(defaults);
                }}
              >
                {t('advanced.reset')}
              </button>
            </>
          )}
        </p>
      </fieldset>

      <div className="panel__bar panel__bar--solo imgbar">
        <p className="imgbar__summary" aria-live="polite">
          {finished.length > 0
            ? t('img.summary.done', {
                count: finished.length,
                before: formatSize(before),
                after: formatSize(after),
              })
            : items.length > 0
              ? tn('img.count', items.length)
              : t('img.summary.empty')}
          {finished.length > 0 && before > 0 && (
            <b className={after <= before ? 'saving' : 'saving saving--worse'}>
              {' '}
              {after <= before
                ? t('img.saved', { percent: Math.round((1 - after / before) * 100) })
                : t('img.grew', { percent: Math.round((after / before - 1) * 100) })}
            </b>
          )}
        </p>
        <div className="imgbar__actions">
          {running ? (
            <button className="btn btn--ghost" type="button" onClick={cancel}>
              {t('compose.cancel')}
            </button>
          ) : (
            pending > 0 && (
              <button className="btn btn--primary" type="button" onClick={() => void start()}>
                {finished.length > 0
                  ? tn('img.startMore', pending)
                  : t(`img.start.${tool.id}` as MessageKey)}
              </button>
            )
          )}
          {finished.length > 0 && !running && (
            <button
              className={`btn ${pending > 0 ? 'btn--ghost' : 'btn--primary'}`}
              type="button"
              disabled={zipping}
              onClick={() => void downloadAll()}
            >
              {zipping
                ? t('queue.zipping')
                : finished.length === 1
                  ? t('img.download')
                  : t('img.downloadAll', { count: finished.length })}
            </button>
          )}
          {items.length === 0 && (
            <button className="btn btn--primary" type="button" disabled>
              {t(`img.start.${tool.id}` as MessageKey)}
            </button>
          )}
        </div>
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
            {t('img.processing', {
              done: Math.min(progress.done + 1, progress.total),
              total: progress.total,
            })}
          </span>
        </div>
      )}

      {compareItem?.result !== undefined && (
        <CompareDialog
          name={compareItem.file.name}
          original={{
            url: compareItem.url,
            size: compareItem.file.size,
            width: compareItem.width,
            height: compareItem.height,
            label: t('img.compare.original'),
          }}
          result={{
            url: compareItem.result.url,
            size: compareItem.result.blob.size,
            width: compareItem.result.width,
            height: compareItem.result.height,
            label: t('img.compare.result'),
          }}
          onClose={() => setCompareId(null)}
        />
      )}
    </div>
  );
}
