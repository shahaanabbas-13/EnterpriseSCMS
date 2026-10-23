import mongoose from 'mongoose';
import config from '../config';
import { User } from '../models/User.model';
import { UserRole } from '../types';

const readRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Set it in this terminal before running the command.`);
  }
  return value;
};

const bootstrapAdmin = async (): Promise<void> => {
  const name = readRequiredEnv('SCMS_ADMIN_NAME');
  const email = readRequiredEnv('SCMS_ADMIN_EMAIL').toLowerCase();
  const password = readRequiredEnv('SCMS_ADMIN_PASSWORD');

  if (name.length < 2 || name.length > 100) {
    throw new Error('SCMS_ADMIN_NAME must be between 2 and 100 characters.');
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('SCMS_ADMIN_EMAIL must be a valid email address.');
  }
  if (
    password.length < 8 ||
    password.length > 128 ||
    !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)
  ) {
    throw new Error(
      'SCMS_ADMIN_PASSWORD must be 8–128 characters and contain uppercase, lowercase, and numeric characters.'
    );
  }
  if (!config.mongo.uri) {
    throw new Error('MONGODB_URI is missing from the server environment.');
  }

  await mongoose.connect(config.mongo.uri);

  try {
    const existingAdmin = await User.findOne({ role: UserRole.ADMIN }).select('_id email');
    if (existingAdmin) {
      throw new Error(
        `An Admin account already exists (${existingAdmin.email}). Bootstrap stopped without changes.`
      );
    }

    const existingUser = await User.findOne({ email }).select('_id');
    if (existingUser) {
      throw new Error(`An account with ${email} already exists. Bootstrap stopped without changes.`);
    }

    const admin = await User.create({
      name,
      email,
      password,
      role: UserRole.ADMIN,
    });

    console.info(`Initial Admin account created: ${admin.email} (${admin._id.toString()})`);
    console.info('The password was not printed. Sign in through POST /api/auth/login.');
  } finally {
    await mongoose.disconnect();
  }
};

bootstrapAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
  console.error(`Admin bootstrap failed: ${message}`);
  process.exitCode = 1;
});
