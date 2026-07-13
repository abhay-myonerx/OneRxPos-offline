// Listens for barcode scans relayed from a mobile phone scanner via Socket.IO

import { useEffect, useRef, useCallback, useState } from "react";
import { connectSocket } from "@/lib/socket/socket-client";
import type { Socket } from "socket.io-client";

interface UseSocketScannerOptions {
  /** Called when a barcode arrives from a remote scanner device */
  onBarcode: (barcode: string) => void;
  /** Store ID to join the correct POS room */
  storeId: string | null;
  /** Whether the socket scanner listener is active */
  enabled?: boolean;
}

interface ScannerDevice {
  userId: string;
  name: string;
  device: "scanner" | "pos";
  socketId: string;
}

export function useSocketScanner({ onBarcode, storeId, enabled = true }: UseSocketScannerOptions) {
  const [connected, setConnected] = useState(false);
  const [scanners, setScanners] = useState<ScannerDevice[]>([]);
  const onBarcodeRef = useRef(onBarcode);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    onBarcodeRef.current = onBarcode;
  }, [onBarcode]);

  // Named handlers so cleanup can detach exactly these listeners without
  // tearing down the shared singleton socket (the notification system relies
  // on the same connection — see useNotificationsSocket).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type SocketHandler = (...args: any[]) => void;
  const handlersRef = useRef<Record<string, SocketHandler> | null>(null);

  const connect = useCallback(() => {
    if (!storeId || !enabled) return;

    const socket = connectSocket();
    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
      socket.emit("scanner:join", { storeId, device: "pos" });
    };
    const onDisconnect = () => {
      setConnected(false);
      setScanners([]);
    };
    const onBarcode = (data: { barcode: string }) => {
      onBarcodeRef.current(data.barcode);
    };
    const onDeviceJoined = (device: ScannerDevice) => {
      if (device.device === "scanner") {
        setScanners((prev) =>
          prev.some((d) => d.socketId === device.socketId) ? prev : [...prev, device],
        );
      }
    };
    const onDeviceLeft = (device: ScannerDevice) => {
      setScanners((prev) => prev.filter((d) => d.socketId !== device.socketId));
    };
    const onConnectError = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("scanner:barcode-received", onBarcode);
    socket.on("scanner:device-joined", onDeviceJoined);
    socket.on("scanner:device-left", onDeviceLeft);
    socket.on("connect_error", onConnectError);

    // The connection may already be open (shared singleton) — join now.
    if (socket.connected) onConnect();

    handlersRef.current = {
      connect: onConnect,
      disconnect: onDisconnect,
      "scanner:barcode-received": onBarcode,
      "scanner:device-joined": onDeviceJoined,
      "scanner:device-left": onDeviceLeft,
      connect_error: onConnectError,
    };

    return socket;
  }, [storeId, enabled]);

  useEffect(() => {
    if (!enabled || !storeId) return;

    connect();

    return () => {
      const socket = socketRef.current;
      const handlers = handlersRef.current;
      if (socket) {
        // Leave the POS room and detach only OUR listeners; leave the
        // shared connection intact for other consumers (notifications).
        if (socket.connected) socket.emit("scanner:leave");
        if (handlers) {
          for (const [event, fn] of Object.entries(handlers)) {
            socket.off(event, fn);
          }
        }
      }
      handlersRef.current = null;
      socketRef.current = null;
      setConnected(false);
      setScanners([]);
    };
  }, [enabled, storeId, connect]);

  return {
    connected,
    scanners,
  };
}
