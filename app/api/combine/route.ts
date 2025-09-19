// app/api/combine/route.ts
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { parseWorkbookAllSkusAllSheets } from '@/lib/parseAll';
import type { CombineResponse, CombineRow, CombineCell, FileResult } from '@/lib/types';
import { digitsOnly } from '@/lib/normalize';
import { cleanDisplay, guessProductName } from '@/lib/text';

// Import array JSON and index it
import SKU_ARRAY from '@/data/db.json';
type DbRow = { SKU: string; ProductName?: string; Formula?: string; Lab?: string };
type SkuMeta = { productName?: string; formula?: string; lab?: string };

// Build SKU -> meta dictionary (normalize to digits) with cleaned strings
const SKU_INDEX: Record<string, SkuMeta> = Array.isArray(SKU_ARRAY)
  ? (SKU_ARRAY as DbRow[]).reduce<Record<string, SkuMeta>>((acc, row) => {
      const key = digitsOnly(row.SKU);
      if (!key) return acc;
      acc[key] = {
        productName: cleanDisplay(row.ProductName),
        formula: cleanDisplay(row.Formula),
        lab: cleanDisplay(row.Lab),
      };
      return acc;
    }, {})
  : {};

const getDbMeta = (sku: string): SkuMeta | undefined => SKU_INDEX[sku];

const toBuffer = (file: File) => file.arrayBuffer().then((ab) => Buffer.from(ab));

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter(Boolean) as File[];
    if (!files.length) return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });

    // Parse all files once
    const buffers = await Promise.all(files.map(toBuffer));
    const resultsPerFile: FileResult[][] = [];
    for (let i = 0; i < files.length; i++) {
      const r = parseWorkbookAllSkusAllSheets(buffers[i], files[i].name);
      resultsPerFile.push(r);
    }
    const allFileResults: FileResult[] = resultsPerFile.flat();

    // Decide a consistent price header per sheet (stable across all SKUs)
    // Keyed by `${fileIdx}:${sheetIdx}` -> normalized header string
    const chosenHeaderBySheet = new Map<string, string>();
    const sheetKey = (fi: number, si: number) => `${fi}:${si}`;

    for (let fIdx = 0; fIdx < resultsPerFile.length; fIdx++) {
      const fileSheets = resultsPerFile[fIdx];
      for (let sIdx = 0; sIdx < fileSheets.length; sIdx++) {
        const fr = fileSheets[sIdx];
        const counts = new Map<string, number>();

        // Prefer columns that were explicitly chosen per-row
        for (const m of fr.matches) {
          const h = m.priceColumnUsed;
          if (h && m.priceSelected != null) counts.set(h, (counts.get(h) || 0) + 1);
        }

        // If no explicit selections, use candidate presence as a signal
        if (counts.size === 0) {
          for (const m of fr.matches) {
            for (const [h, v] of Object.entries(m.priceCandidates || {})) {
              if (v != null) counts.set(h, (counts.get(h) || 0) + 1);
            }
          }
        }

        const chosen = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (chosen) {
          chosenHeaderBySheet.set(sheetKey(fIdx, sIdx), chosen);
          // annotate for diagnostics
          fr.mapping.priceColumnChosen = chosen;
          fr.mapping.priceColumnReason = 'consensus';
        }
      }
    }

    // Gather all SKUs found
    const skuSet = new Set<string>();
    for (const fr of allFileResults) for (const m of fr.matches) skuSet.add(m.skuDetected);
    const allSkus = Array.from(skuSet).sort();

    // Build rows ordered by SKU; per-file min price (or empty if missing)
    const matrix: CombineRow[] = allSkus.map((sku) => {
      const dbMeta = getDbMeta(sku);

      const row: CombineRow = {
        sku,
        productName: dbMeta?.productName,
        formula: dbMeta?.formula,
        lab: dbMeta?.lab,
        prices: [],
      };

      // If DB missing any, fallback to first seen in files (cleaned)
      if (!row.productName || !row.formula || !row.lab) {
        outer: for (const fr of allFileResults) {
          for (const hit of fr.matches) {
            if (hit.skuDetected !== sku) continue;
            row.productName ||= cleanDisplay(hit.productName) || cleanDisplay(hit.nameFromFile) || guessProductName(hit.row) || undefined;
            row.formula ||= cleanDisplay(hit.formula);
            row.lab ||= cleanDisplay(hit.lab);
            if (row.productName && row.formula && row.lab) break outer;
          }
        }
      }
      // Final guarantee: never show SKU in the name cell; fallback to '(sin nombre)'
      if (!row.productName || /^\d{8,}$/.test(String(row.productName))) {
        row.productName = '(sin nombre)';
      }

      for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const fileName = files[fIdx].name;
        const fileSheets = resultsPerFile[fIdx];

        let best: { price: number; cell: CombineCell } | null = null;

        for (let sIdx = 0; sIdx < fileSheets.length; sIdx++) {
          const fr = fileSheets[sIdx];
          const chosenHeader = chosenHeaderBySheet.get(sheetKey(fIdx, sIdx));
          for (let mIdx = 0; mIdx < fr.matches.length; mIdx++) {
            const match = fr.matches[mIdx];
            if (match.skuDetected !== sku) continue;

            // Enforce the chosen header per sheet; fallback to row-selected if absent
            const enforced = chosenHeader ? match.priceCandidates?.[chosenHeader] ?? null : null;
            const p = (enforced != null ? enforced : match.priceSelected) ?? null;
            const used = enforced != null ? chosenHeader! : match.priceColumnUsed;

            const cell: CombineCell = {
              filename: fileName,
              sheetName: fr.sheetName,
              supplier: cleanDisplay(match.supplier),
              price: p,
              priceColumnUsed: used,
              rowIndex: match.rowIndex,
              ref: { fileIdx: allFileResults.indexOf(fr), matchIdx: mIdx },
            };

            if (p != null) {
              if (!best || p < best.price) best = { price: p, cell };
            } else if (!best) {
              best = { price: Infinity, cell };
            }
          }
        }

        row.prices.push(best ? best.cell : { filename: fileName, price: null });
      }

      // Best price index (bold)
      let bestIdx: number | undefined = undefined;
      let bestPrice = Number.POSITIVE_INFINITY;
      row.prices.forEach((c, idx) => {
        if (c.price != null && c.price < bestPrice) { bestPrice = c.price; bestIdx = idx; }
      });
      row.bestIndex = bestIdx;

      return row;
    });

    const payload: CombineResponse = { files: allFileResults, matrix };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error('COMBINE_ERROR', e);
    return NextResponse.json({ error: 'Failed to combine files', detail: String(e?.message || e) }, { status: 500 });
  }
}
