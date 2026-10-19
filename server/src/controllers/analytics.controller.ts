import { Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { ApiResponse } from '../utils/ApiResponse';
import { AuthRequest } from '../types';
import { strOrUndefined } from '../utils/express-helpers';

/**
 * Analytics controller.
 * Powers the management dashboard with aggregated supply chain insights.
 */
export class AnalyticsController {
  static async getDashboardSummary(_req: AuthRequest, res: Response): Promise<void> {
    const data = await AnalyticsService.getDashboardSummary();
    ApiResponse.success(res, data, 'Dashboard summary');
  }

  static async getRevenueAnalytics(req: AuthRequest, res: Response): Promise<void> {
    const startDateStr = strOrUndefined(req.query.startDate);
    const endDateStr = strOrUndefined(req.query.endDate);

    const data = await AnalyticsService.getRevenueAnalytics(
      startDateStr ? new Date(startDateStr) : undefined,
      endDateStr ? new Date(endDateStr) : undefined
    );
    ApiResponse.success(res, data, 'Revenue analytics');
  }

  static async getInventoryAnalytics(_req: AuthRequest, res: Response): Promise<void> {
    const data = await AnalyticsService.getInventoryAnalytics();
    ApiResponse.success(res, data, 'Inventory analytics');
  }

  static async getOrderAnalytics(_req: AuthRequest, res: Response): Promise<void> {
    const data = await AnalyticsService.getOrderAnalytics();
    ApiResponse.success(res, data, 'Order analytics');
  }

  static async getVendorRankings(_req: AuthRequest, res: Response): Promise<void> {
    const data = await AnalyticsService.getVendorRankings();
    ApiResponse.success(res, data, 'Vendor rankings');
  }
}
