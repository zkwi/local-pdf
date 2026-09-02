/**
 * XML 1.0 不允许的字符：C0 控制符（除 \t \n \r）、C1 控制符、U+FFFE/U+FFFF、落单的代理项。
 * PDF 字体经常把制表符、项目符号之类的字形映射成 U+0002 这种控制符，
 * 原样写进 document.xml 会让 Word 直接拒绝打开。
 */
const INVALID_XML_CHARS = new RegExp(
  [
    '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\uFFFE\\uFFFF]',
    '[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])',
    '(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]',
  ].join('|'),
  'g',
);

export function sanitizeText(text: string): string {
  return text.replace(INVALID_XML_CHARS, '');
}
