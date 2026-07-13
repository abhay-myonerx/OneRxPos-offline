import { PayloadAction, createSlice } from "@reduxjs/toolkit";

interface OfflineQueueItem {
  id: string;
  payload: unknown;
  createdAt: string;
}

interface OfflineQueueState {
  items: OfflineQueueItem[];
}

const initialState: OfflineQueueState = {
  items: [],
};

const offlineQueueSlice = createSlice({
  name: "offlineQueue",
  initialState,
  reducers: {
    enqueueOfflineAction: (state, action: PayloadAction<OfflineQueueItem>) => {
      state.items.push(action.payload);
    },

    dequeueOfflineAction: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((item) => item.id !== action.payload);
    },

    clearOfflineQueue: (state) => {
      state.items = [];
    },
  },
});

export const { enqueueOfflineAction, dequeueOfflineAction, clearOfflineQueue } =
  offlineQueueSlice.actions;

export default offlineQueueSlice.reducer;
