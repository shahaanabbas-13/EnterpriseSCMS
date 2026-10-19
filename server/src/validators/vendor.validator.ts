import { z } from 'zod';
import { VendorStatus, PurchaseOrderStatus } from '../types';

const addressSchema = z.object({
  street: z.string({ required_error: 'Street is required' }).min(1).trim(),
  city: z.string({ required_error: 'City is required' }).min(1).trim(),
  state: z.string({ required_error: 'State is required' }).min(1).trim(),
  country: z.string({ required_error: 'Country is required' }).min(1).trim(),
  zipCode: z.string().trim().optional(),
});

export const createVendorSchema = {
  body: z.object({
    name: z.string({ required_error: 'Vendor name is required' }).min(1).max(200).trim(),
    code: z.string({ required_error: 'Vendor code is required' }).min(1).max(20).trim(),
    contactInfo: z.object({
      email: z.string().email('Invalid email format').trim().toLowerCase(),
      phone: z.string().min(1).trim(),
      contactPerson: z.string().min(1).trim(),
      address: addressSchema,
    }),
    categories: z.array(z.string().trim()).optional(),
    paymentTerms: z.string().trim().optional(),
    leadTimeDays: z.number().min(0).default(7),
    notes: z.string().max(2000).trim().optional(),
  }),
};

export const updateVendorSchema = {
  body: z.object({
    name: z.string().min(1).max(200).trim().optional(),
    contactInfo: z
      .object({
        email: z.string().email().trim().toLowerCase(),
        phone: z.string().min(1).trim(),
        contactPerson: z.string().min(1).trim(),
        address: addressSchema,
      })
      .optional(),
    categories: z.array(z.string().trim()).optional(),
    status: z.nativeEnum(VendorStatus).optional(),
    paymentTerms: z.string().trim().optional(),
    leadTimeDays: z.number().min(0).optional(),
    notes: z.string().max(2000).trim().optional(),
  }),
};

export const createPurchaseOrderSchema = {
  body: z.object({
    vendorId: z.string({ required_error: 'Vendor ID is required' }).min(1),
    warehouseId: z.string({ required_error: 'Warehouse ID is required' }).min(1),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          productName: z.string().min(1),
          sku: z.string().min(1),
          quantity: z.number().min(1),
          unitPrice: z.number().min(0),
        })
      )
      .min(1, 'At least one item is required'),
    expectedDeliveryDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid date format',
    }),
    notes: z.string().max(2000).trim().optional(),
  }),
};

export const updatePOStatusSchema = {
  body: z.object({
    status: z.nativeEnum(PurchaseOrderStatus, {
      required_error: 'Status is required',
    }),
  }),
};
