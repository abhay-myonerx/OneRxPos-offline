import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import uiPrefs, { setLocale } from "@/features/settings/state/ui-prefs.slice";
import { LocaleProvider } from "../LocaleProvider";
import { LOCALE_STORAGE_KEY } from "@/lib/i18n/locale-storage";
import i18n from "@/lib/i18n/i18n";

function makeStore() {
  return configureStore({ reducer: { uiPrefs } });
}

describe("LocaleProvider", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage("en");
  });

  it("applies the store locale to i18next and <html lang>", async () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <LocaleProvider>
          <span>child</span>
        </LocaleProvider>
      </Provider>,
    );
    await act(async () => {
      store.dispatch(setLocale("fr"));
    });
    expect(i18n.language).toBe("fr");
    expect(document.documentElement.lang).toBe("fr-CA");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
  });
});
