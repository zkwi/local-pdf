import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImageNote, ProcessResult } from '../../core/image/compress.ts';
import { decodeWithImage } from '../../core/image/dom-decode.ts';
import { canEncode } from '../../core/image/encode.ts';
import { directoryOf, limitPlan, outputName, planResize } from '../../core/image/plan.ts';
import type {
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
import type { ImageFailure } from '../../worker/image-protocol.ts';
import { probeCapabilities } from '../capabilities.ts';
import { DropZone } from '../DropZone.tsx';
import { relativePathOf } from '../files.ts';
import { formatSize } from '../format.ts';
import { ImageJobError, processInWorker } from '../image-client.ts';
import { Segmented } from '../OptionsPanel.tsx';
import { PanelMore } from '../PanelMore.tsx';
import { useStored } from '../persist.ts';
import { useFileSink, useShell } from '../shell.tsx';
import { acceptsFile } from '../tools.ts';
import type { ImageToolId, Tool, ToolActivity } from '../tools.ts';
import { triggerDownload, zipBlobs } from '../zip.ts';
import { CompareDialog } from './CompareDialog.tsx';

/**
 * 三个工具各自只露出一项核心设置，「更多选项」里也只有一项，其余固定成合理的默认：
 * - 压缩：画质（高清 / 标准 / 小体积 / 指定大小）；更多选项里改输出格式；
 * - 转换：转成 JPG / PNG / WebP，选 JPG 时顺带给透明部分选个底色；更多选项里改画质；
 * - 改尺寸：长边 / 宽 / 高 / 百分比 / 精确尺寸；更多选项里写 DPI。
 * 设置项少，用户不用琢磨；需要组合时先压缩、再转换即可。
 */
interface ImageSettings {
  readonly quality: QualityPreset;
  /** 压缩时选了「指定大小」 */
  readonly target: boolean;
  /** KB */
  readonly targetKb: number;
  readonly output: OutputChoice;
  /** 转成 JPG 时透明部分填的颜色 */
  readonly color: string;
  readonly resize: Exclude<ResizeMode, 'none'>;
  readonly size: number;
  readonly percent: number;
  readonly exactWidth: number;
  readonly exactHeight: number;
  readonly fit: ExactFit;
  readonly dpi: number;
}

const BASE: ImageSettings = {
  quality: 'standard',
  target: false,
  targetKb: 500,
  output: 'keep',
  color: '#ffffff',
  resize: 'long',
  size: 1920,
  percent: 50,
  exactWidth: 1080,
  exactHeight: 1080,
  fit: 'cover',
  dpi: 0,
};

const IMAGE_DEFAULTS: Record<ImageToolId, ImageSettings> = {
  'compress-images': BASE,
  'convert-images': { ...BASE, output: 'jpeg', quality: 'high' },
  'resize-images': BASE,
};

/** 用户不能改的部分：不缩放、不填色、不写 DPI、画质按高清 */
const FIXED: ImageJobOptions = {
  output: 'keep',
  quality: 'high',
  targetBytes: 0,
  resize: 'none',
  size: 1920,
  percent: 100,
  exactWidth: 1080,
  exactHeight: 1080,
  fit: 'cover',
  background: 'keep',
  color: '#ffffff',
  dpi: 0,
  keepUnchanged: true,
};

/**
 * 只取这个工具露出来的设置，别的一律用固定值：以前版本存下的其他设置不会悄悄生效。
 * 压缩总要重新编码试一试；转换和改尺寸遇到本来就符合的图原样保留，不白白损失画质。
 */
function toJob(s: ImageSettings, tool: ImageToolId): ImageJobOptions {
  switch (tool) {
    case 'compress-images':
      return {
        ...FIXED,
        output: s.output,
        quality: s.quality,
        targetBytes: s.target ? Math.round(s.targetKb * 1024) : 0,
        keepUnchanged: false,
      };
    case 'convert-images':
      return { ...FIXED, output: s.output, quality: s.quality, color: s.color };
    case 'resize-images':
      return {
        ...FIXED,
        resize: s.resize,
        size: s.size,
        percent: s.percent,
        exactWidth: s.exactWidth,
        exactHeight: s.exactHeight,
        fit: s.fit,
        dpi: s.dpi,
      };
  }
}

/** 「更多选项」里那一项改过没有：改过就亮点，打开页面时直接展开 */
function moreChanged(s: ImageSettings, tool: ImageToolId): boolean {
  const d = IMAGE_DEFAULTS[tool];
  if (tool === 'compress-images') return s.output !== d.output;
  if (tool === 'convert-images') return s.quality !== d.quality;
  return s.dpi !== d.dpi;
}

const COMPRESS_OUTPUTS: readonly OutputChoice[] = ['keep', 'jpeg', 'png', 'webp'];
const CONVERT_OUTPUTS: readonly OutputChoice[] = ['jpeg', 'png', 'webp'];
const QUALITIES: readonly QualityPreset[] = ['high', 'standard', 'small'];
/** 压缩的画质档位多一个「指定大小」 */
type CompressLevel = QualityPreset | 'target';
const LEVELS: readonly CompressLevel[] = ['high', 'standard', 'small', 'target'];
const RESIZES: readonly ImageSettings['resize'][] = ['long', 'width', 'height', 'percent', 'exact'];
const FITS: readonly ExactFit[] = ['cover', 'contain'];
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

/** 加图或改设置后稍等一下再开始：连着拖几批、连着点几下设置时只处理一遍 */
const AUTO_START_MS = 300;

const oneOf = <T,>(list: readonly T[], value: T, fallback: T): T =>
  list.includes(value) ? value : fallback;
const clamp = (value: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

function fixSettings(tool: ImageToolId) {
  const d = IMAGE_DEFAULTS[tool];
  const outputs = tool === 'convert-images' ? CONVERT_OUTPUTS : COMPRESS_OUTPUTS;
  return (o: ImageSettings): ImageSettings => ({
    quality: oneOf(QUALITIES, o.quality, d.quality),
    target: o.target === true,
    targetKb: clamp(o.targetKb, 10, 102_400, d.targetKb),
    output: oneOf(outputs, o.output, d.output),
    color: /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : d.color,
    resize: oneOf(RESIZES, o.resize, d.resize),
    size: clamp(o.size, 16, 16384, d.size),
    percent: clamp(o.percent, 1, 100, d.percent),
    exactWidth: clamp(o.exactWidth, 1, 16384, d.exactWidth),
    exactHeight: clamp(o.exactHeight, 1, 16384, d.exactHeight),
    fit: oneOf(FITS, o.fit, d.fit),
    dpi: oneOf([0, 72, 96, 150, 300], o.dpi, d.dpi),
  });
}

type Status = 'ready' | 'processing' | 'done' | 'kept' | 'skipped' | 'failed';

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

/** 失败了值得再试一次的：内存不够、Worker 崩了、编码失败、没见过的错误；读不了的格式重试也没用 */
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
 * 图片压缩 / 格式转换 / 改尺寸：同一个组件，按工具换设置。
 * 拖进来就在 Worker 里一张张处理；改了设置，已有结果作废并按新设置重做。
 */
export function ImageTool({ tool, active, onActivity }: ImageToolProps) {
  const { t, tn } = useI18n();
  const { toast } = useShell();
  const defaults = IMAGE_DEFAULTS[tool.id];
  const fix = useMemo(() => fixSettings(tool.id), [tool.id]);
  const [settings, setSettings] = useStored<ImageSettings>(`local-pdf.${tool.id}`, defaults, {
    fix,
  });
  const [moreOpen, setMoreOpen] = useState(() => moreChanged(settings, tool.id));
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [running, setRunning] = useState(false);
  /** 用户点了「停止」：不再自动开始，直到加图、改设置或点「继续」 */
  const [paused, setPaused] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [webp, setWebp] = useState(true);
  const controller = useRef<AbortController | null>(null);
  /** 设置每改一次加一：上一轮还没写回的结果作废 */
  const generation = useRef(0);
  const sniffing = useRef<Promise<void>>(Promise.resolve());
  const caps = useMemo(() => probeCapabilities(), []);
  const maxPixels = caps.mobile ? MAX_PIXELS_MOBILE : MAX_PIXELS_DESKTOP;
  const moreId = `${tool.id}-more`;

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

  /** 设置改了：正在跑的这一轮作废，已有结果放回待处理（读不了的格式不用重来） */
  const invalidate = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    setItems((prev) =>
      prev.map((item) => {
        if (item.status === 'ready' || item.status === 'skipped') return item;
        if (item.status === 'failed' && !retryable(item.error)) return item;
        if (item.result !== undefined) URL.revokeObjectURL(item.result.url);
        return { ...item, status: 'ready', result: undefined, error: undefined, detail: undefined };
      }),
    );
  }, []);

  const update = (change: Partial<ImageSettings>): void => {
    const keys = Object.keys(change) as (keyof ImageSettings)[];
    if (keys.every((key) => settings[key] === change[key])) return;
    const next = { ...settings, ...change };
    // 只有真正影响结果的改动才重做（比如没选「指定大小」时改了 KB 数值就不用）
    if (JSON.stringify(toJob(next, tool.id)) !== JSON.stringify(toJob(settings, tool.id))) {
      invalidate();
      setPaused(false);
    }
    setSettings(next);
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
      setPaused(false);
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
    generation.current++;
    controller.current?.abort();
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.url);
      if (item.result !== undefined) URL.revokeObjectURL(item.result.url);
    }
    setItems([]);
    setCompareId(null);
    setPaused(false);
  };

  /** 处理一张：SVG 先在主线程按最终尺寸画成 PNG；Worker 解不了的再用 <img> 兜底一次 */
  const processOne = useCallback(
    async (item: Item, job: ImageJobOptions, signal: AbortSignal): Promise<ProcessResult> => {
      if (isSvg(item)) {
        const intrinsic = svgIntrinsicSize(await item.file.text());
        const plan = limitPlan(planResize(intrinsic, job, true), maxPixels);
        const canvas = await renderSvg(item.file, plan, intrinsic, signal);
        const png = await canvas.convertToBlob({ type: 'image/png' });
        canvas.width = 0;
        canvas.height = 0;
        return processInWorker(
          { file: png, options: job, maxPixels, rasterized: { format: 'svg', sized: true } },
          signal,
        );
      }
      try {
        return await processInWorker({ file: item.file, options: job, maxPixels }, signal);
      } catch (error) {
        // Worker 解不了、但 <img> 也许能显示（Safari 的 HEIC、TIFF）：主线程画成 PNG 再试一次
        if (!(error instanceof ImageJobError && error.code === 'decode')) throw error;
        const png = await decodeWithImage(item.file, maxPixels, signal).catch(() => {
          throw error;
        });
        return processInWorker(
          {
            file: png,
            options: job,
            maxPixels,
            rasterized: { format: item.header?.format ?? 'unknown', sized: false },
          },
          signal,
        );
      }
    },
    [maxPixels],
  );

  const run = useCallback(async (): Promise<void> => {
    if (controller.current !== null) return;
    const abort = new AbortController();
    controller.current = abort;
    const gen = generation.current;
    const job = toJob(settings, tool.id);
    /** 列表快照要等下一次渲染才更新，处理过的记下来，免得同一张取两遍 */
    const seen = new Set<string>();
    setRunning(true);
    try {
      for (;;) {
        if (abort.signal.aborted || gen !== generation.current) break;
        // 处理途中新拖进来的图也会在这一轮里接着处理
        const item = itemsRef.current.find((each) => each.status === 'ready' && !seen.has(each.id));
        if (item === undefined) break;
        seen.add(item.id);
        patch(item.id, (current) => ({ ...current, status: 'processing' }));
        try {
          const result = await processOne(item, job, abort.signal);
          if (gen !== generation.current) break;
          patch(item.id, (current) => ({
            ...current,
            status: result.kept ? 'kept' : 'done',
            width: current.width ?? result.sourceWidth,
            height: current.height ?? result.sourceHeight,
            result: {
              blob: result.blob,
              url: URL.createObjectURL(result.blob),
              name: outputName(item.file.name, result.format),
              format: result.format,
              width: result.width,
              height: result.height,
              kept: result.kept,
              notes: result.notes,
            },
          }));
        } catch (error) {
          if (abort.signal.aborted || gen !== generation.current) {
            // 用户点了停止：这张放回待处理；改设置引起的中断，invalidate 已经处理过
            if (gen === generation.current) {
              patch(item.id, (current) => ({ ...current, status: 'ready' }));
            }
            break;
          }
          const code: ImageFailure =
            error instanceof ImageJobError ? error.code : isSvg(item) ? 'decode' : 'unknown';
          patch(item.id, (current) => ({
            ...current,
            status: code === 'animated' ? 'skipped' : 'failed',
            error: code,
            detail: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    } finally {
      if (controller.current === abort) controller.current = null;
      setRunning(false);
    }
  }, [patch, processOne, settings, tool.id]);

  // 有待处理的图就自动开始：拖进来、改了设置、点了「继续」都走这里
  const pending = items.filter((item) => item.status === 'ready').length;
  useEffect(() => {
    if (paused || running || pending === 0) return;
    const timer = setTimeout(() => void run(), AUTO_START_MS);
    return () => clearTimeout(timer);
  }, [paused, pending, run, running]);

  const stop = (): void => {
    setPaused(true);
    controller.current?.abort();
  };

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const retry = (id: string): void => {
    patch(id, (current) => ({ ...current, status: 'ready', error: undefined, detail: undefined }));
    setPaused(false);
  };

  const finished = items.filter((item) => item.result !== undefined);
  const settled = items.filter((item) => item.status !== 'ready' && item.status !== 'processing');
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

  const busy = running || (pending > 0 && !paused);
  useEffect(() => {
    onActivity(tool.id, { count: items.length, busy });
  }, [busy, items.length, onActivity, tool.id]);

  const changed =
    JSON.stringify(toJob(settings, tool.id)) !== JSON.stringify(toJob(defaults, tool.id));
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

  const statusText = (item: Item): string => {
    switch (item.status) {
      case 'ready':
        return t(busy ? 'img.status.queued' : 'img.status.ready');
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

  // ---------- 设置 ----------

  const outputs = (tool.id === 'convert-images' ? CONVERT_OUTPUTS : COMPRESS_OUTPUTS).filter(
    (v) => webp || v !== 'webp',
  );
  const shownOutput = !webp && settings.output === 'webp' ? outputs[0] : settings.output;

  const mainControls = (() => {
    switch (tool.id) {
      case 'compress-images': {
        const level: CompressLevel = settings.target ? 'target' : settings.quality;
        return (
          <>
            <span className="imgopts__label" id={`${tool.id}-main`}>
              {t('img.quality.label')}
            </span>
            <Segmented
              compact
              values={LEVELS}
              value={level}
              label={(v) => t(v === 'target' ? 'img.quality.custom' : `img.quality.${v}`)}
              hint={(v) => t(v === 'target' ? 'img.quality.target' : `img.quality.${v}.hint`)}
              onChange={(v) =>
                v === 'target' ? update({ target: true }) : update({ quality: v, target: false })
              }
            />
            {settings.target && (
              <span className="unit-input">
                <NumberField
                  min={10}
                  max={102_400}
                  value={settings.targetKb}
                  label={t('img.target.value')}
                  onCommit={(v) => update({ targetKb: v })}
                />
                <span>KB</span>
              </span>
            )}
          </>
        );
      }
      case 'convert-images':
        return (
          <>
            <span className="imgopts__label">{t('img.convert.label')}</span>
            <Segmented
              compact
              values={outputs}
              value={shownOutput}
              label={(v) => t(`img.output.${v}` as MessageKey)}
              hint={(v) => t(`img.output.${v}.hint` as MessageKey)}
              onChange={(v) => update({ output: v })}
            />
            {shownOutput === 'jpeg' && (
              <label className="swatch-field">
                <span>{t('img.fill.label')}</span>
                <span className="swatch">
                  <input
                    type="color"
                    value={settings.color}
                    onChange={(e) => update({ color: e.target.value })}
                  />
                </span>
              </label>
            )}
          </>
        );
      case 'resize-images':
        return (
          <>
            <span className="imgopts__label">{t('img.resize.label')}</span>
            <select
              value={settings.resize}
              aria-label={t('img.resize.label')}
              onChange={(e) => update({ resize: e.target.value as ImageSettings['resize'] })}
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
                  onCommit={(v) => update({ size: v })}
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
                  onCommit={(v) => update({ percent: v })}
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
                    onCommit={(v) => update({ exactWidth: v })}
                  />
                  <span>×</span>
                  <NumberField
                    min={1}
                    max={16384}
                    value={settings.exactHeight}
                    label={t('img.resize.exactHeight')}
                    onCommit={(v) => update({ exactHeight: v })}
                  />
                  <span>px</span>
                </span>
                <Segmented
                  compact
                  values={FITS}
                  value={settings.fit}
                  label={(v) => t(`img.fit.${v}` as MessageKey)}
                  hint={(v) => t(`img.fit.${v}.hint` as MessageKey)}
                  onChange={(v) => update({ fit: v })}
                />
              </>
            )}
          </>
        );
    }
  })();

  const moreControls = (() => {
    switch (tool.id) {
      case 'compress-images':
        return (
          <label className="field__row">
            <span>{t('img.output.label')}</span>
            <Segmented
              compact
              values={outputs}
              value={shownOutput}
              label={(v) => t(`img.output.${v}` as MessageKey)}
              hint={(v) => t(`img.output.${v}.hint` as MessageKey)}
              onChange={(v) => update({ output: v })}
            />
          </label>
        );
      case 'convert-images':
        return (
          <label className="field__row">
            <span>{t('img.quality.label')}</span>
            <Segmented
              compact
              values={QUALITIES}
              value={settings.quality}
              label={(v) => t(`img.quality.${v}`)}
              hint={(v) => t(`img.quality.${v}.hint`)}
              onChange={(v) => update({ quality: v })}
            />
          </label>
        );
      case 'resize-images':
        return (
          <label className="field__row">
            <span>{t('img.dpi.label')}</span>
            <Segmented
              compact
              values={DPIS}
              value={String(settings.dpi) as DpiValue}
              label={(v) => (v === '0' ? t('img.dpi.none') : v)}
              hint={() => t('img.dpi.hint')}
              onChange={(v) => update({ dpi: Number(v) })}
            />
          </label>
        );
    }
  })();

  const moreHint = (() => {
    switch (tool.id) {
      case 'compress-images':
        return t(`img.output.${shownOutput}.hint` as MessageKey);
      case 'convert-images':
        return t(`img.quality.${settings.quality}.hint`);
      case 'resize-images':
        return t('img.dpi.hint');
    }
  })();

  const mainHint = (() => {
    switch (tool.id) {
      case 'compress-images':
        return settings.target
          ? t('img.quality.target')
          : t(`img.quality.${settings.quality}.hint`);
      case 'convert-images':
        return t(`img.output.${shownOutput}.hint` as MessageKey);
      case 'resize-images':
        return settings.resize === 'exact'
          ? t(`img.fit.${settings.fit}.hint` as MessageKey)
          : t(`img.resize.${settings.resize}.hint` as MessageKey);
    }
  })();

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
                <button className="btn btn--ghost" type="button" onClick={clear}>
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
                  // 只有「调整尺寸」能放大 SVG，别的工具里指个路
                  if (tool.id !== 'resize-images') parts.splice(1, 0, t('img.note.svgResize'));
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
                const comparable = result !== undefined && !result.kept && item.previewable;
                return (
                  <li key={item.id} className={`imgrow imgrow--${item.status}`}>
                    <button
                      type="button"
                      className="imgrow__thumb"
                      disabled={!comparable}
                      onClick={() => setCompareId(item.id)}
                      aria-label={t('img.compare.open', { name: item.file.name })}
                      title={
                        comparable ? t('img.compare.open', { name: item.file.name }) : undefined
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
                        {comparable && (
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
                        {item.status === 'failed' && retryable(item.error) && (
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

      <div className="panel__bar imgopts" role="group" aria-label={t('img.settings')}>
        <div className="imgopts__main">{mainControls}</div>
        <PanelMore
          open={moreOpen}
          changed={moreChanged(settings, tool.id)}
          controls={moreId}
          onToggle={() => setMoreOpen((v) => !v)}
        />
      </div>
      <p className="panel__hint">
        {mainHint}
        {changed && !moreOpen && (
          <>
            {' '}
            <button type="button" className="link" onClick={() => update(defaults)}>
              {t('advanced.reset')}
            </button>
          </>
        )}
      </p>
      {moreOpen && (
        <div className="advanced imgopts__more" id={moreId}>
          {moreControls}
          <p className="field__hint">
            {moreHint}
            {changed && (
              <>
                {' '}
                <button type="button" className="link" onClick={() => update(defaults)}>
                  {t('advanced.reset')}
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="panel__bar panel__bar--solo imgbar">
          {busy && (
            <div className="imgbar__progress" aria-hidden="true">
              <div
                className="imgbar__fill"
                style={{ width: `${Math.round((settled.length / items.length) * 100)}%` }}
              />
            </div>
          )}
          <p className="imgbar__summary" role="status" aria-live="polite">
            {busy ? (
              t('img.processing', { done: settled.length, total: items.length })
            ) : finished.length > 0 ? (
              <>
                {t('img.summary.done', {
                  count: finished.length,
                  before: formatSize(before),
                  after: formatSize(after),
                })}
                {before > 0 && (
                  <b className={after <= before ? 'saving' : 'saving saving--worse'}>
                    {' '}
                    {after <= before
                      ? t('img.saved', { percent: Math.round((1 - after / before) * 100) })
                      : t('img.grew', { percent: Math.round((after / before - 1) * 100) })}
                  </b>
                )}
              </>
            ) : (
              tn('img.count', items.length)
            )}
          </p>
          <div className="imgbar__actions">
            {busy ? (
              <button className="btn btn--ghost" type="button" onClick={stop}>
                {t('img.stop')}
              </button>
            ) : (
              pending > 0 && (
                <button className="btn btn--primary" type="button" onClick={() => setPaused(false)}>
                  {tn('img.startMore', pending)}
                </button>
              )
            )}
            {finished.length > 0 && (
              <button
                className={`btn ${busy || pending > 0 ? 'btn--ghost' : 'btn--primary'}`}
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
          </div>
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
