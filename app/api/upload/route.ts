import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { digitsOnly } from '@/lib/normalize';
import { parseWorkbookForSkuAllSheets } from '@/lib/parseSheet';
import { computeConsensusBand, refineSelectionsWithBand } from '@/lib/consensus';
import type { UploadResponse } from '@/lib/types';

function toBuffer(file: File): Promise<Buffer> {
  return file.arrayBuffer().then((ab) => Buffer.from(ab));
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const skuRaw = String(form.get('sku') ?? '').trim();
    const files = form.getAll('files').filter(Boolean) as File[];

    if (!skuRaw) return NextResponse.json({ error: 'Missing sku' }, { status: 400 });
    if (!files.length) return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });

    const skuNormalized = digitsOnly(skuRaw);
    if (skuNormalized.length < 12 || skuNormalized.length > 14) {
      return NextResponse.json({ error: 'SKU must be 12–14 digits (UPC/EAN/GTIN).' }, { status: 400 });
    }

    const allResults = await Promise.all(
      files.map(async (f) => {
        const buf = await toBuffer(f);
        return parseWorkbookForSkuAllSheets(buf, f.name, skuNormalized);
      })
    );

    const flatResults = allResults.flat();

    // Cross-file consensus band and refinement
    const band = computeConsensusBand(flatResults);
    refineSelectionsWithBand(flatResults, band);

    // Best price across suppliers
    const supplierBest = new Map<string, { price: number; filename: string; rowIndex: number; col: string }>();
    for (const fr of flatResults) {
      for (const m of fr.matches) {
        if (m.priceSelected == null) continue;
        const key = (m.supplier?.trim() || `${fr.filename}${fr.sheetName ? ` (${fr.sheetName})` : ''}`);
        const prev = supplierBest.get(key);
        if (!prev || m.priceSelected < prev.price) {
          supplierBest.set(key, {
            price: m.priceSelected,
            filename: `${fr.filename}${fr.sheetName ? ` (${fr.sheetName})` : ''}`,
            rowIndex: m.rowIndex,
            col: m.priceColumnUsed || '',
          });
        }
      }
    }

    let best: UploadResponse['best'] = null;
    if (supplierBest.size) {
      const sorted = [...supplierBest.entries()].sort((a, b) => a[1].price - b[1].price);
      const [topKey, topVal] = sorted[0];
      const ties = sorted
        .filter(([, v]) => v.price === topVal.price)
        .map(([k, v]) => ({ supplier: k, filename: v.filename, price: v.price }));
      best = {
        supplier: topKey,
        filename: topVal.filename,
        price: topVal.price,
        source: { file: topVal.filename, rowIndex: topVal.rowIndex, priceColumnUsed: topVal.col },
        tie: ties.length > 1 ? ties : undefined,
      };
    }

    const payload: UploadResponse = {
      sku: skuRaw,
      skuNormalized,
      files: flatResults,
      best,
      consensus: band ?? null,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    console.error('UPLOAD_ERROR', e);
    return NextResponse.json({ error: 'Failed to parse files', detail: String(e?.message || e) }, { status: 500 });
  }
}
