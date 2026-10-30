import mongoose from "mongoose";
import config from "./index";
import { logger } from "../utils/logger";

let connectionPromise: Promise<void> | null = null;

export const connectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) return;
  if (connectionPromise) return connectionPromise;

  connectionPromise = connectWithRetry();
  try {
    await connectionPromise;
  } finally {
    connectionPromise = null;
  }
};

const connectWithRetry = async (): Promise<void> => {
  if (!config.mongo.uri) {
    throw new Error("MONGODB_URI is missing from environment configuration");
  }

  await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 10000 });
  logger.info(`MongoDB connected: ${mongoose.connection.host}`);

  // Connection event listeners
  mongoose.connection.on("error", (err) => {
    logger.error("MongoDB connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected. Attempting reconnection...");
  });
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected gracefully.");
};
