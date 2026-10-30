import { AuditLog } from '../models/AuditLog.model';
import { Order } from '../models/Order.model';
import { Product } from '../models/Product.model';
import { PurchaseOrder } from '../models/PurchaseOrder.model';
import { Shipment } from '../models/Shipment.model';
import { StockMovement } from '../models/StockMovement.model';
import { User } from '../models/User.model';
import { Vendor } from '../models/Vendor.model';
import { Warehouse } from '../models/Warehouse.model';
import { AnalyticsService } from './analytics.service';
import { InventoryService } from './inventory.service';
import { ShipmentService } from './shipment.service';
import { VendorService } from './vendor.service';

/**
 * Captures one sanitized, read-only view of current workspace data for the public
 * recruiter demo. The promise is intentionally cached for this server process:
 * operational changes made after the first demo visit cannot change the demo.
 */
export class DemoSnapshotService {
  private static snapshot: Promise<Record<string, unknown>> | null = null;

  static getSnapshot(): Promise<Record<string, unknown>> {
    if (!this.snapshot) this.snapshot = this.capture().catch(error => {
      this.snapshot = null;
      throw error;
    });
    return this.snapshot;
  }

  private static async capture(): Promise<Record<string, unknown>> {
    const capturedAt = new Date().toISOString();
    const [summary, revenue, inventory, orderAnalytics, vendorRankings, replenishment, shipmentStats,
      products, warehouses, orders, shipments, vendors, purchaseOrders, movements, users, audits,
      vendorCount, userCount, orderCount, shipmentCount, poCount, movementCount, auditCount] = await Promise.all([
      AnalyticsService.getDashboardSummary(),
      AnalyticsService.getRevenueAnalytics(),
      AnalyticsService.getInventoryAnalytics(),
      AnalyticsService.getOrderAnalytics(),
      AnalyticsService.getVendorRankings(),
      InventoryService.getReplenishmentPlan(),
      ShipmentService.getShipmentStats(),
      Product.find({ isActive: true }).select('sku name category unit price costPrice reorderPoint currentStock warehouseId vendorId isActive createdAt updatedAt').populate('warehouseId', 'name code location.city').populate('vendorId', 'name code leadTimeDays rating status').sort({ name: 1 }).lean(),
      Warehouse.find({ isActive: true }).select('name code location.city location.state capacity currentOccupancy isActive').sort({ name: 1 }).lean(),
      Order.find().select('orderNumber customer.name customer.address.city items status subtotal tax shippingCost totalAmount statusHistory approvedAt packedAt shippedAt deliveredAt createdAt updatedAt warehouseId').populate('warehouseId', 'name code location.city').sort({ createdAt: -1 }).limit(200).lean(),
      Shipment.find().select('trackingId orderId carrier.name carrier.code status checkpoints.location checkpoints.timestamp checkpoints.status origin.city destination.city destination.state estimatedDelivery actualDelivery shippingCost createdAt updatedAt').populate({ path: 'orderId', select: 'orderNumber customer.name' }).sort({ createdAt: -1 }).limit(200).lean(),
      Vendor.find().select('name code categories rating status leadTimeDays paymentTerms createdAt updatedAt').sort({ name: 1 }).lean(),
      PurchaseOrder.find().select('poNumber vendorId warehouseId items totalCost status expectedDeliveryDate actualDeliveryDate vendorResponse.response vendorResponse.proposedDeliveryDate vendorResponse.respondedAt dispatchDetails.carrier dispatchDetails.trackingNumber dispatchDetails.dispatchedAt statusHistory.toStatus statusHistory.timestamp receiptHistory.receivedAt receiptHistory.items createdAt updatedAt').populate('vendorId', 'name code').populate('warehouseId', 'name code location.city').sort({ createdAt: -1 }).limit(200).lean(),
      StockMovement.find().select('productId warehouseId type quantity previousStock newStock reason referenceType referenceId timestamp').populate('productId', 'sku name').populate('warehouseId', 'name code').sort({ timestamp: -1 }).limit(100).lean(),
      User.find().select('name role vendorId isActive createdAt').populate('vendorId', 'name code').sort({ createdAt: -1 }).lean(),
      AuditLog.find().select('userId action entity entityId previousValue newValue timestamp').populate('userId', 'name role').sort({ timestamp: -1 }).limit(100).lean(),
      Vendor.countDocuments(), User.countDocuments(), Order.countDocuments(), Shipment.countDocuments(), PurchaseOrder.countDocuments(), StockMovement.countDocuments(), AuditLog.countDocuments(),
    ]);

    // Never publish customer contact details, supplier contact details, login
    // emails, IP addresses, user agents, or free-form internal notes publicly.
    const safeOrders = orders.map((order, index) => ({
      ...order,
      customer: { name: `Customer ${String(index + 1).padStart(2, '0')}`, address: { city: order.customer?.address?.city || '' } },
      statusHistory: (order.statusHistory || []).map(entry => ({ status: entry.status, timestamp: entry.timestamp })),
    }));
    const safeShipments = shipments.map(shipment => ({
      ...shipment,
      destination: { city: shipment.destination?.city || '', state: shipment.destination?.state || '' },
      checkpoints: (shipment.checkpoints || []).map(entry => ({ location: entry.location, timestamp: entry.timestamp, status: entry.status })),
    }));
    const safeMovements = movements.map(movement => ({ ...movement, reason: movement.referenceType || 'Stock movement' }));
    const roleIndex: Record<string, number> = {};
    const safeUsers = users.map(user => {
      const role = String(user.role || 'USER');
      roleIndex[role] = (roleIndex[role] || 0) + 1;
      return {
        _id: user._id,
        name: `${role.replaceAll('_', ' ')} ${String(roleIndex[role]).padStart(2, '0')}`,
        role: user.role,
        vendorId: user.vendorId,
        isActive: user.isActive,
        createdAt: user.createdAt,
      };
    });
    const safeAudits = audits.map(audit => {
      const actor = audit.userId as unknown as { name?: string; role?: string } | null;
      return {
        _id: audit._id,
        userId: actor?.name ? { name: actor.name, role: actor.role } : null,
        action: audit.action,
        entity: audit.entity,
        entityId: audit.entityId,
        previousValue: sanitizeAuditValue(audit.previousValue),
        newValue: sanitizeAuditValue(audit.newValue),
        timestamp: audit.timestamp,
      };
    });
    const vendorPerformance = await Promise.all(vendors.map(async vendor => ({
      vendorId: String(vendor._id),
      name: vendor.name,
      code: vendor.code,
      ...(await VendorService.getVendorPerformance(String(vendor._id))),
    })));

    return {
      capturedAt,
      source: 'workspace database snapshot',
      readOnly: true,
      counts: { vendors: vendorCount, users: userCount, orders: orderCount, shipments: shipmentCount, purchaseOrders: poCount, stockMovements: movementCount, auditEntries: auditCount },
      summary, revenue, inventory, orderAnalytics, vendorRankings, replenishment, shipmentStats,
      products, warehouses, orders: safeOrders, shipments: safeShipments, vendors, purchaseOrders,
      movements: safeMovements, users: safeUsers, audits: safeAudits, vendorPerformance,
    };
  }
}

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(email|phone|password|secret|token|address|ipaddress|useragent|contact|note|name)/i.test(key))
    .map(([key, child]) => [key, sanitizeAuditValue(child)]));
}
