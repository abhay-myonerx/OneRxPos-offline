import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { AuthState, AuthUser, AuthTenant } from "@/features/auth/types/auth.types";
import { TokenManager } from "@/lib/api/token-manager";

const initialState: AuthState = {
  accessToken: null,
  user: null,
  tenant: null,
  isAuthenticated: false,
  isHydrated: false,
  isDemoMode: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<{
        accessToken: string;
        user: AuthState["user"];
        tenant: AuthState["tenant"];
        isDemoMode?: boolean;
      }>,
    ) => {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.tenant = action.payload.tenant;
      state.isAuthenticated = true;
      state.isHydrated = true;
      state.isDemoMode = action.payload.isDemoMode ?? false;

      TokenManager.setAccessToken(action.payload.accessToken);

      if (action.payload.user) TokenManager.setUser(action.payload.user);
      if (action.payload.tenant) TokenManager.setTenant(action.payload.tenant);
    },

    logout: (state) => {
      state.accessToken = null;
      state.user = null;
      state.tenant = null;
      state.isAuthenticated = false;
      state.isHydrated = true;
      state.isDemoMode = false;
      TokenManager.clearAll();
    },

    // Restore auth state from localStorage on app boot.
    // isAuthenticated is set optimistically from stored data;
    // the dashboard layout calls /auth/me to verify with the server
    // and will call logout() + redirect if the token is invalid.
    hydrateAuth: (state) => {
      const user = TokenManager.getUser<AuthUser>();
      const tenant = TokenManager.getTenant<AuthTenant>();

      state.user = user;
      state.tenant = tenant;
      state.isAuthenticated = !!user;
      state.isHydrated = true;
    },
  },
});

export const { setCredentials, logout, hydrateAuth } = authSlice.actions;
export default authSlice.reducer;
