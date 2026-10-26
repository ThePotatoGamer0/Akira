import type { Me } from "../types/index.js";
import { collectionOrder, type CollectionOrder } from "./collectionView.js";

function orderKey(userId: string): string {
  return `akira.collection.order.${userId}`;
}

function scrollKey(userId: string): string {
  return `akira.collection.scroll.${userId}`;
}

export function readLocalCollectionOrder(userId: string): CollectionOrder | null {
  try {
    const raw = localStorage.getItem(orderKey(userId));
    return raw ? collectionOrder(raw) : null;
  } catch {
    return null;
  }
}

export function writeLocalCollectionOrder(userId: string, value: CollectionOrder): void {
  try {
    localStorage.setItem(orderKey(userId), value);
  } catch {
    /* private mode */
  }
}

export function readLocalContinuousScroll(userId: string): boolean | null {
  try {
    const raw = localStorage.getItem(scrollKey(userId));
    if (raw === "on") return true;
    if (raw === "off") return false;
    return null;
  } catch {
    return null;
  }
}

export function writeLocalContinuousScroll(userId: string, value: boolean): void {
  try {
    localStorage.setItem(scrollKey(userId), value ? "on" : "off");
  } catch {
    /* private mode */
  }
}

export function applyCollectionPrefs(me: Me): Me {
  return {
    ...me,
    collectionOrder: readLocalCollectionOrder(me.id) ?? collectionOrder(me.collectionOrder),
    continuousScroll: readLocalContinuousScroll(me.id) ?? me.continuousScroll === true,
    seriesTitle: me.seriesTitle === "romaji" ? "romaji" : "english",
  };
}

export function writeCollectionPrefs(
  userId: string,
  patch: { collectionOrder?: string; continuousScroll?: boolean; seriesTitle?: string },
): void {
  if (patch.collectionOrder) writeLocalCollectionOrder(userId, collectionOrder(patch.collectionOrder));
  if (typeof patch.continuousScroll === "boolean") writeLocalContinuousScroll(userId, patch.continuousScroll);
}
