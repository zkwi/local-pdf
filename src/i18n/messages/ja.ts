import type { Messages } from './zh-CN.ts';

export const ja: Messages = {
  'app.title': 'Local PDF',
  'app.feature': 'PDF → Word / Markdown',
  'app.tagline': 'PDF は端末から出ません。変換はすべてブラウザ内で行われ、アップロードはしません。',
  'app.badgeLocal': 'ローカル変換',
  'app.badgeLocalTitle': 'アップロード機能はありません。オフラインでも使えます',
  'app.language': '表示言語',
  'app.docTitle': 'Local PDF · ブラウザで PDF → Word / Markdown',

  'drop.title': 'PDF をここにドロップ、またはクリックして選択',
  'drop.hint': '複数ファイル対応 · ファイルはこのパソコンから出ません',

  'drop.choose': 'PDF ファイルを選択',
  'drop.overlay': 'ドロップして変換を開始',
  'drop.rejected.one': 'PDF ではないファイル 1 件を無視しました',
  'drop.rejected.other': 'PDF ではないファイル {count} 件を無視しました',

  'summary.pages.one': '1 ページ',
  'summary.pages.other': '{count} ページ',
  'summary.characters.one': '1 文字',
  'summary.characters.other': '{count} 文字',
  'summary.tables.one': '表 1 件',
  'summary.tables.other': '表 {count} 件',
  'summary.images.one': '画像 1 件',
  'summary.images.other': '画像 {count} 件',
  'summary.ocrPages.one': 'OCR 1 ページ',
  'summary.ocrPages.other': 'OCR {count} ページ',
  'summary.lowConfidence.one': '要確認 1 ページ',
  'summary.lowConfidence.other': '要確認 {count} ページ',
  'app.github': 'GitHub リポジトリ',
  'drop.more': 'PDF を追加：ここにドロップするか、クリックして選択',
  'drop.paste': 'Ctrl+V でファイルを貼り付けることもできます',
  'drop.sample': '手元にファイルがなければサンプル PDF をお試しください',
  'drop.sampleFailed': 'サンプルを読み込めませんでした。しばらくしてからお試しください',
  'footer.source': 'ソースコード',
  'footer.issues': '問題を報告',
  'footer.version': 'バージョン {version}',
  'footer.builtWith': 'pdf.js · docx.js · PaddleOCR.js · remark で構築',

  'output.label': '変換先',
  'output.docx': 'Word',
  'output.markdown': 'Markdown',
  'output.both': '両方',
  'output.docx.hint': '段落・表・画像・ヘッダーとフッターを保持した .docx を作成します。',
  'output.markdown.hint': '.md を作成します。画像がある場合は画像と一緒に zip にまとめます。',
  'output.both.hint': '同じ認識結果から Word と Markdown の両方を作成します。',

  'advanced.toggle': '詳細オプション',
  'advanced.reset': '初期設定に戻す',

  'ocr.label': 'スキャン文書の認識（OCR）',
  'ocr.auto': '自動',
  'ocr.auto.hint': 'テキスト層のないページだけを認識します。通常の PDF には影響しません。',
  'ocr.off': 'オフ',
  'ocr.off.hint': 'スキャンページは認識せず、空白になります。',
  'ocr.force': '全ページ',
  'ocr.force.hint':
    'すべてのページを認識します。かなり遅くなるので、テキスト層が壊れている場合だけ使ってください。',
  'ocr.quality.label': '認識精度',
  'ocr.quality.fast': '標準',
  'ocr.quality.balanced': '高',
  'ocr.quality.fast.hint': '小さいモデル（約 6 MB）。一般的なスキャン文書には十分です。',
  'ocr.quality.balanced.hint': '大きいモデル（約 30 MB）。小さい文字やぼやけたページに強いです。',
  'ocr.language.label': '認識言語',
  'ocr.language.auto': '表示言語に合わせる',
  'ocr.language.zh': '簡体字中国語 + 英語',
  'ocr.language.zh-Hant': '繁体字中国語 + 英語',
  'ocr.language.en': '英語のみ',
  'ocr.language.ja': '日本語 + 英語',
  'ocr.download.hint':
    '初めてスキャン文書を認識するときに認識コンポーネント（約 {size}）をダウンロードします。その後はブラウザに保存され、オフラインでも使えます。ダウンロードのみで、アップロードはしません。',
  'ocr.japaneseNeedsSmall':
    '標準精度は日本語に対応していないため、自動的に高精度に切り替えました。',
  'ocr.cache.status': '保存済みの認識モデル {size}',
  'ocr.cache.clear': '削除',
  'ocr.unavailable':
    'このブラウザはスキャン認識に必要な WebAssembly SIMD に対応していないため、OCR は無効です。通常の PDF は変換できます。',

  'content.label': '内容',
  'content.editable': 'レイアウトを保持',
  'content.editable.hint': '見出し・段落・リスト・表・画像を認識します。',
  'content.plain': 'テキストのみ',
  'content.plain.hint':
    '読み順どおりのプレーンテキストを出力します。複雑なレイアウトでは最も安全です。',

  'layout.label': 'レイアウトの詳細',
  'layout.columns': '段組みを検出',
  'layout.tables': '罫線のある表を検出',
  'layout.images': '画像を保持',
  'layout.headerFooter': 'ヘッダーとフッターを検出',
  'layout.keepHeaderFooter': 'Word のヘッダー / フッターとして書き出す',

  'queue.title': '変換キュー（{count}）',
  'queue.downloadAll': 'すべてダウンロード（{count}）',
  'queue.clear': 'リストを消去',

  'job.cancel': 'キャンセル',
  'job.retry': '再試行',
  'job.remove': '削除',
  'job.download.docx': 'Word をダウンロード',
  'job.download.markdown': 'Markdown をダウンロード',
  'job.download.markdown-bundle': 'Markdown 一式をダウンロード',
  'job.report.show': '変換レポートを表示',
  'job.report.hide': '変換レポートを閉じる',
  'job.password.label': 'この PDF にはパスワードがかかっています',
  'job.password.placeholder': 'パスワードを入力して再試行',
  'job.password.submit': '解除して変換',

  'stage.queued': '待機中',
  'stage.loading': 'PDF を解析',
  'stage.extracting': '内容を読み取り',
  'stage.ocr-model': 'OCR を準備',
  'stage.ocr': '文字を認識',
  'stage.analyzing': 'レイアウト解析',
  'stage.writing': 'ファイル生成',
  'stage.completed': '完了',
  'stage.failed': '失敗',
  'stage.cancelled': 'キャンセル済み',

  'progress.queued': '順番待ちです',
  'progress.loading': 'PDF を解析しています…',
  'progress.extracting': '{page} / {total} ページを読み取り中',
  'progress.ocr-model-download': '認識モデルを準備中 {loaded} / {total}',
  'progress.ocr-model-init': '認識エンジンを初期化しています',
  'progress.ocr-model-ready': '認識エンジンの準備ができました',
  'progress.ocr': '{page} ページはスキャン画像です。文字を認識しています…',
  'progress.analyzing': 'レイアウトを解析しています…',
  'progress.writing-docx': 'Word ファイルを生成しています…',
  'progress.writing-markdown': 'Markdown を生成しています…',
  'progress.completed': '変換が完了しました',
  'progress.failed': '変換に失敗しました',
  'progress.cancelled': 'キャンセルしました',

  'error.cancelled': '変換をキャンセルしました',
  'error.password-required': 'この PDF を開くにはパスワードが必要です',
  'error.password-incorrect': 'パスワードが違います',
  'error.invalid-pdf': '有効な PDF ではないか、ファイルが壊れています',
  'error.unknown': '変換に失敗しました：{detail}',
  'error.read-file': 'ファイルを読み込めませんでした',

  'report.pages': 'ページ数',
  'report.characters': '文字数',
  'report.tables': '表',
  'report.images': '画像',
  'report.ocrPages': 'OCR ページ',
  'report.ocrEngine': 'OCR エンジン',
  'report.duration': '所要時間',
  'report.warnings': '確認をおすすめする注意 {count} 件',
  'report.more': '… 他 {count} 件は省略',
  'report.pageDetails': 'ページ別の詳細',
  'report.col.page': 'ページ',
  'report.col.confidence': '信頼度',
  'report.col.columns': '段',
  'report.col.paragraphs': '段落',
  'report.col.headings': '見出し',
  'report.col.lists': 'リスト',
  'report.col.tables': '表',
  'report.col.images': '画像',
  'report.col.characters': '文字数',

  'warning.encrypted-pdf': 'ファイルは暗号化されています',
  'warning.page-extract-failed': '{page} ページを解析できずスキップしました：{reason}',
  'warning.page-render-failed': '{page} ページを描画できず、画像と OCR が使えません：{reason}',
  'warning.page-render-downscaled':
    '{page} ページが大きすぎるため、描画倍率を {from}× から {to}× に下げました',
  'warning.image-extract-failed': '{page} ページの画像を取り出せませんでした：{reason}',
  'warning.operator-list-failed':
    '{page} ページのベクター情報を読めず、表や画像が欠ける可能性があります：{reason}',
  'warning.low-confidence-reading-order':
    '{page} ページの段組み判定に自信がありません（{columns} 段）。読み順を確認してください',
  'warning.low-confidence-table':
    '{page} ページの表は罫線が不完全です（完成度 {percent}%）。行と列がずれている可能性があります',
  'warning.table-dropped': '{page} ページの表は信頼度が低いため出力しませんでした',
  'warning.ocr-applied': '{page} ページの文字は OCR によるもので、認識誤りを含む可能性があります',
  'warning.ocr-failed': '{page} ページの OCR に失敗しました：{reason}',
  'warning.ocr-skipped': '{page} ページは OCR が必要でしたが描画できずスキップしました',
  'warning.ocr-sparse-kept-image':
    '{page} ページは {count} 文字しか認識できなかったため、図表とみなして画像のまま残しました',
  'warning.ocr-model-unverified':
    'モデル {model} のチェックサムが内蔵の一覧と一致しません（上流で更新された可能性）。そのまま使用しました',
  'warning.markdown-table-html':
    '結合セルを含む表は Markdown で表現できないため、HTML の表として埋め込みました',
  'warning.rotated-text-flattened':
    '{page} ページに回転したテキストが {count} 箇所あり、通常の段落として出力しました',
  'warning.vertical-text-flattened': '{page} ページの縦書きテキストを横書きで出力しました',
  'warning.font-substituted': 'フォント {from} を {to} に置き換えました',
  'warning.page-limit-exceeded':
    '文書は {total} ページありますが、設定により先頭 {limit} ページのみ変換しました',
  'warning.page-size-clamped':
    '{page} ページは Word のページサイズ上限を超えるため（縦長画像）、A4 に流し込みました',
  'warning.no-text-found': '{page} ページから文字を取り出せませんでした',

  'meta.description':
    'Local PDF はブラウザ内で PDF を Word と Markdown に変換します。アップロードなし、無料、オープンソース。スキャン文書は自動 OCR、中国語・英語・日本語ほか多言語対応。',
  'seo.how.title': '使い方は 3 ステップ',
  'seo.how.1': 'PDF をページにドロップするか、Ctrl+V で貼り付けるか、まずサンプルを試します。',
  'seo.how.2':
    'テキスト抽出、レイアウト解析、スキャンページの OCR はすべてブラウザ内で行われ、ファイルはどこにも送信されません。',
  'seo.how.3':
    'Word または Markdown をダウンロードし、変換レポートで確認が必要なページをチェックします。',
  'seo.why.title': 'なぜローカルで変換するのか',
  'seo.why.body':
    '多くのオンライン変換サービスはファイルをサーバーにアップロードします。Local PDF にはサーバーがありません。静的なページで、変換エンジンはブラウザ内で動作し、ネットワークパネルで自分で確認できます。契約書、明細書、論文がパソコンの外に出ることはありません。',
  'seo.faq.title': 'よくある質問',
  'seo.faq.q1': '本当に無料ですか？',
  'seo.faq.a1':
    'はい。MIT ライセンスのオープンソースで、アカウント登録は不要、ファイル数やサイズの制限はパソコンのメモリ以外にありません。',
  'seo.faq.q2': 'ファイルはアップロードされますか？',
  'seo.faq.a2':
    'いいえ。アップロード先のサーバー自体が存在せず、一度読み込めばオフラインでも動作します。スキャンページの認識時に初めて OCR コンポーネントをダウンロードするだけです。',
  'seo.faq.q3': 'スキャンした PDF も変換できますか？',
  'seo.faq.a3':
    'はい。テキスト層のないページは PaddleOCR がブラウザ内で認識します。簡体字・繁体字中国語、英語、日本語など 50 以上の言語に対応しています。',
  'seo.faq.q4': 'Word の再現度はどのくらいですか？',
  'seo.faq.a4':
    'テキスト層のある PDF の文字は正確です。段落、見出し、リスト、罫線のある表、画像、ヘッダーとフッターを再構築します。フォントは埋め込まないため改行位置がずれることがあり、信頼度の低いページはレポートに表示されます。',
  'seo.faq.q5': '対応ブラウザは？',
  'seo.faq.a5':
    'パソコンの最新の Chrome、Edge、Firefox、Safari 16.4 以降。スマートフォンでも小さなファイルは変換できますが、大きなスキャンはメモリ不足で失敗することがあります。',

  'footer.license': 'MIT ライセンス',
  'footer.hint': '認識には必ず誤差があります。重要な文書は確認してください。',

  'compat.unsupported.title': 'このブラウザでは動作しません',
  'compat.unsupported.body':
    '変換には Web Worker、WebAssembly、OffscreenCanvas が必要ですが、このブラウザはいずれかに対応していません。最新の Chrome、Edge、Firefox、または Safari（16.4 以降）をお使いください。',
  'compat.mobile.title': 'パソコンでの利用をおすすめします',
  'compat.mobile.body':
    'スマートフォンのブラウザはメモリと WebAssembly の制約が大きく、大きなファイルやスキャン文書の変換は失敗したり、システムに中断されたりしがちです。このリンクをパソコンで開くと快適に使えます。',
  'compat.mobile.copy': 'このページのリンクをコピー',
  'compat.mobile.copied': 'コピーしました',
  'compat.mobile.continue': 'それでもこの端末で試す（小さなファイルのみ推奨）',
  'compat.lowMemory':
    'この端末はメモリが少ないため、大きなファイルは失敗することがあります。1 ファイルずつ変換してください。',

  'features.label': 'Local PDF の特長',
  'features.local.title': 'ファイルは端末から出ません',
  'features.local.body':
    'サーバーはありません。解析・認識・生成はすべてブラウザ内で行われ、オフラインでも使えます。',
  'features.editable.title': '本当に編集できる Word',
  'features.editable.body':
    '段落・見出し・リスト・表・画像・ヘッダーとフッターを再構築します。ページ画像を貼るだけではありません。',
  'features.ocr.title': 'スキャンは自動で文字認識',
  'features.ocr.body':
    'テキスト層のないページは自動で OCR。中国語・英語・日本語など 50 以上の言語に対応。',
  'features.free.title': '無料・オープンソース',
  'features.free.body': 'MIT ライセンス。登録不要、回数制限なし、透かしなし。',

  'job.elapsed': '経過 {time}',
  'job.duration': '所要時間 {time}',
  'job.eta.underMinute': '残り 1 分未満',
  'job.eta.minutes': '残り約 {count} 分',
  'job.eta.hours': '残り約 {hours} 時間 {minutes} 分',
  'job.large.size':
    '大きなファイル（{size}）のため時間がかかります。このページを開いたままにしてください。他のタブに切り替えても、タイトルバーに進捗が表示されます。',
  'job.large.pages':
    'このファイルは {pages} ページ（{size}）あり、時間がかかります。このページを開いたままにしてください。他のタブに切り替えても、タイトルバーに進捗が表示されます。',
  'job.large.ocr':
    'スキャン文書のため 1 ページずつ文字認識を行います。通常の PDF よりかなり時間がかかり、速度はパソコンの性能に依存します。',
  'job.pageLimit': '文書は {total} ページありますが、今回は先頭 {limit} ページのみ変換します。',
  'job.retryPlain': '「テキストのみ」で再試行',

  'error.out-of-memory': 'ブラウザのメモリが不足し、変換が中断しました',
  'error.worker-crashed': '変換プロセスが予期せず終了しました。メモリ不足の可能性が高いです',
  'error.memory.hint':
    '対処法：他のタブを閉じて再試行する。「テキストのみ」モードにして画像を保持しない。PDF を分割して別々に変換する。',
  'warning.image-budget-exceeded':
    '画像の合計が上限 {limit} に達したため、{page} ページ以降の画像は保持しません',
  'summary.imageBudget': '画像が上限 {limit} を超えたため {page} ページ以降は保持していません',
  'warning.scan-text-layer':
    '{count} ページはテキスト層付きのスキャンです。テキスト層を出力し、ページ全体のスキャン画像は保持していません',
};
