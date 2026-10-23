import { z } from 'zod';
import { OrderStatus } from '../types';

const addressSchema = z.object({
  street: z.string({ required_error: 'Street is required' }).min(1).trim(),
  city: z.string({ required_error: 'City is required' }).min(1).trim(),
  state: z.string({ required_error: 'State is required' }).min(1).trim(),
  country: z.string({ required_error: 'Country is required' }).min(1).trim(),
  zipCode: z.string().trim().optional(),
});

export const createOrderSchema = {
  body: z.object({
    customer: z.object({
      name: z.string({ required_error: 'Customer name is required' }).min(1).trim(),
      email: z.string().email('Invalid email').trim().toLowerCase(),
      phone: z.string().min(1).trim(),
      address: addressSchema,
    }),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().min(1, 'Quantity must be at least 1'),
        })
      )
      .min(1, 'At least one item is required'),
    warehouseId: z.string({ required_error: 'Warehouse ID is required' }).min(1),
    tax: z.number().min(0).default(0),
    shippingCost: z.number().min(0).default(0),
    notes: z.string().max(2000).trim().optional(),
  }),
};

export const updateOrderStatusSchema = {
  body: z.object({
    status: z.nativeEnum(OrderStatus, {
      required_error: 'Status is required',
    }),
    note: z.string().max(500).trim().optional(),
    shipment: z.object({
      carrier: z.object({
        name: z.string().min(1).trim(),
        code: z.string().min(1).trim(),
        contactPhone: z.string().trim().optional(),
      }),
      estimatedDelivery: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
        message: 'Invalid estimated delivery date',
      }),
      shippingCost: z.number().min(0).optional(),
    }).optional(),
  }).superRefine((body, context) => {
    if (body.status === OrderStatus.SHIPPED && !body.shipment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shipment'],
        message: 'Carrier and estimated delivery details are required when shipping an order',
      });
    }
  }),
};

export const assignOrderSchema = {
  body: z.object({
    assigneeId: z.string({ required_error: 'Assignee ID is required' }).min(1),
  }),
};
