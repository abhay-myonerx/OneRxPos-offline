// Singleton Socket.IO client for the POS frontend

import { io, Socket } from "socket.io-client";
import { TokenManager } from "@/lib/api/token-manager";
import { env } from "@/shell/env";

const SOCKET_URL = env.apiUrl.replace("/api/v1", "");

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      auth: {
        token: TokenManager.getAccessToken(),
      },
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();

  // Update auth token before connecting (it may have been refreshed)
  s.auth = { token: TokenManager.getAccessToken() };

  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
