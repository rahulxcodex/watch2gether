import { io, Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "@watch2gether/shared";

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

let socketInstance: TypedSocket | null = null;

export function getSocket(token?: string): TypedSocket {
  if (!socketInstance || !socketInstance.connected) {
    socketInstance = io(SOCKET_SERVER_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      auth: {
        token: token || "",
      },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }) as TypedSocket;
  }
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
