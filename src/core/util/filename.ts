/** 去掉扩展名和文件系统不接受的字符 */
export function safeBaseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  return base || 'document';
}
