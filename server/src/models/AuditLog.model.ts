import mongoose, { Document, Schema } from 'mongoose';
import { AuditAction } from '../types';

export interface IAuditLogDocument extends Document {
  userId: mongoose.Types.ObjectId;
  action: AuditAction;
  entity: string;
  entityId: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: Object.values(AuditAction),
      required: true,
    },
    entity: {
      type: String,
      required: true,
      trim: true,
    },
    entityId: {
      type: String,
      required: true,
    },
    previousValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    strict: true,
    // No timestamps option — we use our own timestamp field for ML precision
  }
);

// Indexes for efficient querying
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLogDocument>('AuditLog', auditLogSchema);
