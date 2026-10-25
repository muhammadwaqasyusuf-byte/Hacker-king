import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { LicenseDetails, SignalItem, AppConfig } from '../types.ts';

// All license keys are dynamic — created via /api/register-key or /api/admin/create-key.
// No hardcoded keys are seeded on the client.

interface BotContextType {
  currentRoute: string;
  navigateTo: (route: string) => void;
  activeLicense: string | null;
  licenseDetails: LicenseDetails | null;
  deviceId: string;
  signals: SignalItem[];
  addSignal: (signal: SignalItem) => void;
  clearSignals: () => void;
  activateKey: (key: string, details?: LicenseDetails) => void;
  deactivateKey: () => void;
  appConfig: AppConfig | null;
  refreshConfig: () => Promise<void>;
  isAuthSettingsOpen: boolean;
  setAuthSettingsOpen: (open: boolean) => void;
  isVerifying: boolean;
  isAdmin: boolean;
  setIsAdmin: (admin: boolean) => void;
}

const BotContext = createContext<BotContextType | null>(null);

export const BotProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [isAdmin, setIsAdmin] = useState<boolean>(() => !!sessionStorage.getItem('frk_admin'));
  const [activeLicense, setActiveLicense] = useState<string | null>(
    () => localStorage.getItem('frk_license')
  );
  const [licenseDetails, setLicenseDetails] = useState<LicenseDetails | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(
    () => !!localStorage.getItem('frk_license')
  );

  const [deviceId] = useState<string>(() => {
    let saved = localStorage.getItem('frk_device');
    if (!saved) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        saved = crypto.randomUUID();
      } else {
        saved = 'dev-' + Math.random().toString(36).substring(2, 12);
      }
      localStorage.setItem('frk_device', saved);
    }
    return saved;
  });

  const [signals, setSignals] = useState<SignalItem[]>(() => {
    try {
      const stored = localStorage.getItem('frk_signals');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [isAuthSettingsOpen, setAuthSettingsOpen] = useState<boolean>(false);

  const refreshConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setAppConfig(data);
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  };

  useEffect(() => {
    refreshConfig();

    // Fetch persisted signals from server
    fetch('/api/signals')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.signals) && data.signals.length > 0) {
          setSignals((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const newOnes = data.signals.filter((s: SignalItem) => !existingIds.has(s.id));
            const combined = [...prev, ...newOnes].slice(0, 50);
            localStorage.setItem('frk_signals', JSON.stringify(combined));
            return combined;
          });
        }
      })
      .catch((error) => console.error('Failed to fetch persisted signals:', error));
  }, []);

  // Check active license on startup
  useEffect(() => {
    const savedKey = localStorage.getItem('frk_license');
    if (savedKey) {
      setIsVerifying(true);
      fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: savedKey, device: deviceId }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'License verification is unavailable.');
          return data;
        })
        .then((data) => {
          if (data.ok && data.license) {
            setActiveLicense(savedKey);
            setLicenseDetails(data.license);
            if (currentRoute === '/') {
              navigateTo('/dashboard');
            }
          } else {
            console.warn('License verification failed:', data.error);
            localStorage.removeItem('frk_license');
            setActiveLicense(null);
            setLicenseDetails(null);
            if (currentRoute !== '/' && currentRoute !== '/admin') {
              navigateTo('/');
            }
          }
        })
        .catch((error) => {
          console.error('Could not verify the saved license:', error);
          setActiveLicense(null);
          setLicenseDetails(null);
        })
        .finally(() => {
          setIsVerifying(false);
        });
    } else {
      setIsVerifying(false);
    }
  }, [deviceId]);

  const navigateTo = (route: string) => {
    queueMicrotask(() => {
      setCurrentRoute(route);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const addSignal = (sig: SignalItem) => {
    setSignals((prev) => {
      const updated = [sig, ...prev].slice(0, 50);
      try {
        localStorage.setItem('frk_signals', JSON.stringify(updated));
      } catch (error) {
        console.warn('Could not cache signals locally:', error);
      }
      return updated;
    });

    fetch('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal: sig }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to save signal.');
        }
      })
      .catch((error) => console.error('Failed to save signal:', error));
  };

  const clearSignals = () => {
    setSignals([]);
    try {
      localStorage.removeItem('frk_signals');
    } catch (error) {
      console.warn('Could not clear the local signal cache:', error);
    }
  };

  const activateKey = (key: string, details?: LicenseDetails) => {
    const clean = key.trim().toUpperCase();
    localStorage.setItem('frk_license', clean);
    setActiveLicense(clean);
    if (details) setLicenseDetails(details);
    navigateTo('/dashboard');
  };

  const deactivateKey = () => {
    localStorage.removeItem('frk_license');
    setActiveLicense(null);
    setLicenseDetails(null);
    navigateTo('/');
  };

  return (
    <BotContext.Provider
      value={{
        currentRoute,
        navigateTo,
        activeLicense,
        licenseDetails,
        deviceId,
        signals,
        addSignal,
        clearSignals,
        activateKey,
        deactivateKey,
        appConfig,
        refreshConfig,
        isAuthSettingsOpen,
        setAuthSettingsOpen,
        isVerifying,
        isAdmin,
        setIsAdmin,
      }}
    >
      {children}
    </BotContext.Provider>
  );
};

export function useBot() {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error('useBot must be used within a BotProvider');
  return ctx;
}
