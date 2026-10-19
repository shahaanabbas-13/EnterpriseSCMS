import { AuditLog, IAuditLogDocument } from '../models/AuditLog.model';
import { AuditAction, PaginationQuery, PaginatedResult, AppEvents } from '../types';
import { appEvents } from '../events';
import { logger } from '../utils/logger';
import { PAGINATION } from '../utils/constants';

/**
 * Audit logging service.
 * Records every state-changing action in the system.
 *
 * Why this matters:
 * 1. Security: Track who changed what and when
 * 2. Compliance: Full audit trail for enterprise requirements
 * 3. ML: This data becomes training input for Phase 8 (anomaly detection, etc.)
 * 4. Debugging: Trace exact sequence of events that led to a state
 */
export class AuditService {
  /**
   * Log an audit action.
   * Called from controllers/services whenever a state-changing action occurs.
   */
  static async log(data: {
    userId: string;
    action: AuditAction;
    entity: string;
    entityId: string;
    previousValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<IAuditLogDocument> {
    const auditLog = await AuditLog.create({
      ...data,
      timestamp: new Date(),
    });

    // Emit event for potential real-time dashboard updates
    appEvents.emitEvent(AppEvents.AUDIT_LOG, {
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      userId: data.userId,
      timestamp: auditLog.timestamp,
    });

    logger.debug(
      `Audit: ${data.action} on ${data.entity}/${data.entityId} by ${data.userId}`
    );

    return auditLog;
  }

  /**
   * Query audit logs with pagination and filters.
   */
  static async getAuditLogs(
    filters: {
      userId?: string;
      action?: AuditAction;
      entity?: string;
      entityId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<IAuditLogDocument>> {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = pagination;

    // Build filter query
    const query: Record<string, unknown> = {};

    if (filters.userId) query.userId = filters.userId;
    if (filters.action) query.action = filters.action;
    if (filters.entity) query.entity = filters.entity;
    if (filters.entityId) query.entityId = filters.entityId;

    if (filters.startDate || filters.endDate) {
      const timestampFilter: Record<string, Date> = {};
      if (filters.startDate) timestampFilter.$gte = filters.startDate;
      if (filters.endDate) timestampFilter.$lte = filters.endDate;
      query.timestamp = timestampFilter;
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email role')
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return {
      data: data as IAuditLogDocument[],
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get audit history for a specific entity.
   * Shows complete change timeline for an order, product, vendor, etc.
   */
  static async getEntityHistory(
    entity: string,
    entityId: string
  ): Promise<IAuditLogDocument[]> {
    return AuditLog.find({ entity, entityId })
      .sort({ timestamp: -1 })
      .populate('userId', 'name email role')
      .lean() as Promise<IAuditLogDocument[]>;
  }
}
