import mongoose, { Document, Schema } from 'mongoose';

export interface IWarehouseDocument extends Document {
  name: string;
  code: string;
  location: {
    address: string;
    city: string;
    state: string;
    country: string;
    zipCode?: string;
  };
  managerId: mongoose.Types.ObjectId;
  capacity: number;
  currentOccupancy: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const warehouseSchema = new Schema<IWarehouseDocument>(
  {
    name: {
      type: String,
      required: [true, 'Warehouse name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    code: {
      type: String,
      required: [true, 'Warehouse code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    location: {
      address: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true },
      zipCode: { type: String, trim: true },
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Manager assignment is required'],
    },
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: [1, 'Capacity must be at least 1'],
    },
    currentOccupancy: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

warehouseSchema.index({ code: 1 });
warehouseSchema.index({ managerId: 1 });
warehouseSchema.index({ isActive: 1 });

export const Warehouse = mongoose.model<IWarehouseDocument>('Warehouse', warehouseSchema);
