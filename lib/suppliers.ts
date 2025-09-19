// lib/suppliers.ts
const ALIASES: Record<string, string> = {
  'ACME SA': 'ACME',
  'ACME S.A.': 'ACME',
  'ACME, SA': 'ACME',
  'ACME, S.A.': 'ACME',
  'ACME S.A DE C.V': 'ACME',
  'ACME SA DE CV': 'ACME',
  'ACME S.A. DE C.V.': 'ACME',
  // add more known aliases here...
};

function clean(s: string) {
  return s
    .normalize('NFKD')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function normalizeSupplier(input?: string | null) {
  if (!input) return undefined;
  const raw = input.trim();
  if (!raw) return undefined;
  const key = clean(raw);
  const exact = ALIASES[key];
  if (exact) return exact;
  // fallback: collapse forms like "S.A. de C.V."
  const soft = key.replace(/\bSA\b|\bS A\b|\bS\.A\.\b/gi, 'SA').replace(/\bDE CV\b|\bDE C V\b/gi, 'DE CV');
  return ALIASES[soft] ?? raw; // return canonical if known, else original string
}
