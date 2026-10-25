import { randomInt, randomUUID } from 'node:crypto';
import {
  getConfigCollection,
  getLicensesCollection,
  getSignalsCollection,
  License,
  SignalRecord,
  AppConfig,
} from './mongo';

export type { License, SignalRecord, AppConfig };

export interface DatabaseSchema {
  config: AppConfig;
  licenses: License[];
  signals: SignalRecord[];
}

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: process.env.API_KEY || '',
  recoveryEmail: process.env.RECOVERY_EMAIL || '',
  allowMasterApiKeyBypass: process.env.ALLOW_MASTER_KEY_BYPASS === 'true',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  whatsappUrl: process.env.WHATSAPP_URL || 'https://chat.whatsapp.com/G1yKmNVIntiLx7c9KX5zEu',
  telegramUrl: process.env.TELEGRAM_URL || 'https://t.me/frking00',
  phone: process.env.PHONE || '+966554573612',
  developer: process.env.DEVELOPER || '@codetrader',
};

let legacyConfigCleanup: Promise<void> | null = null;

function calculateExpiry(durationLabel: string): {
  expires_at: string | null;
  lifetime: boolean;
} {
  if (durationLabel === 'Lifetime') return { expires_at: null, lifetime: true };

  const durationDays: Record<string, number> = {
    '1 Day': 1,
    '2 Days': 2,
    '3 Days': 3,
    '5 Days': 5,
    '1 Week': 7,
    '15 Days': 15,
    '1 Month': 30,
    '3 Months': 90,
    '6 Months': 180,
    '1 Year': 365,
  };
  const days = durationDays[durationLabel];
  if (!days) throw new Error('Unsupported license duration.');

  return {
    expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    lifetime: false,
  };
}

function makeId(): string {
  return `lic_${randomUUID()}`;
}

function toLicense(doc: Omit<License, 'id'> & { id?: string; _id?: { toString(): string } }): License {
  const { _id, ...license } = doc;
  const id = license.id || _id?.toString();
  if (!id) throw new Error('MongoDB license record is missing its identifier.');
  return { ...license, id } as License;
}

function toSignal(doc: Omit<SignalRecord, 'id'> & { id?: string; _id?: { toString(): string } }): SignalRecord {
  const { _id, ...signal } = doc;
  const id = signal.id || _id?.toString();
  if (!id) throw new Error('MongoDB signal record is missing its identifier.');
  return { ...signal, id } as SignalRecord;
}

class Database {
  public async getConfig(): Promise<AppConfig> {
    const col = await getConfigCollection();
    if (!legacyConfigCleanup) {
      legacyConfigCleanup = col.updateOne(
        { _id: 'app' },
        { $unset: { supabaseUrl: '', supabaseAnonKey: '', authMode: '' } },
      ).then(() => undefined).catch((error: unknown) => {
        legacyConfigCleanup = null;
        throw error;
      });
    }
    await legacyConfigCleanup;
    const doc = await col.findOne({ _id: 'app' });
    if (!doc) return { ...DEFAULT_CONFIG };
    return {
      ...DEFAULT_CONFIG,
      apiKey: typeof doc.apiKey === 'string' ? doc.apiKey : DEFAULT_CONFIG.apiKey,
      recoveryEmail: typeof doc.recoveryEmail === 'string' ? doc.recoveryEmail : DEFAULT_CONFIG.recoveryEmail,
      allowMasterApiKeyBypass: typeof doc.allowMasterApiKeyBypass === 'boolean'
        ? doc.allowMasterApiKeyBypass
        : DEFAULT_CONFIG.allowMasterApiKeyBypass,
      adminPassword: typeof doc.adminPassword === 'string' ? doc.adminPassword : DEFAULT_CONFIG.adminPassword,
      whatsappUrl: typeof doc.whatsappUrl === 'string' ? doc.whatsappUrl : DEFAULT_CONFIG.whatsappUrl,
      telegramUrl: typeof doc.telegramUrl === 'string' ? doc.telegramUrl : DEFAULT_CONFIG.telegramUrl,
      phone: typeof doc.phone === 'string' ? doc.phone : DEFAULT_CONFIG.phone,
      developer: typeof doc.developer === 'string' ? doc.developer : DEFAULT_CONFIG.developer,
    };
  }

