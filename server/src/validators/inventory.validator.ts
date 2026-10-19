import { z } from 'zod';
import { StockMovementType } from '../types';

export const createProductSchema = {
  body: z.object({
    sku: z.string({ required_error: 'SKU is required' }).min(1).max(50).trim(),
    name: z.string({ required_error: 'Product name is required' }).min(1).max(300).trim(),
    description: z.string().max(2000).trim().optional(),
    category: z.string({ required_error: 'Category is required' }).min(1).trim(),
    unit: z.enum(['pieces', 'kg', 'liters', 'boxes', 'pallets', 'units'], {
      required_error: 'Unit is required',
    }),
    price: z.number({ required_error: 'Selling price is required' }).min(0),
    costPrice: z.number({ required_error: 'Cost price is required' }).min(0),
    reorderPoint: z.number().min(0).default(10),
    warehouseId: z.string({ required_error: 'Warehouse ID is required' }).min(1),
    vendorId: z.string().optional(),
    tags: z.array(z.string().trim()).optional(),
  }),
};

export const updateProductSchema = {
  body: z.object({
    name: z.string().min(1).max(300).trim().optional(),
    description: z.string().max(2000).trim().optional(),
    category: z.string().min(1).trim().optional(),
    unit: z.enum(['pieces', 'kg', 'liters', 'boxes', 'pallets', 'units']).optional(),
    price: z.number().min(0).optional(),
    costPrice: z.number().min(0).optional(),
    reorderPoint: z.number().min(0).optional(),
    warehouseId: z.string().optional(),
    vendorId: z.string().optional(),
    isActive: z.boolean().optional(),
    tags: z.array(z.string().trim()).optional(),
  }),
};

export const stockMovementSchema = {
  body: z.object({
    productId: z.string({ required_error: 'Product ID is required' }).min(1),
    type: z.nativeEnum(StockMovementType, {
      required_error: 'Movement type is required (IN, OUT, ADJUSTMENT)',
    }),
    quantity: z.number({ required_error: 'Quantity is required' }).min(1, 'Quantity must be at least 1'),
    reason: z.string({ required_error: 'Reason is required' }).min(1).max(500).trim(),
    referenceType: z.string().optional(),
    referenceId: z.string().optional(),
  }),
};
