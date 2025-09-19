// lib/parseSheet.ts
import * as XLSX from 'xlsx';
import { digitsOnly } from './normalize';
import { mapColumns, pickHeaderRow, getCell, inferSkuColsFromData } from './detect';
import { parsePrice } from './price';
import { detectProductColumns, extractFirstNonEmpty } from './productMap';
import { cleanDisplay, guessProductName } from './text';
import { normalizeSupplier } from './suppliers';
import type { MatchRow, FileResult } from './types';

/** Normalize header tokens for scoring. */
function normHeader(h: string) {
  return cleanDisplay(h)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const PRICE_HEADER_HINTS = [
  'precio', 'precio unitario', 'p. unit', 'p.unit', 'p lista',
  'p.lista', 'price', 'unit price', 'neto', 'costo', 'cost',
  '$', 'mxn'
];

type PriceProfileResult = {
  idx: number | null;
  reason: 'header' | 'profile' | 'none';
  score?: number;
};

/**
 * Profile all columns and choose ONE price column index for the entire sheet.
 * We score columns by header hints, currency marks, numeric parse rate,
 * decimal rate, and penalize obvious ID-like integer columns.
 */
function chooseSheetPriceColumn(
  headers: string[],
  dataRows: any[][]
): PriceProfileResult {
  const nCols = headers.length;
  if (!nCols) return { idx: null, reason: 'none' };

  const H = headers.map(normHeader);

  type Stats = {
    headerHit: boolean;
    headerHasCurrency: boolean;
    parsedCount: number;
    totalCount: number;
    decimalCount: number;
    currencyMarkCount: number;
    intOnlyCount: number;
    uniqueSample: Set<number>;
    score: number;
  };

  const stats: Stats[] = Array.from({ length: nCols }, () => ({
    headerHit: false,
    headerHasCurrency: false,
    parsedCount: 0,
    totalCount: 0,
    decimalCount: 0,
    currencyMarkCount: 0,
    intOnlyCount: 0,
    uniqueSample: new Set<number>(),
    score: 0,
  }));

  // header features
  for (let c = 0; c < nCols; c++) {
    const h = H[c];
    stats[c].headerHit = PRICE_HEADER_HINTS.some((kw) => h.includes(kw));
    stats[c].headerHasCurrency = /\$|mxn/.test(h);
  }

  // scan rows
  for (const row of dataRows) {
    for (let c = 0; c < nCols; c++) {
      const raw = getCell(row, c);
      if (raw == null || raw === '') continue;
      stats[c].totalCount += 1;

      const s = typeof raw === 'string' ? raw : String(raw);
      if (/\$/.test(s)) stats[c].currencyMarkCount += 1;

      const p = parsePrice(raw);
      if (p != null && Number.isFinite(p) && p > 0) {
        stats[c].parsedCount += 1;
        stats[c].uniqueSample.add(p);
        const str = String(raw);
        const hasDec = /[,\.]\d{1,2}\b/.test(str);
        if (hasDec) stats[c].decimalCount += 1;
        if (Number.isInteger(p)) stats[c].intOnlyCount += 1;
      }
    }
  }

  // score columns
  for (let c = 0; c < nCols; c++) {
    const st = stats[c];
    const total = Math.max(1, st.totalCount);
    const parseRate = st.parsedCount / total;                 // 0..1
    const decimalRate = st.decimalCount / Math.max(1, st.parsedCount); // 0..1
    const currencyRate = st.currencyMarkCount / total;

    let score = 0;
    score += 4.0 * parseRate;        // strong: most cells parse as numbers
    score += 2.5 * decimalRate;      // decimals common in prices
    score += 2.0 * currencyRate;     // $ in cells
    if (st.headerHit) score += 3.5;  // header hint bonus
    if (st.headerHasCurrency) score += 1.0;

    // Penalize ID-like columns: mostly integers and low decimal usage
    if (st.intOnlyCount > 0 && decimalRate < 0.2) score -= 2.0;

    // Penalize low uniqueness (flags/sentinels)
    if (st.uniqueSample.size <= 3 && st.parsedCount >= 10) score -= 1.0;

    st.score = score;
  }

  // prefer header-hint columns
  const headerHitCols = stats
    .map((st, idx) => ({ idx, st }))
    .filter(({ st }) => st.headerHit)
    .sort((a, b) => b.st.score - a.st.score);

  if (headerHitCols.length) {
    const top = headerHitCols[0];
    return { idx: top.idx, reason: 'header', score: top.st.score };
  }

  // else best by score if minimally sane
  const ranked = stats.map((st, idx) => ({ idx, st })).sort((a, b) => b.st.score - a.st.score);
  const best = ranked[0];
  if (best && (best.st.parsedCount >= 6 || best.st.score >= 3.0)) {
    return { idx: best.idx, reason: 'profile', score: best.st.score };
  }

  return { idx: null, reason: 'none' };
}

/** Does this row contain the normalized SKU? */
function rowHasSku(row: any[], skuColsIdx: number[], sku: string): boolean {
  if (skuColsIdx.length) {
    for (const i of skuColsIdx) {
      const d = digitsOnly(getCell(row, i));
      if (d && d.includes(sku)) return true;
    }
  }
  for (const c of row) {
    const d = digitsOnly(c);
    if (d && d.includes(sku)) return true;
  }
  return false;
}

/** Parse just one sheet for a single normalized SKU (12–14 digits). */
function parseSingleSheetForSku(
  ws: XLSX.WorkSheet,
  sheetNameRaw: string,
  filenameRaw: string,
  skuNorm: string
): FileResult {
  const t0 = Date.now();

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const headerRowIdx = pickHeaderRow(rows);
  const rawHeaders = (rows[headerRowIdx] || []).map(String);

  // Clean headers; keep a normalized lookup too
  const headers = rawHeaders.map((h) => cleanDisplay(h));
  const dataRows = rows.slice(headerRowIdx + 1);

  // Column maps
  const mapping0 = mapColumns(headers);
  const skuColsIdx = inferSkuColsFromData(dataRows, mapping0.headerStrings, mapping0.skuCols);

  // Product metadata columns inferred from headers
  const { H: hdrNorm, nameCols, formulaCols, labCols } = detectProductColumns(headers);

  // --- PRICE COLUMN LOCK (per sheet) ---
  let priceColIdx: number | null = null;
  let priceColReason: PriceProfileResult['reason'] = 'none';
  let priceColScore: number | undefined = undefined;

  if (mapping0.priceCols.length) {
    if (mapping0.priceCols.length === 1) {
      priceColIdx = mapping0.priceCols[0];
      priceColReason = 'header';
    } else {
      const ranked = mapping0.priceCols
        .map((idx) => ({ idx, h: normHeader(headers[idx]) }))
        .sort((a, b) => {
          const ah = PRICE_HEADER_HINTS.some((kw) => a.h.includes(kw)) ? 1 : 0;
          const bh = PRICE_HEADER_HINTS.some((kw) => b.h.includes(kw)) ? 1 : 0;
          return bh - ah;
        });
      priceColIdx = ranked[0]?.idx ?? mapping0.priceCols[0];
      priceColReason = 'header';
    }
  } else {
    const prof = chooseSheetPriceColumn(headers, dataRows);
    priceColIdx = prof.idx;
    priceColReason = prof.reason;
    priceColScore = prof.score;
  }

  const matches: MatchRow[] = [];
  let scanned = 0;

  const sheetName = cleanDisplay(sheetNameRaw);
  const filename = cleanDisplay(filenameRaw);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];
    scanned++;

    if (!rowHasSku(row, skuColsIdx, skuNorm)) continue;

    // Supplier (first non-empty among mapped supplier columns), cleaned+normalized
    let supplier: string | undefined = undefined;
    for (const si of mapping0.supplierCols) {
      const v = cleanDisplay(getCell(row, si));
      if (v) { supplier = normalizeSupplier(v) ?? v; break; }
    }

    // Price: use the locked price column only
    let priceSelected: number | null = null;
    let priceColumnUsed: string | undefined = undefined;
    if (priceColIdx != null) {
      const v = getCell(row, priceColIdx);
      const parsed = parsePrice(v);
      if (parsed != null) priceSelected = parsed;
      priceColumnUsed = hdrNorm[priceColIdx] || `col_${priceColIdx}`;
    }

    // Clean row object (fix encoding on strings)
    const rowObj: Record<string, any> = Object.fromEntries(
      headers.map((h, j: number) => {
        const val = getCell(row, j);
        return [h, typeof val === 'string' ? cleanDisplay(val) : val];
      })
    );

    // metadata from row (fallback when db.json doesn’t have it)
    const productName = extractFirstNonEmpty(row, nameCols);
    const formula = extractFirstNonEmpty(row, formulaCols);
    const lab = extractFirstNonEmpty(row, labCols);

    // Heuristic label for headerless/weird sheets
    const nameFromFile = guessProductName(rowObj);

    const match: MatchRow = {
      rowIndex: headerRowIdx + 1 + i,
      filename,
      sheetName,
      supplier,
      priceSelected,
      priceColumnUsed,
      priceCandidates:
        priceColIdx != null ? { [priceColumnUsed || `col_${priceColIdx}`]: priceSelected } : {},
      skuDetected: skuNorm,
      productName: productName ? cleanDisplay(productName) : undefined,
      formula: formula ? cleanDisplay(formula) : undefined,
      lab: lab ? cleanDisplay(lab) : undefined,
      nameFromFile,
      row: rowObj,
      selectionReason: priceColIdx != null ? 'keyword' : 'min', // approximate
    };

    matches.push(match);
  }

  const parseMs = Date.now() - t0;

  const priceChosenHeader =
    priceColIdx != null ? headers[priceColIdx] ?? `col_${priceColIdx}` : undefined;

  const fileResult: FileResult = {
    filename,
    sheetName,
    headerRow: headerRowIdx,
    mapping: {
      skuCols: skuColsIdx.map((i: number) => headers[i] ?? `col_${i}`),
      priceCols: priceColIdx != null ? [headers[priceColIdx] ?? `col_${priceColIdx}`] : [],
      priceColumnChosen: priceChosenHeader,   // ← NEW: chosen header (or undefined)
      priceColumnIndex: priceColIdx,          // ← NEW: chosen index (or null)
      priceColumnReason: priceColReason,      // ← NEW: 'header' | 'profile' | 'none'
      priceColumnScore: priceColScore,        // ← NEW: numeric score when profiled
      supplierCols: mapping0.supplierCols.map((i: number) => headers[i] ?? `col_${i}`),
      productNameCols: nameCols.map((i: number) => headers[i] ?? `col_${i}`),
      formulaCols: formulaCols.map((i: number) => headers[i] ?? `col_${i}`),
      labCols: labCols.map((i: number) => headers[i] ?? `col_${i}`),
      confidence: mapping0.confidence,
    },
    stats: { rowsScanned: scanned, matches: matches.length, parseMs },
    matches,
  };

  return fileResult;
}

/** Parse ALL sheets of a workbook for a single normalized SKU (12–14 digits). */
export function parseWorkbookForSkuAllSheets(buffer: Buffer, filename: string, skuNorm: string): FileResult[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const out: FileResult[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    out.push(parseSingleSheetForSku(ws, sheetName, filename, skuNorm));
  }
  return out;
}
