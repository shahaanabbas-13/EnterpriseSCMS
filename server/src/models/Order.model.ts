import mongoose, { Document, Schema } from 'mongoose';
import { OrderStatus } from '../types';

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface IStatusHistoryEntry {
  status: OrderStatus;
  timestamp: Date;
  changedBy: mongoose.Types.ObjectId;
  note?: string;
}

export interface IOrderDocument extends Document {
  orderNumber: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: {
      street: string;
      city: string;
      state: string;
      country: string;
      zipCode?: string;
    };
  };
  items: IOrderItem[];
  warehouseId: mongoose.Types.ObjectId;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  shippingCost: number;
  totalAmount: number;
  notes?: string;
  statusHistory: IStatusHistoryEntry[];
  approvedAt?: Date;
  packedAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const statusHistorySchema = new Schema<IStatusHistoryEntry>(
  {
    status: { type: String, enum: Object.values(OrderStatus), required: true },
    timestamp: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrderDocument>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    customer: {
      name: { type: String, required: [true, 'Customer name is required'], trim: true },
      email: {
        type: String,
        required: [true, 'Customer email is required'],
        lowercase: true,
        trim: true,
      },
      phone: { type: String, required: [true, 'Customer phone is required'], trim: true },
      address: {
        street: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        state: { type: String, required: true, trim: true },
        country: { type: String, required: true, trim: true },
        zipCode: { type: String, trim: true },
      },
    },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (v: IOrderItem[]) => v.length > 0,
        message: 'Order must have at least one item',
      },
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Warehouse is required'],
    },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.CREATED,
    },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    shippingCost: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, maxlength: 2000 },
    statusHistory: [statusHistorySchema],
    approvedAt: { type: Date },
    packedAt: { type: Date },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    strict: true,
  }
);

orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ warehouseId: 1, status: 1 });
orderSchema.index({ 'customer.email': 1 });
orderSchema.index({ createdBy: 1 });
orderSchema.index({ assignedTo: 1, status: 1 });

export const Order = mongoose.model<IOrderDocument>('Order', orderSchema);
