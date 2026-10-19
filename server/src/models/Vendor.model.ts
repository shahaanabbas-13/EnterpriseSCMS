import mongoose, { Document, Schema } from 'mongoose';
import { VendorStatus } from '../types';

export interface IVendorDocument extends Document {
  name: string;
  code: string;
  contactInfo: {
    email: string;
    phone: string;
    contactPerson: string;
    address: {
      street: string;
      city: string;
      state: string;
      country: string;
      zipCode?: string;
    };
  };
  categories: string[];
  rating: number;
  status: VendorStatus;
  paymentTerms?: string;
  leadTimeDays: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const vendorSchema = new Schema<IVendorDocument>(
  {
    name: {
      type: String,
      required: [true, 'Vendor name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    code: {
      type: String,
      required: [true, 'Vendor code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    contactInfo: {
      email: {
        type: String,
        required: [true, 'Contact email is required'],
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
      },
      phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
      },
      contactPerson: {
        type: String,
        required: [true, 'Contact person name is required'],
        trim: true,
      },
      address: {
        street: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        state: { type: String, required: true, trim: true },
        country: { type: String, required: true, trim: true },
        zipCode: { type: String, trim: true },
      },
    },
    categories: [
      {
        type: String,
        trim: true,
      },
    ],
    rating: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be negative'],
      max: [5, 'Rating cannot exceed 5'],
    },
    status: {
      type: String,
      enum: Object.values(VendorStatus),
      default: VendorStatus.ACTIVE,
    },
    paymentTerms: {
      type: String,
      trim: true,
    },
    leadTimeDays: {
      type: Number,
      default: 7,
      min: [0, 'Lead time cannot be negative'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

vendorSchema.index({ code: 1 });
vendorSchema.index({ status: 1 });
vendorSchema.index({ categories: 1 });
vendorSchema.index({ rating: -1 });
vendorSchema.index({ name: 'text' });

export const Vendor = mongoose.model<IVendorDocument>('Vendor', vendorSchema);
