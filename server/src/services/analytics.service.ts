import mongoose from 'mongoose';
import { Order } from '../models/Order.model';
import { Product } from '../models/Product.model';
import { Shipment } from '../models/Shipment.model';
import { StockMovement } from '../models/StockMovement.model';
import { Vendor } from '../models/Vendor.model';
import { PurchaseOrder } from '../models/PurchaseOrder.model';
import {
  OrderStatus,
  ShipmentStatus,
  PurchaseOrderStatus,
  VendorStatus,
} from '../types';
import { logger } from '../utils/logger';

/**
 * Analytics service.
 * Provides aggregated insights across the entire supply chain.
 * This is where the system becomes impressive — complex MongoDB pipelines
 * that pull actionable intelligence from raw data.
 */
export class AnalyticsService {
  /**
   * Revenue analytics: total revenue, daily/monthly trends, top products.
   */
  static async getRevenueAnalytics(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    revenueByMonth: Array<{ month: string; revenue: number; orders: number }>;
    topProducts: Array<{ sku: string; name: string; revenue: number; unitsSold: number }>;
  }> {
    const dateMatch: Record<string, unknown> = {
      status: { $in: [OrderStatus.DELIVERED, OrderStatus.SHIPPED, OrderStatus.IN_TRANSIT] },
    };
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
      dateMatch.createdAt = dateFilter;
    }

