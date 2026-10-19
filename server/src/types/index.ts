import { Request } from 'express';

// ─── User & Auth ────────────────────────────────────────────

export enum UserRole {
  ADMIN = 'ADMIN',
  WAREHOUSE_MANAGER = 'WAREHOUSE_MANAGER',
  VENDOR = 'VENDOR',
  OPERATIONS_MANAGER = 'OPERATIONS_MANAGER',
}

export interface IUser {
  _id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ─── API Response ───────────────────────────────────────────

export interface ApiResponseShape<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown[];
}

// ─── Pagination ─────────────────────────────────────────────

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// ─── Audit Log ──────────────────────────────────────────────

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  STATUS_CHANGE = 'STATUS_CHANGE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
}

export interface IAuditLog {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  timestamp: Date;
}

// ─── Inventory ──────────────────────────────────────────────

export enum StockMovementType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
}

// ─── Orders ─────────────────────────────────────────────────

export enum OrderStatus {
  CREATED = 'CREATED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PICKING = 'PICKING',
  PACKED = 'PACKED',
  SHIPPED = 'SHIPPED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  RETURN_REQUESTED = 'RETURN_REQUESTED',
  RETURNED = 'RETURNED',
}

// ─── Purchase Orders ────────────────────────────────────────

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  DELIVERED = 'DELIVERED',
  CLOSED = 'CLOSED',
}

// ─── Vendors ────────────────────────────────────────────────

export enum VendorStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLACKLISTED = 'BLACKLISTED',
}

// ─── Shipments ──────────────────────────────────────────────

export enum ShipmentStatus {
  CREATED = 'CREATED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  DELAYED = 'DELAYED',
  FAILED = 'FAILED',
}

// ─── Socket Events ──────────────────────────────────────────

export enum SocketEvents {
  STOCK_UPDATE = 'stock:update',
  LOW_STOCK_ALERT = 'stock:low-alert',
  ORDER_STATUS_CHANGE = 'order:status-change',
  SHIPMENT_UPDATE = 'shipment:update',
  SHIPMENT_DELAYED = 'shipment:delayed',
}

// ─── App Events (Internal EventEmitter) ─────────────────────

export enum AppEvents {
  STOCK_CHANGED = 'stock.changed',
  LOW_STOCK_DETECTED = 'stock.low',
  ORDER_CREATED = 'order.created',
  ORDER_STATUS_CHANGED = 'order.status_changed',
  SHIPMENT_CREATED = 'shipment.created',
  SHIPMENT_CHECKPOINT_ADDED = 'shipment.checkpoint_added',
  SHIPMENT_DELAYED = 'shipment.delayed',
  VENDOR_PERFORMANCE_UPDATE = 'vendor.performance_update',
  AUDIT_LOG = 'audit.log',
}
