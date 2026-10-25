import React, { useState, useEffect } from 'react';
import { useBot } from '../context/BotContext.tsx';
import { PLAN_DURATIONS, DEV_HANDLE } from '../constants.ts';
import { LicenseDetails } from '../types.ts';
import {
  Lock,
  Plus,
  ArrowLeft,
  Smartphone,
  CircleCheck,
  RefreshCw,
  KeyRound,
  ShieldAlert,
  Copy,
  Check,
  Database,
} from 'lucide-react';
import {
  saveLicenseToFirestore,
  updateLicenseInFirestore,
  deleteLicenseFromFirestore,
  fetchLicensesFromFirestore,
} from '../services/firebaseDb.ts';

export const AdminView: React.FC = () => {
  const { navigateTo, setAuthSettingsOpen, setIsAdmin, appConfig } = useBot();

  const [passwordInput, setPasswordInput] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [keysList, setKeysList] = useState<LicenseDetails[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [cardEdits, setCardEdits] = useState<Record<string, { duration: string; devices: number }>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Mint New Key Modal State
  const [isMintModalOpen, setIsMintModalOpen] = useState<boolean>(false);
  const [mintForm, setMintForm] = useState({
    custom_key: '',
    full_name: 'VIP User',
    phone: '+966554573612',
    email: 'client@frkings.pro',
    duration: '1 Month',
    max_devices: 1,
    status: 'approved' as const,
  });
  const [isMinting, setIsMinting] = useState<boolean>(false);

  const fetchKeys = async (pwd = passwordInput) => {
    setErrorMessage('');
    let mergedKeys: LicenseDetails[] = [];
    let authenticated = false;

    try {
      const res = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.keys)) {
        mergedKeys = [...data.keys];
        authenticated = true;
      } else if (res.status === 401) {
        setErrorMessage(data.error || 'Wrong admin password.');
        setIsAuthenticated(false);
        setIsAdmin(false);
        sessionStorage.removeItem('frk_admin');
        return;
      }
    } catch {
      // Backend may be offline or in serverless cold start
    }

    // Also sync from Firestore cloud database
    try {
      const firestoreKeys = await fetchLicensesFromFirestore();
      if (firestoreKeys && firestoreKeys.length > 0) {
        const keyMap = new Map<string, LicenseDetails>();
        for (const k of mergedKeys) {
          keyMap.set(k.license_key.toUpperCase(), k);
        }
        for (const fk of firestoreKeys) {
          if (!keyMap.has(fk.license_key.toUpperCase())) {
            keyMap.set(fk.license_key.toUpperCase(), fk);
          }
        }
        mergedKeys = Array.from(keyMap.values());
      }
    } catch (e) {
      console.warn('Firestore keys sync warning:', e);
    }

    if (authenticated || mergedKeys.length > 0) {
      setKeysList(mergedKeys);
      setIsAuthenticated(true);
      setIsAdmin(true);
      sessionStorage.setItem('frk_admin', pwd);
    } else {
      setErrorMessage('Could not load license database. Check admin credentials.');
      setIsAuthenticated(false);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    const saved = sessionStorage.getItem('frk_admin');
    if (saved) {
      setPasswordInput(saved);
      fetchKeys(saved);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setErrorMessage('Please enter admin password.');
      return;
    }

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchKeys(passwordInput.trim());
      } else {
        setErrorMessage(data.error || 'Invalid password.');
      }
    } catch {
      setErrorMessage('Failed to connect to authentication server.');
    }
  };

  const handleRemoveDevice = async (licId: string, deviceToken: string) => {
    setErrorMessage('');
    setSuccessMessage(null);
    const pwd = passwordInput || sessionStorage.getItem('frk_admin') || '';
    if (!pwd) {
      setErrorMessage('Admin session expired. Please log in again.');
      setIsAuthenticated(false);
      return;
    }

    // Optimistic UI update
    setKeysList((prev) =>
      prev.map((item) =>
        item.id === licId || item.license_key === licId
          ? {
              ...item,
              license_devices: (item.license_devices || []).filter(
                (d) => d.trim().toLowerCase() !== deviceToken.trim().toLowerCase()
              ),
            }
          : item
      )
    );

    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: pwd,
          id: licId,
          action: 'remove_device',
          deviceId: deviceToken,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.license) {
          saveLicenseToFirestore(data.license).catch(() => {});
        }
        setSuccessMessage(`Device "${deviceToken}" unlinked successfully.`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setErrorMessage(data.error || 'Failed to remove device.');
      }
      await fetchKeys(pwd);
    } catch {
      setErrorMessage('Network error removing device.');
      await fetchKeys(pwd);
    }
  };

  const handleAdminAction = async (licId: string, action: string) => {
    setErrorMessage('');
    setSuccessMessage(null);
    setDeleteConfirmId(null);
    const pwd = passwordInput || sessionStorage.getItem('frk_admin') || '';
    if (!pwd) {
      setErrorMessage('Admin session expired. Please log in again.');
      setIsAuthenticated(false);
      return;
    }

    const currentEdit = cardEdits[licId] ?? { duration: '1 Day', devices: 1 };

    // Optimistic update
    if (action === 'reset_devices') {
      setKeysList((prev) =>
        prev.map((k) =>
          k.id === licId || k.license_key === licId
            ? { ...k, license_devices: [] }
            : k
        )
      );
    } else if (action === 'delete') {
      setKeysList((prev) =>
        prev.filter((k) => k.id !== licId && k.license_key !== licId)
      );
    } else if (action === 'block') {
      setKeysList((prev) =>
        prev.map((k) =>
          k.id === licId || k.license_key === licId
            ? { ...k, status: 'blocked' }
            : k
        )
      );
    }

    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: pwd,
          id: licId,
          action: action,
          duration: currentEdit.duration,
          max_devices: currentEdit.devices,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (action === 'delete') {
          // Wait for the cloud delete to fully complete BEFORE refetching,
          // otherwise fetchKeys() merges the still-existing Firestore doc
          // back into the list (the "deleted key reappears" bug).
          const cloudOk = await deleteLicenseFromFirestore(licId).catch(() => false);
          if (!cloudOk) {
            setErrorMessage('Local delete succeeded, but cloud delete failed. The key may reappear on next refresh — try deleting again.');
          } else {
            setSuccessMessage('License key deleted successfully from server and cloud.');
          }
        } else if (action === 'reset_devices') {
          updateLicenseInFirestore(licId, { license_devices: [] }).catch(() => {});
          setSuccessMessage('All bound devices reset successfully for this key.');
        } else if (action === 'block') {
          updateLicenseInFirestore(licId, { status: 'blocked' }).catch(() => {});
          setSuccessMessage('License blocked successfully.');
        } else if (action === 'approve') {
          if (data.license) saveLicenseToFirestore(data.license).catch(() => {});
          setSuccessMessage('License approved/updated successfully in database.');
        }
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setErrorMessage(data.error || 'Action failed.');
      }
      await fetchKeys(pwd);
    } catch {
      setErrorMessage('Network error executing admin action.');
    }
  };

  const handleMintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsMinting(true);
    setErrorMessage('');
    const pwd = passwordInput || sessionStorage.getItem('frk_admin') || '';

    try {
      const res = await fetch('/api/admin/create-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: pwd,
          ...mintForm,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.license) {
          saveLicenseToFirestore(data.license).catch(() => {});
        }
        setIsMintModalOpen(false);
        setSuccessMessage('New key minted and approved successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
        await fetchKeys(pwd);
      } else {
        setErrorMessage(data.error || 'Failed to create key.');
      }
    } catch {
      setErrorMessage('Network error creating key.');
    } finally {
      setIsMinting(false);
    }
  };

  const copyToClipboard = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(identifier);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <main className="bot-page">
        <div className="license-shell">
          <div className="w-full flex items-center justify-between mb-4">
            <button
              onClick={() => navigateTo('/')}
              className="flex items-center gap-1.5 text-xs text-[#B8B8B8] hover:text-white cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Back to App</span>
            </button>
          </div>

          <div className="license-card max-w-sm">
            <h2>
              <Lock size={18} className="text-[#FFC247]" />
              <span>Admin Login</span>
            </h2>
            <p className="text-muted-foreground text-xs mt-1">
              Protected terminal management and database license issuance.
            </p>

            <form onSubmit={handleLogin} className="mt-2">
              <input
                className="license-input text-center tracking-wider"
                type="password"
                placeholder="ADMIN PASSWORD"
                aria-label="Admin password"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setErrorMessage('');
                }}
              />

              {errorMessage && (
                <p className="text-[#FF4D6D] text-xs font-bold mb-2">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                className="bot-button bot-button-neon generate-button flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock size={15} />
                <span>LOGIN</span>
              </button>
            </form>
          </div>

          <p className="dev-credit">Developer {DEV_HANDLE}</p>
        </div>
      </main>
    );
  }

  // LOGGED IN ADMIN DASHBOARD
  const filteredKeys = keysList.filter(
    (k) => filterStatus === 'all' || k.status === filterStatus
  );

  return (
    <main className="bot-page">
      <div className="admin-shell">
        {/* Admin Top Header */}
        <div className="admin-top">
          <div>
            <h1 className="terminal-heading text-left">
              ADMIN <span>PANEL</span>
            </h1>
            <p className="text-xs text-[#B8B8B8]">
              Manage user licenses, database bindings, and API authorizations
            </p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setIsMintModalOpen(true)}
              className="bot-button bot-button-neon flex items-center gap-1.5 text-xs py-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>New Key</span>
            </button>

            <button
              onClick={() => setAuthSettingsOpen(true)}
              className="bot-button bot-button-outline flex items-center gap-1.5 text-xs py-1.5 cursor-pointer"
            >
              <KeyRound size={14} />
              <span>API Config</span>
            </button>

            <button
              onClick={() => fetchKeys(passwordInput)}
              className="bot-button bot-button-outline flex items-center gap-1.5 text-xs py-1.5 cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => {
                sessionStorage.removeItem('frk_admin');
                setIsAuthenticated(false);
                setIsAdmin(false);
                setPasswordInput('');
              }}
              className="bot-button bot-button-ghost text-xs py-1.5 text-[#FF4D6D] hover:text-[#FF4D6D] cursor-pointer"
            >
              Logout
            </button>

            <button
              onClick={() => navigateTo('/dashboard')}
              className="bot-button bot-button-outline text-xs py-1.5 text-[#B8B8B8] cursor-pointer"
            >
              Back
            </button>
          </div>
        </div>

        {/* Live Firebase Firestore Database Status */}
        <div className="p-3 mb-3 rounded-xl bg-[#00D68F]/10 border border-[#00D68F]/30 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={15} className="text-[#00D68F]" />
            <span className="font-bold text-[#00D68F] flex items-center gap-1.5">
              <span>Firebase Firestore Live Database Active</span>
              <span className="w-2 h-2 rounded-full bg-[#00D68F] animate-pulse" />
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#B8B8B8]">
            Project: unified-park-zbcxw
          </span>
        </div>

        {/* Quick Master API Key Banner */}
        <div className="p-3.5 mb-4 rounded-xl bg-[#151515]/90 border border-[#8D7210]/50 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-[#FFD000] flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
              <KeyRound size={13} />
              <span>Admin Quick Test Keys (Private Reference)</span>
            </span>
            <span className="text-[10px] text-[#777777] font-mono">
              Database Synced
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {appConfig?.apiKey && (
              <button
                onClick={() => copyToClipboard(appConfig.apiKey, 'master-test')}
                className="px-2.5 py-1 rounded bg-[#2A2208] border border-[#8D7210]/60 hover:bg-[#3A2F0C] text-[#FFE166] font-mono text-[11px] flex items-center gap-1.5 cursor-pointer"
                title="Copy Master API Key"
              >
                <span>Master API Key: {appConfig.apiKey}</span>
                {copiedKeyId === 'master-test' ? (
                  <Check size={11} className="text-[#00D68F]" />
                ) : (
                  <Copy size={11} />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="admin-filters">
          {['all', 'pending', 'approved', 'blocked'].map((st) => {
            const count =
              st === 'all'
                ? keysList.length
                : keysList.filter((k) => k.status === st).length;
            return (
              <button
                key={st}
                data-active={filterStatus === st}
                onClick={() => setFilterStatus(st)}
              >
                {st.toUpperCase()} ({count})
              </button>
            );
          })}
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="mb-3 p-3 rounded-xl bg-[#00D68F]/10 border border-[#00D68F]/30 text-[#00D68F] text-xs flex items-center gap-2">
            <CircleCheck size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <p className="text-[#FF4D6D] text-xs font-bold mb-3">{errorMessage}</p>
        )}

        {/* Empty State */}
        {filteredKeys.length === 0 && (
          <div className="empty-state">
            <p>No license keys found in this category.</p>
          </div>
        )}

        {/* Licenses Grid */}
        <div className="admin-list">
          {filteredKeys.map((lic) => {
            const currentEdit = cardEdits[lic.id] ?? {
              duration: lic.duration_label || '1 Day',
              devices: lic.max_devices || 1,
            };

            const updateCardEdit = (patch: Partial<{ duration: string; devices: number }>) => {
              setCardEdits({
                ...cardEdits,
                [lic.id]: { ...currentEdit, ...patch },
              });
            };

            const isExpired =
              !lic.lifetime &&
              lic.expires_at &&
              new Date(lic.expires_at) < new Date();

            return (
              <div key={lic.id} className="admin-card">
                <div className="admin-row">
                  <div className="flex items-center gap-2">
                    <strong className="new-key small font-mono">
                      {lic.license_key}
                    </strong>
                    <button
                      onClick={() => copyToClipboard(lic.license_key, lic.id)}
                      className="p-1 text-[#B8B8B8] hover:text-[#FFD000] cursor-pointer"
                      title="Copy Key"
                    >
                      {copiedKeyId === lic.id ? (
                        <Check size={13} className="text-[#00D68F]" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>

                  <span
                    className={`status-pill ${isExpired ? 'blocked' : lic.status}`}
                  >
                    {isExpired ? 'EXPIRED' : lic.status.toUpperCase()}
                  </span>
                </div>

                <dl>
                  <dt>Name</dt>
                  <dd className="font-semibold text-white">{lic.full_name}</dd>

                  <dt>Number</dt>
                  <dd className="font-mono text-[#FFE166]">{lic.phone || '-'}</dd>

                  <dt>Gmail</dt>
                  <dd className="text-[#B8B8B8]">{lic.email || '-'}</dd>

                  <dt>Paid</dt>
                  <dd className="font-bold text-[#00D68F]">{lic.amount || '-'}</dd>

                  <dt>Registered</dt>
                  <dd className="text-[#B8B8B8] text-xs">
                    {lic.created_at ? new Date(lic.created_at).toLocaleString() : '-'}
                  </dd>

                  <dt>Plan</dt>
                  <dd className="text-xs">
                    {lic.status === 'approved'
                      ? lic.lifetime
                        ? 'Lifetime'
                        : `${lic.duration_label} · expires ${
                            lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : '-'
                          }`
                      : '-'}
                  </dd>

                  <dt>Devices</dt>
                  <dd className="text-xs">
                    <div className="font-mono text-[#FFE166] font-bold mb-1">
                      {lic.license_devices ? lic.license_devices.length : 0} /{' '}
                      {lic.max_devices} bound
                    </div>
                    {lic.license_devices && lic.license_devices.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {lic.license_devices.map((deviceToken) => (
                          <span
                            key={deviceToken}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#080808] border border-[#34302A] text-[10px] text-[#B8B8B8] font-mono"
                          >
                            <Smartphone size={10} className="text-[#FFD000] shrink-0" />
                            <span title={deviceToken}>
                              {deviceToken.length > 14
                                ? `${deviceToken.substring(0, 11)}...`
                                : deviceToken}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveDevice(lic.id, deviceToken);
                              }}
                              className="text-[#FF4D6D] hover:text-white hover:bg-[#FF4D6D] rounded px-1 text-xs font-bold transition-colors cursor-pointer"
                              title={`Delete device (${deviceToken})`}
                              aria-label={`Delete device ${deviceToken}`}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[#777777] text-[10px] italic">
                        No devices bound
                      </span>
                    )}
                  </dd>
                </dl>

                {/* Actions */}
                <div className="admin-actions">
                  <select
                    value={currentEdit.duration}
                    onChange={(e) => updateCardEdit({ duration: e.target.value })}
                    aria-label="Duration"
                  >
                    {PLAN_DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>

                  <select
                    value={currentEdit.devices}
                    onChange={(e) => updateCardEdit({ devices: Number(e.target.value) })}
                    aria-label="Devices"
                  >
                    {[1, 2, 3, 4, 5, 10].map((num) => (
                      <option key={num} value={num}>
                        {num} device{num > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    className="bot-button bot-button-neon cursor-pointer"
                    onClick={() => handleAdminAction(lic.id, 'approve')}
                  >
                    {lic.status === 'approved' ? 'Update' : 'Approve'}
                  </button>

                  <button
                    type="button"
                    className="bot-button bot-button-outline cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAdminAction(lic.id, 'reset_devices');
                    }}
                    title="Clear all bound devices for this key"
                  >
                    Reset devices
                  </button>

                  <button
                    className="bot-button bot-button-outline cursor-pointer"
                    onClick={() => handleAdminAction(lic.id, 'block')}
                  >
                    Block
                  </button>

                  {deleteConfirmId === lic.id ? (
                    <div className="inline-flex items-center gap-1.5 p-1 rounded-lg bg-[#FF4D6D]/10 border border-[#FF4D6D]/40">
                      <button
                        className="bot-button bg-[#FF4D6D] hover:bg-[#FF6D87] text-white text-[11px] px-2.5 py-1 cursor-pointer"
                        onClick={() => handleAdminAction(lic.id, 'delete')}
                      >
                        Confirm Delete
                      </button>
                      <button
                        className="bot-button bot-button-ghost text-[#B8B8B8] text-[11px] px-1.5 py-1 cursor-pointer"
                        onClick={() => setDeleteConfirmId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="bot-button bot-button-ghost text-[#FF4D6D] hover:text-[#FF4D6D] cursor-pointer"
                      onClick={() => setDeleteConfirmId(lic.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mint New Key Modal */}
        {isMintModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-md bg-[#151515] border border-[#8D7210]/60 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-base font-bold text-white mb-2 font-mono flex items-center gap-2">
                <Plus size={16} className="text-[#FFD000]" />
                <span>Mint New License Key</span>
              </h3>
              <p className="text-xs text-[#B8B8B8] mb-3">
                Generate an immediate pre-approved license key for a customer in the database.
              </p>

              {/* Quick Preset Buttons */}
              <div className="mb-3.5 p-2.5 rounded-xl bg-[#080808] border border-[#34302A]">
                <label className="text-[10px] text-[#FFD000] font-mono font-bold block mb-1.5">
                  QUICK PRESET TIERS (CLICK TO AUTO-FILL):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const rand = Math.floor(1000 + Math.random() * 9000);
                      setMintForm({
                        ...mintForm,
                        custom_key: `FRK-CROWN-VIP-${rand}`,
                        full_name: 'VIP Crown Member',
                        duration: 'Lifetime',
                        max_devices: 10,
                      });
                    }}
                    className="px-2 py-1 rounded bg-[#2A2208] border border-[#FFD000] text-[#FFD000] text-[10px] font-mono font-bold cursor-pointer hover:bg-[#FFD000] hover:text-black transition-colors"
                  >
                    👑 Lifetime Crown (10 Dev)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const rand = Math.floor(1000 + Math.random() * 9000);
                      setMintForm({
                        ...mintForm,
                        custom_key: `FRK-1YEAR-PRO-${rand}`,
                        full_name: '1-Year VIP Trader',
                        duration: '1 Year',
                        max_devices: 5,
                      });
                    }}
                    className="px-2 py-1 rounded bg-[#151515] border border-[#00D68F] text-[#00D68F] text-[10px] font-mono font-bold cursor-pointer hover:bg-[#00D68F] hover:text-black transition-colors"
                  >
                    🔥 1 Year (5 Dev)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const rand = Math.floor(1000 + Math.random() * 9000);
                      setMintForm({
                        ...mintForm,
                        custom_key: `FRK-6M-ELITE-${rand}`,
                        full_name: '6-Month Elite Trader',
                        duration: '6 Months',
                        max_devices: 3,
                      });
                    }}
                    className="px-2 py-1 rounded bg-[#151515] border border-[#38BDF8] text-[#38BDF8] text-[10px] font-mono font-bold cursor-pointer hover:bg-[#38BDF8] hover:text-black transition-colors"
                  >
                    💎 6 Months (3 Dev)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const rand = Math.floor(1000 + Math.random() * 9000);
                      setMintForm({
                        ...mintForm,
                        custom_key: `FRK-3M-PRO-${rand}`,
                        full_name: '3-Month Pro Member',
                        duration: '3 Months',
                        max_devices: 3,
                      });
                    }}
                    className="px-2 py-1 rounded bg-[#151515] border border-[#A855F7] text-[#A855F7] text-[10px] font-mono font-bold cursor-pointer hover:bg-[#A855F7] hover:text-black transition-colors"
                  >
                    ⚡ 3 Months (3 Dev)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const rand = Math.floor(1000 + Math.random() * 9000);
                      setMintForm({
                        ...mintForm,
                        custom_key: `FRK-1M-GOLD-${rand}`,
                        full_name: '1-Month Gold Member',
                        duration: '1 Month',
                        max_devices: 2,
                      });
                    }}
                    className="px-2 py-1 rounded bg-[#151515] border border-[#FFC247] text-[#FFC247] text-[10px] font-mono font-bold cursor-pointer hover:bg-[#FFC247] hover:text-black transition-colors"
                  >
                    🏆 1 Month (2 Dev)
                  </button>
                </div>
              </div>

              <form onSubmit={handleMintSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] text-[#B8B8B8]">
                    CUSTOM KEY (OPTIONAL - AUTO-GENERATED IF EMPTY)
                  </label>
                  <input
                    type="text"
                    value={mintForm.custom_key}
                    onChange={(e) =>
                      setMintForm({ ...mintForm, custom_key: e.target.value })
                    }
                    placeholder="e.g. FRK-VIP8-8888-2026"
                    className="w-full mt-1 px-3 py-1.5 bg-[#151515] border border-[#34302A] rounded-lg text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-[#B8B8B8]">
                    CUSTOMER FULL NAME
                  </label>
                  <input
                    type="text"
                    value={mintForm.full_name}
                    onChange={(e) =>
                      setMintForm({ ...mintForm, full_name: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 bg-[#151515] border border-[#34302A] rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] text-[#B8B8B8]">
                    CUSTOMER PHONE
                  </label>
                  <input
                    type="tel"
                    value={mintForm.phone}
                    onChange={(e) =>
                      setMintForm({ ...mintForm, phone: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 bg-[#151515] border border-[#34302A] rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] text-[#B8B8B8]">
                    CUSTOMER EMAIL
                  </label>
                  <input
                    type="email"
                    value={mintForm.email}
                    onChange={(e) =>
                      setMintForm({ ...mintForm, email: e.target.value })
                    }
                    className="w-full mt-1 px-3 py-1.5 bg-[#151515] border border-[#34302A] rounded-lg text-white"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[#B8B8B8]">
                      PLAN DURATION
                    </label>
                    <select
                      value={mintForm.duration}
                      onChange={(e) =>
                        setMintForm({ ...mintForm, duration: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-1.5 bg-[#151515] border border-[#34302A] rounded-lg text-white font-mono"
                    >
                      {PLAN_DURATIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-[#B8B8B8]">
                      MAX DEVICES
                    </label>
                    <select
                      value={mintForm.max_devices}
                      onChange={(e) =>
                        setMintForm({
                          ...mintForm,
                          max_devices: Number(e.target.value),
                        })
                      }
                      className="w-full mt-1 px-3 py-1.5 bg-[#151515] border border-[#34302A] rounded-lg text-white font-mono"
                    >
                      {[1, 2, 3, 4, 5, 10].map((num) => (
                        <option key={num} value={num}>
                          {num} device{num > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsMintModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-[#34302A] text-[#B8B8B8] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isMinting}
                    className="bot-button bot-button-neon px-4 py-1.5 cursor-pointer"
                  >
                    {isMinting ? 'Minting...' : 'Mint & Approve Key'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <p className="dev-credit">Developer {DEV_HANDLE}</p>
      </div>
    </main>
  );
};
