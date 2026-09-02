import { useCallback, useMemo, useState } from 'react';
import type { CjkFont } from '../../core/pdfgen/fonts.ts';
import { DEFAULT_DOC_OPTIONS } from '../../hooks/useToPdfQueue.ts';
import type { DocPdfOptions, DocSource, useToPdfQueue } from '../../hooks/useToPdfQueue.ts';
import { useI18n } from '../../i18n/index.tsx';
import type { Locale, MessageKey } from '../../i18n/index.tsx';
import { DocJobCard } from '../DocJobCard.tsx';
import { DocOptionsPanel } from '../DocOptionsPanel.tsx';
import { DropZone } from '../DropZone.tsx';
import { PanelMore } from '../PanelMore.tsx';
import { useFileSink, useShell } from '../shell.tsx';
import { acceptsFile, isImageFile, isMarkdownFile } from '../tools.ts';
import type { Tool } from '../tools.ts';

type Queue = ReturnType<typeof useToPdfQueue>;

export type CjkChoice = CjkFont | 'auto';

/** 界面是英文时按简体中文的字形集处理，英文文档里偶尔夹的汉字多半是简体 */
export function cjkForLocale(locale: Locale): CjkFont {
  return locale === 'en' ? 'zh-CN' : locale;
}

interface DocToPdfToolProps {
  readonly tool: Tool;
  readonly source: DocSource;
  readonly active: boolean;
  /** Word 页和 Markdown 页共用一条主线程队列 */
  readonly queue: Queue;
}

/** Word / Markdown → PDF：拖入文件即转，纸张和字体在"更多选项"里 */
export function DocToPdfTool({ tool, source, active, queue }: DocToPdfToolProps) {
  const { t, tn, locale } = useI18n();
  const { toast } = useShell();
  const [options, setOptions] = useState<DocPdfOptions>(DEFAULT_DOC_OPTIONS);
  const [cjkChoice, setCjkChoice] = useState<CjkChoice>('auto');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /** Markdown 引用的图片：先拖进来的图片记着，转 .md 时按文件名配上 */
  const [assets, setAssets] = useState<Map<string, Blob>>(() => new Map());

  const jobs = useMemo(
    () => queue.jobs.filter((job) => job.source === source),
    [queue.jobs, source],
  );
  const effective = useCallback(
    (): DocPdfOptions => ({
      ...options,
      cjk: cjkChoice === 'auto' ? cjkForLocale(locale) : cjkChoice,
    }),
    [cjkChoice, locale, options],
  );
  const settingsChanged =
    cjkChoice !== 'auto' ||
    JSON.stringify({ ...options, cjk: DEFAULT_DOC_OPTIONS.cjk }) !==
      JSON.stringify(DEFAULT_DOC_OPTIONS);

  const handleFiles = useCallback(
    (files: readonly File[], text?: string): boolean => {
      if (files.length === 0) {
        if (source !== 'markdown' || text === undefined || text.trim() === '') return false;
        const file = new File([text], `${t('topdf.pastedName')}.md`, { type: 'text/markdown' });
        queue.enqueue(source, [file], assets, effective());
        return true;
      }
      let docs: File[];
      let nextAssets = assets;
      if (source === 'markdown') {
        docs = files.filter(isMarkdownFile);
        const images = files.filter((f) => !isMarkdownFile(f) && isImageFile(f));
        if (images.length > 0) {
          nextAssets = new Map(assets);
          for (const image of images) nextAssets.set(image.name, image);
          setAssets(nextAssets);
          if (docs.length === 0) toast(tn('topdf.assetsAdded', images.length));
        }
        const rejected = files.length - docs.length - images.length;
        if (rejected > 0) toast(tn('drop.unsupported', rejected));
      } else {
        docs = files.filter((f) => acceptsFile(tool, f));
        const rejected = files.length - docs.length;
        if (rejected > 0) toast(tn('drop.unsupported', rejected));
      }
      if (docs.length > 0) queue.enqueue(source, docs, nextAssets, effective());
      return true;
    },
    [assets, effective, queue, source, t, tn, tool, toast],
  );
  useFileSink(active, handleFiles);

  const finished = jobs.filter((job) => job.status === 'done');
  const busy = jobs.some((job) => job.status === 'running' || job.status === 'queued');
  const downloadAll = (): void => {
    for (const job of finished) {
      if (job.result === undefined) continue;
      const link = document.createElement('a');
      link.href = job.result.url;
      link.download = job.result.fileName;
      document.body.append(link);
      link.click();
      link.remove();
    }
  };

  return (
    <div className="panel">
      <div className="panel__body">
        {jobs.length === 0 ? (
          <DropZone onFiles={handleFiles} kind={source} accept={tool.accept} />
        ) : (
          <>
            <div className="queue__head">
              <h2>{t('queue.title', { count: jobs.length })}</h2>
              <div className="queue__actions">
                {finished.length > 1 && (
                  <button className="btn btn--ghost" type="button" onClick={downloadAll}>
                    {t('queue.downloadAll', { count: finished.length })}
                  </button>
                )}
                {!busy && (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => queue.clearFinished(source)}
                  >
                    {t('queue.clear')}
                  </button>
                )}
              </div>
            </div>
            <div className="queue__list">
              {jobs.map((job) => (
                <DocJobCard
                  key={job.id}
                  job={job}
                  onCancel={queue.cancel}
                  onRetry={(id) => queue.retry(id, effective())}
                  onRemove={queue.remove}
                />
              ))}
            </div>
            <DropZone onFiles={handleFiles} compact kind={source} accept={tool.accept} />
          </>
        )}
      </div>

      {source === 'markdown' && (
        <MarkdownEditor
          onConvert={(text) => {
            // 文件名取第一个标题；没有就叫"粘贴的 Markdown"
            const heading = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/m.exec(text)?.[1]?.trim();
            const name = (heading === undefined || heading === '' ? t('topdf.pastedName') : heading)
              .replace(/[\\/:*?"<>|]/g, '_')
              .slice(0, 60);
            queue.enqueue(
              source,
              [new File([text], `${name}.md`, { type: 'text/markdown' })],
              assets,
              effective(),
            );
          }}
        />
      )}

      <div className="panel__bar panel__bar--solo">
        <p className="panel__lead">{t(`tool.${tool.id}.hint` as MessageKey)}</p>
        <PanelMore
          open={advancedOpen}
          changed={settingsChanged}
          onToggle={() => setAdvancedOpen((v) => !v)}
        />
      </div>

      {advancedOpen && (
        <DocOptionsPanel
          source={source}
          options={options}
          onChange={setOptions}
          cjk={cjkChoice}
          onCjkChange={setCjkChoice}
        />
      )}
    </div>
  );
}

/** 不想拖文件的话，直接在这里贴 Markdown；转完文本留着，改两笔还能再转 */
function MarkdownEditor({ onConvert }: { readonly onConvert: (text: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  if (!open) {
    return (
      <div className="editor">
        <button type="button" className="link editor__toggle" onClick={() => setOpen(true)}>
          {t('topdf.editor.toggle')}
        </button>
      </div>
    );
  }
  return (
    <div className="editor">
      <textarea
        value={draft}
        placeholder={t('topdf.editor.placeholder')}
        aria-label={t('topdf.editor.toggle')}
        rows={10}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="editor__actions">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={draft === ''}
          onClick={() => setDraft('')}
        >
          {t('topdf.editor.clear')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={draft.trim() === ''}
          onClick={() => onConvert(draft)}
        >
          {t('topdf.editor.convert')}
        </button>
      </div>
    </div>
  );
}
