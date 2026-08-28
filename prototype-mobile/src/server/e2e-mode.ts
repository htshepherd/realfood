type E2EAccount = { accountId: string; username: string; displayName: string };
const state = globalThis as typeof globalThis & {
  ihealthE2EFavorites?: Map<string, Map<string, { objectId: string; updatedAt: string; deleted: boolean }>>;
  ihealthE2ESessions?: Map<string, E2EAccount>;
};

export const E2E_ACCOUNTS = [
  { accountId: "00000000-0000-0000-0000-000000000001", username: "admin", displayName: "管理员", password: "999999" },
  { accountId: "00000000-0000-0000-0000-000000000002", username: "family", displayName: "家庭成员", password: "888888" },
];

export function e2eMode() {
  return process.env.NODE_ENV !== "production" && process.env.IHEALTH_E2E_MODE === "1";
}

export function registerE2ESession(tokenHash: string, account: E2EAccount) {
  state.ihealthE2ESessions ??= new Map();
  state.ihealthE2ESessions.set(tokenHash, account);
}

export function e2eSession(tokenHash: string) { return state.ihealthE2ESessions?.get(tokenHash) ?? null; }
export function deleteE2ESession(tokenHash: string) { state.ihealthE2ESessions?.delete(tokenHash); }

export function e2eFavorites(accountId: string) {
  state.ihealthE2EFavorites ??= new Map();
  let favorites = state.ihealthE2EFavorites.get(accountId);
  if (!favorites) { favorites = new Map(); state.ihealthE2EFavorites.set(accountId, favorites); }
  return favorites;
}
