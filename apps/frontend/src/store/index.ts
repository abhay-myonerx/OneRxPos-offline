import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "./base-api";
import authReducer from "./auth.slice";
import cartReducer from "@/features/pos/state/cart.slice";
import offlineQueueReducer from "@/features/pos/state/offline-queue.slice";
import uiPrefsReducer from "@/features/settings/state/ui-prefs.slice";

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    auth: authReducer,
    cart: cartReducer,
    // Phase 1.3b follow-up: parked-sale mirror writes that fail (offline) are
    // enqueued here and flushed on reconnect by useRingUp.
    offlineQueue: offlineQueueReducer,
    uiPrefs: uiPrefsReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
