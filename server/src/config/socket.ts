import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import config from './index';
import { logger } from '../utils/logger';
import { AuthService } from '../services/auth.service';
import { User } from '../models/User.model';
import { UserRole } from '../types';

let io: SocketServer | null = null;

export const initializeSocket = (httpServer: HttpServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: config.env === 'development'
        ? [...new Set([config.cors.origin, 'http://localhost:5173', 'http://127.0.0.1:5173'])]
        : config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  // Authenticate every socket from the short-lived access token and derive
  // rooms from the database role; clients cannot request privileged rooms.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) return next(new Error('Authentication required'));
      const payload = AuthService.verifyAccessToken(token);
      const user = await User.findById(payload.userId).select('role vendorId isActive').lean();
      if (!user || !user.isActive) return next(new Error('Account is inactive or unavailable'));
      socket.data.user = {
        userId: user._id.toString(),
        role: user.role,
        vendorId: user.vendorId?.toString(),
      };
      next();
    } catch {
      next(new Error('Invalid or expired access token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    const { userId, role, vendorId } = socket.data.user as { userId: string; role: UserRole; vendorId?: string };
    socket.join(`role:${role}`);
    socket.join(`user:${userId}`);
    if (role === UserRole.VENDOR && vendorId) socket.join(`vendor:${vendorId}`);
    logger.debug(`Socket ${socket.id} joined authenticated rooms for ${role}`);

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

export const disconnectUserSockets = (userId: string): void => {
  if (!io) return;
  io.in(`user:${userId}`).disconnectSockets(true);
};