    const [result] = await Order.aggregate([
      { $match: dateMatch },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$totalAmount' },
                totalOrders: { $sum: 1 },
                avgOrderValue: { $avg: '$totalAmount' },
              },
            },
          ],
          revenueByMonth: [
            {
              $group: {
                _id: {
                  year: { $year: '$createdAt' },
                  month: { $month: '$createdAt' },
                },
                revenue: { $sum: '$totalAmount' },
                orders: { $sum: 1 },
              },
            },
            {
              $project: {
                month: {
                  $concat: [
                    { $toString: '$_id.year' },
                    '-',
                    {
                      $cond: [
                        { $lt: ['$_id.month', 10] },
                        { $concat: ['0', { $toString: '$_id.month' }] },
                        { $toString: '$_id.month' },
                      ],
                    },
                  ],
                },
                revenue: 1,
                orders: 1,
                _id: 0,
              },
            },
            { $sort: { month: 1 } },
          ],
          topProducts: [
            { $unwind: '$items' },
            {
              $group: {
                _id: '$items.sku',
                name: { $first: '$items.productName' },
                revenue: { $sum: '$items.totalPrice' },
                unitsSold: { $sum: '$items.quantity' },
              },
            },
            { $project: { sku: '$_id', name: 1, revenue: 1, unitsSold: 1, _id: 0 } },
            { $sort: { revenue: -1 } },
            { $limit: 10 },
          ],
        },
      },
    ]);

    const overview = result?.overview?.[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      avgOrderValue: 0,
    };

    return {
      totalRevenue: Math.round(overview.totalRevenue * 100) / 100,
      totalOrders: overview.totalOrders,
      avgOrderValue: Math.round((overview.avgOrderValue || 0) * 100) / 100,
      revenueByMonth: result?.revenueByMonth || [],
      topProducts: result?.topProducts || [],
    };
  }

  /**
   * Inventory analytics: turnover rate, stock value, category distribution.
   */
  static async getInventoryAnalytics(): Promise<{
    totalProducts: number;
    totalStockValue: number;
    avgStockValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    categoryDistribution: Array<{ category: string; count: number; value: number }>;
    turnoverRate: number;
  }> {
    const [productStats] = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalProducts: { $sum: 1 },
                totalStockValue: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
                avgStockValue: { $avg: { $multiply: ['$currentStock', '$costPrice'] } },
                lowStockCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $lte: ['$currentStock', '$reorderPoint'] },
                          { $gt: ['$currentStock', 0] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                outOfStockCount: {
                  $sum: { $cond: [{ $eq: ['$currentStock', 0] }, 1, 0] },
                },
              },
            },
          ],
          categoryDistribution: [
            {
              $group: {
                _id: '$category',
                count: { $sum: 1 },
                value: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
              },
            },
            { $project: { category: '$_id', count: 1, value: 1, _id: 0 } },
            { $sort: { value: -1 } },
          ],
        },
      },
    ]);

    // Calculate turnover rate from stock movements (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [movementStats] = await StockMovement.aggregate([
      {
        $match: {
          type: 'OUT',
          timestamp: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: null,
          totalOutQuantity: { $sum: { $abs: '$quantity' } },
        },
      },
    ]);

    const overview = productStats?.overview?.[0] || {
      totalProducts: 0,
      totalStockValue: 0,
      avgStockValue: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    };

    const totalOut = movementStats?.totalOutQuantity || 0;
    const avgInventory = overview.totalProducts > 0 ? overview.totalStockValue / overview.totalProducts : 1;
    const turnoverRate = avgInventory > 0 ? Math.round((totalOut / avgInventory) * 100) / 100 : 0;

    return {
      ...overview,
      categoryDistribution: productStats?.categoryDistribution || [],
      turnoverRate,
    };
  }

  /**
   * Order analytics: status breakdown, fulfillment time, daily volume.
   */
  static async getOrderAnalytics(): Promise<{
    totalOrders: number;
    statusBreakdown: Array<{ status: string; count: number; percentage: number }>;
    avgFulfillmentDays: number;
    ordersByDay: Array<{ date: string; count: number }>;
  }> {
    const [result] = await Order.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          statusBreakdown: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $project: { status: '$_id', count: 1, _id: 0 } },
            { $sort: { count: -1 } },
          ],
          fulfillment: [
            {
              $match: {
                status: OrderStatus.DELIVERED,
                deliveredAt: { $exists: true },
              },
            },
            {
              $addFields: {
                fulfillmentDays: {
                  $divide: [
                    { $subtract: ['$deliveredAt', '$createdAt'] },
                    1000 * 60 * 60 * 24,
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                avgFulfillmentDays: { $avg: '$fulfillmentDays' },
              },
            },
          ],
          ordersByDay: [
            {
              $match: {
                createdAt: {
                  $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
                count: { $sum: 1 },
              },
            },
            { $project: { date: '$_id', count: 1, _id: 0 } },
            { $sort: { date: 1 } },
          ],
        },
      },
    ]);

    const totalOrders = result?.total?.[0]?.count || 0;
    const statusBreakdown = (result?.statusBreakdown || []).map(
      (s: { status: string; count: number }) => ({
        ...s,
        percentage: totalOrders > 0 ? Math.round((s.count / totalOrders) * 100) : 0,
      })
    );

    return {
      totalOrders,
      statusBreakdown,
      avgFulfillmentDays:
        Math.round((result?.fulfillment?.[0]?.avgFulfillmentDays || 0) * 10) / 10,
      ordersByDay: result?.ordersByDay || [],
    };
  }

  /**
   * Vendor rankings by performance score.
   */
  static async getVendorRankings(): Promise<
    Array<{
      vendorId: string;
      name: string;
      code: string;
      totalPOs: number;
      onTimeRate: number;
      totalSpend: number;
      avgLeadDays: number;
    }>
  > {
    const vendors = await Vendor.find({ status: VendorStatus.ACTIVE }).lean();

    const rankings = await Promise.all(
      vendors.map(async (vendor) => {
        const [stats] = await PurchaseOrder.aggregate([
          { $match: { vendorId: vendor._id } },
          {
            $facet: {
              overview: [
                { $group: { _id: null, totalPOs: { $sum: 1 }, totalSpend: { $sum: '$totalCost' } } },
              ],
              delivery: [
                {
                  $match: {
                    status: PurchaseOrderStatus.DELIVERED,
                    actualDeliveryDate: { $exists: true },
                  },
                },
                {
                  $addFields: {
                    isOnTime: { $lte: ['$actualDeliveryDate', '$expectedDeliveryDate'] },
                    leadDays: {
                      $divide: [
                        { $subtract: ['$actualDeliveryDate', '$createdAt'] },
                        1000 * 60 * 60 * 24,
                      ],
                    },
                  },
                },
                {
                  $group: {
                    _id: null,
                    delivered: { $sum: 1 },
                    onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } },
                    avgLeadDays: { $avg: '$leadDays' },
                  },
                },
              ],
            },
          },
        ]);

        const overview = stats?.overview?.[0] || { totalPOs: 0, totalSpend: 0 };
        const delivery = stats?.delivery?.[0] || { delivered: 0, onTime: 0, avgLeadDays: 0 };

        return {
          vendorId: vendor._id.toString(),
          name: vendor.name,
          code: vendor.code,
          totalPOs: overview.totalPOs,
          onTimeRate:
            delivery.delivered > 0
              ? Math.round((delivery.onTime / delivery.delivered) * 100)
              : 0,
          totalSpend: overview.totalSpend,
          avgLeadDays: Math.round((delivery.avgLeadDays || 0) * 10) / 10,
        };
      })
    );

    return rankings.sort((a, b) => b.onTimeRate - a.onTimeRate);
  }

  /**
   * Full dashboard summary — everything at a glance.
   * This single endpoint powers the main dashboard.
   */
  static async getDashboardSummary(): Promise<{
    revenue: { total: number; thisMonth: number; lastMonth: number; growth: number };
    orders: { total: number; pending: number; shipped: number; delivered: number };
    inventory: { totalProducts: number; lowStock: number; outOfStock: number; totalValue: number };
    shipments: { active: number; delayed: number; onTimeRate: number };
    vendors: { total: number; active: number };
  }> {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      thisMonthRevenue,
      lastMonthRevenue,
      orderCounts,
      inventoryStats,
      shipmentStats,
      vendorCounts,
    ] = await Promise.all([
      // This month revenue
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfThisMonth },
            status: { $in: [OrderStatus.DELIVERED, OrderStatus.SHIPPED, OrderStatus.IN_TRANSIT] },
          },
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      // Last month revenue
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth },
            status: { $in: [OrderStatus.DELIVERED, OrderStatus.SHIPPED, OrderStatus.IN_TRANSIT] },
          },
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      // Order counts
      Order.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: {
              $sum: {
                $cond: [
                  { $in: ['$status', [OrderStatus.CREATED, OrderStatus.APPROVED, OrderStatus.PICKING, OrderStatus.PACKED]] },
                  1,
                  0,
                ],
              },
            },
            shipped: {
              $sum: {
                $cond: [
                  { $in: ['$status', [OrderStatus.SHIPPED, OrderStatus.IN_TRANSIT]] },
                  1,
                  0,
                ],
              },
            },
            delivered: {
              $sum: { $cond: [{ $eq: ['$status', OrderStatus.DELIVERED] }, 1, 0] },
            },
          },
        },
      ]),
      // Inventory stats
      Product.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            totalValue: { $sum: { $multiply: ['$currentStock', '$costPrice'] } },
            lowStock: {
              $sum: {
                $cond: [
                  { $and: [{ $lte: ['$currentStock', '$reorderPoint'] }, { $gt: ['$currentStock', 0] }] },
                  1,
                  0,
                ],
              },
            },
            outOfStock: {
              $sum: { $cond: [{ $eq: ['$currentStock', 0] }, 1, 0] },
            },
          },
        },
      ]),
      // Shipment stats
      Shipment.aggregate([
        {
          $facet: {
            active: [
              {
                $match: {
                  status: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.FAILED] },
                },
              },
              { $count: 'count' },
            ],
            delayed: [
              {
                $match: {
                  status: { $nin: [ShipmentStatus.DELIVERED, ShipmentStatus.FAILED] },
                  estimatedDelivery: { $lt: now },
                },
              },
              { $count: 'count' },
            ],
            onTime: [
              {
                $match: {
                  status: ShipmentStatus.DELIVERED,
                  actualDelivery: { $exists: true },
                },
              },
              {
                $addFields: {
                  isOnTime: { $lte: ['$actualDelivery', '$estimatedDelivery'] },
                },
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  onTime: { $sum: { $cond: ['$isOnTime', 1, 0] } },
                },
              },
            ],
          },
        },
      ]),
      // Vendor counts
      Vendor.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', VendorStatus.ACTIVE] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const thisMonth = thisMonthRevenue[0]?.total || 0;
    const lastMonth = lastMonthRevenue[0]?.total || 0;
    const growth = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;

    const orders = orderCounts[0] || { total: 0, pending: 0, shipped: 0, delivered: 0 };
    const inventory = inventoryStats[0] || { totalProducts: 0, totalValue: 0, lowStock: 0, outOfStock: 0 };
    const shipments = shipmentStats[0] || { active: [], delayed: [], onTime: [] };
    const vendors = vendorCounts[0] || { total: 0, active: 0 };

    const onTimeData = shipments.onTime?.[0];
    const onTimeRate = onTimeData && onTimeData.total > 0
      ? Math.round((onTimeData.onTime / onTimeData.total) * 100)
      : 0;

    return {
      revenue: {
        total: thisMonth + lastMonth,
        thisMonth: Math.round(thisMonth * 100) / 100,
        lastMonth: Math.round(lastMonth * 100) / 100,
        growth,
      },
      orders: {
        total: orders.total,
        pending: orders.pending,
        shipped: orders.shipped,
        delivered: orders.delivered,
      },
      inventory: {
        totalProducts: inventory.totalProducts,
        lowStock: inventory.lowStock,
        outOfStock: inventory.outOfStock,
        totalValue: Math.round(inventory.totalValue * 100) / 100,
      },
      shipments: {
        active: shipments.active?.[0]?.count || 0,
        delayed: shipments.delayed?.[0]?.count || 0,
        onTimeRate,
      },
      vendors: {
        total: vendors.total,
        active: vendors.active,
      },
    };
  }
}
