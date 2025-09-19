// lib/text.ts

/** Try to reverse common UTF-8→Latin-1 mojibake */
export function fixMojibake(input: unknown): string {
  if (input == null) return '';
  let s = String(input);
  if (!s) return '';
  try {
    // Treat current JS string's 0–255 codepoints as Latin-1 bytes and decode as UTF-8
    const bytes = Uint8Array.from(Array.from(s, ch => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    // If decoding yields more replacement chars or same length garbage, fall back
    if (decoded && decoded !== s && /Ã.|Â./.test(s)) return decoded;
  } catch {
    /* noop */
  }
  return s;
}

/** Normalize a display string: fix encoding, collapse whitespace, trim. */
export function cleanDisplay(s: unknown): string {
  const x = fixMojibake(s);
  return x.replace(/\s+/g, ' ').trim();
}

/** Heuristic to pick a product name from a row object when headers vary/missing. */
export function guessProductName(row: Record<string, any>): string | undefined {
  const keys = Object.keys(row || {});
  if (!keys.length) return undefined;

  // Preferred header candidates (lowercased, diacritics-insensitive)
  const preferred = [
    'producto', 'producto/desc', 'descripcion', 'descripción',
    'nombre', 'name', 'product', 'item', 'artículo', 'articulo'
  ];

  const norm = (k: string) =>
    k.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // 1) Known header names first
  for (const k of keys) {
    if (preferred.includes(norm(k))) {
      const v = cleanDisplay(row[k]);
      if (v) return v;
    }
  }

  // 2) Otherwise choose the longest "human-looking" string cell
  const candidates = keys
    .map(k => cleanDisplay(row[k]))
    .filter(v => v && !/^\d+(\.\d+)?$/.test(v)) // skip obvious pure numbers
    .filter(v => v.length >= 4 && v.length <= 160);

  if (candidates.length) {
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0];
  }

  return undefined;
}
