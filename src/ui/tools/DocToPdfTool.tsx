import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CjkFont } from '../../core/pdfgen/fonts.ts';
import type { DocMargin } from '../../core/pdfgen/markdown.ts';
import { DEFAULT_DOC_OPTIONS } from '../../hooks/useToPdfQueue.ts';
import type { DocPdfOptions, DocSource, useToPdfQueue } from '../../hooks/useToPdfQueue.ts';
import { useI18n } from '../../i18n/index.tsx';
import type { Locale, MessageKey } from '../../i18n/index.tsx';
import { DocJobCard } from '../DocJobCard.tsx';
import { CJK_CHOICES, DocOptionsPanel } from '../DocOptionsPanel.tsx';
import { DropZone } from '../DropZone.tsx';
import { PanelMore } from '../PanelMore.tsx';
import { useStored } from '../persist.ts';
import { useFileSink, useShell } from '../shell.tsx';
import { acceptsFile, isImageFile, isMarkdownFile } from '../tools.ts';
import type { Tool } from '../tools.ts';
import { downloadAsZip } from '../zip.ts';

type Queue = ReturnType<typeof useToPdfQueue>;

export type CjkChoice = CjkFont | 'auto';

/** 界面是英文时按简体中文的字形集处理，英文文档里偶尔夹的汉字多半是简体 */
export function cjkForLocale(locale: Locale): CjkFont {
  return locale === 'en' ? 'zh-CN' : locale;
}

const oneOf = <T extends string | number>(list: readonly T[], value: T, fallback: T): T =>
  list.includes(value) ? value : fallback;

function fixDocOptions(o: DocPdfOptions): DocPdfOptions {
  return {
    ...o,
    pageSize: oneOf<'a4' | 'letter'>(['a4', 'letter'], o.pageSize, DEFAULT_DOC_OPTIONS.pageSize),
    margin: oneOf<DocMargin>(['narrow', 'normal', 'wide'], o.margin, DEFAULT_DOC_OPTIONS.margin),
    fontSize: oneOf([10, 11, 12], o.fontSize, DEFAULT_DOC_OPTIONS.fontSize),
  };
}

interface DocToPdfToolProps {
  readonly tool: Tool;
  readonly source: DocSource;
  readonly active: boolean;
  /** Word 页和 Markdown 页共用一条主线程队列 */
  readonly queue: Queue;
}

/** Word / Markdown → PDF：拖入文件即转，纸张和字体在"更多选项"里，改过的会记住 */
export function DocToPdfTool({ tool, source, active, queue }: DocToPdfToolProps) {
  const { t, tn, locale } = useI18n();
  const { toast } = useShell();
  const [options, setOptions] = useStored<DocPdfOptions>('local-pdf.topdf', DEFAULT_DOC_OPTIONS, {
    omit: ['cjk'],
    fix: fixDocOptions,
  });
  const [cjkStored, setCjkStored] = useStored<{ readonly choice: CjkChoice }>(
    'local-pdf.topdf.cjk',
    { choice: 'auto' },
    { fix: (v) => ({ choice: oneOf<CjkChoice>(CJK_CHOICES, v.choice, 'auto') }) },
  );
  const cjkChoice = cjkStored.choice;
  const setCjkChoice = useCallback((choice: CjkChoice) => setCjkStored({ choice }), [setCjkStored]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [zipping, setZipping] = useState(false);
  /** Markdown 引用的图片：先拖进来的图片记着，转 .md 时按文件名配上 */
  const [assets, setAssets] = useState<Map<string, Blob>>(() => new Map());
  /** 内联编辑器的状态放在这里，"填入示例"从拖放区也能打开它 */
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState('');

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

  const convertDraft = useCallback(
    (text: string) => {
      if (text.trim() === '') return;
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
    },
    [assets, effective, queue, source, t],
  );

  const fillSample = useCallback(() => {
    setDraft(t('topdf.editor.sampleText'));
    setEditorOpen(true);
  }, [t]);

  const finished = jobs.filter((job) => job.status === 'done');
  const busy = jobs.some((job) => job.status === 'running' || job.status === 'queued');
  const downloadAll = async (): Promise<void> => {
    if (zipping) return;
    const entries = finished.flatMap((job) =>
      job.result === undefined ? [] : [{ name: job.result.fileName, blob: job.result.blob }],
    );
    if (entries.length === 0) return;
    setZipping(true);
    try {
      await downloadAsZip(entries, `${tool.id}.zip`);
    } catch {
      toast(t('queue.zipFailed'));
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel__body">
        {jobs.length === 0 ? (
          <DropZone
            onFiles={handleFiles}
            onSample={source === 'markdown' ? fillSample : undefined}
            kind={source}
            accept={tool.accept}
          />
        ) : (
          <>
            <div className="queue__head">
              <h2>{t('queue.title', { count: jobs.length })}</h2>
              <div className="queue__actions">
                {finished.length > 1 && (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    disabled={zipping}
                    onClick={() => void downloadAll()}
                  >
                    {zipping
                      ? t('queue.zipping')
                      : t('queue.downloadAll', { count: finished.length })}
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
          open={editorOpen}
          draft={draft}
          onOpen={() => setEditorOpen(true)}
          onDraft={setDraft}
          onSample={fillSample}
          onConvert={() => convertDraft(draft)}
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

interface MarkdownEditorProps {
  readonly open: boolean;
  readonly draft: string;
  readonly onOpen: () => void;
  readonly onDraft: (text: string) => void;
  readonly onSample: () => void;
  readonly onConvert: () => void;
}

/** 不想拖文件的话，直接在这里贴 Markdown；转完文本留着，改两笔还能再转。Ctrl+Enter 也能转 */
function MarkdownEditor({
  open,
  draft,
  onOpen,
  onDraft,
  onSample,
  onConvert,
}: MarkdownEditorProps) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 从"填入示例"打开时把光标放进去，用户马上能改
  useEffect(() => {
    if (open) textareaRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) {
    return (
      <div className="editor">
        <button type="button" className="link editor__toggle" onClick={onOpen}>
          {t('topdf.editor.toggle')}
        </button>
      </div>
    );
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim() !== '') {
      e.preventDefault();
      onConvert();
    }
  };
  return (
    <div className="editor">
      <textarea
        ref={textareaRef}
        value={draft}
        placeholder={t('topdf.editor.placeholder')}
        aria-label={t('topdf.editor.toggle')}
        rows={10}
        spellCheck={false}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="editor__actions">
        {draft.trim() === '' && (
          <button type="button" className="link editor__sample" onClick={onSample}>
            {t('topdf.editor.sample')}
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          disabled={draft === ''}
          onClick={() => onDraft('')}
        >
          {t('topdf.editor.clear')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={draft.trim() === ''}
          title={`${t('topdf.editor.convert')} (Ctrl+Enter)`}
          onClick={onConvert}
        >
          {t('topdf.editor.convert')}
        </button>
      </div>
    </div>
  );
}
