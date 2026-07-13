/**
 * Extension point for POS-only RTK Query endpoints.
 *
 * The bundled POS UI already uses `@/features/products/api`, `@/features/sales/api`,
 * `@/features/stores/api`, and related slices. Inject new endpoints here and register
 * the slice in `@/store` when your backend exposes dedicated POS routes.
 */
import { baseApi } from "@/store/base-api";
import { env } from "@/shell/env";
import type { ApiResponse } from "@/types/common/api-response.types";
import type { ParkedSaleRecord, ParkedSnapshot } from "../types/parked-sale.types";

export interface MiscProduct {
  id: string;
}

// ── Parked sales (Phase 1.3b) ───────────────────────────────────────────────
// The device's IndexedDB is authoritative (Approach A); these endpoints are the
// best-effort backend mirror that makes a hold recallable from another till in
// the same store. Snapshots are grant-free (grants stripped at park time).

/** Body sent to mirror a locally-parked sale up to the backend. */
export interface MirrorParkedSaleRequest {
  id: string;
  storeId: string;
  customerId?: string | null;
  label?: string | null;
  parkedByName?: string | null;
  snapshot: ParkedSnapshot;
  itemCount: number;
  total: number;
}

/** The backend's stored shape (see ParkedSale model). */
interface ParkedSaleDto {
  id: string;
  storeId: string;
  customerId: string | null;
  label: string | null;
  parkedByName: string | null;
  cashierId: string;
  snapshot: ParkedSnapshot;
  itemCount: number;
  total: number;
  status: string;
  createdAt: string;
}

function dtoToRecord(dto: ParkedSaleDto): ParkedSaleRecord {
  return {
    id: dto.id,
    storeId: dto.storeId,
    customerId: dto.customerId,
    label: dto.label,
    parkedByUserId: dto.cashierId,
    parkedByName: dto.parkedByName,
    parkedAt: dto.createdAt,
    itemCount: dto.itemCount,
    total: dto.total,
    snapshot: dto.snapshot,
    origin: "remote",
  };
}

// `/api/v2/pos/override/consume` lives in the pos-auth module (Phase 1.1/1.3a
// Task 8), mounted a version ahead of `baseApi`'s default v1 root — same
// absolute-URL-computation as `pos-auth.api.ts`'s `POS_V2_ROOT` (fetchBaseQuery
// uses a URL as-is, skipping baseUrl-joining, whenever it's absolute).
// Duplicated here rather than imported so this file doesn't reach into the
// pos-auth feature just for a URL constant.
const POS_V2_ROOT = env.apiUrl.replace(/\/api\/v\d+\/?$/, "/api") + "/v2/pos";

export interface ConsumeOverrideRequest {
  action: string;
  context: string;
  grant: string;
}

// `consumeOverrideController` returns `{ consumed: boolean }` directly —
// NOT wrapped in the usual `{ success, data }` envelope — so no
// `transformResponse` here (contrast `getMiscProduct` below).
export interface ConsumeOverrideResponse {
  consumed: boolean;
}

export const posApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // Ensures + returns the tenant's "Miscellaneous" open-price product id
    // (Phase 1.3a, Task 9 backend / Task 15 frontend). `ManualItemModal`
    // uses the returned id as the `productId` on the misc cart line it
    // builds via `buildMiscCartLine`.
    getMiscProduct: build.query<MiscProduct, void>({
      query: () => "/products/misc",
      transformResponse: (res: ApiResponse<MiscProduct>) => res.data,
    }),
    // Verify + consume + audit a manager-override grant for a PRE-checkout
    // gated action (void line, clear transaction) that never reaches a
    // persisted sale, so it's audited at action time rather than riding
    // along on a sale's own audit trail (Phase 1.3a, Task 16). A rejected
    // (tampered/expired/context-mismatched) grant resolves as an HTTP 400,
    // which RTK Query surfaces as a rejected `.unwrap()` — callers must NOT
    // perform the void/clear unless this resolves successfully.
    consumeOverride: build.mutation<ConsumeOverrideResponse, ConsumeOverrideRequest>({
      query: (body) => ({ url: `${POS_V2_ROOT}/override/consume`, method: "POST", body }),
    }),

    // Best-effort mirror of a locally-parked sale (idempotent by `id`).
    mirrorParkedSale: build.mutation<{ id: string }, MirrorParkedSaleRequest>({
      query: (body) => ({ url: `${POS_V2_ROOT}/parked-sales`, method: "POST", body }),
      transformResponse: (res: ApiResponse<{ id: string }>) => res.data,
    }),

    // Store-scoped list of PARKED holds for cross-till recall.
    listRemoteParkedSales: build.query<ParkedSaleRecord[], { storeId: string }>({
      query: ({ storeId }) => ({
        url: `${POS_V2_ROOT}/parked-sales`,
        params: { storeId },
      }),
      transformResponse: (res: ApiResponse<ParkedSaleDto[]>) => res.data.map(dtoToRecord),
    }),

    // Atomic claim (PARKED→CLAIMED). Rejects (HTTP 409) if another till already
    // resumed it — callers MUST NOT restore the cart unless this resolves.
    claimParkedSale: build.mutation<{ snapshot: ParkedSnapshot }, { id: string }>({
      query: ({ id }) => ({ url: `${POS_V2_ROOT}/parked-sales/${id}/claim`, method: "POST" }),
      transformResponse: (res: ApiResponse<{ snapshot: ParkedSnapshot }>) => res.data,
    }),

    // Discard (soft) a mirrored hold.
    discardParkedSale: build.mutation<void, { id: string }>({
      query: ({ id }) => ({ url: `${POS_V2_ROOT}/parked-sales/${id}`, method: "DELETE" }),
    }),
  }),
});

export const {
  useGetMiscProductQuery,
  useConsumeOverrideMutation,
  useMirrorParkedSaleMutation,
  useLazyListRemoteParkedSalesQuery,
  useClaimParkedSaleMutation,
  useDiscardParkedSaleMutation,
} = posApi;
