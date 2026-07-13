import net from "node:net";

/**
 * A throwaway TCP server that mimics a network scale: on receiving the poll it
 * replies with the configured ASCII weight `frame`.
 */
export function makeScaleEmulator(frame: string): Promise<{
  port: number;
  close: () => void;
}> {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      sock.on("data", () => sock.write(frame));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, close: () => server.close() });
    });
  });
}
