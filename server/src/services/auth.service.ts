import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User, IUserDocument } from "../models/User.model";
import { RefreshToken } from "../models/RefreshToken.model";
import { ApiError } from "../utils/ApiError";
import { JwtPayload, UserRole } from "../types";
import config from "../config";
import { logger } from "../utils/logger";

/**
 * Authentication service.
 * Handles registration, login, token generation, rotation, and revocation.
 *
 * Key security features:
 * - Passwords hashed with bcrypt (12 salt rounds) via User model pre-save hook
 * - Access tokens: short-lived JWTs (15min)
 * - Refresh tokens: cryptographically random, stored in DB, rotated on each use
 * - Token reuse detection: if a revoked token is reused, ALL user tokens are revoked
 */
export class AuthService {
  /**
   * Register a new user.
   */
  static async register(data: {
    email: string;
    password: string;
    name: string;
  }): Promise<{
    user: IUserDocument;
    accessToken: string;
    refreshToken: string;
  }> {
    // Check if email already exists
    const existing = await User.findOne({ email: data.email });
    if (existing) {
      throw ApiError.conflict("Email already registered");
    }

    // Create user (password hashed via pre-save hook)
    const user = await User.create({
      email: data.email,
      password: data.password,
      name: data.name,
      role: UserRole.VENDOR,
    });

    // Generate token pair
    const { accessToken, refreshToken } = await this.generateTokenPair(user);

    logger.info(`User registered: ${user.email} (${user.role})`);
    return { user, accessToken, refreshToken };
  }

  /**
   * Login with email and password.
   */
  static async login(
    email: string,
    password: string,
  ): Promise<{
    user: IUserDocument;
    accessToken: string;
    refreshToken: string;
  }> {
    // Find user with password field included (select: false by default)
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    if (!user.isActive) {
      throw ApiError.forbidden("Account is deactivated. Contact admin.");
    }

    // Compare passwords
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    // Generate token pair
    const { accessToken, refreshToken } = await this.generateTokenPair(user);

    logger.info(`User logged in: ${user.email}`);
    return { user, accessToken, refreshToken };
  }

  /**
   * Refresh access token using a valid refresh token.
   * Implements ROTATION: old refresh token is revoked, new pair issued.
   * If a revoked token is reused, all user tokens are revoked (security measure).
   */
  static async refreshAccessToken(
    token: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Find the refresh token in DB
    const existingToken = await RefreshToken.findOne({ token });

    if (!existingToken) {
      throw ApiError.unauthorized("Invalid refresh token");
    }

    // Token reuse detection: if token was already revoked, revoke ALL user tokens
    if (existingToken.isRevoked) {
      await RefreshToken.updateMany(
        { userId: existingToken.userId },
        { isRevoked: true },
      );
      logger.warn(
        `Refresh token reuse detected for user: ${existingToken.userId}`,
      );
      throw ApiError.unauthorized(
        "Token reuse detected. All sessions revoked for security.",
      );
    }

    // Check expiry
    if (existingToken.expiresAt < new Date()) {
      existingToken.isRevoked = true;
      await existingToken.save();
      throw ApiError.unauthorized("Refresh token expired");
    }

    // Get user
    const user = await User.findById(existingToken.userId);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized("User not found or deactivated");
    }

    // Revoke old token
    existingToken.isRevoked = true;

    // Generate new pair
    const { accessToken, refreshToken: newRefreshToken } =
      await this.generateTokenPair(user);

    // Link old token to new one (for audit trail)
    existingToken.replacedByToken = newRefreshToken;
    await existingToken.save();

    logger.debug(`Token rotated for user: ${user.email}`);
    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout — revoke the refresh token.
   */
  static async logout(refreshToken: string): Promise<void> {
    const token = await RefreshToken.findOne({ token: refreshToken });
    if (token) {
      token.isRevoked = true;
      await token.save();
    }
    logger.debug("User logged out");
  }

  /**
   * Revoke all refresh tokens for a user.
   * Used on password change, security breach, admin action.
   */
  static async revokeAllUserTokens(userId: string): Promise<void> {
    await RefreshToken.updateMany(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    logger.info(`All tokens revoked for user: ${userId}`);
  }

  /**
   * Verify an access token and return the payload.
   */
  static verifyAccessToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
    } catch (error) {
      if ((error as Error).name === "TokenExpiredError") {
        throw ApiError.unauthorized("Access token expired");
      }
      throw ApiError.unauthorized("Invalid access token");
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────

  /**
   * Generate an access + refresh token pair.
   */
  private static async generateTokenPair(
    user: IUserDocument,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      ...(user.vendorId ? { vendorId: user.vendorId.toString() } : {}),
    };

    // Access token (short-lived JWT)
    const signOptions = {
      expiresIn: config.jwt.accessExpiry,
    } as jwt.SignOptions;
    const accessToken = jwt.sign(payload, config.jwt.accessSecret, signOptions);

    // Refresh token (long-lived, opaque, stored in DB)
    const refreshTokenValue = crypto.randomBytes(64).toString("hex");

    // Calculate expiry from config string (e.g., '7d')
    const expiresIn = this.parseExpiry(config.jwt.refreshExpiry);
    const expiresAt = new Date(Date.now() + expiresIn);

    await RefreshToken.create({
      token: refreshTokenValue,
      userId: user._id,
      expiresAt,
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }

  /**
   * Parse expiry string (e.g., '7d', '15m', '1h') to milliseconds.
   */
  private static parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }
}
