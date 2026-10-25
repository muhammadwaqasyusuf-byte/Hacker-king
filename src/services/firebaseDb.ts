import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { firestore } from '../firebase.ts';
import { LicenseDetails, SignalItem } from '../types.ts';

export async function saveLicenseToFirestore(lic: LicenseDetails): Promise<void> {
  try {
    const docRef = doc(firestore, 'licenses', lic.id || lic.license_key);
    await setDoc(docRef, {
      id: lic.id || lic.license_key,
      license_key: lic.license_key,
      full_name: lic.full_name,
      phone: lic.phone || '',
      email: lic.email || '',
      amount: lic.amount || 'Paid',
      status: lic.status || 'pending',
      duration_label: lic.duration_label || '1 Month',
      expires_at: lic.expires_at || null,
      lifetime: Boolean(lic.lifetime),
      max_devices: lic.max_devices || 1,
      license_devices: lic.license_devices || [],
      created_at: lic.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore license save warning:', err);
  }
}

export async function findLicenseInFirestore(key: string): Promise<LicenseDetails | null> {
  try {
    const cleanKey = key.trim().toUpperCase();
    const colRef = collection(firestore, 'licenses');

    // Query by license_key
    const q = query(colRef, where('license_key', '==', cleanKey), limit(1));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data() as LicenseDetails;
    }

    // Also check direct document ID
    const docSnap = await getDoc(doc(firestore, 'licenses', cleanKey));
    if (docSnap.exists()) {
      return docSnap.data() as LicenseDetails;
    }
  } catch (err) {
    console.warn('Firestore find license warning:', err);
  }
  return null;
}

export async function bindDeviceInFirestore(
  licenseKey: string,
  deviceId: string
): Promise<{ ok: boolean; error?: string; license?: LicenseDetails }> {
  try {
    const lic = await findLicenseInFirestore(licenseKey);
    if (!lic) {
      return { ok: false, error: 'License key not found in cloud database.' };
    }

    if (lic.status === 'blocked') {
      return { ok: false, error: 'This license has been blocked by administrator.' };
    }

    if (lic.status === 'pending') {
      return { ok: false, error: 'Payment verification pending. Please wait for admin approval.' };
    }

    if (!lic.lifetime && lic.expires_at && new Date(lic.expires_at) < new Date()) {
      return { ok: false, error: 'License expired. Please renew with admin.' };
    }

    const devices = lic.license_devices || [];
    const hasDevice = devices.some(
      (d) => d.trim().toLowerCase() === deviceId.trim().toLowerCase()
    );

    if (!hasDevice) {
      const maxDev = lic.max_devices || 1;
      if (devices.length >= maxDev) {
        return {
          ok: false,
          error: `Device limit reached (${devices.length}/${maxDev} bound). Contact admin to reset devices.`,
        };
      }
      const updatedDevices = [...devices, deviceId.trim()];
      const docId = lic.id || lic.license_key;
      await updateDoc(doc(firestore, 'licenses', docId), {
        license_devices: updatedDevices,
        updated_at: new Date().toISOString(),
      });
      lic.license_devices = updatedDevices;
    }

    return { ok: true, license: lic };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Database error verifying device.' };
  }
}

export async function fetchLicensesFromFirestore(): Promise<LicenseDetails[]> {
  try {
    const colRef = collection(firestore, 'licenses');
    const q = query(colRef, orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as LicenseDetails);
  } catch (err) {
    console.warn('Firestore fetch licenses warning:', err);
    return [];
  }
}

export async function updateLicenseInFirestore(
  licId: string,
  patch: Partial<LicenseDetails>
): Promise<void> {
  try {
    const docRef = doc(firestore, 'licenses', licId);
    await updateDoc(docRef, {
      ...patch,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Firestore license update warning:', err);
  }
}

/**
 * Deletes a license from Firestore completely.
 * The doc may exist under `lic.id` OR under `license_key` as the document ID
 * (saveLicenseToFirestore uses `lic.id || lic.license_key`), and older syncs
 * may have written either. We remove BOTH so a deleted key can never be
 * resurrected by the Firestore merge in AdminView.fetchKeys().
 * Returns true if the delete completed without a cloud error.
 */
export async function deleteLicenseFromFirestore(licIdOrKey: string): Promise<boolean> {
  const clean = (licIdOrKey || '').trim();
  if (!clean) return false;

  let ok = true;

  // 1. Delete by document ID (covers docs saved with lic.id or license_key as ID)
  try {
    await deleteDoc(doc(firestore, 'licenses', clean));
  } catch (err) {
    console.warn('Firestore license delete (by id) warning:', err);
    // Doc might exist under the other ID — don't fail the whole delete yet.
  }

  // 2. Query and delete ANY docs whose license_key matches (covers every ID scheme)
  try {
    const cleanKey = clean.toUpperCase();
    const q = query(
      collection(firestore, 'licenses'),
      where('license_key', '==', cleanKey)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
    }
  } catch (err) {
    console.warn('Firestore license delete (by key) warning:', err);
    ok = false;
  }

  return ok;
}

export async function saveSignalToFirestore(sig: SignalItem): Promise<void> {
  try {
    const docRef = doc(firestore, 'signals', sig.id.replace('#', ''));
    await setDoc(docRef, {
      ...sig,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Firestore signal save warning:', err);
  }
}

export async function fetchSignalsFromFirestore(): Promise<SignalItem[]> {
  try {
    const colRef = collection(firestore, 'signals');
    const q = query(colRef, orderBy('created_at', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => docSnap.data() as SignalItem);
  } catch (err) {
    console.warn('Firestore signals fetch warning:', err);
    return [];
  }
}
