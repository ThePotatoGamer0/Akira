export type ShopItem = {
  id: string;
  name: string;
  description: string;
  priceBits: number;
  durationHours: number | null;
};

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "drop_booster",
    name: "Drop rate booster",
    description: "Akira nudges fortune so drops feel a little kinder for a while.",
    priceBits: 400,
    durationHours: 24,
  },
  {
    id: "grab_shield",
    name: "Grab protection",
    description: "A short window where grabs cost you less stress - perfect for busy days.",
    priceBits: 350,
    durationHours: 12,
  },
  {
    id: "burn_bonus",
    name: "Burn value booster",
    description: "Bits from burns sing a little sweeter until this buff fades.",
    priceBits: 300,
    durationHours: 24,
  },
];
