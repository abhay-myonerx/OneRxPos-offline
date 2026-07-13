import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ThemeMode, ResolvedTheme } from "@/lib/theme/theme";
import type { Locale } from "@/lib/i18n/locale";

interface UiPrefsState {
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  /** User's chosen theme: light, dark, or follow the OS. */
  themeMode: ThemeMode;
  /** Concrete theme currently painted (system resolved against the OS). */
  resolvedTheme: ResolvedTheme;
  /** User's chosen UI language. LocaleProvider applies it to i18next. */
  locale: Locale;
}

const initialState: UiPrefsState = {
  sidebarOpen: true,
  mobileSidebarOpen: false,
  themeMode: "system",
  resolvedTheme: "light",
  locale: "en",
};

const uiPrefsSlice = createSlice({
  name: "uiPrefs",
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    toggleMobileSidebar: (state) => {
      state.mobileSidebarOpen = !state.mobileSidebarOpen;
    },
    setMobileSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.mobileSidebarOpen = action.payload;
    },
    /** Set the user's theme preference. The ThemeProvider resolves + applies it. */
    setThemeMode: (state, action: PayloadAction<ThemeMode>) => {
      state.themeMode = action.payload;
    },
    /** Record the concrete theme the ThemeProvider has applied to the DOM. */
    setResolvedTheme: (state, action: PayloadAction<ResolvedTheme>) => {
      state.resolvedTheme = action.payload;
    },
    /** Set the user's UI language. The LocaleProvider applies + persists it. */
    setLocale: (state, action: PayloadAction<Locale>) => {
      state.locale = action.payload;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarOpen,
  toggleMobileSidebar,
  setMobileSidebarOpen,
  setThemeMode,
  setResolvedTheme,
  setLocale,
} = uiPrefsSlice.actions;
export default uiPrefsSlice.reducer;
