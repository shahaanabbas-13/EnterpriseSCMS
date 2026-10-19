import mongoose, { Document, Schema } from 'mongoose';

export interface IRefreshTokenDocument extends Document {
  token: string;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
  isRevoked: boolean;
  replacedByToken?: string;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
    replacedByToken: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// TTL Index: MongoDB auto-deletes documents when expiresAt is reached
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for user token lookups
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });

export const RefreshToken = mongoose.model<IRefreshTokenDocument>(
  'RefreshToken',
  refreshTokenSchema
);
