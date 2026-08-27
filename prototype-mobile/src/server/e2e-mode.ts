const state = globalThis as typeof globalThis & { ihealthE2EFavorites?: Map<string, { objectId: string; updatedAt: string; deleted: boolean }> };

export function e2eMode() {
  return process.env.NODE_ENV !== "production" && process.env.IHEALTH_E2E_MODE === "1";
}

export function e2eFavorites() {
  state.ihealthE2EFavorites ??= new Map();
  return state.ihealthE2EFavorites;
}
