import type { CSSProperties } from 'react';
import { useI18n } from '../i18n/index.tsx';
import type { MessageKey } from '../i18n/index.tsx';
import { SITE } from '../site.ts';

const FAQ_COUNT = 5;
const STEP_COUNT = 3;
const SITE_URL = 'https://localpdfconverter.com/';

/**
 * 工具下方给搜索引擎和第一次来的访客看的正文：怎么用、为什么本地、常见问题，
 * 外加 schema.org 的 WebApplication + FAQPage 结构化数据（跟随当前语言）。
 * index.html 里有一份英文静态版给不跑 JS 的爬虫，tests/seo.test.ts 保证两边 FAQ 一致。
 */
export function SeoContent() {
  const { t, locale } = useI18n();
  const faq = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: t(`seo.faq.q${i + 1}` as MessageKey),
    a: t(`seo.faq.a${i + 1}` as MessageKey),
  }));
  const steps = Array.from({ length: STEP_COUNT }, (_, i) => t(`seo.how.${i + 1}` as MessageKey));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'Local PDF',
        url: SITE_URL,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript and WebAssembly',
        description: t('meta.description'),
        inLanguage: locale,
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        license: 'https://opensource.org/licenses/MIT',
        softwareVersion: SITE.version,
        sameAs: SITE.repo,
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <div className="content reveal" style={{ '--i': 4 } as CSSProperties}>
      <section className="seo seo--steps">
        <h2>{t('seo.how.title')}</h2>
        <ol className="steps">
          {steps.map((step, i) => (
            <li key={i}>
              <span className="steps__num" aria-hidden="true">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="seo seo--why">
        <h2>{t('seo.why.title')}</h2>
        <p>{t('seo.why.body')}</p>
      </section>

      <section className="seo seo--faq">
        <h2>{t('seo.faq.title')}</h2>
        <div className="faq">
          {faq.map((f, i) => (
            <details key={i} className="faq__item" open={i === 0}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </div>
  );
}
