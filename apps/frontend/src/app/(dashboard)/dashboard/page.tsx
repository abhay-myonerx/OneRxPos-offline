"use client";

import {
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  UserPlus,
  Receipt,
  Calendar,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/container";
import { SkeletonDashboard } from "@/components/ui/skeleton";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { useGetDashboardQuery } from "@/features/tenant/api/tenant.api";
import {
  useGetSalesReportQuery,
  useGetDailyRevenueQuery,
  useGetMyCashierStatsQuery,
} from "@/features/reports/api/reports.api";
import { useGetLowStockQuery } from "@/features/inventory/api/inventory.api";
import { formatMoney, formatCompact } from "@/lib/currency/format-money";
import { todayISO, thirtyDaysAgoISO } from "@/lib/date/format-date";
import { useAppSelector } from "@/store/hooks";
import { Role } from "@/types/enums/role.enums";
import { Link, Navigate } from "@/shell/nav";
import { ROUTES } from "@/constants/routes";
import { usePermissions } from "@/hooks/usePermissions";
import { BarChart3, Wallet, CalendarClock, UserCircle } from "lucide-react";
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
  AreaChart,
  Area,
} from "recharts";
import { ManagerDashboard } from "@/features/tenant/components/ManagerDashboard";

const CHART_COLORS = ["#4263eb", "#3b5bdb", "#748ffc", "#91a7ff", "#bac8ff"];

type Trend = { value: string; positive: boolean };

// Returns "New" instead of "∞%" when the baseline is zero (first period ever).
function calcTrend(current: string | number, previous: string | number): Trend | undefined {
  const curr = parseFloat(String(current)) || 0;
  const prev = parseFloat(String(previous)) || 0;
  if (prev === 0) {
    return curr > 0 ? { value: "New", positive: true } : undefined;
  }
  const pct = ((curr - prev) / prev) * 100;
  return {
    value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    positive: pct >= 0,
  };
}

function KpiCard({
  title,
  value,
  subtitle,
  trend,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: Trend;
  gradient?: string;
}) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</p>
      <p className="text-2xl font-medium text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
        {value}
      </p>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>}
      {trend && (
        <p className={`text-[11px] mt-1 ${trend.positive ? "text-success-600" : "text-error-600"}`}>
          {trend.positive ? (
            <ArrowUpRight className="inline h-3 w-3" />
          ) : (
            <ArrowDownRight className="inline h-3 w-3" />
          )}{" "}
          {trend.value} vs last period
        </p>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ── Role-scoped sub-dashboards ─────────────────────────────────────────────
//
// Each sub-dashboard is intentionally scoped to what its role's API grants
// allow. Cashiers can only call /me/cashier-stats; Admins call the full
// tenant overview endpoint. Rendering the wrong sub-dashboard would result
// in 403s and empty charts rather than a permission-denied message.

/** Personal KPIs and same-day trend for cashier role. */
function CashierDashboard() {
  const user = useAppSelector((s) => s.auth.user);
  const isDark = useAppSelector((s) => s.uiPrefs.resolvedTheme) === "dark";
  const { data: myStats, isLoading, error, refetch } = useGetMyCashierStatsQuery({ days: 14 });

  if (isLoading) return <SkeletonDashboard />;
  if (error) return <ErrorDisplay onRetry={refetch} />;

  const todayRev = parseFloat(myStats?.todayRevenue ?? "0");
  const todaySalesCount = myStats?.todaySales ?? 0;
  const series = myStats?.series ?? [];

  const yesterdayKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const yesterdayRev = series.find((s) => s.date === yesterdayKey)?.revenue ?? 0;
  const revTrend = calcTrend(todayRev, yesterdayRev);

  const trendData = series.map((s) => ({
    day: s.date.slice(5),
    revenue: s.revenue,
    sales: s.sales,
  }));

  return (
    <>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        {greeting()}, {user?.firstName ?? "there"}
      </p>

      <PageHeader title="My Dashboard" description="Your personal sales performance" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-6">
        <KpiCard
          title="Today's Revenue"
          value={formatMoney(todayRev)}
          icon={<DollarSign className="h-5 w-5" />}
          trend={revTrend}
          gradient="from-primary-500 to-accent-500"
        />
        <KpiCard
          title="Sales Today"
          value={todaySalesCount.toString()}
          subtitle="Completed transactions"
          icon={<ShoppingCart className="h-5 w-5" />}
          gradient="from-emerald-500 to-teal-500"
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary-500" />
            My Sales Trend
          </CardTitle>
          <Badge variant="info">Last 14 days</Badge>
        </CardHeader>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="grad-cashier" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b5ef8" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#02bcf5" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? "#1e293b" : "#f1f5f9"}
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                  background: isDark ? "#1e293b" : "#fff",
                  color: isDark ? "#e2e8f0" : "#1e293b",
                  fontSize: 12,
                }}
                formatter={(val: number, name: string) =>
                  name === "revenue" ? [formatMoney(val), "Revenue"] : [val, "Sales"]
                }
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3b5ef8"
                strokeWidth={2.5}
                fill="url(#grad-cashier)"
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            No sales yet today &mdash; start making sales to see your trend here
          </div>
        )}
      </Card>
    </>
  );
}

