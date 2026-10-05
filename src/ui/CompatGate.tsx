import { useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/index.tsx';
import type { Capabilities } from './capabilities.ts';
import { isSupported } from './capabilities.ts';
import { LanguageSelect } from './LanguageSelect.tsx';
import { Logo } from './Logo.tsx';

const ACK_KEY = 'local-pdf.mobile-ack';

/** 本次会话里是否点过「仍要在手机上试试」 */
export function readMobileAck(): boolean {
  try {
    return sessionStorage.getItem(ACK_KEY) === '1';
  } catch {
    return false;
  }
}

interface CompatGateProps {
  readonly caps: Capabilities;
  /**
   * 从图片工具进来的手机用户不拦：压缩照片正是手机上的常见用途，也用不到 OCR 和大文档解析。
   * 之后切到 PDF 工具时页面上会有一条提示代替整页说明。
   */
  readonly bypassMobile?: boolean;
  readonly children: ReactNode;
}

/**
 * 不满足硬性要求：整页提示，不渲染应用。
 * 手机：先给一页说明，用户点"仍要继续"才放行（本会话记住）。
 */
export function CompatGate({ caps, bypassMobile = false, children }: CompatGateProps) {
  const { t } = useI18n();
  const [ack, setAck] = useState(() => readMobileAck() || bypassMobile);
  const [copied, setCopied] = useState(false);

  if (!isSupported(caps)) {
    return (
      <Interstitial title={t('compat.unsupported.title')}>
        <p>{t('compat.unsupported.body')}</p>
      </Interstitial>
    );
  }

  if (caps.mobile && !ack) {
    const copy = (): void => {
      void navigator.clipboard?.writeText(location.href).then(
        () => setCopied(true),
        () => setCopied(false),
      );
    };
    return (
      <Interstitial title={t('compat.mobile.title')}>
        <p>{t('compat.mobile.body')}</p>
        <p className="interstitial__url">{location.href}</p>
        <div className="interstitial__actions">
          <button className="btn btn--primary" type="button" onClick={copy}>
            {copied ? t('compat.mobile.copied') : t('compat.mobile.copy')}
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem(ACK_KEY, '1');
              } catch {
                /* ignore */
              }
              setAck(true);
            }}
          >
            {t('compat.mobile.continue')}
          </button>
        </div>
      </Interstitial>
    );
  }

  return <>{children}</>;
}

function Interstitial({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="interstitial">
      <div className="interstitial__card">
        <div className="interstitial__top">
          <Logo size={40} />
          <LanguageSelect />
        </div>
        <h1>{title}</h1>
        {children}
        <p className="interstitial__foot">{t('app.tagline')}</p>
      </div>
    </div>
  );
}
