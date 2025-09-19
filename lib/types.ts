// lib/types.ts
export type PriceCandidates = Record<string, number | null>;

// lib/types.ts

export type MatchRow = {
  rowIndex: number;
  filename: string;
  sheetName?: string;
  supplier?: string;
  nameFromFile?: string;

  priceSelected: number | null;          // (unused now; keep for compatibility)
  priceColumnUsed?: string;              // (unused now; combine sets on output)
  priceCandidates: PriceCandidates;      // ← all candidate headers → values

  skuDetected: string;

  productName?: string;
  formula?: string;
  lab?: string;

  row: Record<string, unknown>;
  selectionReason?: 'band' | 'keyword' | 'min';
};


export type FileMapping = {
  skuCols: string[];
  priceCols: string[];
  supplierCols: string[];
  productNameCols?: string[];
  formulaCols?: string[];
  labCols?: string[];
  confidence: 'high' | 'med' | 'low';
};

export type FileStats = { rowsScanned: number; matches: number; parseMs: number };

export type FileResult = {
  filename: string;
  sheetName: string;
  headerRow: number;
  mapping: {
    skuCols: string[];
    priceCols: string[];

    // NEW: per-sheet candidate diagnostics
    priceCandidateColumns?: Array<{
      index: number;
      header: string;
      score?: number;
      headerHit?: boolean;
      headerIdLike?: boolean;
      currencyRate?: number;
      parseRate?: number;
      decimalRate?: number;
    }>;

    priceColumnChosen?: string;
    priceColumnIndex: number | null;
    priceColumnReason: 'header' | 'profile' | 'none' | 'consensus';
    priceColumnScore?: number;

    supplierCols: string[];
    productNameCols: string[];
    formulaCols: string[];
    labCols: string[];
    confidence: 'low' | 'med' | 'high';
  };
  stats: { rowsScanned: number; matches: number; parseMs: number };
  matches: MatchRow[];
};

// ---------- single-SKU response (used by /api/upload and the original page)
export type ConsensusBand = {
  median: number;
  low: number;
  high: number;
  sampleSize: number;
};

export type UploadResponse = {
  sku: string;
  skuNormalized: string;
  files: FileResult[]; // one per parsed sheet
  best: {
    supplier?: string;
    filename: string;
    price: number;
    source: { file: string; rowIndex: number; priceColumnUsed: string };
    tie?: Array<{ supplier?: string; filename: string; price: number }>;
  } | null;
  consensus?: ConsensusBand | null;
};

// ---------- combined catalog response (for /api/combine)
export type CombineCell = {
  filename: string;
  sheetName?: string;
  supplier?: string;
  price: number | null;
  priceColumnUsed?: string;
  rowIndex?: number;
  ref?: { fileIdx: number; matchIdx: number }; // to show diagnostics
};

export type CombineRow = {
  sku: string;
  productName?: string;
  formula?: string;
  lab?: string;
  prices: CombineCell[]; // in upload order (one per file)
  bestIndex?: number;    // index into prices[]
};

export type CombineResponse = {
  files: FileResult[]; // diagnostics source (one per sheet)
  matrix: CombineRow[]; // all SKUs found across files
};

