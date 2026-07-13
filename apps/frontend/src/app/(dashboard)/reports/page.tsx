"use client";

import { useState } from "react";
import { BarChart3, TrendingUp, Warehouse, Users, Download, ShieldAlert, Pill, Layers, Wallet } from "lucide-react";
import { ArAgingReport } from "@/features/reports/components/ArAgingReport";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import {
  useGetSalesReportQuery,
  useGetProfitReportQuery,
  useGetStockReportQuery,
  useGetCashierReportQuery,
  useGetNarcoticReportQuery,
  useGetRxSalesReportQuery,
  useGetScheduleBreakdownQuery,
} from "@/features/reports/api/reports.api";
import { usePharmacyEnabled } from "@/features/pharmacy/useSectorEnabled";
import { formatMoney } from "@/lib/currency/format-money";
import { todayISO, thirtyDaysAgoISO } from "@/lib/date/format-date";
import { TokenManager } from "@/lib/api/token-manager";
import { showApiError } from "@/lib/api/error-handler";
import { useAppSelector } from "@/store/hooks";
import { env } from "@/shell/env";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#233699", "#02BCF5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
type Tab = "sales" | "profit" | "stock" | "cashier" | "ar-aging" | "narcotic" | "rx-sales" | "schedules";
const SCHEDULE_LABELS: Record<string, string> = {
  NEEDS_RX: "Rx-required",
  NARCOTIC: "Narcotic",
  BEHIND_COUNTER: "Behind-counter",
  OPEN: "OTC / open",
};

// Each sub-report fires its own RTK-Query hook. The date range controls
// are intentionally hidden for the Stock tab because the stock report
// reflects current on-hand levels, not a time-windowed aggregate.

const API_BASE = env.apiUrl;

