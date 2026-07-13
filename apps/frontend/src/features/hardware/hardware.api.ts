import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";

/**
 * Peripheral hardware (Phase 2.9). Device-profile CRUD over
 * `/api/v1/device-profiles` (reads till-open; writes admin-gated server-side)
 * plus one-shot test actions over `/api/v1/hardware/*`.
 */

export type DeviceKind = "printer" | "drawer" | "scale" | "scanner";
export type Transport = "network" | "native" | "relay";
export type ScaleProtocol = "nci" | "hid" | "network";

export type ConnectionSpec =
  | { kind: "network"; ip: string; port: number }
  | { kind: "usb"; usbVendorId: number; usbProductId: number }
  | { kind: "serial"; serialPath: string; baudRate: number }
  | { kind: "windows-printer"; printerName: string };

export interface DeviceProfileDto {
  id: string;
  storeId: string;
  kind: DeviceKind;
  label: string;
  transport: Transport;
  connection: ConnectionSpec;
  ownerStationId: string | null;
  protocol: ScaleProtocol | null;
  config: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertDeviceProfileInput {
  storeId: string;
  kind: DeviceKind;
  label: string;
  transport: Transport;
  connection: ConnectionSpec;
  ownerStationId?: string | null;
  protocol?: ScaleProtocol | null;
  isActive?: boolean;
}

interface WeightReading {
  value: number;
  unit: string;
  stable: boolean;
}

export interface DiscoveredDevices {
  serial: Array<{
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    vendorId?: string;
    productId?: string;
  }>;
  hid: Array<{
    vendorId: number;
    productId: number;
    path?: string;
    product?: string;
    manufacturer?: string;
  }>;
  printers: string[];
}

export const hardwareApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listDeviceProfiles: build.query<DeviceProfileDto[], void>({
      query: () => "/device-profiles",
      transformResponse: (res: ApiResponse<DeviceProfileDto[]>) => res.data,
      providesTags: ["DeviceProfile"],
    }),
    createDeviceProfile: build.mutation<DeviceProfileDto, UpsertDeviceProfileInput>({
      query: (body) => ({ url: "/device-profiles", method: "POST", body }),
      transformResponse: (res: ApiResponse<DeviceProfileDto>) => res.data,
      invalidatesTags: ["DeviceProfile"],
    }),
    updateDeviceProfile: build.mutation<
      DeviceProfileDto,
      { id: string } & Partial<UpsertDeviceProfileInput>
    >({
      query: ({ id, ...body }) => ({ url: `/device-profiles/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiResponse<DeviceProfileDto>) => res.data,
      invalidatesTags: ["DeviceProfile"],
    }),
    deleteDeviceProfile: build.mutation<void, { id: string }>({
      query: ({ id }) => ({ url: `/device-profiles/${id}`, method: "DELETE" }),
      invalidatesTags: ["DeviceProfile"],
    }),

    // Test actions are transport-aware: they send the device's `connection`
    // (network | serial | usb), so a USB/serial device can be tested from the
    // UI too — not just network devices.
    testPrint: build.mutation<{ ok: boolean }, { connection: ConnectionSpec }>({
      query: ({ connection }) => ({
        url: "/hardware/print",
        method: "POST",
        body: {
          connection,
          job: {
            lines: [{ text: "*** TEST RECEIPT ***", align: "center", bold: true }],
            cut: true,
          },
        },
      }),
      transformResponse: (res: ApiResponse<{ ok: boolean }>) => res.data,
    }),
    testDrawer: build.mutation<{ ok: boolean }, { connection: ConnectionSpec }>({
      query: ({ connection }) => ({
        url: "/hardware/drawer/open",
        method: "POST",
        body: { connection },
      }),
      transformResponse: (res: ApiResponse<{ ok: boolean }>) => res.data,
    }),
    testScale: build.mutation<WeightReading, { connection: ConnectionSpec }>({
      query: ({ connection }) => ({
        url: "/hardware/scale/read",
        method: "POST",
        body: { connection },
      }),
      transformResponse: (res: ApiResponse<WeightReading>) => res.data,
    }),

    // Enumerate locally-attached COM ports + HID devices for the pick-list.
    discoverDevices: build.query<DiscoveredDevices, void>({
      query: () => "/hardware/devices",
      transformResponse: (res: ApiResponse<DiscoveredDevices>) => res.data,
    }),
  }),
});

export const {
  useListDeviceProfilesQuery,
  useCreateDeviceProfileMutation,
  useUpdateDeviceProfileMutation,
  useDeleteDeviceProfileMutation,
  useTestPrintMutation,
  useTestDrawerMutation,
  useTestScaleMutation,
  useLazyDiscoverDevicesQuery,
} = hardwareApi;
