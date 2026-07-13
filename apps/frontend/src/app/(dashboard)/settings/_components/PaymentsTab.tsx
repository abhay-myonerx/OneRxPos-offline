/**
 * Payment processors settings. Lists every supported acquirer behind the one
 * semi-integrated terminal interface, with honest readiness so the operator
 * knows what each needs to go live. Selecting + entering credentials for a live
 * processor (and closing the checkout persistence gap) is the follow-on payment
 * phase; card data never touches the app at any point (semi-integrated).
 */
import { CreditCard, ShieldCheck } from "lucide-react";
import { useGetPaymentProvidersQuery } from "@/features/pos/payment-terminal.api";
import { SectionTitle, SettingsCard, InfoBanner } from "./shared";

const READINESS: Record<string, { label: string; cls: string }> = {
  ready: {
    label: "Ready",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  configurable: {
    label: "Configurable",
    cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  "sdk-required": {
    label: "Needs device SDK",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
};

export function PaymentsTab() {
  const { data, isLoading } = useGetPaymentProvidersQuery();
  const providers = data?.providers ?? [];
  const active = data?.active ?? "mock";

  return (
    <div className="space-y-6">
      <SettingsCard>
        <SectionTitle
          icon={<CreditCard className="h-4 w-4" />}
          title="Payment processors"
          description="Card/debit terminals behind one semi-integrated interface — card data never touches the app."
        />

        <InfoBanner
          icon={<ShieldCheck className="h-4 w-4" />}
          title={`Active processor: ${active}`}
          description={
            "“Ready” works now (mock, for testing). “Configurable” acquirers work through the HTTP " +
            "semi-integrated adapter once you enter their gateway URL + credentials and verify the " +
            "mapping against their sandbox — production still needs the processor’s certification " +
            "(Interac certification is rigorous). “Needs device SDK” processors are driven by a " +
            "Bluetooth/cloud reader SDK (a native integration)."
          }
        />

        {isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading processors…</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 pr-4 font-medium">Processor</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Regions</th>
                  <th className="py-2 pr-4 font-medium">Connections</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => {
                  const r = READINESS[p.readiness] ?? READINESS.configurable;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-slate-100 dark:border-slate-800 align-top"
                    >
                      <td className="py-2 pr-4">
                        <div className="font-medium text-slate-800 dark:text-slate-100">
                          {p.label}
                          {p.id === active && (
                            <span className="ml-2 text-xs text-primary-600">(active)</span>
                          )}
                        </div>
                        {p.notes && (
                          <div className="text-xs text-slate-500 mt-0.5 max-w-md">{p.notes}</div>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${r.cls}`}>
                          {r.label}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                        {p.regions.join(", ")}
                      </td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                        {p.connectionModels.join(", ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
