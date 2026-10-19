import { z } from 'zod';

export const createWarehouseSchema = {
  body: z.object({
    name: z.string({ required_error: 'Warehouse name is required' }).min(1).max(200).trim(),
    code: z.string({ required_error: 'Warehouse code is required' }).min(1).max(20).trim(),
    location: z.object({
      address: z.string({ required_error: 'Address is required' }).min(1).trim(),
      city: z.string({ required_error: 'City is required' }).min(1).trim(),
      state: z.string({ required_error: 'State is required' }).min(1).trim(),
      country: z.string({ required_error: 'Country is required' }).min(1).trim(),
      zipCode: z.string().trim().optional(),
    }),
    managerId: z.string({ required_error: 'Manager ID is required' }).min(1),
    capacity: z.number({ required_error: 'Capacity is required' }).min(1),
  }),
};

export const updateWarehouseSchema = {
  body: z.object({
    name: z.string().min(1).max(200).trim().optional(),
    location: z
      .object({
        address: z.string().min(1).trim(),
        city: z.string().min(1).trim(),
        state: z.string().min(1).trim(),
        country: z.string().min(1).trim(),
        zipCode: z.string().trim().optional(),
      })
      .optional(),
    managerId: z.string().optional(),
    capacity: z.number().min(1).optional(),
    isActive: z.boolean().optional(),
  }),
};
