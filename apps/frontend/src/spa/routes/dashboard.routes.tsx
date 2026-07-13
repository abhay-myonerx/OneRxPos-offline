import type { RouteObject } from "react-router-dom";
import DashboardLayout from "@/app/(dashboard)/layout";
import AdminLayout from "@/app/(dashboard)/admin/layout";
import DashboardPage from "@/app/(dashboard)/dashboard/page";
import ManagerDashboardPage from "@/app/(dashboard)/manager-dashboard/page";
import PosPage from "@/app/(dashboard)/pos/page";
import SalesPage from "@/app/(dashboard)/sales/page";
import ReportsPage from "@/app/(dashboard)/reports/page";
import HrReportsPage from "@/app/(dashboard)/reports/hr/page";
import ProfilePage from "@/app/(dashboard)/profile/page";
import SettingsPage from "@/app/(dashboard)/settings/page";
import PermissionsPage from "@/app/(dashboard)/permissions/page";
import UsersPage from "@/app/(dashboard)/users/page";
import StoresPage from "@/app/(dashboard)/stores/page";
import ReceiptSettingsPage from "@/app/(dashboard)/receipt-settings/page";
import ExpensesPage from "@/app/(dashboard)/expenses/page";
import PurchasesPage from "@/app/(dashboard)/purchases/page";
import PromotionsPage from "@/app/(dashboard)/promotions/page";
import CatalogImportPage from "@/app/(dashboard)/products/import/page";
import SuppliersPage from "@/app/(dashboard)/suppliers/page";
import BrandsPage from "@/app/(dashboard)/brands/page";
import LeviesPage from "@/app/(dashboard)/levies/page";
import CategoriesPage from "@/app/(dashboard)/categories/page";
import CustomersPage from "@/app/(dashboard)/customers/page";
import CustomerDetailPage from "@/app/(dashboard)/customers/[id]/page";
import ProductsPage from "@/app/(dashboard)/products/page";
import ProductDetailPage from "@/app/(dashboard)/products/[id]/page";
import InventoryPage from "@/app/(dashboard)/inventory/page";
import TransferDetailPage from "@/app/(dashboard)/inventory/transfers/[id]/page";
import NarcoticLogRoutePage from "@/app/(dashboard)/narcotic-log/page";
import AdminTenantsPage from "@/app/(dashboard)/admin/tenants/page";
import AdminTenantDetailPage from "@/app/(dashboard)/admin/tenants/[id]/page";
import { layoutRoute } from "./layoutRoute";
import { hrRoutes } from "./hr.routes";
import { payrollRoutes } from "./payroll.routes";

const DashboardLayoutRoute = layoutRoute(DashboardLayout);
const AdminLayoutRoute = layoutRoute(AdminLayout);

// (dashboard) group: CORE subtree (Task 10) + hr subtree (Task 11) + payroll
// subtree (Task 12). The full-group glob parity check is Task 13.
export const dashboardRoutes: RouteObject[] = [
  {
    element: <DashboardLayoutRoute />,
    children: [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/manager-dashboard", element: <ManagerDashboardPage /> },
      { path: "/pos", element: <PosPage /> },
      { path: "/narcotic-log", element: <NarcoticLogRoutePage /> },
      { path: "/sales", element: <SalesPage /> },
      { path: "/reports", element: <ReportsPage /> },
      { path: "/reports/hr", element: <HrReportsPage /> },
      { path: "/profile", element: <ProfilePage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/permissions", element: <PermissionsPage /> },
      { path: "/users", element: <UsersPage /> },
      { path: "/stores", element: <StoresPage /> },
      { path: "/receipt-settings", element: <ReceiptSettingsPage /> },
      { path: "/expenses", element: <ExpensesPage /> },
      { path: "/purchases", element: <PurchasesPage /> },
      { path: "/promotions", element: <PromotionsPage /> },
      { path: "/suppliers", element: <SuppliersPage /> },
      { path: "/brands", element: <BrandsPage /> },
      { path: "/levies", element: <LeviesPage /> },
      { path: "/categories", element: <CategoriesPage /> },
      { path: "/customers", element: <CustomersPage /> },
      { path: "/customers/:id", element: <CustomerDetailPage /> },
      { path: "/products", element: <ProductsPage /> },
      { path: "/products/import", element: <CatalogImportPage /> },
      { path: "/products/:id", element: <ProductDetailPage /> },
      { path: "/inventory", element: <InventoryPage /> },
      { path: "/inventory/transfers/:id", element: <TransferDetailPage /> },
      ...hrRoutes,
      ...payrollRoutes,
      // Admin sub-layout nested under the dashboard shell.
      {
        element: <AdminLayoutRoute />,
        children: [
          { path: "/admin/tenants", element: <AdminTenantsPage /> },
          { path: "/admin/tenants/:id", element: <AdminTenantDetailPage /> },
        ],
      },
    ],
  },
];
