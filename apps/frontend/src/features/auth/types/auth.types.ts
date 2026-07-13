import { Role } from "@/types/enums/role.enums";
import { TenantPlan } from "@/types/enums/status.enums";

export interface UserPreferences {
  languagePreference?: string;
  themePreference?: "light" | "dark" | "system";
  [key: string]: unknown;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  storeId?: string | null;
  storeIds?: string[]; // For users with access to multiple stores.
  permissions?: string[];

  preferences?: UserPreferences;

  employeeId?: string | null;
}

// Mirrors the backend's `shared/settings/discount-caps.ts` `RoleCaps` shape
// (duplicated on the frontend the same way `pos/helpers/discount-cap.ts`
// already does) — kept local to `auth` rather than importing from the `pos`
// feature so auth doesn't reach into a sibling feature for a type.
export interface DiscountCap {
  percent: number | null;
  flat: number | null;
}
export type RoleCaps = Record<string, DiscountCap>;

export interface AuthTenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  /** ISO 4217 currency code — from tenant settings. */
  currency?: string;
  /** Currency symbol (e.g. "$", "৳"). */
  currencySymbol?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  // refreshToken intentionally omitted — set as HTTP-only cookie server-side.
  user: AuthUser;
  tenant: AuthTenant;
  isDemoMode: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  tenant: AuthTenant | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  isDemoMode: boolean;
}