  public async updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
    const col = await getConfigCollection();
    await col.updateOne({ _id: 'app' }, { $set: updates }, { upsert: true });
    return this.getConfig();
  }

  public async getLicenses(): Promise<License[]> {
    const col = await getLicensesCollection();
    const docs = await col.find({}).sort({ created_at: -1 }).toArray();
    return docs.map(toLicense);
  }

  public async addOrUpdateLicense(license: License): Promise<void> {
    const col = await getLicensesCollection();
    await col.updateOne(
      { id: license.id },
      { $set: license },
      { upsert: true },
    );
  }

  public async findLicenseByKey(key: string): Promise<License | null> {
    const cleanKey = key.trim().toUpperCase();
    const col = await getLicensesCollection();
    const doc = await col.findOne(
      { license_key: cleanKey },
      { collation: { locale: 'en', strength: 2 } },
    );
    if (doc) return toLicense(doc);

    const byId = await col.findOne({ id: cleanKey });
    return byId ? toLicense(byId) : null;
  }

  public async findLicenseById(id: string): Promise<License | null> {
    const col = await getLicensesCollection();
    const doc = await col.findOne({
      $or: [{ id }, { license_key: id.toUpperCase() }],
    }, { collation: { locale: 'en', strength: 2 } });
    return doc ? toLicense(doc) : null;
  }

  public async createLicense(input: {
    custom_key?: string;
    full_name: string;
    phone: string;
    email: string;
    amount: string;
    duration?: string;
    max_devices?: number;
    status?: 'pending' | 'approved' | 'blocked';
  }): Promise<License> {
    const licenseKey =
      input.custom_key?.trim().toUpperCase() ||
      `FRK-${randomInt(1000, 10000)}-${randomInt(1000, 10000)}-${randomInt(1000, 10000)}`;
    const durationLabel = input.duration || '1 Month';
    const { expires_at, lifetime } = calculateExpiry(durationLabel);

    const newLicense: License = {
      id: makeId(),
      license_key: licenseKey,
      full_name: input.full_name.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      amount: input.amount.trim() || 'Paid',
      status: input.status || 'pending',
      duration_label: durationLabel,
      expires_at,
      lifetime,
      max_devices: input.max_devices ?? 1,
      license_devices: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const col = await getLicensesCollection();
    try {
      await col.insertOne(newLicense);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new Error('A license with this key already exists.');
      }
      throw error;
    }
    return newLicense;
  }

  public async updateLicenseAction(
    idOrKey: string,
    action: string,
    duration?: string,
    maxDevices?: number,
    deviceId?: string,
  ): Promise<{ ok: boolean; error?: string; license?: License }> {
    const license = await this.findLicenseById(idOrKey);
    if (!license) return { ok: false, error: 'License not found.' };

    const updates: Partial<License> = { updated_at: new Date().toISOString() };

    if (action === 'delete') {
      const col = await getLicensesCollection();
      const result = await col.deleteOne({ id: license.id });
      return result.deletedCount === 1
        ? { ok: true }
        : { ok: false, error: 'License not found.' };
    }
    if (action === 'approve') {
      updates.status = 'approved';
      if (duration) {
        const expiry = calculateExpiry(duration);
        updates.duration_label = duration;
        updates.expires_at = expiry.expires_at;
        updates.lifetime = expiry.lifetime;
      }
      if (maxDevices !== undefined) updates.max_devices = maxDevices;
    } else if (action === 'block') {
      updates.status = 'blocked';
    } else if (action === 'reset_devices') {
      updates.license_devices = [];
    } else if (action === 'remove_device' && deviceId) {
      updates.license_devices = (license.license_devices || []).filter(
        (device) => device.toLowerCase() !== deviceId.trim().toLowerCase(),
      );
    } else {
      return { ok: false, error: `Unknown action: ${action}` };
    }

    const col = await getLicensesCollection();
    const result = await col.updateOne({ id: license.id }, { $set: updates });
    if (result.matchedCount !== 1) return { ok: false, error: 'License not found.' };

    const updatedLicense = await this.findLicenseById(license.id);
    return updatedLicense
      ? { ok: true, license: updatedLicense }
      : { ok: false, error: 'Updated license could not be read.' };
  }

  public async bindDevice(
    licenseKey: string,
    deviceId: string,
  ): Promise<{ ok: boolean; error?: string; license?: License }> {
    const license = await this.findLicenseByKey(licenseKey);
    if (!license) return { ok: false, error: 'License key not found.' };
    if (license.status !== 'approved') {
      return {
        ok: false,
        error: license.status === 'blocked'
          ? 'This license has been blocked by administrator.'
          : 'Payment verification pending. Please wait for admin approval.',
      };
    }
    if (!license.lifetime && license.expires_at && new Date(license.expires_at) < new Date()) {
      return { ok: false, error: 'License key expired. Please contact admin to renew.' };
    }

    const normalizedDevice = deviceId.trim();
    if (license.license_devices.some((device) => device.toLowerCase() === normalizedDevice.toLowerCase())) {
      return { ok: true, license };
    }

    const col = await getLicensesCollection();
    const updatedAt = new Date().toISOString();
    const result = await col.updateOne(
      {
        id: license.id,
        status: 'approved',
        license_devices: { $ne: normalizedDevice },
        $expr: {
          $lt: [
            { $size: { $ifNull: ['$license_devices', []] } },
            { $ifNull: ['$max_devices', 1] },
          ],
        },
      },
      {
        $addToSet: { license_devices: normalizedDevice },
        $set: { updated_at: updatedAt },
      },
    );

    const currentLicense = await this.findLicenseById(license.id);
    if (!currentLicense) return { ok: false, error: 'License not found.' };
    if (result.matchedCount === 0) {
      if (currentLicense.license_devices.some((device) => device.toLowerCase() === normalizedDevice.toLowerCase())) {
        return { ok: true, license: currentLicense };
      }
      return {
        ok: false,
        error: `Device limit reached (${currentLicense.license_devices.length}/${currentLicense.max_devices} bound). Please ask admin to reset devices or upgrade limit.`,
      };
    }
    return { ok: true, license: currentLicense };
  }

  public async addSignal(signal: Omit<SignalRecord, 'created_at'>): Promise<SignalRecord> {
    const record: SignalRecord = {
      ...signal,
      created_at: new Date().toISOString(),
    };
    const col = await getSignalsCollection();
    await col.insertOne(record);
    return record;
  }

  public async getSignals(limit = 50): Promise<SignalRecord[]> {
    const col = await getSignalsCollection();
    const docs = await col.find({}).sort({ created_at: -1 }).limit(limit).toArray();
    return docs.map(toSignal);
  }
}

export const db = new Database();
