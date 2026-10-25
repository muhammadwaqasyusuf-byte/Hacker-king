export interface LicenseDetails {
  id: string;
  license_key: string;
  full_name: string;
  phone?: string;
  email?: string;
  amount?: string;
  status: 'pending' | 'approved' | 'blocked';
  duration_label: string;
  expires_at?: string | null;
  lifetime?: boolean;
  max_devices: number;
  license_devices?: string[];
  created_at?: string;
}

export interface SignalItem {
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
}

export interface AppConfig {
  allowMasterApiKeyBypass: boolean;
  whatsappUrl?: string;
  telegramUrl?: string;
  phone?: string;
  developer?: string;
}

export interface WinRateData {
  total: number;
  rate: number;
  wins: number;
  losses: number;
}
