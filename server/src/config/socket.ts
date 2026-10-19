import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import config from './index';
import { logger } from '../utils/logger';

let io: SocketServer | null = null;

export const initializeSocket = (httpServer: HttpServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Join role-based rooms (will be set after auth in Phase 1)
    socket.on('join:room', (room: string) => {
      socket.join(room);
      logger.debug(`Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  logger.info('Socket.io initialized');
  return io;
};

export const getIO = (): SocketServer => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket() first.');
  }
  return io;
};
