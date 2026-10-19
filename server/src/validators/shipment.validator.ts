import { z } from 'zod';
import { ShipmentStatus } from '../types';

export const createShipmentSchema = {
  body: z.object({
    orderId: z.string({ required_error: 'Order ID is required' }).min(1),
    carrier: z.object({
      name: z.string({ required_error: 'Carrier name is required' }).min(1).trim(),
      code: z.string({ required_error: 'Carrier code is required' }).min(1).trim(),
      contactPhone: z.string().trim().optional(),
    }),
    estimatedDelivery: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Invalid date format',
    }),
    weight: z.number().min(0).optional(),
    dimensions: z
      .object({
        length: z.number().min(0),
        width: z.number().min(0),
        height: z.number().min(0),
      })
      .optional(),
    shippingCost: z.number({ required_error: 'Shipping cost is required' }).min(0),
  }),
};

export const updateShipmentStatusSchema = {
  body: z.object({
    status: z.nativeEnum(ShipmentStatus, { required_error: 'Status is required' }),
    location: z.string({ required_error: 'Location is required' }).min(1).trim(),
    note: z.string().max(500).trim().optional(),
  }),
};

export const addCheckpointSchema = {
  body: z.object({
    location: z.string({ required_error: 'Location is required' }).min(1).trim(),
    status: z.string({ required_error: 'Status description is required' }).min(1).trim(),
    note: z.string().max(500).trim().optional(),
  }),
};
