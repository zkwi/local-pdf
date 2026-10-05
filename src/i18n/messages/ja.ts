import type { Messages } from './zh-CN.ts';

export const ja: Messages = {
  'app.title': 'Local PDF',
  'app.feature': 'PDF → Word / Markdown',
  'app.tagline': 'PDF は端末から出ません。変換はすべてブラウザ内で行われ、アップロードはしません。',
  'app.badgeLocal': 'ローカル変換',
  'app.badgeLocalTitle': 'アップロード機能はありません。オフラインでも使えます',
  'app.language': '表示言語',
  'app.docTitle': 'ブラウザで PDF → Word / Markdown · Local PDF',

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
  'feedback.report': 'この問題を報告',
  'feedback.quality': '結果がおかしい？報告する',
  'feedback.hint':
    'GitHub の報告フォームを開きます。バージョン、ブラウザー、エラー情報は自動で入りますが、ファイルは含まれません。',

  'output.label': '変換先',
  'output.docx': 'Word',
  'output.markdown': 'Markdown',
  'output.both': '両方',
  'output.docx.hint': '段落・表・画像・ヘッダーとフッターを保持した .docx を作成します。',
  'output.markdown.hint': '.md を作成します。画像がある場合は画像と一緒に zip にまとめます。',
  'output.both.hint': '同じ認識結果から Word と Markdown の両方を作成します。',
  'output.images': '画像',
  'output.images.hint':
    '各ページを 1 枚の画像にします。複数ページは zip にまとめます。形式、解像度、ページ範囲は「詳細オプション」で選べます。',

  'images.label': '画像の出力',
  'images.format.label': '形式',
  'images.format.png.hint': 'PNG は可逆で、文字や線が最もくっきりしますが、ファイルは大きめです。',
  'images.format.jpeg.hint': 'JPEG は軽く、スキャンや写真向きです。文字の輪郭はやや甘くなります。',
  'images.dpi.label': '解像度',
  'images.dpi.96.hint': '画面で見るには十分で、ファイルが最も小さくなります。',
  'images.dpi.150.hint': '鮮明さとサイズのバランスがよく、たいていの用途に向きます。',
  'images.dpi.300.hint': '印刷品質です。ファイルが大きく、変換にも時間がかかります。',
  'images.size.hint': 'A4 ページはおよそ {width} × {height} ピクセルになります。',
  'job.download.image': '画像をダウンロード',
  'job.download.image-bundle': '画像一式をダウンロード',
  'stage.rendering': '描画中',
  'progress.rendering': '{total} ページ中 {page} ページ目を描画しています',
  'progress.writing-images': '画像をまとめています…',

  'nav.label': 'ツール',
  'nav.fromPdf': 'PDF から',
  'nav.toPdf': 'PDF へ',
  'nav.word': 'Word',
  'nav.markdown': 'Markdown',
  'nav.images': '画像',
  'nav.activity.saved': '{tool}、{count} 件を保持',
  'nav.activity.busy': '{tool}、{count} 件を処理中',
  'tool.docTitle': 'ブラウザで {tool} · Local PDF',
  'tool.pdf-to-word.title': 'PDF → Word',
  'tool.pdf-to-word.lede':
    'PDF を編集できる .docx にします。段落・表・画像・ヘッダーとフッターを再構成し、スキャンは自動で認識します。',
  'tool.pdf-to-markdown.title': 'PDF → Markdown',
  'tool.pdf-to-markdown.lede':
    '同じレイアウト解析の結果を .md に書き出します。画像がある場合は画像と一覧をまとめて zip にします。',
  'tool.pdf-to-images.title': 'PDF → 画像',
  'tool.pdf-to-images.lede':
    '各ページを PNG または JPEG にします。解像度を選べ、複数ページは zip になります。',
  'tool.word-to-pdf.title': 'Word → PDF',
  'tool.word-to-pdf.lede':
    '.docx をブラウザ内でレイアウトして PDF に書き出します。文字は選択・検索でき、アップロードはしません。',
  'tool.markdown-to-pdf.title': 'Markdown → PDF',
  'tool.markdown-to-pdf.lede':
    '.md ファイル（参照している画像と一緒でも可）をドロップするか、Markdown のテキストをそのまま貼り付けてください。',
  'tool.images-to-pdf.title': '画像 → PDF',
  'tool.images-to-pdf.lede':
    '複数の画像を並べた順に 1 つの PDF にします。サムネイルをドラッグして並べ替え、回転や用紙サイズの指定もできます。',
  'tool.word-to-pdf.hint':
    'フォントは埋め込まないのでファイルは小さくなります。用紙サイズ・余白・ヘッダーとフッターは文書の設定に従います。テキストボックスやワードアートは崩れることがあります。',
  'tool.markdown-to-pdf.hint':
    '見出し・リスト・表・コードブロック・タスクリスト・引用・画像に対応。用紙と文字サイズは「詳細オプション」で選べます。',
  'drop.title.word': 'Word 文書（.docx）をここにドロップ、またはクリックして選択',
  'drop.title.markdown': 'Markdown ファイルをここにドロップ、またはクリックして選択',
  'drop.title.images': '画像をここにドロップ、またはクリックして選択',
  'drop.hint.markdown':
    '.md が参照する画像も一緒にドロップできます · Ctrl+V でテキストの貼り付けも可',
  'drop.hint.images':
    'JPG、PNG、WebP、GIF など · 追加した順に並び、あとからドラッグで並べ替えできます',
  'drop.choose.word': 'Word 文書を選択',
  'drop.choose.markdown': 'Markdown ファイルを選択',
  'drop.choose.images': '画像を選択',
  'drop.more.word': '文書を追加：ここにドロップするか、クリックして選択',
  'drop.more.markdown': 'ファイルを追加：ここにドロップするか、クリックして選択',
  'drop.more.images': '画像を追加：ここにドロップするか、クリックして選択',
  'drop.overlay.images': 'ドロップして画像を追加',
  'drop.unsupported.one': 'このツールで扱えないファイル 1 件を無視しました',
  'drop.unsupported.other': 'このツールで扱えないファイル {count} 件を無視しました',
  'compose.count.one': '画像 1 枚を選択中',
  'compose.count.other': '画像 {count} 枚を選択中',
  'compose.dragHint': 'サムネイルをドラッグして並べ替えます。並び順がページ順になります。',
  'compose.sortByName': 'ファイル名で並べ替え',
  'compose.reverse': '逆順',
  'compose.clear': 'すべて削除',
  'compose.rotate': '90° 回転',
  'compose.moveLeft': '前へ',
  'compose.moveRight': '後ろへ',
  'compose.remove': '削除',
  'compose.pageSize': 'ページ',
  'compose.pageSize.fit': '画像に合わせる',
  'compose.pageSize.a4': 'A4',
  'compose.pageSize.letter': 'Letter',
  'compose.orientation': '向き',
  'compose.orientation.auto': '自動',
  'compose.orientation.portrait': '縦',
  'compose.orientation.landscape': '横',
  'compose.margin': '余白',
  'compose.margin.none': 'なし',
  'compose.margin.small': '狭い',
  'compose.margin.normal': '標準',
  'compose.quality': '画質',
  'compose.quality.auto': '自動',
  'compose.quality.lossless': 'そのまま',
  'compose.quality.compact': '圧縮',
  'compose.quality.auto.hint':
    '写真は JPEG、スクリーンショットや図表は可逆で保持します。JPEG の原本は再エンコードせずに埋め込みます。',
  'compose.quality.lossless.hint':
    'すべての画像を可逆で埋め込みます。ファイルが大きくなることがあります。',
  'compose.quality.compact.hint':
    'すべて JPEG にし、約 400 万画素（2000×2000 相当）を超える画像は縦横比を保って縮小します。ファイルが最も小さくなります。',
  'compose.fileName': 'ファイル名',
  'compose.generate': 'PDF を作成',
  'compose.generating': '{total} 枚中 {done} 枚目を処理しています…',
  'compose.done': '{pages} ページの PDF を作成しました（{size}）',
  'compose.download': 'PDF をダウンロード',
  'compose.failed': '作成に失敗しました：{detail}',
  'compose.stale': '画像か設定が変わりました。もう一度作成してください。',
  'compose.cancel': 'キャンセル',
  'topdf.queued': '順番待ち',
  'topdf.stage.render': 'レイアウト中',
  'topdf.stage.layout': 'ページ分割中',
  'topdf.stage.images': '画像を処理中',
  'topdf.stage.write': 'PDF を書き出し中',
  'topdf.done': '変換が完了しました',
  'topdf.failed': '変換に失敗しました：{detail}',
  'topdf.cancelled': 'キャンセルしました',
  'topdf.download': 'PDF をダウンロード',
  'topdf.imagesSkipped.one': '画像 1 件を埋め込めませんでした',
  'topdf.imagesSkipped.other': '画像 {count} 件を埋め込めませんでした',
  'topdf.unsupportedImages':
    '{formats} 画像は未対応です。Word で PNG/JPEG に置き換えて再試行してください',
  'topdf.charactersReplaced':
    '珍しい文字や絵文字 {count} 個を □ に置き換えました。原文と照合してください',
  'topdf.blockedContent':
    '外部または安全でない内容 {count} 件をブロックしました。画像は端末から追加してください',
  'error.invalid-page-range':
    'ページ範囲が無効、または対象ページがありません。範囲を修正して再試行してください',
  'warning.scan-image-fallback':
    '{page} ページのスキャン領域を画像で保持しました。画像内の文字は編集できません。文字が必要な場合は「画像を保持」をオフにして再試行してください',
  'warning.scan-layout-review':
    '{page} ページはスキャン文字を使用しています。図表やレイアウトが復元されない場合があるため、原文と照合してください',
  'topdf.pastedName': '貼り付けた Markdown',
  'topdf.assetsAdded.one': '画像 1 件を保持しました。.md の変換時に使います',
  'topdf.assetsAdded.other': '画像 {count} 件を保持しました。.md の変換時に使います',
  'docpdf.page.label': '用紙',
  'docpdf.page.a4': 'A4',
  'docpdf.page.letter': 'Letter',
  'docpdf.margin.label': '余白',
  'docpdf.margin.narrow': '狭い',
  'docpdf.margin.normal': '標準',
  'docpdf.margin.wide': '広い',
  'docpdf.fontSize.label': '本文の文字サイズ',
  'docpdf.cjk.label': '日中韓フォント',
  'docpdf.cjk.auto': '表示言語に合わせる',
  'docpdf.cjk.zh-CN': '簡体字中国語',
  'docpdf.cjk.zh-TW': '繁体字中国語',
  'docpdf.cjk.ja': '日本語',
  'docpdf.cjk.ko': '韓国語',
  'docpdf.cjk.hint':
    'PDF にフォントは埋め込まず、日中韓の文字は閲覧ソフト側のフォントで表示されます。文字種に合わせて選ぶと字形が正しくなります。',
  'docpdf.word.hint': '用紙・余白・ヘッダーとフッターは文書の設定に従います。',
  'advanced.also.markdown': 'Markdown も作成する',
  'advanced.also.docx': 'Word も作成する',
  'seo.how.topdf.1':
    'Word 文書、Markdown ファイル、または画像をページにドロップするか、Ctrl+V で貼り付けます。',
  'seo.how.topdf.2':
    'レイアウト・ページ分割・PDF の書き出しはすべてブラウザ内で行われ、ファイルはどこにも送信されません。',
  'seo.how.topdf.3':
    'PDF をダウンロードします。文字は選択・検索でき、フォントを埋め込まないのでファイルは小さくなります。',
  'topdf.error.invalid': '有効な Word 文書（.docx）ではないか、ファイルが壊れています',
  'topdf.editor.toggle': 'Markdown を直接貼り付け・入力',
  'topdf.editor.resume': 'Markdown の編集を続ける',
  'topdf.editor.title': 'Markdown の内容',
  'topdf.editor.collapse': 'エディターを閉じる',
  'topdf.editor.placeholder': '# 見出し\n\nここに Markdown を貼り付けるか入力してください…',
  'topdf.editor.convert': 'PDF に変換',
  'topdf.editor.clear': 'クリア',
  'features.vector.title': '文字を選択できるベクター PDF',
  'features.vector.body':
    'ページのスクリーンショットではありません。文字は選択・検索・コピーでき、フォントを埋め込まないのでファイルは小さくなります。',
  'features.compose.title': '並べてから変換',
  'features.compose.body':
    '画像はドラッグで並べ替え・回転・用紙選択。Word はヘッダー・フッター・番号付け・表を保持し、Markdown は表・コードブロック・タスクリストに対応。',
  'seo.faq.q6': 'Word・Markdown・画像を PDF にできますか？',
  'seo.faq.a6':
    'できます。Word と Markdown はブラウザがレイアウトし、文字を選択できるベクター PDF として書き出します。画像は並べた順に 1 つの PDF にまとめます。すべてお使いのパソコン内で完了します。フォントは埋め込まず（日中韓の文字は閲覧ソフトのフォントで表示）、ファイルは小さくなります。テキストボックスやワードアートは崩れることがあります。',

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
  'queue.downloadAll': 'まとめて zip でダウンロード（{count}）',
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
  'warning.scan-page-resized':
    '{page} ページはサイズが特殊なスキャン（大判スキャンやスマートフォンの画面）のため、文字が通常の大きさになるよう A4 の比率に合わせました',
  'warning.no-text-found': '{page} ページから文字を取り出せませんでした',

  'meta.description':
    'Local PDF はブラウザ内で PDF を Word・Markdown・画像に、Word・Markdown・画像を PDF に変換します。アップロードなし、無料、オープンソース。スキャン文書は自動 OCR、中国語・英語・日本語ほか多言語対応。',
  'meta.suffix': 'すべてブラウザ内で完結：アップロードなし、登録不要、無料でオープンソース。',
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

  'app.skip': '本文へ移動',
  'app.titleDone': '✅ 変換完了',
  'drop.switched': '「{tool}」に切り替えました',
  'drop.sample.markdown': 'ファイルがない場合はサンプルの Markdown を入力',
  'queue.zipping': 'まとめています…',
  'queue.zipFailed': 'まとめられませんでした。1 つずつダウンロードしてください',
  'job.copy': 'Markdown をコピー',
  'job.copied': 'クリップボードにコピーしました',
  'job.copyFailed': 'コピーできませんでした。ファイルをダウンロードしてください',
  'topdf.editor.sample': 'サンプルを入力',
  'topdf.editor.sampleText':
    '# サンプル文書\n\nこれは **Markdown** の一例です。PDF にしても文字は選択・検索できます。\n\n## リスト\n\n- 箇条書き\n- 二つ目\n  1. 入れ子の番号付きリスト\n  2. 二番目の手順\n\n## タスク\n\n- [x] 完了\n- [ ] 未完了\n\n## 表\n\n| 品目 | 数量 | 備考 |\n| --- | ---: | --- |\n| りんご | 3 | 赤い |\n| みかん | 12 | 甘酸っぱい |\n\n## コード\n\n```js\nconsole.log("Hello, Local PDF");\n```\n\n> 引用：ファイルは端末から出ません。\n\n[詳しく見る](https://localpdfconverter.com)\n',
  'images.range.label': 'ページ範囲',
  'images.range.placeholder': '全ページ',
  'images.range.hint':
    '空欄なら全ページ。例：1-3, 5, 8- は 1〜3 ページ、5 ページ、8 ページ以降を指します。',
  'images.range.invalid': 'ページ範囲が無効です。1-3, 5, 8- のように修正してから変換してください。',
  'summary.pageRange': '{range} ページ',
  'nav.imageTools': '画像ツール',
  'nav.compress': '圧縮',
  'nav.convert': '形式変換',
  'nav.resize': 'サイズ変更',
  'tool.compress-images.title': '画像を圧縮',
  'tool.compress-images.lede':
    'JPG・PNG・WebP をまとめて圧縮。透過を保ち、元より大きくならず、サイズ指定もできます。',
  'tool.convert-images.title': '画像の形式を変換',
  'tool.convert-images.lede':
    'PNG・WebP・GIF・BMP・AVIF・SVG などをまとめて JPG・PNG・WebP に変換します。',
  'tool.resize-images.title': '画像サイズを変更',
  'tool.resize-images.lede':
    '長辺・幅・高さ・パーセントで縦横比を保って縮小、正確なサイズへの切り抜きもできます。',
  'drop.title.imageTools': '画像またはフォルダーをここにドロップ、またはクリックして選択',
  'drop.hint.imageTools':
    'JPG・PNG・WebP・GIF・BMP・AVIF・SVG に対応 · 何枚でもまとめて選べます · 画像はこのコンピューターから出ません',
  'drop.folder': 'フォルダーを選択',
  'drop.folder.long': 'フォルダーごと選ぶこともできます',
  'compat.mobile.banner':
    'スマートフォンのブラウザーはメモリが少なく、大きなファイルやスキャンの変換に失敗することがあります。できればパソコンでご利用ください。',
  'compose.itemFailed':
    '{index} 枚目の画像（{name}）を読み込めませんでした。削除するか PNG / JPG に変換してから再試行してください。',
  'img.settings': '処理の設定',
  'img.count.one': '1 枚の画像を選択中',
  'img.count.other': '{count} 枚の画像を選択中',
  'img.listHint':
    'サムネイルをクリックすると元の画像と比較できます。設定を変えると自動で処理し直します。',
  'img.output.label': '出力形式',
  'img.output.keep': '元の形式',
  'img.output.jpeg': 'JPG',
  'img.output.png': 'PNG',
  'img.output.webp': 'WebP',
  'img.output.keep.hint':
    '各画像の形式を保ちます。GIF・BMP・AVIF など書き戻せない形式は PNG か JPG で保存します。',
  'img.output.jpeg.hint':
    'JPG は小さくどこでも開けるので写真向き。透過は使えず、透明部分は背景色で塗りつぶします。',
  'img.output.png.hint':
    'PNG はスクリーンショットやアイコン、透過が必要な画像向き。可逆圧縮か減色圧縮です。',
  'img.output.webp.hint':
    'WebP は JPG・PNG より小さく、透過にも対応。一部の古いソフトでは開けません。',
  'img.quality.label': '画質',
  'img.quality.high': '高画質',
  'img.quality.standard': '標準',
  'img.quality.small': '最小',
  'img.quality.high.hint': '高画質：JPG / WebP 品質 90、PNG は可逆。',
  'img.quality.standard.hint':
    '標準：JPG / WebP 品質 80 で見た目はほぼ変わりません。PNG は 256 色に減色。',
  'img.quality.small.hint':
    '最小：JPG / WebP 品質 65。PNG は 64 色に減色し、グラデーションが粗く見えることがあります。',
  'img.quality.target':
    'サイズ上限に収まる画質を自動で選び、足りなければ縦横比を保って縮小します（1 MB = 1024 KB）。',
  'img.target.value': '1 枚あたりのサイズ上限（KB）',
  'img.resize.label': '寸法',
  'img.resize.long': '長辺を指定',
  'img.resize.width': '幅を指定',
  'img.resize.height': '高さを指定',
  'img.resize.percent': 'パーセント',
  'img.resize.exact': '正確なサイズ',
  'img.resize.long.hint':
    '横長・縦長どちらも長い辺に合わせて縦横比を保って縮小します。小さい画像は拡大しません。',
  'img.resize.width.hint': '幅を指定値に縮め、高さは比率に従います。幅が狭い画像は拡大しません。',
  'img.resize.height.hint':
    '高さを指定値に縮め、幅は比率に従います。高さが低い画像は拡大しません。',
  'img.resize.percent.hint': '幅と高さを同じ割合で縮小します。',
  'img.resize.exactWidth': '幅（ピクセル）',
  'img.resize.exactHeight': '高さ（ピクセル）',
  'img.fit.cover': '切り抜いて埋める',
  'img.fit.contain': '全体を収める',
  'img.fit.cover.hint':
    '縦横比を保ってこのサイズを覆うように拡大縮小し、はみ出た部分を中央基準で切り取ります。',
  'img.fit.contain.hint':
    '縦横比を保ってこのサイズに収め、余白は透明のままか背景色で塗りつぶします。',
  'img.dpi.label': 'DPI',
  'img.dpi.none': '設定しない',
  'img.dpi.hint':
    'DPI は印刷サイズの目印でピクセルは変わりません。JPG と PNG で有効、WebP は非対応です。',
  'img.startMore.one': '残りの 1 枚を処理',
  'img.startMore.other': '残りの {count} 枚を処理',
  'img.processing': '処理中… {total} 枚中 {done} 枚完了',
  'img.status.ready': '未処理',
  'img.status.queued': '待機中',
  'img.status.processing': '処理中',
  'img.status.kept': '元のまま',
  'img.status.skipped': 'スキップ',
  'img.status.failed': '失敗',
  'img.note.format': '{format} で保存',
  'img.note.alpha': '透明部分を塗りつぶしました',
  'img.note.limited': '大きすぎるため {width} × {height} に縮小しました',
  'img.note.shrunk': 'サイズ上限に収めるため {width} × {height} に縮小しました',
  'img.note.missed': '{size} 以下にはできませんでした。可能な限り小さくした結果です',
  'img.note.dpi': 'WebP には DPI を記録できません',
  'img.note.palette': '{colors} 色に減色しました',
  'img.note.larger': '元の画像より大きい',
  'img.error.animated':
    'アニメーション画像には未対応のためスキップしました（最初のフレームしか残らないため）',
  'img.error.heic':
    'このブラウザーは HEIC を読み込めません。Safari でこのページを開くか、iPhone の 設定 › カメラ › フォーマット で「互換性優先」を選んでください',
  'img.error.decode':
    'このブラウザーではこの {format} 画像を読み込めません。ファイルが壊れている可能性があります',
  'img.error.memory':
    'メモリ不足でこの画像を処理できませんでした。ほかのタブを閉じて再試行してください',
  'img.error.encode': '画像を作成できませんでした',
  'img.error.unknown': '処理に失敗しました：{detail}',
  'img.compare': '比較',
  'img.compare.open': '{name} の元の画像と結果を比較',
  'img.compare.original': '元の画像',
  'img.compare.result': '結果',
  'img.compare.actual': '実寸',
  'img.compare.close': '閉じる',
  'img.compare.slider': '左右にドラッグして元の画像と結果を比較',
  'img.compare.hint':
    '仕切り線をドラッグ（または左右キー）して比較。「実寸」にチェックすると細部を確認できます。',
  'img.download': 'ダウンロード',
  'img.downloadAll': 'まとめてダウンロード（{count} 枚）',
  'img.remove': '{name} を削除',
  'img.summary.done': '{count} 枚：{before} → {after}',
  'img.saved': '{percent}% 削減',
  'img.grew': '{percent}% 増加',
  'features.shrink.title': '小さく、でも劣化させない',
  'features.shrink.body':
    'JPG・WebP は画質を調整し、PNG は透過を保ったまま減色。小さくならなければ元の画像を残し、指定サイズ以下にもできます。',
  'features.batch.title': 'まとめて処理、まとめて保存',
  'features.batch.body':
    '数百枚やフォルダーごとドロップして形式・サイズ・画質をそろえ、元のフォルダー構成のまま 1 つの zip にします。',
  'seo.how.image.1':
    '画像やフォルダーごとページにドロップするか、Ctrl+V でスクリーンショットを貼り付けます。',
  'seo.how.image.2':
    '形式・画質・サイズを選んで開始します。デコード・縮小・圧縮はすべてブラウザー内で行われます。',
  'seo.how.image.3':
    'サムネイルをクリックして元の画像と比較し、1 枚ずつ、またはまとめて zip でダウンロードします。',
  'seo.why.image':
    '多くのオンライン画像圧縮ツールは画像をサーバーにアップロードします。Local PDF の画像ツールはブラウザー内で動くので、証明写真もスクリーンショットもカメラロールの写真もこのコンピューターから出ません。ネットワークパネルで確かめられます。',
  'seo.faq.image.q1': '画像はアップロードされますか？',
  'seo.faq.image.a1':
    'いいえ。圧縮・変換・サイズ変更はすべてブラウザー内で行われます。アップロード先はなく、読み込み後はオフラインでも使えます。',
  'seo.faq.image.q2': 'PNG の透過は保たれますか？',
  'seo.faq.image.a2':
    'はい。PNG と WebP で出力すれば透過は残ります。JPG は透過を持てないため、透明部分は選んだ色（既定は白）になります。',
  'seo.faq.image.q3': '「元のまま」と表示される画像があるのはなぜですか？',
  'seo.faq.image.a3':
    '再圧縮しても小さくならない場合（最適化済みの画像によくあります）は元のファイルをそのまま返すので、大きくなることはありません。さらに小さくしたいときは寸法や画質を下げるか、WebP / JPG で保存してください。',
  'seo.faq.image.q4': '200 KB 以下など、指定したサイズに圧縮できますか？',
  'seo.faq.image.a4':
    'できます。「画像を圧縮」の画質で「サイズ指定」を選んで数値を入力すると、収まる範囲で最も高い画質を自動で選び、それでも足りなければ縦横比を保って縮小します。',
  'seo.faq.image.q5': '写真の向きや位置情報はどうなりますか？',
  'seo.faq.image.a5':
    '写真はまず撮影時の向きに合わせて回転されます。再エンコードした画像には EXIF が含まれないため、撮影場所やカメラの機種などの情報は削除されます。「元のまま」の画像だけはそのままです。',
  'seo.faq.image.q6': 'HEIC やアニメーション画像には対応していますか？',
  'seo.faq.image.a6':
    'HEIC を読み込めるのは Safari だけです。iPhone では Web ページで写真を選ぶと通常 JPG に変換されます。アニメーション GIF・APNG・WebP は最初のフレームだけにならないようスキップします。',
  'img.note.unchanged': '設定どおりのため元のまま',
  'img.note.withinTarget': 'もともと {size} 以下のため元のまま',
  'img.note.notSmaller': '再圧縮しても小さくならないため元のまま',
  'img.note.svg': 'SVG を {width} × {height} でラスタライズしました',
  'img.note.svgResize': '大きくしたい場合は「画像サイズを変更」で拡大できます',
  'img.status.done': '完了',
  'img.quality.custom': 'サイズ指定',
  'img.convert.label': '変換先',
  'img.fill.label': '透明部分の色',
  'img.stop': '停止',
  'compose.settings': 'PDF ページの設定',
  'compose.pageSize.fit.hint':
    '各ページを画像と同じ大きさにし、余白を付けません。スクリーンショットや縦長の画像向きです。',
  'compose.pageSize.a4.hint':
    'すべて A4 ページにし、画像は縦横比を保って中央に配置します。横長の画像はページを横向きにします。',
  'compose.pageSize.letter.hint':
    'すべて Letter ページにし、画像は縦横比を保って中央に配置します。横長の画像はページを横向きにします。',
};
