import { useCallback, useEffect, useMemo, useState } from 'react';
import { canEncode } from '../../core/image/encode.ts';
import { directoryOf } from '../../core/image/plan.ts';
import { useImageBatch } from '../../hooks/useImageBatch.ts';
import { useI18n } from '../../i18n/index.tsx';
import { probeCapabilities } from '../capabilities.ts';
import { DropZone } from '../DropZone.tsx';
import { formatSize } from '../format.ts';
import { fixSettings, IMAGE_DEFAULTS, toJob } from '../image-settings.ts';
import type { ImageSettings } from '../image-settings.ts';
import { useStored } from '../persist.ts';
import { useFileSink, useShell } from '../shell.tsx';
import { acceptsFile } from '../tools.ts';
import type { ImageToolId, Tool, ToolActivity } from '../tools.ts';
import { triggerDownload, zipBlobs } from '../zip.ts';
import { CompareDialog } from './CompareDialog.tsx';
import { ImageOptions } from './ImageOptions.tsx';
import { ImageRow } from './ImageRow.tsx';

const ZIP_NAMES: Record<ImageToolId, string> = {
  'compress-images': 'compressed-images.zip',
  'convert-images': 'converted-images.zip',
  'resize-images': 'resized-images.zip',
};

/** 手机浏览器（尤其 iOS）单张画布约 1600 万像素就分配不出来 */
const MAX_PIXELS_DESKTOP = 50_000_000;
const MAX_PIXELS_MOBILE = 16_000_000;

/** 桌面端同时处理几张：核数的一半，最多 3 张（PNG 减色是纯计算，几乎按核数线性变快）；手机一张一张来 */
const desktopLanes = (): number =>
  Math.min(3, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)));

interface ImageToolProps {
  readonly tool: Tool & { readonly id: ImageToolId };
  readonly active: boolean;
  readonly onActivity: (id: ImageToolId, activity: ToolActivity) => void;
}

/**
 * 图片压缩 / 格式转换 / 改尺寸：同一个组件，按工具换设置。
 * 拖进来就在 Worker 里一张张处理（useImageBatch）；改了设置，已有结果作废并按新设置重做。
 */
export function ImageTool({ tool, active, onActivity }: ImageToolProps) {
  const { t, tn } = useI18n();
  const { toast } = useShell();
  const fix = useMemo(() => fixSettings(tool.id), [tool.id]);
  const [settings, setSettings] = useStored<ImageSettings>(
    `local-pdf.${tool.id}`,
    IMAGE_DEFAULTS[tool.id],
    { fix },
  );
  const [webp, setWebp] = useState(true);
  const [zipping, setZipping] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const caps = useMemo(() => probeCapabilities(), []);
  const job = useMemo(() => toJob(settings, tool.id), [settings, tool.id]);
  const batch = useImageBatch({
    prefix: `img-${tool.id}`,
    job,
    maxPixels: caps.mobile ? MAX_PIXELS_MOBILE : MAX_PIXELS_DESKTOP,
    lanes: caps.mobile ? 1 : desktopLanes(),
  });
  const { items, finished, busy, pending, settled } = batch;

  useEffect(() => {
    let alive = true;
    void canEncode('webp').then((ok) => {
      if (alive) setWebp(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = (change: Partial<ImageSettings>): void => {
    const keys = Object.keys(change) as (keyof ImageSettings)[];
    if (keys.every((key) => settings[key] === change[key])) return;
    setSettings({ ...settings, ...change });
  };

  const { add } = batch;
  const addFiles = useCallback(
    (files: readonly File[]): boolean => {
      const images = files.filter((file) => acceptsFile(tool, file));
      const rejected = files.length - images.length;
      if (rejected > 0) toast(tn('drop.unsupported', rejected));
      add(images);
      return files.length > 0;
    },
    [add, tn, toast, tool],
  );
  useFileSink(active, addFiles);

  const remove = (id: string): void => {
    batch.remove(id);
    if (compareId === id) setCompareId(null);
  };

  const clear = (): void => {
    batch.clear();
    setCompareId(null);
  };

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
    onActivity(tool.id, { count: items.length, busy });
  }, [busy, items.length, onActivity, tool.id]);

  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  const before = finished.reduce((sum, item) => sum + item.file.size, 0);
  const after = finished.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0);
  const compareItem = items.find((item) => item.id === compareId);

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
            {/* 只有一个「清空」：和标题放一行，说明另起一行，手机上不用单独占一整行 */}
            <div className="composer__head composer__head--inline">
              <h2>
                {tn('img.count', items.length)} · {formatSize(totalSize)}
              </h2>
              <button className="btn btn--ghost" type="button" onClick={clear}>
                {t('compose.clear')}
              </button>
              <p className="composer__hint">{t('img.listHint')}</p>
            </div>
            <ul className="imglist">
              {items.map((item) => (
                <ImageRow
                  key={item.id}
                  item={item}
                  tool={tool.id}
                  busy={busy}
                  onCompare={setCompareId}
                  onRemove={remove}
                  onRetry={batch.retry}
                  onMeasured={(id, width, height) =>
                    batch.patch(id, (current) => ({ ...current, width, height }))
                  }
                  onUnpreviewable={(id) =>
                    batch.patch(id, (current) => ({ ...current, previewable: false }))
                  }
                />
              ))}
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

      <ImageOptions tool={tool.id} settings={settings} onChange={update} webp={webp} />

      {items.length > 0 && (
        <div className="panel__bar panel__bar--solo imgbar">
          {busy && (
            <div className="imgbar__progress" aria-hidden="true">
              <div
                className="imgbar__fill"
                style={{ width: `${Math.round((settled / items.length) * 100)}%` }}
              />
            </div>
          )}
          <p className="imgbar__summary" role="status" aria-live="polite">
            {busy ? (
              t('img.processing', { done: settled, total: items.length })
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
              <button className="btn btn--ghost" type="button" onClick={batch.stop}>
                {t('img.stop')}
              </button>
            ) : (
              pending > 0 && (
                <button className="btn btn--primary" type="button" onClick={batch.resume}>
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
