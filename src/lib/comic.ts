/**
 * CBZ (ZIP) comic reader — pure JS via jszip. CBR (RAR) needs the native
 * module (react-native-zip-archive doesn't handle RAR either) → we attempt
 * dev-client unrar and otherwise show an honest convert hint.
 */
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';
import { AppDirs } from './files';

const IMG_RE = /\.(jpe?g|png|gif|webp|bmp)$/i;

export interface ComicPage { index: number; uri: string; name: string; }

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export async function extractCbz(uri: string, bookId: string): Promise<ComicPage[]> {
  const dir = `${AppDirs.cache}comics/${bookId}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const names = Object.keys(zip.files)
    .filter((n) => IMG_RE.test(n) && !zip.files[n]?.dir && !n.includes('__MACOSX'))
    .sort(naturalSort)
    .slice(0, 1000);

  const pages: ComicPage[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i] as string;
    const ext = name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const dest = `${dir}${String(i).padStart(4, '0')}.${ext}`;
    const exists = await FileSystem.getInfoAsync(dest);
    if (!exists.exists) {
      const data = await (zip.files[name] as JSZip.JSZipObject).async('base64');
      await FileSystem.writeAsStringAsync(dest, data, { encoding: FileSystem.EncodingType.Base64 });
    }
    pages.push({ index: i, uri: dest, name: name.split('/').pop() ?? name });
  }
  return pages;
}

/**
 * CBR: try native unrar if a dev-client module is present.
 * Returns null when unsupported → UI shows "Convert to CBZ/PDF" guidance.
 */
export async function tryExtractCbr(_uri: string, _bookId: string): Promise<ComicPage[] | null> {
  // No reliable Expo-compatible unrar exists as of this build. We keep the
  // seam: a future `readnest-unrar` dev-client module can fill this in.
  // Deliberately honest: never fake support.
  return null;
}
