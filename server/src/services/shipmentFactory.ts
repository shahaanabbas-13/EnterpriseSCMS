import mongoose from 'mongoose';
import crypto from 'crypto';
import { IOrderDocument } from '../models/Order.model';
import { Shipment, IShipmentDocument } from '../models/Shipment.model';
import { Warehouse } from '../models/Warehouse.model';
import { ApiError } from '../utils/ApiError';
import { ShipmentStatus } from '../types';

export interface ShipmentCreationDetails {
  carrier: { name: string; code: string; contactPhone?: string };
  estimatedDelivery: Date;
  shippingCost?: number;
}

/** Create the shipment record inside the order's transaction. */
export async function createShipmentForOrder(
  order: IOrderDocument,
  details: ShipmentCreationDetails,
  createdBy: string,
  session: mongoose.ClientSession
): Promise<IShipmentDocument> {
  const existingShipment = await Shipment.findOne({ orderId: order._id }).session(session);
  if (existingShipment) {
    throw ApiError.conflict(
      `Shipment already exists for order ${order.orderNumber}: ${existingShipment.trackingId}`
    );
  }

  const warehouse = await Warehouse.findById(order.warehouseId).session(session);
  if (!warehouse) throw ApiError.notFound('Warehouse not found');

  const shipment = new Shipment({
      orderId: order._id,
      trackingId: `TRK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      carrier: details.carrier,
      status: ShipmentStatus.CREATED,
      checkpoints: [{
        location: `${warehouse.name}, ${warehouse.location.city}`,
        timestamp: new Date(),
        status: 'Shipment created',
        note: 'Package ready for pickup',
      }],
      origin: {
        warehouseId: warehouse._id,
        address: warehouse.location.address,
        city: warehouse.location.city,
        state: warehouse.location.state,
        country: warehouse.location.country,
      },
      destination: {
        name: order.customer.name,
        address: order.customer.address.street,
        city: order.customer.address.city,
        state: order.customer.address.state,
        country: order.customer.address.country,
        zipCode: order.customer.address.zipCode,
      },
      estimatedDelivery: details.estimatedDelivery,
      shippingCost: details.shippingCost ?? order.shippingCost,
      createdBy: new mongoose.Types.ObjectId(createdBy),
    });
  await shipment.save({ session });

  return shipment;
}
