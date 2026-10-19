/**
 * Application-wide constants.
 * Centralized here to avoid magic strings/numbers scattered in code.
 */

// Default pagination values
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// Stock thresholds
export const STOCK = {
  DEFAULT_REORDER_POINT: 10,
  DEAD_STOCK_DAYS: 30,
} as const;

// Cache TTLs (in seconds)
export const CACHE_TTL = {
  ANALYTICS: 300,       // 5 minutes
  PRODUCT_LIST: 60,     // 1 minute
  VENDOR_STATS: 300,    // 5 minutes
  DASHBOARD: 120,       // 2 minutes
} as const;

// BullMQ Queue names
export const QUEUES = {
  LOW_STOCK_ALERT: 'low-stock-alert',
  ORDER_NOTIFICATION: 'order-notification',
  SHIPMENT_ALERT: 'shipment-alert',
  REPORT_GENERATION: 'report-generation',
  AUDIT_LOG: 'audit-log',
} as const;

// HTTP Status codes (commonly used)
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL_ERROR: 500,
} as const;
