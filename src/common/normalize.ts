export const normalizeDominio = (d: string) =>
  d
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
