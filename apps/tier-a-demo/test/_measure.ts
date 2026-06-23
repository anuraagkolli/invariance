// Inline WCAG measurement of an emitted bare HSL triple "H S% L%". This probe measures the engine's
// output to make a PRODUCT decision; it is not an independence check, so standard WCAG math is fine.
export function hslTripleToSrgb(triple: string): [number, number, number] {
  const [h, s, l] = triple.trim().split(/\s+/).map((t) => parseFloat(t));
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hh = ((h % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = L - c / 2;
  let rgb: [number, number, number];
  if (hh < 60) rgb = [c, x, 0];
  else if (hh < 120) rgb = [x, c, 0];
  else if (hh < 180) rgb = [0, c, x];
  else if (hh < 240) rgb = [0, x, c];
  else if (hh < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}
export function luminance(triple: string): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = hslTripleToSrgb(triple).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return Math.max(la, lb) / Math.min(la, lb);
}
export function lightnessPct(triple: string): number {
  return parseFloat(triple.trim().split(/\s+/)[2]); // the L% token
}
