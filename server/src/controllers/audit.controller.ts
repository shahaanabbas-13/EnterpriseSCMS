import { Response } from 'express';
import { AuditService } from '../services/audit.service';
import { Order } from '../models/Order.model';
import { ApiResponse } from '../utils/ApiResponse';
import { AuthRequest, AuditAction } from '../types';
import { numOrUndefined, strOrUndefined } from '../utils/express-helpers';

export class AuditController {
  static async getLogs(req: AuthRequest, res: Response): Promise<void> {
    const startDate = strOrUndefined(req.query.startDate);
    const endDate = strOrUndefined(req.query.endDate);
    const result = await AuditService.getAuditLogs(
      {
        action: strOrUndefined(req.query.action) as AuditAction | undefined,
        entity: strOrUndefined(req.query.entity),
        entityId: strOrUndefined(req.query.entityId),
        userId: strOrUndefined(req.query.userId),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
      {
        page: numOrUndefined(req.query.page),
        limit: numOrUndefined(req.query.limit),
        sortBy: 'timestamp',
        sortOrder: 'desc',
      }
    );

    // Older status-change audit records did not store previousValue. Recover
    // historical order transitions from the order's own status history.
    const missingOrderTransitions = result.data.filter((entry) =>
      entry.entity === 'Order' &&
      entry.action === AuditAction.STATUS_CHANGE &&
      !entry.previousValue?.status &&
      typeof entry.newValue?.status === 'string'
    );
    const orderIds = [...new Set(missingOrderTransitions.map((entry) => entry.entityId))];
    const orders = orderIds.length
      ? await Order.find({ _id: { $in: orderIds } }).select('statusHistory').lean()
      : [];
    const orderById = new Map(orders.map((order) => [order._id.toString(), order]));
    const data = result.data.map((entry) => {
      if (
        entry.entity !== 'Order' ||
        entry.action !== AuditAction.STATUS_CHANGE ||
        entry.previousValue?.status ||
        typeof entry.newValue?.status !== 'string'
      ) return entry;

      const order = orderById.get(entry.entityId);
      const history = order?.statusHistory || [];
      const targetTime = new Date(entry.timestamp).getTime();
      let matchingIndex = -1;
      let smallestDelta = Number.POSITIVE_INFINITY;
      history.forEach((change, index) => {
        const delta = Math.abs(new Date(change.timestamp).getTime() - targetTime);
        if (change.status === entry.newValue!.status && delta < smallestDelta) {
          matchingIndex = index;
          smallestDelta = delta;
        }
      });

      const previous = matchingIndex > 0 ? history[matchingIndex - 1]?.status : undefined;
      return previous
        ? { ...entry, previousValue: { ...(entry.previousValue || {}), status: previous } }
        : entry;
    });

    ApiResponse.paginated(
      res,
      data,
      result.pagination.total,
      result.pagination.page,
      result.pagination.limit,
      'Audit log entries retrieved'
    );
  }
}
