import mongoose, { Document, Schema } from 'mongoose';
import { StockMovementType } from '../types';

export interface IStockMovementDocument extends Document {
  productId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  type: StockMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  referenceType?: string;
  referenceId?: mongoose.Types.ObjectId;
  performedBy: mongoose.Types.ObjectId;
  timestamp: Date;
}

const stockMovementSchema = new Schema<IStockMovementDocument>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(StockMovementType),
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    previousStock: {
      type: Number,
      required: true,
    },
    newStock: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: [true, 'Reason for stock movement is required'],
      trim: true,
    },
    referenceType: {
      type: String,
      enum: ['PurchaseOrder', 'Order', 'Manual', 'Adjustment'],
      default: 'Manual',
    },
    referenceId: {
      type: Schema.Types.ObjectId,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    strict: true,
  }
);

stockMovementSchema.index({ productId: 1, timestamp: -1 });
stockMovementSchema.index({ warehouseId: 1, timestamp: -1 });
stockMovementSchema.index({ performedBy: 1 });
stockMovementSchema.index({ type: 1, timestamp: -1 });

export const StockMovement = mongoose.model<IStockMovementDocument>(
  'StockMovement',
  stockMovementSchema
);
