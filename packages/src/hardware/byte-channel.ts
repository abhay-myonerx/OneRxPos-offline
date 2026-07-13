// A bidirectional byte channel over a physical transport (serial/USB). Native
// adapters (serialport, node-hid) implement this in the Electron host; drivers
// depend ONLY on this interface so they test against a mock channel.

export interface ByteChannel {
  write(bytes: Uint8Array): Promise<void>;
  /** Register a data listener; returns an unsubscribe function. */
  onData(cb: (chunk: Uint8Array) => void): () => void;
  close(): Promise<void>;
}
