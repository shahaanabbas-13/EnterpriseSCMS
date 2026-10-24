import mongoose, { Document, Schema } from 'mongoose';
import { PurchaseOrderStatus } from '../types';

export interface IPurchaseOrderItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface IPurchaseOrderDocument extends Document {
  poNumber: string;
  vendorId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  items: IPurchaseOrderItem[];
  totalCost: number;
  status: PurchaseOrderStatus;
  expectedDeliveryDate: Date;
  actualDeliveryDate?: Date;
  vendorResponse?: { response: 'ACKNOWLEDGED' | 'REJECTED'; note?: string; proposedDeliveryDate?: Date; respondedAt: Date };
  dispatchDetails?: { carrier: string; trackingNumber: string; dispatchedAt: Date; note?: string };
  dispatchHistory: Array<{ carrier: string; trackingNumber: string; dispatchedAt: Date; note?: string; recordedAt: Date; recordedBy: mongoose.Types.ObjectId }>;
  statusHistory: Array<{ fromStatus?: PurchaseOrderStatus; toStatus: PurchaseOrderStatus; changedBy: mongoose.Types.ObjectId; timestamp: Date; note?: string }>;
  receiptHistory: Array<{
    receivedBy: mongoose.Types.ObjectId;
    receivedAt: Date;
    note?: string;
    items: Array<{ productId: mongoose.Types.ObjectId; quantity: number }>;
  }>;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseOrderItemSchema = new Schema<IPurchaseOrderItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },
    receivedQuantity: { type: Number, min: 0, default: 0 },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price cannot be negative'],
    },
    totalPrice: {
      type: Number,
      required: true,
      min: [0, 'Total price cannot be negative'],
    },
  },
  { _id: false }
);

const purchaseOrderSchema = new Schema<IPurchaseOrderDocument>(
  {
    poNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'Vendor',
      required: [true, 'Vendor is required'],
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Destination warehouse is required'],
    },
    items: {
      type: [purchaseOrderItemSchema],
      validate: {
        validator: (v: IPurchaseOrderItem[]) => v.length > 0,
        message: 'Purchase order must have at least one item',
      },
    },
    totalCost: {
      type: Number,
      required: true,
      min: [0, 'Total cost cannot be negative'],
    },
    status: {
      type: String,
      enum: Object.values(PurchaseOrderStatus),
      default: PurchaseOrderStatus.DRAFT,
    },
    expectedDeliveryDate: {
      type: Date,
      required: [true, 'Expected delivery date is required'],
    },
    actualDeliveryDate: {
      type: Date,
    },
    vendorResponse: {
      response: { type: String, enum: ['ACKNOWLEDGED', 'REJECTED'] },
      note: { type: String, trim: true, maxlength: 1000 },
      proposedDeliveryDate: Date,
      respondedAt: Date,
    },
    dispatchDetails: {
      carrier: { type: String, trim: true, maxlength: 120 },
      trackingNumber: { type: String, trim: true, maxlength: 120 },
      dispatchedAt: Date,
      note: { type: String, trim: true, maxlength: 1000 },
    },
    dispatchHistory: [{
      carrier: { type: String, required: true, trim: true, maxlength: 120 },
      trackingNumber: { type: String, required: true, trim: true, maxlength: 120 },
      dispatchedAt: { type: Date, required: true },
      note: { type: String, trim: true, maxlength: 1000 },
      recordedAt: { type: Date, required: true, default: Date.now },
      recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    }],
    statusHistory: [{
      fromStatus: { type: String, enum: Object.values(PurchaseOrderStatus) },
      toStatus: { type: String, enum: Object.values(PurchaseOrderStatus), required: true },
      changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      timestamp: { type: Date, required: true, default: Date.now },
      note: { type: String, trim: true, maxlength: 1000 },
    }],
    receiptHistory: [{
      receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      receivedAt: { type: Date, required: true, default: Date.now },
      note: { type: String, trim: true, maxlength: 1000 },
      items: [{
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true, min: 1 },
      }],
    }],
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

purchaseOrderSchema.index({ vendorId: 1, status: 1 });
purchaseOrderSchema.index({ warehouseId: 1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ expectedDeliveryDate: 1 });

export const PurchaseOrder = mongoose.model<IPurchaseOrderDocument>(
  'PurchaseOrder',
  purchaseOrderSchema
);
