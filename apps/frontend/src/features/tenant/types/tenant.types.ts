import { TenantPlan, TenantStatus } from "@/types/enums/status.enums";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  logo?: string | null;
  plan: TenantPlan;
  status: TenantStatus;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _count?: { stores: number; users: number; products: number; customers: number };
}

export interface DashboardStats {
  stores: number;
  users: number;
  products: number;
  customers: number;
  todaySales: number;
  todayRevenue: string;
  // Period-over-period comparison fields
  yesterdayRevenue: string;
  thisMonthRevenue: string;
  lastMonthRevenue: string;
  newCustomersThisMonth: number;
  newCustomersLastMonth: number;
  totalExpensesThisMonth: string;
}

export interface UpdateTenantInput {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  logo?: string;
}
