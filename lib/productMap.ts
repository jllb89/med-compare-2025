// lib/productMap.ts
import { normalizeHeader } from './normalize';

const NAME_HEADERS = ['producto','descripcion','descripción','nombre','nombre producto','desc','product','item','articulo','artículo'];
const FORMULA_HEADERS = ['formula','fórmula','composicion','composición','formulacion','formulación','presentacion','presentación'];
const LAB_HEADERS = ['lab','laboratorio','marca','brand','fabricante','manufacturer'];

export function detectProductColumns(headers: any[]) {
  const H = headers.map((h) => normalizeHeader(h));
  const nameCols: number[] = [];
  const formulaCols: number[] = [];
  const labCols: number[] = [];

  const hasWord = (h: string, list: string[]) => list.some((k) => h.includes(k));

  H.forEach((h, i) => {
    if (hasWord(h, NAME_HEADERS)) nameCols.push(i);
    if (hasWord(h, FORMULA_HEADERS)) formulaCols.push(i);
    if (hasWord(h, LAB_HEADERS)) labCols.push(i);
  });

  return { H, nameCols, formulaCols, labCols };
}

export function extractFirstNonEmpty(row: any[], idxs: number[]): string | undefined {
  for (const i of idxs) {
    const v = row?.[i];
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return undefined;
}
