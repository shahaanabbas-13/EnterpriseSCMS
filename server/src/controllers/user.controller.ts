import { Response } from 'express';
import { User } from '../models/User.model';
import { AuthRequest, AuditAction, UserRole } from '../types';
import { AuditService } from '../services/audit.service';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { AuthService } from '../services/auth.service';
import { Vendor } from '../models/Vendor.model';
import mongoose from 'mongoose';

export class UserController {
  static async list(_req: AuthRequest, res: Response): Promise<void> {
    const users = await User.find().select('name email role vendorId isActive createdAt').populate('vendorId', 'name code status').sort({ createdAt: -1 }).lean();
    ApiResponse.success(res, users, 'Users retrieved');
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const { name, email, password, role, vendorId } = req.body;
    if (await User.exists({ email })) throw ApiError.conflict('Email already registered');
    if (role === UserRole.VENDOR) {
      if (!vendorId || !mongoose.isValidObjectId(vendorId)) throw ApiError.badRequest('A valid supplier is required for vendor accounts');
      const vendor = await Vendor.findById(vendorId).select('status');
      if (!vendor || vendor.status !== 'ACTIVE') throw ApiError.badRequest('Select an active supplier');
    }
    const user = await User.create({ name, email, password, role, ...(role === UserRole.VENDOR ? { vendorId } : {}) });
    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: user._id.toString(),
      newValue: { name: user.name, email: user.email, role: user.role, vendorId: user.vendorId?.toString(), isActive: user.isActive },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    ApiResponse.created(res, { _id: user._id, name: user.name, email: user.email, role: user.role, vendorId: user.vendorId, isActive: user.isActive, createdAt: user.createdAt }, 'User created');
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const target = await User.findById(req.params.id);
    if (!target) throw ApiError.notFound('User not found');
    const before = { role: target.role, vendorId: target.vendorId?.toString(), isActive: target.isActive };
    const nextRole = req.body.role as UserRole | undefined;
    const nextActive = req.body.isActive as boolean | undefined;
    const nextVendorId = req.body.vendorId as string | undefined;
    const resultingRole = nextRole ?? target.role;
    const resultingVendorId = resultingRole === UserRole.VENDOR ? (nextVendorId ?? target.vendorId?.toString()) : undefined;
    if (resultingRole === UserRole.VENDOR) {
      if (!resultingVendorId || !mongoose.isValidObjectId(resultingVendorId)) throw ApiError.badRequest('A valid supplier is required for vendor accounts');
      const vendor = await Vendor.findById(resultingVendorId).select('status');
      if (!vendor) throw ApiError.badRequest('Select an existing supplier');
      const assigningSupplier = target.role !== UserRole.VENDOR || resultingVendorId !== target.vendorId?.toString();
      if (assigningSupplier && vendor.status !== 'ACTIVE') throw ApiError.badRequest('Select an active supplier');
    }
    const removesAdmin = target.role === UserRole.ADMIN && (nextRole !== undefined && nextRole !== UserRole.ADMIN || nextActive === false);

    if (removesAdmin && target.isActive) {
      const activeAdmins = await User.countDocuments({ role: UserRole.ADMIN, isActive: true });
      if (activeAdmins <= 1) throw ApiError.badRequest('Cannot deactivate or demote the last active administrator');
    }
    if (target._id.toString() === req.user!.userId && nextActive === false) {
      throw ApiError.badRequest('You cannot deactivate your own account');
    }

    if (nextRole !== undefined) target.role = nextRole;
    if (nextActive !== undefined) target.isActive = nextActive;
    target.vendorId = resultingVendorId ? new mongoose.Types.ObjectId(resultingVendorId) : undefined;
    await target.save();

    const after = { role: target.role, vendorId: target.vendorId?.toString(), isActive: target.isActive };
    if (before.role !== after.role || before.isActive !== after.isActive || before.vendorId !== after.vendorId) {
      await AuthService.revokeAllUserTokens(target._id.toString());
    }
    await AuditService.log({
      userId: req.user!.userId,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: target._id.toString(),
      previousValue: before,
      newValue: { name: target.name, email: target.email, ...after },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    ApiResponse.success(res, { _id: target._id, name: target.name, email: target.email, ...after, createdAt: target.createdAt }, 'User updated');
  }
}
