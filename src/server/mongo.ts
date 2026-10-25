import dotenv from 'dotenv';
import { Collection, Db, MongoClient, ObjectId } from 'mongodb';

dotenv.config({ path: ['.env.local', '.env'] });

export interface License {
  id: string;
  license_key: string;
  full_name: string;
  phone: string;
  email: string;
  amount: string;
  status: 'pending' | 'approved' | 'blocked';
  duration_label: string;
  expires_at: string | null;
  lifetime: boolean;
  max_devices: number;
  license_devices: string[];
  created_at: string;
  updated_at: string;
}

export interface SignalRecord {
  id: string;
  pair: string;
  market: string;
  timer: string;
  mode: 'live' | 'future';
  direction: 'BUY' | 'SELL';
  entry: string;
  expiry: string;
  accuracy?: string;
  strength?: string;
  created_at: string;
}

export interface AppConfig {
  apiKey: string;
  recoveryEmail: string;
  allowMasterApiKeyBypass: boolean;
  adminPassword?: string;
  whatsappUrl: string;
  telegramUrl: string;
  phone: string;
  developer: string;
}

type LicenseDocument = License & { _id?: ObjectId };
type SignalDocument = SignalRecord & { _id?: ObjectId };

let client: MongoClient | null = null;
let dbInstance: Db | null = null;
let connectPromise: Promise<Db> | null = null;
let licenseIndexesPromise: Promise<void> | null = null;

async function getDb(): Promise<Db> {
  if (dbInstance) return dbInstance;

  if (!connectPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not set. Add it to .env.local or your deployment environment.');
    }

    connectPromise = (async () => {
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 10 });
      await client.connect();
      const databaseName = process.env.MONGODB_DB_NAME || 'frking';
      dbInstance = client.db(databaseName);
      console.log(`MongoDB connected to database "${databaseName}"`);
      return dbInstance;
    })().catch((error: unknown) => {
      const failedClient = client;
      connectPromise = null;
      client = null;
      void failedClient?.close();
      throw error;
    });
  }

  return connectPromise;
}

export async function getLicensesCollection(): Promise<Collection<LicenseDocument>> {
  const collection = (await getDb()).collection<LicenseDocument>('licenses');
  if (!licenseIndexesPromise) {
    licenseIndexesPromise = Promise.all([
      collection.createIndex({ id: 1 }, { unique: true, sparse: true }),
      collection.createIndex(
        { license_key: 1 },
        { unique: true, collation: { locale: 'en', strength: 2 } },
      ),
    ]).then(() => undefined).catch((error: unknown) => {
      licenseIndexesPromise = null;
      throw error;
    });
  }
  await licenseIndexesPromise;
  return collection;
}

export async function getSignalsCollection(): Promise<Collection<SignalDocument>> {
  return (await getDb()).collection<SignalDocument>('signals');
}

export async function getConfigCollection(): Promise<Collection<{ _id: string } & Partial<AppConfig>>> {
  return (await getDb()).collection<{ _id: string } & Partial<AppConfig>>('config');
}

export async function pingMongo(): Promise<boolean> {
  await (await getDb()).command({ ping: 1 });
  return true;
}
