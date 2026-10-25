// Seeds Firestore using the Firebase CLI's stored refresh token (no service account needed).
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const cfg = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const seed = JSON.parse(readFileSync('./data/frking.db.json', 'utf8'));

const configFile = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
const cred = JSON.parse(readFileSync(configFile, 'utf8'));
const refreshToken = cred.tokens.refresh_token;

// Firebase CLI public OAuth client
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(data));
  return data.access_token;
}

const PROJECT = cfg.projectId;
const DB = cfg.firestoreDatabaseId;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DB}/documents`;
const DOC_BASE = `projects/${PROJECT}/databases/${DB}/documents`;

async function commit(writes) {
  const res = await fetch(`${BASE}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
    body: JSON.stringify({ writes }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Commit failed: ' + JSON.stringify(body));
  return body;
}

function value(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}
function toFirestore(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = value(v);
  return fields;
}

async function main() {
  const writes = [];

  // config/app
  writes.push({
    update: { name: `${DOC_BASE}/config/app`, fields: toFirestore(seed.config) },
  });

  // licenses
  for (const lic of seed.licenses || []) {
    writes.push({
      update: { name: `${DOC_BASE}/licenses/${lic.id || lic.license_key}`, fields: toFirestore(lic) },
    });
  }

  // signals
  for (const sig of seed.signals || []) {
    writes.push({
      update: { name: `${DOC_BASE}/signals/${sig.id.replace('#', '')}`, fields: toFirestore(sig) },
    });
  }

  if (writes.length) {
    await commit(writes);
    console.log(`✓ committed ${writes.length} write(s)`);
  }

  // verify
  const res = await fetch(`${BASE}/config/app`, {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
  });
  const doc = await res.json();
  console.log('✓ verify config/app:', doc.fields ? JSON.stringify(doc.fields, null, 2) : 'MISSING');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
