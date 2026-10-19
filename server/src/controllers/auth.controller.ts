import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AuditService } from '../services/audit.service';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User.model';
import { AuthRequest, AuditAction } from '../types';

/**
 * Auth controller.
 * Handles HTTP layer for authentication endpoints.
 * Business logic lives in AuthService — controller only handles req/res.
 */
export class AuthController {
  /**
   * POST /api/auth/register
   * Creates a new user account and returns tokens.
   */
  static async register(req: Request, res: Response): Promise<void> {
    const { email, password, name, role } = req.body;

    const { user, accessToken, refreshToken } = await AuthService.register({
      email,
      password,
      name,
      role,
    });

    // Audit log
    await AuditService.log({
      userId: user._id.toString(),
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: user._id.toString(),
      newValue: { email: user.email, name: user.name, role: user.role },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.created(
      res,
      {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
      'Registration successful'
    );
  }

  /**
   * POST /api/auth/login
   * Authenticates user and returns tokens.
   */
  static async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;

    const { user, accessToken, refreshToken } = await AuthService.login(
      email,
      password
    );

    // Audit log
    await AuditService.log({
      userId: user._id.toString(),
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: user._id.toString(),
      newValue: { email: user.email, role: user.role },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    ApiResponse.success(
      res,
      {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
      'Login successful'
    );
  }

  /**
   * POST /api/auth/refresh
   * Issues new token pair using a valid refresh token.
   */
  static async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;

    const tokens = await AuthService.refreshAccessToken(refreshToken);

    ApiResponse.success(res, tokens, 'Token refreshed');
  }

  /**
   * POST /api/auth/logout
   * Revokes the refresh token.
   */
  static async logout(req: AuthRequest, res: Response): Promise<void> {
    const { refreshToken } = req.body;

    await AuthService.logout(refreshToken);

    // Audit log if user is authenticated
    if (req.user) {
      await AuditService.log({
        userId: req.user.userId,
        action: AuditAction.LOGOUT,
        entity: 'User',
        entityId: req.user.userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    ApiResponse.success(res, null, 'Logged out successfully');
  }

  /**
   * GET /api/auth/profile
   * Returns the authenticated user's profile.
   */
  static async getProfile(req: AuthRequest, res: Response): Promise<void> {
    const user = await User.findById(req.user!.userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    ApiResponse.success(
      res,
      {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      'Profile retrieved'
    );
  }
}
