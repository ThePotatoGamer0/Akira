/** Base art first, then other editions by name. Lookup and collection filters share this order. */
export function editionOrder<T extends { id: string; name: string }>(variants: T[]): T[] {
  return variants.slice().sort((a, b) => {
    const base = Number(b.id.endsWith("-base")) - Number(a.id.endsWith("-base"));
    if (base !== 0) return base;
    return a.name.localeCompare(b.name);
  });
}

/** Zero-based index. A missing variant stays on the first edition. */
export function editionIndexForVariant<T extends { id: string; name: string }>(variants: T[], variantId: string): number {
  const index = editionOrder(variants).findIndex((variant) => variant.id === variantId);
  return index < 0 ? 0 : index;
}

/** One-based edition number. A missing variant is 0 so it matches no `e:` filter. */
export function editionNumber<T extends { id: string; name: string }>(variants: T[], variantId: string): number {
  const index = editionOrder(variants).findIndex((variant) => variant.id === variantId);
  return index < 0 ? 0 : index + 1;
}
