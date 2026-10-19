import mongoose, { Document, Schema } from 'mongoose';
import { PurchaseOrderStatus } from '../types';

export interface IPurchaseOrderItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  quantity: number;
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

purchaseOrderSchema.index({ poNumber: 1 });
purchaseOrderSchema.index({ vendorId: 1, status: 1 });
purchaseOrderSchema.index({ warehouseId: 1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ expectedDeliveryDate: 1 });

export const PurchaseOrder = mongoose.model<IPurchaseOrderDocument>(
  'PurchaseOrder',
  purchaseOrderSchema
);
