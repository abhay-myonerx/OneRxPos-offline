import net from "node:net";

export interface PrinterTarget {
  ip: string;
  port: number;
  timeoutMs?: number;
}

/**
 * Open a TCP connection to a network receipt printer (raw / JetDirect :9100),
 * write the ESC/POS bytes, and resolve once flushed and closed. Rejects on
 * connection error or timeout — fail-closed; the caller surfaces the failure.
 */
export function sendToPrinter(bytes: Uint8Array, target: PrinterTarget): Promise<void> {
  const timeoutMs = target.timeoutMs ?? 5000;
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () =>
      done(new Error(`Printer ${target.ip}:${target.port} timed out after ${timeoutMs}ms`)),
    );
    socket.once("error", (err) => done(err));
    socket.connect(target.port, target.ip, () => {
      socket.write(Buffer.from(bytes), (err) => {
        if (err) return done(err);
        socket.end(() => done());
      });
    });
  });
}
