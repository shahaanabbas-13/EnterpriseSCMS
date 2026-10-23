import mongoose, { Document, Schema } from 'mongoose';

export interface IProductDocument extends Document {
  sku: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  price: number;
  costPrice: number;
  reorderPoint: number;
  currentStock: number;
  warehouseId: mongoose.Types.ObjectId;
  vendorId?: mongoose.Types.ObjectId;
  isActive: boolean;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProductDocument>(
  {
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [300, 'Name cannot exceed 300 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
      trim: true,
      enum: ['pieces', 'kg', 'liters', 'boxes', 'pallets', 'units'],
    },
    price: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Price cannot be negative'],
    },
    costPrice: {
      type: Number,
      required: [true, 'Cost price is required'],
      min: [0, 'Cost price cannot be negative'],
    },
    reorderPoint: {
      type: Number,
      default: 10,
      min: [0, 'Reorder point cannot be negative'],
    },
    currentStock: {
      type: Number,
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: [true, 'Warehouse assignment is required'],
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'Vendor',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tags: [{ type: String, trim: true }],
  },
  {
    timestamps: true,
    strict: true,
  }
);

productSchema.index({ category: 1 });
productSchema.index({ warehouseId: 1 });
productSchema.index({ currentStock: 1, reorderPoint: 1 });
productSchema.index({ name: 'text', description: 'text', sku: 'text' });

export const Product = mongoose.model<IProductDocument>('Product', productSchema);
