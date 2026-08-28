export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60_000;
export const DUMMY_PASSWORD_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`;

export class PasswordVerificationBusyError extends Error {
  constructor() {
    super("密码验证并发已满");
    this.name = "PasswordVerificationBusyError";
  }
}

export class VerificationGate {
  #active = 0;
  #maximum;

  constructor(maximum = 2) {
    this.#maximum = Number.isSafeInteger(maximum) && maximum > 0 ? maximum : 2;
  }

  async run(work) {
    if (this.#active >= this.#maximum) throw new PasswordVerificationBusyError();
    this.#active += 1;
    try { return await work(); }
    finally { this.#active -= 1; }
  }
}

export class SourceAttemptLimiter {
  #entries = new Map();
  #maxAttempts;
  #windowMs;
  #maxKeys;

  constructor({ maxAttempts = LOGIN_MAX_FAILURES, windowMs = LOGIN_WINDOW_MS, maxKeys = 4_096 } = {}) {
    this.#maxAttempts = maxAttempts;
    this.#windowMs = windowMs;
    this.#maxKeys = maxKeys;
  }

  get size() { return this.#entries.size; }

  #prune(now) {
    for (const [key, state] of this.#entries) {
      if (state.resetAt <= now) this.#entries.delete(key);
    }
  }

  allowed(key, now = Date.now()) {
    this.#prune(now);
    return (this.#entries.get(key)?.count ?? 0) < this.#maxAttempts;
  }

  recordFailure(key, now = Date.now()) {
    this.#prune(now);
    const current = this.#entries.get(key);
    if (current) {
      current.count += 1;
      return;
    }
    while (this.#entries.size >= this.#maxKeys) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
    this.#entries.set(key, { count: 1, resetAt: now + this.#windowMs });
  }

  recordSuccess(_key, now = Date.now()) { this.#prune(now); }
}

export function effectiveClientAddress(request) {
  return request.headers.get("x-realfood-client-ip")?.trim() || "local";
}
