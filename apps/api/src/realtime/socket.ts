import type { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export function registerSocketServer(io: SocketIOServer) {
  ioInstance = io;
}

export function emitTenantEvent(restaurantId: string, event: string, payload: unknown) {
  if (!ioInstance) return;
  ioInstance.to(`tenant:${restaurantId}`).emit(event, payload);
}

export function emitSessionEvent(tableSessionId: string, event: string, payload: unknown) {
  if (!ioInstance) return;
  ioInstance.to(`session:${tableSessionId}`).emit(event, payload);
}
