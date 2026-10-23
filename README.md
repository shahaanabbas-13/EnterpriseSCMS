# Enterprise SCMS

Enterprise SCMS is a web-based Supply Chain Management System for managing inventory, procurement, customer orders, shipments, and operational reporting across warehouse and supplier workflows.

## Project goals

The system models the movement of goods through a supply chain: suppliers provide products, warehouses hold stock, customer orders consume stock, and shipments track delivery. It is designed as a learning project around practical enterprise concepts such as role-based access, validated state transitions, stock movement history, asynchronous jobs, and analytics.

## Implemented capabilities

- **Authentication and access control:** JWT-based sign-in, access-token refresh, and role-based permissions for administrators, warehouse managers, operations managers, and vendors.
- **Inventory and warehouses:** Product and warehouse records, stock movement history, stock-in/stock-out operations, low-stock detection, and inventory analytics.
- **Replenishment and procurement:** Demand-based replenishment suggestions, supplier assignment, purchase-order creation, supplier acknowledgement, and goods receipt. Receipts can be partial; only the quantities physically received increase stock. Each receipt records stock movements and receipt details, and a PO becomes delivered only when all ordered quantities have been received.
- **Customer orders:** Order creation and validated lifecycle transitions through fulfillment. Stock is deducted when an order is shipped.
- **Shipments:** Tracking IDs, delivery status changes, tracking checkpoints, and order/shipment status synchronization.
- **Analytics and reports:** Dashboard summaries, revenue and product performance, inventory health and turnover, order fulfillment metrics, vendor performance, and revenue CSV export.
- **Audit activity:** Records important actions with the user, entity, timestamp, and available before-and-after values.
- **User administration:** Admin-managed staff and vendor accounts, including vendor-linked accounts with scoped purchase-order access.
- **Background processing:** Redis-backed BullMQ queues are initialized for low-stock alerts, order notifications, shipment alerts, report generation, and audit logging. A low-stock alert worker is currently registered.
- **Application events and sockets:** Domain events are emitted for stock changes, low-stock conditions, vendor performance updates, and audit activity. Socket.IO is initialized on the backend.

## Technology stack

| Area                              | Technologies                          |
| --------------------------------- | ------------------------------------- |
| Frontend                          | React, TypeScript, Vite, Lucide React |
| Backend                           | Node.js, Express, TypeScript          |
| Database                          | MongoDB with Mongoose                 |
| Authentication                    | JSON Web Tokens (JWT), bcryptjs       |
| Validation and API                | Zod, REST endpoints                   |
| Queues and cache infrastructure   | Redis, BullMQ, ioredis                |
| Live communication infrastructure | Socket.IO                             |
| HTTP and security middleware      | Helmet, CORS, Morgan                  |

## Application structure

```text
SCMS/
├── frontend/                 # React dashboard and role-specific workspaces
└── server/
    └── src/
        ├── config/           # Database, Redis, socket, and application config
        ├── controllers/      # HTTP request handlers
        ├── events/           # Domain event listeners
        ├── jobs/             # Queue setup and background workers
        ├── middleware/       # Authentication, authorization, validation, errors
        ├── models/           # Mongoose schemas
        ├── routes/           # REST API route modules
        ├── services/         # Business rules and data operations
        ├── types/            # Shared server-side types and enums
        └── validators/       # Request validation schemas
```

## Key workflows

### Procurement and inventory replenishment

1. Review replenishment suggestions based on recent outbound stock movement.
2. Assign a supplier where needed and create a purchase order for a warehouse.
3. Send the PO and have the linked supplier account acknowledge it.
4. Record one or more receipts with the quantities actually received.
5. Each receipt updates product stock and creates corresponding stock movement records in a MongoDB transaction. Partial receipts leave the PO open as `PARTIALLY_RECEIVED`; full receipt advances it to `DELIVERED`.

### Customer fulfillment

Orders move through validated states: `CREATED → APPROVED → PICKING → PACKED → SHIPPED → IN_TRANSIT → DELIVERED`, with return-related states supported. Shipment updates add tracking checkpoints and synchronize the associated order lifecycle.

### Purchase-order lifecycle

Purchase orders move through `DRAFT → SENT → ACKNOWLEDGED → PARTIALLY_RECEIVED → DELIVERED → CLOSED`. Receipt quantities—not a manual status change—determine when a PO is fully delivered.

## Data and business logic

MongoDB stores users, vendors, warehouses, products, stock movements, purchase orders, customer orders, shipments, and audit records. Mongoose schemas enforce document-level validation and indexes. Service-layer rules enforce role-sensitive operations, valid lifecycle transitions, warehouse consistency, and stock availability. Aggregation pipelines power operational reporting and vendor performance metrics.

## Current scope

The project currently focuses on core supply-chain workflows and operational analytics. Machine learning and deep learning features are not part of the current implementation; they can be considered later for forecasting or anomaly detection after the underlying operational data is sufficiently reliable.
