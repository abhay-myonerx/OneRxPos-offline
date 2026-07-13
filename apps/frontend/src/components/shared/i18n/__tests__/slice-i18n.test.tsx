import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { I18nextProvider } from "react-i18next";
import uiPrefs from "@/features/settings/state/ui-prefs.slice";
import i18n from "@/lib/i18n/i18n";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";

function wrap(ui: React.ReactNode) {
  const store = configureStore({ reducer: { uiPrefs } });
  return render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>{ui}</MemoryRouter>
      </I18nextProvider>
    </Provider>,
  );
}

describe("slice i18n", () => {
  beforeEach(async () => await i18n.changeLanguage("en"));

  it("Empty shows English defaults", () => {
    wrap(<Empty />);
    expect(screen.getByText("No data")).toBeInTheDocument();
  });
  it("Empty shows French defaults after switch", async () => {
    await i18n.changeLanguage("fr");
    wrap(<Empty />);
    expect(screen.getByText("Aucune donnée")).toBeInTheDocument();
  });
  it("ErrorDisplay shows the localized retry action in French", async () => {
    await i18n.changeLanguage("fr");
    wrap(<ErrorDisplay onRetry={() => {}} />);
    expect(screen.getByText("Réessayer")).toBeInTheDocument();
  });
});
