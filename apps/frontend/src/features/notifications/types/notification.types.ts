// Shapes for the in-app real-time notification feature. Mirrors the backend
// `Notification` model + `/api/v2/notifications` contract.

export type NotificationType =
  | "SYSTEM"
  | "INVENTORY"
  | "SALES"
  | "PURCHASE"
  | "HR"
  | "ATTENDANCE"
  | "LEAVE"
  | "SHIFT"
  | "PAYROLL"
  | "SECURITY";

export interface AppNotification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  data: Record<string, unknown>;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationListParams {
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
  isRead?: boolean;
  type?: NotificationType;
}

export interface UnreadCount {
  count: number;
}
