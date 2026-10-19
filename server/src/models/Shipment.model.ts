import mongoose, { Document, Schema } from 'mongoose';
import { ShipmentStatus } from '../types';

export interface ICheckpoint {
  location: string;
  timestamp: Date;
  status: string;
  note?: string;
}

export interface IShipmentDocument extends Document {
  orderId: mongoose.Types.ObjectId;
  trackingId: string;
  carrier: {
    name: string;
    code: string;
    contactPhone?: string;
  };
  status: ShipmentStatus;
  checkpoints: ICheckpoint[];
  origin: {
    warehouseId: mongoose.Types.ObjectId;
    address: string;
    city: string;
    state: string;
    country: string;
  };
  destination: {
    name: string;
    address: string;
    city: string;
    state: string;
    country: string;
    zipCode?: string;
  };
  estimatedDelivery: Date;
  actualDelivery?: Date;
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  shippingCost: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const checkpointSchema = new Schema<ICheckpoint>(
  {
    location: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, required: true, trim: true },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const shipmentSchema = new Schema<IShipmentDocument>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order ID is required'],
    },
    trackingId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    carrier: {
      name: { type: String, required: [true, 'Carrier name is required'], trim: true },
      code: { type: String, required: [true, 'Carrier code is required'], uppercase: true, trim: true },
      contactPhone: { type: String, trim: true },
    },
    status: {
      type: String,
      enum: Object.values(ShipmentStatus),
      default: ShipmentStatus.CREATED,
    },
    checkpoints: [checkpointSchema],
    origin: {
      warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
      address: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true },
    },
    destination: {
      name: { type: String, required: true, trim: true },
      address: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true },
      zipCode: { type: String, trim: true },
    },
    estimatedDelivery: {
      type: Date,
      required: [true, 'Estimated delivery date is required'],
    },
    actualDelivery: { type: Date },
    weight: { type: Number, min: 0 },
    dimensions: {
      length: { type: Number, min: 0 },
      width: { type: Number, min: 0 },
      height: { type: Number, min: 0 },
    },
    shippingCost: {
      type: Number,
      required: true,
      min: [0, 'Shipping cost cannot be negative'],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

shipmentSchema.index({ trackingId: 1 });
shipmentSchema.index({ orderId: 1 });
shipmentSchema.index({ status: 1, createdAt: -1 });
shipmentSchema.index({ 'carrier.code': 1 });
shipmentSchema.index({ estimatedDelivery: 1 });

export const Shipment = mongoose.model<IShipmentDocument>('Shipment', shipmentSchema);
