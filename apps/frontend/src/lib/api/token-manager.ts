const USER_KEY = "pos_user";
const TENANT_KEY = "pos_tenant";

let _accessToken: string | null = null;

export const TokenManager = {
  getAccessToken: (): string | null => _accessToken,

  setAccessToken: (token: string): void => {
    _accessToken = token;
  },

  clearAccessToken: (): void => {
    _accessToken = null;
  },

  // These are not authentication secrets — safe in localStorage.
  // They let us show names/plan instantly on reload without an API round-trip.
  setUser: (user: unknown): void => {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  getUser: <T>(): T | null => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setTenant: (tenant: unknown): void => {
    localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
  },

  getTenant: <T>(): T | null => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(TENANT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  clearAll: (): void => {
    _accessToken = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TENANT_KEY);
    }
  },
};
