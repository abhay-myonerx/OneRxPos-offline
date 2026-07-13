import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ProvinceCode } from "rx-pos-shared";
import type { CartItem, CartState } from "../types/cart.types";

const initialState: CartState = {
  items: [],
  customerId: null,
  storeId: null,
  shiftId: null,
  notes: "",
  storeProvince: null,
  discountOverride: null,
  discountReauth: null,
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    addToCart: (state, action: PayloadAction<CartItem>) => {
      const existing = state.items.find(
        (i) => i.productId === action.payload.productId && i.variantId === action.payload.variantId,
      );
      if (existing) {
        existing.quantity = Math.min(
          existing.quantity + action.payload.quantity,
          existing.maxStock,
        );
      } else {
        state.items.push(action.payload);
      }
    },
    updateQuantity: (state, action: PayloadAction<{ id: string; quantity: number }>) => {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) item.quantity = Math.max(1, Math.min(action.payload.quantity, item.maxStock));
    },
    updateDiscount: (state, action: PayloadAction<{ id: string; discount: number }>) => {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) item.discount = Math.max(0, action.payload.discount);
    },
    removeFromCart: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },
    setCustomer: (state, action: PayloadAction<string | null>) => {
      state.customerId = action.payload;
    },
    setStore: (state, action: PayloadAction<string>) => {
      state.storeId = action.payload;
    },
    setStoreProvince: (state, action: PayloadAction<ProvinceCode | null>) => {
      state.storeProvince = action.payload;
    },
    setShift: (state, action: PayloadAction<string | null>) => {
      state.shiftId = action.payload;
    },
    setNotes: (state, action: PayloadAction<string>) => {
      state.notes = action.payload;
    },
    clearCart: () => initialState,
    voidLine: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },
    overrideLinePrice: (
      state,
      action: PayloadAction<{ id: string; newPrice: number; grant: string; authorizerUserId: string }>,
    ) => {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) {
        item.priceOverride = { originalPrice: item.unitPrice, grant: action.payload.grant, authorizerUserId: action.payload.authorizerUserId };
        item.unitPrice = action.payload.newPrice;
        // A freshly-authorized price clears any resume re-auth marker.
        delete item.reauth;
      }
    },
    addMiscItem: (state, action: PayloadAction<CartItem>) => {
      state.items.push(action.payload);
    },
    setDiscountOverride: (
      state,
      action: PayloadAction<
        { grant: string; authorizerUserId: string; mode: "flat" | "percent"; value: number } | null
      >,
    ) => {
      state.discountOverride = action.payload;
      // A freshly-authorized discount clears any resume re-auth marker.
      if (action.payload) state.discountReauth = null;
    },
    // Phase 1.3b — resume: replace the entire cart from a deserialized parked
    // snapshot (grants already stripped; `reauth`/`discountReauth` markers set).
    replaceCart: (_state, action: PayloadAction<CartState>) => action.payload,
    // Phase 1.3b — resume re-auth: a manager re-approved a resumed line's
    // overridden price/open-price. Re-attach a fresh grant and clear the
    // marker; `originalPrice` comes from the snapshot's reauth marker (misc
    // lines carry no catalog price, so 0) so checkout rebuilds the same
    // context it was authorized against.
    resolveLineReauth: (
      state,
      action: PayloadAction<{
        id: string;
        originalPrice: number;
        grant: string;
        authorizerUserId: string;
      }>,
    ) => {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) {
        item.priceOverride = {
          originalPrice: action.payload.originalPrice,
          grant: action.payload.grant,
          authorizerUserId: action.payload.authorizerUserId,
        };
        delete item.reauth;
      }
    },
    setDiscountReauth: (
      state,
      action: PayloadAction<{ mode: "flat" | "percent"; value: number } | null>,
    ) => {
      state.discountReauth = action.payload;
    },
    // Phase 2.2 — link a PII-free prescription to a line; the copay becomes the
    // line price (that's what the patient pays at the front store).
    linkRx: (
      state,
      action: PayloadAction<{ id: string; rxNumber: string; copay?: number }>,
    ) => {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) {
        item.rx = { rxNumber: action.payload.rxNumber, copay: action.payload.copay };
        if (action.payload.copay != null) item.unitPrice = action.payload.copay;
      }
    },
    unlinkRx: (state, action: PayloadAction<string>) => {
      const item = state.items.find((i) => i.id === action.payload);
      if (item) delete item.rx;
    },
    // Phase 2.2 — the resolved schedule for a line (from din -> drug catalog),
    // written by the resolution effect; drives the enforcement UI.
    setLineSchedule: (
      state,
      action: PayloadAction<{ id: string; scheduleCategory: CartItem["scheduleCategory"] }>,
    ) => {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) item.scheduleCategory = action.payload.scheduleCategory;
    },
    // Phase 2.2 — record a pharmacist consult (behind-counter), backed by an
    // RX_CONSULT grant that rides to checkout for audit.
    setConsult: (
      state,
      action: PayloadAction<{ id: string; grant: string; authorizerUserId: string; context: string }>,
    ) => {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) {
        item.consultAck = true;
        item.consultGrant = {
          grant: action.payload.grant,
          authorizerUserId: action.payload.authorizerUserId,
          context: action.payload.context,
        };
      }
    },
  },
});

export const {
  addToCart,
  updateQuantity,
  updateDiscount,
  removeFromCart,
  setCustomer,
  setStore,
  setStoreProvince,
  setShift,
  setNotes,
  clearCart,
  voidLine,
  overrideLinePrice,
  addMiscItem,
  setDiscountOverride,
  replaceCart,
  resolveLineReauth,
  setDiscountReauth,
  linkRx,
  unlinkRx,
  setConsult,
  setLineSchedule,
} = cartSlice.actions;
export default cartSlice.reducer;
