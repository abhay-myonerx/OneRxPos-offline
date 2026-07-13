import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { I18nextProvider } from "react-i18next";
import uiPrefs from "@/features/settings/state/ui-prefs.slice";
import i18n from "@/lib/i18n/i18n";
import { LocaleSwitcher } from "../LocaleSwitcher";

function renderSwitcher() {
  const store = configureStore({ reducer: { uiPrefs } });
  render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <LocaleSwitcher />
      </I18nextProvider>
    </Provider>,
  );
  return store;
}

describe("LocaleSwitcher", () => {
  it("switches the store locale to fr when FR is chosen", async () => {
    const store = renderSwitcher();
    await userEvent.click(screen.getByRole("button", { name: /français/i }));
    expect(store.getState().uiPrefs.locale).toBe("fr");
  });
  it("switches back to en when EN is chosen", async () => {
    const store = renderSwitcher();
    await userEvent.click(screen.getByRole("button", { name: /english/i }));
    expect(store.getState().uiPrefs.locale).toBe("en");
  });
});