/**
 * Tenant overview with revenue trend, top-products chart, payment-method
 * breakdown, month-over-month comparison, and low-stock alerts.
 * All four queries run in parallel; the page blocks on the primary
 * `useGetDashboardQuery` and renders supplementary charts lazily.
 */
function AdminDashboard() {
  const user = useAppSelector((s) => s.auth.user);
  const isDark = useAppSelector((s) => s.uiPrefs.resolvedTheme) === "dark";
  const { data: stats, isLoading, error, refetch } = useGetDashboardQuery();
  // Date range is fixed at 30 days — aligns with the backend dashboard endpoint
  // which computes thisMonth/lastMonth from the same window.
  const { data: salesReport } = useGetSalesReportQuery({
    dateFrom: thirtyDaysAgoISO(),
    dateTo: todayISO(),
  });
  const { data: dailyData } = useGetDailyRevenueQuery({ days: 30 });
  const { data: lowStockData } = useGetLowStockQuery({});
  const lowStock = lowStockData?.data || [];

  if (isLoading) return <SkeletonDashboard />;
  if (error) return <ErrorDisplay onRetry={refetch} />;
  if (!stats) return null;

  const trendData = (dailyData ?? []).map((d) => ({
    day: d.date.slice(5),
    revenue: d.revenue,
    sales: d.sales,
  }));

  const revenueTrend = calcTrend(stats.todayRevenue, stats.yesterdayRevenue);
  const customerTrend = calcTrend(stats.newCustomersThisMonth, stats.newCustomersLastMonth);
  const monthTrend = calcTrend(stats.thisMonthRevenue, stats.lastMonthRevenue);

  const paymentData =
    salesReport?.byPaymentMethod?.map((p) => ({
      name: p.method.replace("_", " "),
      value: parseFloat(p.total),
    })) || [];

  const topProducts =
    salesReport?.topProducts?.slice(0, 6).map((p) => ({
      name: p.name.length > 14 ? p.name.slice(0, 14) + "…" : p.name,
      revenue: parseFloat(p.revenue),
      qty: p.qtySold,
    })) || [];

  const monthlyComparison = [
    { label: "Last Month", revenue: parseFloat(stats.lastMonthRevenue) || 0 },
    { label: "This Month", revenue: parseFloat(stats.thisMonthRevenue) || 0 },
  ];

  const totalPayment = paymentData.reduce((a, b) => a + b.value, 0);
  const greet = greeting();

  return (
    <>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        {greet}, {user?.firstName ?? "there"}
      </p>

      <PageHeader title="Dashboard" description="Overview of your business performance" />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 mb-6">
        <KpiCard
          title="Today's Revenue"
          value={formatMoney(stats.todayRevenue)}
          icon={<DollarSign className="h-5 w-5" />}
          trend={revenueTrend}
          gradient="from-primary-500 to-accent-500"
        />
        <KpiCard
          title="Today's Sales"
          value={stats.todaySales.toString()}
          subtitle="Completed transactions"
          icon={<ShoppingCart className="h-5 w-5" />}
          gradient="from-emerald-500 to-teal-500"
        />
        <KpiCard
          title="New Customers"
          value={formatCompact(stats.newCustomersThisMonth)}
          subtitle={`${formatCompact(stats.customers)} total active`}
          icon={<UserPlus className="h-5 w-5" />}
          gradient="from-violet-500 to-fuchsia-500"
          trend={customerTrend}
        />
        <KpiCard
          title="Products"
          value={formatCompact(stats.products)}
          subtitle={`${stats.stores} store(s)`}
          icon={<Package className="h-5 w-5" />}
          gradient="from-amber-500 to-orange-500"
        />
      </div>

      {/* Revenue trend */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary-500" />
            Revenue Trend
          </CardTitle>
          <Badge variant="info">Last 30 days</Badge>
        </CardHeader>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b5ef8" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#02bcf5" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="grad-sales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? "#1e293b" : "#f1f5f9"}
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                  background: isDark ? "#1e293b" : "#fff",
                  color: isDark ? "#e2e8f0" : "#1e293b",
                  boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
                  fontSize: 12,
                }}
                formatter={(val: number, name: string) =>
                  name === "revenue" ? [formatMoney(val), "Revenue"] : [val, "Sales"]
                }
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3b5ef8"
                strokeWidth={2.5}
                fill="url(#grad-rev)"
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#grad-sales)"
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            No sales yet &mdash; start making sales to see your trend here
          </div>
        )}
      </Card>

      {/* Top products + payment methods */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Products by Revenue</CardTitle>
            <Badge variant="info">{topProducts.length} items</Badge>
          </CardHeader>
          {topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topProducts} margin={{ top: 5, right: 10, bottom: 60, left: 10 }}>
                <defs>
                  <linearGradient id="grad-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b5ef8" stopOpacity={1} />
                    <stop offset="100%" stopColor="#02bcf5" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDark ? "#1e293b" : "#f1f5f9"}
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }}
                  angle={-30}
                  textAnchor="end"
                  height={70}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(59,94,248,0.06)" }}
                  contentStyle={{
                    borderRadius: "12px",
                    border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                    background: isDark ? "#1e293b" : "#fff",
                    color: isDark ? "#e2e8f0" : "#1e293b",
                    boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
                    fontSize: 12,
                  }}
                  formatter={(val: number) => [formatMoney(val), "Revenue"]}
                />
                <Bar dataKey="revenue" fill="url(#grad-bar)" radius={[10, 10, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
              No sales data yet
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
          </CardHeader>
          {paymentData.length > 0 ? (
            <div className="relative">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={paymentData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={60}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {paymentData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                      background: isDark ? "#1e293b" : "#fff",
                      color: isDark ? "#e2e8f0" : "#1e293b",
                      fontSize: 12,
                    }}
                    formatter={(val: number) => [formatMoney(val), ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Total
                </p>
                <p className="text-lg font-medium text-slate-800 dark:text-slate-100">
                  {formatMoney(totalPayment)}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
              No data
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {paymentData.map((p, i) => {
              const pct = totalPayment > 0 ? (p.value / totalPayment) * 100 : 0;
              return (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                    <span className="text-slate-600 dark:text-slate-300 capitalize truncate">
                      {p.name}
                    </span>
                  </div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Monthly comparison + Business snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary-500" />
              Monthly Revenue
            </CardTitle>
            {monthTrend && (
              <Badge variant={monthTrend.positive ? "success" : "danger"}>{monthTrend.value}</Badge>
            )}
          </CardHeader>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={monthlyComparison}
              margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <defs>
                <linearGradient id="grad-month" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={isDark ? "#1e293b" : "#f1f5f9"}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: isDark ? "#94a3b8" : "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                  background: isDark ? "#1e293b" : "#fff",
                  color: isDark ? "#e2e8f0" : "#1e293b",
                  fontSize: 12,
                }}
                formatter={(val: number) => [formatMoney(val), "Revenue"]}
              />
              <Bar dataKey="revenue" fill="url(#grad-month)" radius={[10, 10, 0, 0]} barSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-500" />
              Business Snapshot
            </CardTitle>
            <Badge variant="info">This month</Badge>
          </CardHeader>
          <div className="space-y-3 pt-2">
            {[
              {
                label: "Total Customers",
                value: formatCompact(stats.customers),
                sub: `+${stats.newCustomersThisMonth} new this month`,
                color: "text-violet-600 dark:text-violet-300",
                bg: "bg-violet-50 dark:bg-violet-500/15",
                icon: <Users className="h-4 w-4" />,
              },
              {
                label: "Monthly Revenue",
                value: formatMoney(stats.thisMonthRevenue),
                sub: `Last month: ${formatMoney(stats.lastMonthRevenue)}`,
                color: "text-primary-600 dark:text-primary-300",
                bg: "bg-primary-50 dark:bg-primary-400/15",
                icon: <DollarSign className="h-4 w-4" />,
              },
              {
                label: "Total Expenses",
                value: formatMoney(stats.totalExpensesThisMonth),
                sub: "Recorded this month",
                color: "text-red-600 dark:text-danger-300",
                bg: "bg-red-50 dark:bg-danger-500/15",
                icon: <Receipt className="h-4 w-4" />,
              },
              {
                label: "Active Stores",
                value: stats.stores.toString(),
                sub: `${stats.users} active users`,
                color: "text-emerald-600 dark:text-success-300",
                bg: "bg-emerald-50 dark:bg-success-500/15",
                icon: <Package className="h-4 w-4" />,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div
                  className={`h-9 w-9 rounded-lg ${item.bg} ${item.color} flex items-center justify-center shrink-0`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {item.label}
                  </p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {item.value}
                  </p>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 text-right shrink-0 max-w-[100px]">
                  {item.sub}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Low Stock Items</CardTitle>
            <Badge variant="warning">{lowStock.length} items</Badge>
          </CardHeader>
          <div className="space-y-2">
            {lowStock.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-slate-100 dark:border-slate-800"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {item.product?.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {item.store?.name} &middot; SKU {item.product?.sku}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant={item.quantity === 0 ? "danger" : "warning"}>
                    {item.quantity} left
                  </Badge>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    Threshold: {item.lowStockThreshold}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/**
 * Lightweight landing for roles without a tenant-overview dashboard
 * (ACCOUNTANT, HR_MANAGER). The admin overview endpoint
 * (/tenants/me/dashboard) is ADMIN-only, so rather than firing queries
 * these roles can't run — which previously surfaced as 403 errors — we
 * greet them and surface quick links to the modules they CAN access.
 */
function WelcomeDashboard() {
  const user = useAppSelector((s) => s.auth.user);
  const { can, canAny } = usePermissions();

  const links: { label: string; href: string; icon: React.ReactNode }[] = [];
  if (
    canAny(
      "reports.sales.read",
      "reports.profit.read",
      "reports.stock.read",
      "reports.purchases.read",
      "reports.expenses.read",
    )
  )
    links.push({ label: "Reports", href: ROUTES.REPORTS, icon: <BarChart3 className="h-5 w-5" /> });
  if (canAny("reports.hr.payroll.read", "reports.hr.attendance.read", "hr.employees.read"))
    links.push({
      label: "HR Reports",
      href: ROUTES.REPORTS_HR,
      icon: <BarChart3 className="h-5 w-5" />,
    });
  if (can("hr.employees.read"))
    links.push({
      label: "Employees",
      href: ROUTES.HR_EMPLOYEES,
      icon: <Users className="h-5 w-5" />,
    });
  if (can("hr.payroll.read"))
    links.push({ label: "Payroll", href: ROUTES.HR_PAYROLL, icon: <Wallet className="h-5 w-5" /> });
  if (can("expenses.read"))
    links.push({ label: "Expenses", href: ROUTES.EXPENSES, icon: <Receipt className="h-5 w-5" /> });
  if (canAny("hr.leave.request.read.team", "hr.leave.request.approve"))
    links.push({
      label: "Leave",
      href: ROUTES.HR_LEAVE,
      icon: <CalendarClock className="h-5 w-5" />,
    });
  links.push({
    label: "My Workspace",
    href: ROUTES.ESS_HOME,
    icon: <UserCircle className="h-5 w-5" />,
  });

  return (
    <>
      <PageHeader
        title={`${greeting()}${user?.firstName ? `, ${user.firstName}` : ""}`}
        description="Jump to the areas you have access to."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="flex items-center gap-3 p-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <span className="text-slate-500 dark:text-slate-400">{l.icon}</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {l.label}
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

/**
 * Role-dispatching shell: chooses the correct sub-dashboard for the
 * authenticated user's role. Each sub-dashboard is scoped to the API
 * endpoints that role is permitted to call — rendering the wrong one
 * would produce 403s and broken charts rather than a clear access error.
 * EMPLOYEE is hard-redirected to the ESS shell at the URL level so it never
 * triggers admin-only queries.
 */
export default function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  if (!user) return null;
  // ESS-only employees belong in the self-service shell, not the admin
  // dashboard (whose overview endpoint they can't call).
  if (user.role === Role.EMPLOYEE) return <Navigate to={ROUTES.ESS_HOME} replace />;
  if (user.role === Role.CASHIER) return <CashierDashboard />;
  if (user.role === Role.MANAGER) return <ManagerDashboard />;
  if (user.role === Role.ACCOUNTANT || user.role === Role.HR_MANAGER) return <WelcomeDashboard />;
  return <AdminDashboard />;
}
