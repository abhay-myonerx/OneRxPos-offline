import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ThemeMode, ResolvedTheme } from "@/lib/theme/theme";
import type { Locale } from "@/lib/i18n/locale";

interface UiPrefsState {
  mobileSidebarOpen: boolean;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  locale: Locale;
}

const initialState: UiPrefsState = {
  mobileSidebarOpen: false,
  themeMode: "system",
  resolvedTheme: "light",
  locale: "en",
};

const uiPrefsSlice = createSlice({
  name: "uiPrefs",
  initialState,
  reducers: {
    toggleMobileSidebar: (state) => {
      state.mobileSidebarOpen = !state.mobileSidebarOpen;
    },

    setMobileSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.mobileSidebarOpen = action.payload;
    },

    setThemeMode: (state, action: PayloadAction<ThemeMode>) => {
      state.themeMode = action.payload;
    },

    setResolvedTheme: (state, action: PayloadAction<ResolvedTheme>) => {
      state.resolvedTheme = action.payload;
    },

    setLocale: (state, action: PayloadAction<Locale>) => {
      state.locale = action.payload;
    },
  },
});

export const {
  toggleMobileSidebar,
  setMobileSidebarOpen,
  setThemeMode,
  setResolvedTheme,
  setLocale,
} = uiPrefsSlice.actions;

export default uiPrefsSlice.reducer;
