import net from "node:net";

/**
 * A throwaway TCP server that mimics a network receipt printer: it accepts one
 * connection, buffers everything sent, and resolves `received` with the full
 * byte stream when the client closes the socket.
 */
export function makeEmulator(): Promise<{
  port: number;
  received: Promise<Buffer>;
  close: () => void;
}> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let resolveRecv!: (b: Buffer) => void;
    const received = new Promise<Buffer>((r) => (resolveRecv = r));
    const server = net.createServer((sock) => {
      sock.on("data", (d: Buffer) => chunks.push(d));
      const finish = () => resolveRecv(Buffer.concat(chunks));
      sock.on("end", finish);
      sock.on("close", finish);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, received, close: () => server.close() });
    });
  });
}
