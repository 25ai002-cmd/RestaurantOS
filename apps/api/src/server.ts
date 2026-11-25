import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { registerSocketServer } from './realtime/socket.js';

const app = createApp();
const server = http.createServer(app);

export const io = new SocketIOServer(server, {
  cors: {
    origin: env.corsOriginsList,
    credentials: true,
  },
});

registerSocketServer(io);

io.on('connection', (socket) => {
  socket.on('join:tenant', (restaurantId: string) => {
    if (typeof restaurantId === 'string' && restaurantId.length > 0) {
      socket.join(`tenant:${restaurantId}`);
    }
  });
  socket.on('join:session', (tableSessionId: string) => {
    if (typeof tableSessionId === 'string' && tableSessionId.length > 0) {
      socket.join(`session:${tableSessionId}`);
    }
  });
});

async function start() {
  try {
    await prisma.$connect();
    server.listen(env.PORT, () => {
      console.log(`[RestaurantOS API] Listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    });
  } catch (err) {
    console.error('[RestaurantOS API] Failed to start:', err);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  console.log(`[RestaurantOS API] ${signal} received, closing gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
