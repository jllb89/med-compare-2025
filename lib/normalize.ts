export const digitsOnly = (s: unknown): string => {
  if (s == null) return '';
  if (typeof s === 'number' && Number.isFinite(s)) {
    return Math.trunc(s).toString();
  }
  let str = String(s).trim();
  // scientific notation like "7.502216803657e+12"
  if (/^-?\d+(\.\d+)?e[+]\d+$/i.test(str)) {
    const n = Number(str);
    if (Number.isFinite(n)) return Math.trunc(n).toString();
  }
  return str.replace(/\D+/g, '');
};

export const normalizeHeader = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const looksLikeGtin = (s: unknown): boolean => {
  const d = digitsOnly(s);
  return d.length >= 12 && d.length <= 14;
};