// CSV download is done with a raw fetch rather than RTK-Query because
// the response is a binary blob that needs to be streamed into a <a>
// click — RTK cannot handle non-JSON responses natively.
async function downloadCSV(path: string, filename: string, params?: Record<string, string>) {
  const token = TokenManager.getAccessToken();
  const query = params ? `?${new URLSearchParams(params)}` : "";
  const res = await fetch(`${API_BASE}${path}${query}`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Business reports hub: Sales, Profit, Stock, and Cashier tabs.
 * A shared date-range picker drives the time-windowed tabs; the Stock tab hides
 * it since stock reflects current state. CSV export calls the backend export
 * endpoints directly with a bearer token rather than going through RTK-Query,
 * because the response is a raw binary blob, not JSON.
 */
export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales");
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgoISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [isExporting, setIsExporting] = useState(false);
  const isDark = useAppSelector((s) => s.uiPrefs.resolvedTheme) === "dark";
  const pharmacyEnabled = usePharmacyEnabled();

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "sales", label: "Sales", icon: <BarChart3 className="h-4 w-4" /> },
    { key: "profit", label: "Profit", icon: <TrendingUp className="h-4 w-4" /> },
    { key: "stock", label: "Stock", icon: <Warehouse className="h-4 w-4" /> },
    { key: "cashier", label: "Cashier", icon: <Users className="h-4 w-4" /> },
    { key: "ar-aging", label: "AR Aging", icon: <Wallet className="h-4 w-4" /> },
    // Pharmacy reports (Phase 2.5) — only when the pharmacy sector is enabled.
    ...(pharmacyEnabled
      ? ([
          { key: "narcotic", label: "Narcotic", icon: <ShieldAlert className="h-4 w-4" /> },
          { key: "rx-sales", label: "Rx Sales", icon: <Pill className="h-4 w-4" /> },
          { key: "schedules", label: "Schedules", icon: <Layers className="h-4 w-4" /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[])
      : []),
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (tab === "sales") {
        await downloadCSV("/reports/export/sales", `sales-${dateFrom}-${dateTo}.csv`, {
          dateFrom,
          dateTo,
        });
      } else if (tab === "profit") {
        await downloadCSV("/reports/export/profit", `profit-${dateFrom}-${dateTo}.csv`, {
          dateFrom,
          dateTo,
        });
      } else if (tab === "stock") {
        await downloadCSV("/reports/export/stock", "stock-report.csv");
      } else if (tab === "cashier") {
        await downloadCSV("/reports/export/cashier", `cashier-${dateFrom}-${dateTo}.csv`, {
          dateFrom,
          dateTo,
        });
      } else if (tab === "narcotic") {
        await downloadCSV("/reports/pharmacy/export/narcotic", `narcotic-${dateFrom}-${dateTo}.csv`, {
          dateFrom,
          dateTo,
        });
      } else if (tab === "rx-sales") {
        await downloadCSV("/reports/pharmacy/export/rx-sales", `rx-sales-${dateFrom}-${dateTo}.csv`, {
          dateFrom,
          dateTo,
        });
      } else if (tab === "schedules") {
        await downloadCSV("/reports/pharmacy/export/schedules", `schedules-${dateFrom}-${dateTo}.csv`, {
          dateFrom,
          dateTo,
        });
      }
    } catch (err) {
      showApiError(err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <PageHeader title="Reports" description="Business analytics and insights" />

      <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-wrap">
        {/* Tab strip — scrollable on small screens */}
        <div className="flex gap-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-1 overflow-x-auto shrink-0">
          {tabs.map((t) => (
            <Button
              key={t.key}
              variant={tab === t.key ? "primary" : "ghost"}
              size="sm"
              onClick={() => setTab(t.key)}
              icon={t.icon}
              className="whitespace-nowrap"
            >
              {t.label}
            </Button>
          ))}
        </div>

        {/* Filters + export */}
        <div className="flex gap-2 sm:ml-auto items-center flex-wrap">
          {tab !== "stock" && (
            <>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[148px] sm:w-[160px]"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[148px] sm:w-[160px]"
              />
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            loading={isExporting}
            icon={<Download className="h-4 w-4" />}
            className="whitespace-nowrap"
          >
            Export CSV
          </Button>
        </div>
      </div>

      {tab === "sales" && <SalesReport dateFrom={dateFrom} dateTo={dateTo} isDark={isDark} />}
      {tab === "profit" && <ProfitReport dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === "stock" && <StockReport />}
      {tab === "cashier" && <CashierReport dateFrom={dateFrom} dateTo={dateTo} isDark={isDark} />}
      {tab === "ar-aging" && <ArAgingReport />}
      {tab === "narcotic" && <NarcoticReport dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === "rx-sales" && <RxSalesReport dateFrom={dateFrom} dateTo={dateTo} isDark={isDark} />}
      {tab === "schedules" && <ScheduleReport dateFrom={dateFrom} dateTo={dateTo} />}
    </>
  );
}

// ── Pharmacy reports (Phase 2.5) ──────────────────────────────────────────────

function NarcoticReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading } = useGetNarcoticReportQuery({ dateFrom, dateTo });
  if (isLoading) return <Loading />;
  if (!data) return null;
  return (
    <Card padding={false}>
      <div className="overflow-x-auto">
        <Table>
          <Thead>
            <Tr>
              <Th>Drug</Th>
              <Th>DIN</Th>
              <Th className="text-right">Dispensed</Th>
              <Th className="text-right">Received</Th>
              <Th className="text-right">Destroyed</Th>
              <Th className="text-right">Lost</Th>
              <Th className="text-right">Stolen</Th>
              <Th className="text-right">Discrepancy</Th>
              <Th className="text-right">On hand</Th>
            </Tr>
          </Thead>
          <Tbody>
            {data.rows.map((r) => (
              <Tr key={r.productId}>
                <Td className="font-medium">{r.name}</Td>
                <Td className="font-mono text-xs">{r.din ?? "—"}</Td>
                <Td className="text-right tabular-nums">{r.dispensed}</Td>
                <Td className="text-right tabular-nums">{r.received}</Td>
                <Td className="text-right tabular-nums">{r.destroyed}</Td>
                <Td className="text-right tabular-nums">{r.lost}</Td>
                <Td className="text-right tabular-nums">{r.stolen}</Td>
                <Td className={`text-right tabular-nums ${r.discrepancy !== 0 ? "text-danger-600 font-medium" : ""}`}>
                  {r.discrepancy > 0 ? "+" : ""}
                  {r.discrepancy}
                </Td>
                <Td className="text-right tabular-nums font-medium">{r.onHand}</Td>
              </Tr>
            ))}
            {data.rows.length === 0 && (
              <Tr>
                <Td colSpan={9} className="text-center text-sm text-slate-400 py-4">
                  No controlled-drug activity in this period.
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </div>
    </Card>
  );
}

function RxSalesReport({ dateFrom, dateTo, isDark }: { dateFrom: string; dateTo: string; isDark: boolean }) {
  const { data, isLoading } = useGetRxSalesReportQuery({ dateFrom, dateTo });
  if (isLoading) return <Loading />;
  if (!data) return null;
  const chartData = data.byDay.map((d) => ({ name: d.day.slice(5), copay: d.copayTotal, rx: d.rxCount }));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs text-slate-500 dark:text-slate-400">Prescriptions sold</p>
          <p className="text-xl font-medium mt-1 text-slate-900 dark:text-slate-100">{data.totals.rxCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500 dark:text-slate-400">Copay total</p>
          <p className="text-xl font-medium mt-1 text-slate-900 dark:text-slate-100">
            {formatMoney(data.totals.copayTotal)}
          </p>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Rx copay by day</CardTitle>
        </CardHeader>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1e293b" : "#f1f5f9"} />
            <XAxis dataKey="name" tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }} />
            <YAxis tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                background: isDark ? "#1e293b" : "#fff",
                color: isDark ? "#e2e8f0" : "#1e293b",
              }}
              formatter={(v: number) => formatMoney(v)}
            />
            <Bar dataKey="copay" fill="#233699" radius={[6, 6, 0, 0]} name="Copay" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function ScheduleReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading } = useGetScheduleBreakdownQuery({ dateFrom, dateTo });
  if (isLoading) return <Loading />;
  if (!data) return null;
  const pieData = data.rows.filter((r) => r.revenue > 0).map((r) => ({
    name: SCHEDULE_LABELS[r.category] ?? r.category,
    value: r.revenue,
  }));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card padding={false}>
        <Table>
          <Thead>
            <Tr>
              <Th>Schedule</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Revenue</Th>
            </Tr>
          </Thead>
          <Tbody>
            {data.rows.map((r) => (
              <Tr key={r.category}>
                <Td className="font-medium">{SCHEDULE_LABELS[r.category] ?? r.category}</Td>
                <Td className="text-right tabular-nums">{r.quantity}</Td>
                <Td className="text-right tabular-nums">{formatMoney(r.revenue)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>
      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue by schedule</CardTitle>
          </CardHeader>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} innerRadius={55} dataKey="value" paddingAngle={3}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatMoney(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

function SalesReport({
  dateFrom,
  dateTo,
  isDark,
}: {
  dateFrom: string;
  dateTo: string;
  isDark: boolean;
}) {
  const { data, isLoading } = useGetSalesReportQuery({ dateFrom, dateTo });
  if (isLoading) return <Loading />;
  if (!data) return null;

  const paymentData = data.byPaymentMethod.map((p) => ({
    name: p.method.replace("_", " "),
    value: parseFloat(p.total),
  }));
  const topProducts = data.topProducts.map((p) => ({
    name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name,
    revenue: parseFloat(p.revenue),
    qty: p.qtySold,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: formatMoney(data.summary.totalRevenue) },
          { label: "Total Sales", value: data.summary.totalSales.toString() },
          { label: "Avg Sale Value", value: formatMoney(data.summary.avgSaleValue) },
          { label: "Total Due", value: formatMoney(data.summary.totalDue) },
        ].map((k) => (
          <Card key={k.label}>
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className="text-xl font-medium text-slate-900 dark:text-slate-100 mt-1">{k.value}</p>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topProducts} margin={{ bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1e293b" : "#f1f5f9"} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }}
                angle={-35}
                textAnchor="end"
                height={80}
              />
              <YAxis tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                  background: isDark ? "#1e293b" : "#fff",
                  color: isDark ? "#e2e8f0" : "#1e293b",
                }}
                formatter={(v: number) => formatMoney(v)}
              />
              <Bar dataKey="revenue" fill="#233699" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payment Breakdown</CardTitle>
          </CardHeader>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={paymentData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={55}
                dataKey="value"
                paddingAngle={3}
              >
                {paymentData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                  background: isDark ? "#1e293b" : "#fff",
                  color: isDark ? "#e2e8f0" : "#1e293b",
                }}
                formatter={(v: number) => formatMoney(v)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2">
            {paymentData.map((p, i) => (
              <div key={p.name} className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-xs text-slate-600 dark:text-slate-300">{p.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProfitReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading } = useGetProfitReportQuery({ dateFrom, dateTo });
  if (isLoading) return <Loading />;
  if (!data) return null;
  const s = data.summary;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Revenue",
            value: formatMoney(s.totalRevenue),
            color: "text-primary-700 dark:text-primary-300",
          },
          {
            label: "Gross Profit",
            value: formatMoney(s.grossProfit),
            color: "text-emerald-700 dark:text-success-300",
          },
          {
            label: "Net Profit",
            value: formatMoney(s.netProfit),
            color:
              parseFloat(s.netProfit) >= 0
                ? "text-emerald-700 dark:text-success-300"
                : "text-danger-700 dark:text-danger-300",
          },
          {
            label: "Net Margin",
            value: `${parseFloat(s.netMargin).toFixed(1)}%`,
            color: "text-slate-800 dark:text-slate-100",
          },
        ].map((k) => (
          <Card key={k.label}>
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className={`text-xl font-medium mt-1 ${k.color}`}>{k.value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Most Profitable Products</CardTitle>
        </CardHeader>
        <Table>
          <Thead>
            <Tr>
              <Th>Product</Th>
              <Th>Revenue</Th>
              <Th>Cost</Th>
              <Th>Profit</Th>
              <Th>Qty</Th>
            </Tr>
          </Thead>
          <Tbody>
            {data.topProfitProducts.map((p) => (
              <Tr key={p.productId}>
                <Td className="font-medium">{p.name}</Td>
                <Td>{formatMoney(p.revenue)}</Td>
                <Td>{formatMoney(p.cost)}</Td>
                <Td className="font-medium text-emerald-700">{formatMoney(p.profit)}</Td>
                <Td>{p.qtySold}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>
    </div>
  );
}

function StockReport() {
  const { data, isLoading } = useGetStockReportQuery({});
  if (isLoading) return <Loading />;
  if (!data) return null;
  const s = data.summary;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Total Items", value: s.totalItems.toString() },
          { label: "Out of Stock", value: s.outOfStock.toString() },
          { label: "Low Stock", value: s.lowStockCount.toString() },
          { label: "Cost Value", value: formatMoney(s.totalCostValue) },
          { label: "Sell Value", value: formatMoney(s.totalSellValue) },
          { label: "Potential Profit", value: formatMoney(s.potentialProfit) },
        ].map((k) => (
          <Card key={k.label}>
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className="text-xl font-medium mt-1 text-slate-900 dark:text-slate-100">{k.value}</p>
          </Card>
        ))}
      </div>
      {data.lowStockItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Low Stock Items</CardTitle>
            <Badge variant="warning">{data.lowStockItems.length}</Badge>
          </CardHeader>
          <Table>
            <Thead>
              <Tr>
                <Th>Product</Th>
                <Th>Store</Th>
                <Th>Qty</Th>
                <Th>Threshold</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.lowStockItems.map((i, idx) => (
                <Tr key={idx}>
                  <Td className="font-medium">{i.productName}</Td>
                  <Td>{i.storeName}</Td>
                  <Td>
                    <Badge variant={i.quantity === 0 ? "danger" : "warning"}>{i.quantity}</Badge>
                  </Td>
                  <Td>{i.threshold}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function CashierReport({
  dateFrom,
  dateTo,
  isDark,
}: {
  dateFrom: string;
  dateTo: string;
  isDark: boolean;
}) {
  const { data, isLoading } = useGetCashierReportQuery({ dateFrom, dateTo });
  if (isLoading) return <Loading />;
  if (!data) return null;
  const chartData = data.cashierPerformance.map((c) => ({
    name: c.name.split(" ")[0],
    revenue: parseFloat(c.revenue),
    sales: c.saleCount,
  }));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cashier Performance</CardTitle>
        </CardHeader>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1e293b" : "#f1f5f9"} />
            <XAxis dataKey="name" tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 12 }} />
            <YAxis tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                background: isDark ? "#1e293b" : "#fff",
                color: isDark ? "#e2e8f0" : "#1e293b",
              }}
              formatter={(v: number) => formatMoney(v)}
            />
            <Legend />
            <Bar dataKey="revenue" fill="#233699" radius={[6, 6, 0, 0]} name="Revenue" />
            <Bar dataKey="sales" fill="#02BCF5" radius={[6, 6, 0, 0]} name="Sales" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card padding={false}>
        <Table>
          <Thead>
            <Tr>
              <Th>Cashier</Th>
              <Th>Sales</Th>
              <Th>Revenue</Th>
              <Th>Discounts</Th>
              <Th>Avg Sale</Th>
            </Tr>
          </Thead>
          <Tbody>
            {data.cashierPerformance.map((c) => (
              <Tr key={c.cashierId}>
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.saleCount}</Td>
                <Td className="font-medium">{formatMoney(c.revenue)}</Td>
                <Td>{formatMoney(c.discounts)}</Td>
                <Td>{formatMoney(c.avgSale)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>
    </div>
  );
}
