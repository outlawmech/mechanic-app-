export interface CsvHandoffAdapters {
  isNative: boolean;
  shareNativeFile?: (content: string, filename: string) => Promise<void>;
  shareWebFile?: (file: File) => Promise<boolean>;
  downloadInBrowser: (content: string, filename: string) => void;
}

export function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Hand a CSV to a real download/share target before reporting success. */
export async function handoffCsv(
  content: string,
  filename: string,
  adapters: CsvHandoffAdapters,
): Promise<'native-share' | 'web-share' | 'download'> {
  if (adapters.isNative) {
    if (!adapters.shareNativeFile) throw new Error('File sharing is not available in this app version.');
    await adapters.shareNativeFile(content, filename);
    return 'native-share';
  }

  const file = new File([content], filename, { type: 'text/csv;charset=utf-8' });
  if (adapters.shareWebFile && await adapters.shareWebFile(file)) return 'web-share';
  adapters.downloadInBrowser(content, filename);
  return 'download';
}
