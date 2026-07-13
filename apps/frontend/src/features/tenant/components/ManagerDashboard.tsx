"use client";

import {
  DollarSign,
  ShoppingCart,
  UserPlus,
  Receipt,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Building2,
  BarChart3,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/container";
import { SkeletonDashboard } from "@/components/ui/skeleton";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { useGetManagerDashboardQuery } from "@/features/tenant/api/tenant.api";
import { useGetDailyRevenueQuery } from "@/features/reports/api/reports.api";
import { formatMoney, formatCompact } from "@/lib/currency/format-money";
import { useAppSelector } from "@/store/hooks";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

type Trend = { value: string; positive: boolean };

function calcTrend(current: string | number, previous: string | number): Trend | undefined {
  const curr = parseFloat(String(current)) || 0;
  const prev = parseFloat(String(previous)) || 0;
  if (prev === 0) return curr > 0 ? { value: "New", positive: true } : undefined;
  const pct = ((curr - prev) / prev) * 100;
  return { value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, positive: pct >= 0 };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {title}
      </p>
      <p className="text-2xl sm:text-3xl font-medium text-slate-900 dark:text-slate-100 mt-1.5 tracking-tight truncate">
        {value}
      </p>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{subtitle}</p>}
      {trend && (
        <div className="flex items-center gap-1 mt-2.5">
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
              trend.positive
                ? "bg-emerald-50 dark:bg-success-500/15 text-emerald-700 dark:text-success-300"
                : "bg-red-50 dark:bg-danger-500/15 text-red-700 dark:text-danger-300"
            }`}
          >
            {trend.positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trend.value}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">vs prev</span>
        </div>
      )}
    </div>
  );
}

export function ManagerDashboard() {
  const user = useAppSelector((s) => s.auth.user);
  const isDark = useAppSelector((s) => s.uiPrefs.resolvedTheme) === "dark";
  const { data: stats, isLoading, error, refetch } = useGetManagerDashboardQuery();
  const { data: dailyData } = useGetDailyRevenueQuery({ days: 30 });

  if (isLoading) return <SkeletonDashboard />;
  if (error) return <ErrorDisplay onRetry={refetch} />;
  if (!stats) return null;

  const trendData = (dailyData ?? []).map((d) => ({
    day: d.date.slice(5),
    revenue: d.revenue,
    sales: d.sales,
  }));

  const revenueTrend = calcTrend(stats.todayRevenue, stats.yesterdayRevenue);
  const monthTrend = calcTrend(stats.thisMonthRevenue, stats.lastMonthRevenue);

  const topProducts = stats.topProducts.slice(0, 6).map((p) => ({
    name: p.name.length > 14 ? p.name.slice(0, 14) + "…" : p.name,
    revenue: parseFloat(p.revenue),
    qty: p.qtySold,
  }));

  const storePerf = stats.storePerformance.map((s) => ({
    name: s.storeName.length > 14 ? s.storeName.slice(0, 14) + "…" : s.storeName,
    revenue: parseFloat(s.revenue),
    sales: s.saleCount,
  }));

  return (
    <>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        {greeting()}, {user?.firstName ?? "there"}
      </p>

      <PageHeader title="Manager Dashboard" description="Store performance and sales analytics" />

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
          title="Monthly Revenue"
          value={formatMoney(stats.thisMonthRevenue)}
          subtitle={`Last: ${formatMoney(stats.lastMonthRevenue)}`}
          icon={<Calendar className="h-5 w-5" />}
          trend={monthTrend}
          gradient="from-violet-500 to-fuchsia-500"
        />
        <KpiCard
          title="New Customers"
          value={formatCompact(stats.newCustomersThisMonth)}
          subtitle="This month"
          icon={<UserPlus className="h-5 w-5" />}
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
                <linearGradient id="mgr-grad-rev" x1="0" y1="0" x2="0" y2="1">
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
                fill="url(#mgr-grad-rev)"
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
            No sales data yet
          </div>
        )}
      </Card>

      {/* Top products + Store performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {topProducts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary-500" />
                Top Products
              </CardTitle>
              <Badge variant="info">{topProducts.length} items</Badge>
            </CardHeader>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topProducts} margin={{ top: 5, right: 10, bottom: 60, left: 10 }}>
                <defs>
                  <linearGradient id="mgr-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b5ef8" />
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
                    fontSize: 12,
                  }}
                  formatter={(val: number) => [formatMoney(val), "Revenue"]}
                />
                <Bar dataKey="revenue" fill="url(#mgr-bar)" radius={[10, 10, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {storePerf.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-500" />
                Store Performance
              </CardTitle>
              <Badge variant="success">{storePerf.length} stores</Badge>
            </CardHeader>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={storePerf} margin={{ top: 5, right: 10, bottom: 60, left: 10 }}>
                <defs>
                  <linearGradient id="mgr-store" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.85} />
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
                  cursor={{ fill: "rgba(16,185,129,0.06)" }}
                  contentStyle={{
                    borderRadius: "12px",
                    border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                    background: isDark ? "#1e293b" : "#fff",
                    color: isDark ? "#e2e8f0" : "#1e293b",
                    fontSize: 12,
                  }}
                  formatter={(val: number) => [formatMoney(val), "Revenue"]}
                />
                <Bar
                  dataKey="revenue"
                  fill="url(#mgr-store)"
                  radius={[10, 10, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Bottom snapshot row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: "Month Revenue",
            value: formatMoney(stats.thisMonthRevenue),
            sub: `Last: ${formatMoney(stats.lastMonthRevenue)}`,
            color: "text-primary-600 dark:text-primary-300",
            bg: "bg-primary-50 dark:bg-primary-400/15",
            icon: <DollarSign className="h-4 w-4" />,
          },
          {
            label: "Total Expenses",
            value: formatMoney(stats.totalExpensesThisMonth),
            sub: "This month",
            color: "text-red-600 dark:text-danger-300",
            bg: "bg-red-50 dark:bg-danger-500/15",
            icon: <Receipt className="h-4 w-4" />,
          },
          {
            label: "Active Stores",
            value: stats.stores.toString(),
            sub: "Locations",
            color: "text-emerald-600 dark:text-success-300",
            bg: "bg-emerald-50 dark:bg-success-500/15",
            icon: <Building2 className="h-4 w-4" />,
          },
          {
            label: "Active Users",
            value: stats.users.toString(),
            sub: "Staff members",
            color: "text-violet-600 dark:text-violet-300",
            bg: "bg-violet-50 dark:bg-violet-500/15",
            icon: <UserPlus className="h-4 w-4" />,
          },
        ].map((item) => (
          <div key={item.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {item.label}
            </p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{item.value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{item.sub}</p>
          </div>
        ))}
      </div>
    </>
  );
}
