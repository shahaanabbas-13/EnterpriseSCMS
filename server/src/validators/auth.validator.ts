import { z } from 'zod';
import { UserRole } from '../types';

/**
 * Zod validation schemas for auth endpoints.
 * These are passed to the validate() middleware.
 *
 * Each schema defines what body/query/params are acceptable.
 * Invalid requests never reach the controller — they're caught here.
 */

export const registerSchema = {
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Invalid email format')
      .trim()
      .toLowerCase(),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password cannot exceed 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    name: z
      .string({ required_error: 'Name is required' })
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name cannot exceed 100 characters')
      .trim(),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Invalid email format')
      .trim()
      .toLowerCase(),
    password: z
      .string({ required_error: 'Password is required' })
      .min(1, 'Password is required'),
    role: z.nativeEnum(UserRole).optional(),
  }),
};

export const refreshSchema = {
  body: z.object({
    refreshToken: z
      .string({ required_error: 'Refresh token is required' })
      .min(1, 'Refresh token is required'),
  }),
};

export const logoutSchema = {
  body: z.object({
    refreshToken: z
      .string({ required_error: 'Refresh token is required' })
      .min(1, 'Refresh token is required'),
  }),
};

export const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8).max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain an uppercase letter, a lowercase letter, and a number'),
  }),
};
