import { z } from 'zod';
import { UserRole } from '../types';

export const createUserSchema = {
  body: z.object({
    name: z.string().min(2).max(100).trim(),
    email: z.string().email().trim().toLowerCase(),
    password: z.string().min(8).max(128).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and a number'),
    role: z.nativeEnum(UserRole),
    vendorId: z.string().optional(),
  }).refine(data => data.role !== UserRole.VENDOR || !!data.vendorId, 'Select a supplier for vendor accounts'),
};

export const updateUserSchema = {
  body: z.object({
    role: z.nativeEnum(UserRole).optional(),
    isActive: z.boolean().optional(),
    vendorId: z.string().optional(),
  }).refine(data => data.role !== undefined || data.isActive !== undefined || data.vendorId !== undefined, 'Provide a role, supplier, or account status to update'),
};
