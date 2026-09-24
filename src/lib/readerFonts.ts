/**
 * Reader @font-face injection — WebViews cannot see fonts registered with
 * expo-font, so the reader needs @font-face data URIs baked into its HTML.
 *
 * Sources (all bundled, offline, OFL-licensed):
 *  - Crimson Pro / Libre Baskerville / Atkinson Hyperlegible / Inter
 *    via @expo-google-fonts packages (resolved with expo-asset)
 *  - CustomUpload = user-picked TTF/OTF (Premium), read from app storage
 *
 * CSS is cached per family; generation is one-time (~100-300ms) per family.
 */
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import type { ReaderFontId } from '@/theme/tokens';

const cache = new Map<string, string>();

type FontModule = number | { uri: string };

function familyOf(id: ReaderFontId): string {
  switch (id) {
    case 'crimson': return 'CrimsonPro';
    case 'baskerville': return 'LibreBaskerville';
    case 'atkinson': return 'AtkinsonHyperlegible';
    case 'inter': return 'Inter';
    case 'custom': return 'CustomUpload';
    default: return 'System';
  }
}

async function moduleToDataUri(mod: FontModule): Promise<string | null> {
  try {
    const asset = Asset.fromModule(mod as never);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:font/ttf;base64,${b64}`;
  } catch {
    return null;
  }
}

/**
 * Returns @font-face CSS making `family` available inside the reader WebView.
 * Falls back to '' (system serif/sans) when the file can't be resolved —
 * the reader keeps working, just without that typeface.
 */
export async function getReaderFontCss(id: ReaderFontId, customUri?: string | null): Promise<string> {
  const family = familyOf(id);
  if (family === 'System') return '';
  const key = id === 'custom' ? `custom:${customUri ?? ''}` : id;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let dataUri: string | null = null;
  try {
    if (id === 'custom') {
      if (customUri) {
        const b64 = await FileSystem.readAsStringAsync(customUri, { encoding: FileSystem.EncodingType.Base64 });
        dataUri = `data:font/ttf;base64,${b64}`;
      }
    } else if (id === 'crimson') {
      const m = await import('@expo-google-fonts/crimson-pro');
      dataUri = await moduleToDataUri((m as unknown as { CrimsonPro_400Regular: FontModule }).CrimsonPro_400Regular);
    } else if (id === 'baskerville') {
      const m = await import('@expo-google-fonts/libre-baskerville');
      dataUri = await moduleToDataUri((m as unknown as { LibreBaskerville_400Regular: FontModule }).LibreBaskerville_400Regular);
    } else if (id === 'atkinson') {
      const m = await import('@expo-google-fonts/atkinson-hyperlegible');
      dataUri = await moduleToDataUri((m as unknown as { AtkinsonHyperlegible_400Regular: FontModule }).AtkinsonHyperlegible_400Regular);
    } else if (id === 'inter') {
      const m = await import('@expo-google-fonts/inter');
      dataUri = await moduleToDataUri((m as unknown as { Inter_400Regular: FontModule }).Inter_400Regular);
    }
  } catch {
    dataUri = null;
  }

  const css = dataUri
    ? `@font-face{font-family:'${family}';src:url(${dataUri}) format('truetype');font-weight:400;font-style:normal;font-display:swap;}`
    : '';
  cache.set(key, css);
  return css;
}

export function readerFontFamily(id: ReaderFontId): string {
  switch (id) {
    case 'crimson': return "'CrimsonPro',Georgia,serif";
    case 'baskerville': return "'LibreBaskerville',Georgia,serif";
    case 'atkinson': return "'AtkinsonHyperlegible',Verdana,sans-serif";
    case 'inter': return "'Inter',system-ui,sans-serif";
    case 'custom': return "'CustomUpload',Georgia,serif";
    default: return 'system-ui,sans-serif';
  }
}
