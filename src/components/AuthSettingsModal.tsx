import React, { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Database, KeyRound, Lock, Save, X } from 'lucide-react';
import { useBot } from '../context/BotContext.tsx';

export const AuthSettingsModal: React.FC = () => {
  const {
    isAuthSettingsOpen,
    setAuthSettingsOpen,
    appConfig,
    refreshConfig,
  } = useBot();

  const [newApiKey, setNewApiKey] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [allowBypass, setAllowBypass] = useState(false);
  const [mongoConnected, setMongoConnected] = useState<boolean | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isAuthSettingsOpen) return;

    setAllowBypass(appConfig?.allowMasterApiKeyBypass ?? false);
    setAdminPassword(sessionStorage.getItem('frk_admin') || '');
    setAlert(null);
    fetch('/api/health')
      .then(async (response) => {
        const data = await response.json();
        setMongoConnected(response.ok && data.database?.connected === true);
      })
      .catch((error) => {
        console.error('Failed to check MongoDB connection:', error);
        setMongoConnected(false);
      });
  }, [appConfig, isAuthSettingsOpen]);

  if (!isAuthSettingsOpen) return null;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adminPassword.trim()) {
      setAlert({ type: 'error', text: 'Enter your current admin password to authorize these changes.' });
      return;
    }

    setIsSaving(true);
    setAlert(null);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword.trim(),
          apiKey: newApiKey.trim() || undefined,
          adminPassword: newAdminPassword.trim() || undefined,
          allowMasterApiKeyBypass: allowBypass,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setAlert({ type: 'error', text: data.error || 'Failed to update settings.' });
        return;
      }

      if (newAdminPassword.trim()) {
        sessionStorage.setItem('frk_admin', newAdminPassword.trim());
        setAdminPassword(newAdminPassword.trim());
        setNewAdminPassword('');
      }
      setNewApiKey('');
      setAlert({ type: 'success', text: 'MongoDB-backed settings updated successfully.' });
      await refreshConfig();
    } catch (error) {
      console.error('Failed to update settings:', error);
      setAlert({ type: 'error', text: 'Could not reach the server. Check MongoDB connectivity.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-lg bg-[#151515] border border-[#8D7210]/60 rounded-2xl shadow-2xl p-6 text-[#FFFFFF] my-8">
        <div className="flex items-center justify-between pb-4 border-b border-[#34302A]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#2A2208] border border-[#8D7210]/60 text-[#FFD000]">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-mono">API & MongoDB Settings</h2>
              <p className="text-xs text-[#B8B8B8]">Database credentials are managed on the server.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => setAuthSettingsOpen(false)}
            className="p-1 rounded-lg text-[#B8B8B8] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {alert && (
          <div className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${
            alert.type === 'success'
              ? 'bg-[#00D68F]/10 border border-[#00D68F]/30 text-[#00D68F]'
              : 'bg-[#FF4D6D]/10 border border-[#FF4D6D]/30 text-[#FF4D6D]'
          }`}>
            {alert.type === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
            <span>{alert.text}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
          <div className={`p-3.5 rounded-xl border flex items-center gap-2 ${
            mongoConnected
              ? 'bg-[#00D68F]/10 border-[#00D68F]/30 text-[#00D68F]'
              : 'bg-[#FF4D6D]/10 border-[#FF4D6D]/30 text-[#FF4D6D]'
          }`}>
            <Database size={15} />
            <span className="font-semibold">
              {mongoConnected === null ? 'Checking MongoDB…' : mongoConnected ? 'MongoDB connected' : 'MongoDB unavailable'}
            </span>
          </div>

          <div className="p-3.5 bg-[#151515]/80 rounded-xl border border-[#34302A] space-y-3">
            <div>
              <label className="font-semibold text-[#FFD000] uppercase tracking-wide">Replace master API key</label>
              <input
                type="password"
                value={newApiKey}
                onChange={(event) => setNewApiKey(event.target.value)}
                placeholder="Leave blank to keep the current key"
                autoComplete="new-password"
                className="w-full mt-1 px-3 py-2 bg-[#080808] border border-[#34302A] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#FFD000]"
              />
              <p className="mt-1 text-[11px] text-[#B8B8B8]">The current key is never returned to the browser.</p>
            </div>

            <label className="flex items-center gap-2 text-[#B8B8B8] cursor-pointer">
              <input
                type="checkbox"
                checked={allowBypass}
                onChange={(event) => setAllowBypass(event.target.checked)}
                className="rounded bg-[#151515] border-[#34302A] text-[#FFD000] focus:ring-0 cursor-pointer"
              />
              Allow master API key license bypass
            </label>
          </div>

          <div className="p-3.5 bg-[#151515]/80 rounded-xl border border-[#34302A] space-y-2">
            <div className="flex items-center gap-1.5 text-[#FFC247] font-semibold uppercase tracking-wide">
              <Lock size={13} />
              Admin password
            </div>
            <label className="block text-[10px] text-[#B8B8B8]">CURRENT PASSWORD</label>
            <input
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full px-3 py-1.5 bg-[#080808] border border-[#34302A] rounded-lg text-white text-xs focus:outline-none focus:border-[#FFD000]"
            />
            <label className="block text-[10px] text-[#B8B8B8]">NEW PASSWORD (OPTIONAL)</label>
            <input
              type="password"
              value={newAdminPassword}
              onChange={(event) => setNewAdminPassword(event.target.value)}
              placeholder="Leave blank to keep current"
              autoComplete="new-password"
              className="w-full px-3 py-1.5 bg-[#080808] border border-[#34302A] rounded-lg text-white text-xs focus:outline-none focus:border-[#FFD000]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAuthSettingsOpen(false)}
              className="px-4 py-2 rounded-xl border border-[#34302A] text-[#B8B8B8] hover:text-white cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-[#FFD000] text-black font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Save size={14} />
              {isSaving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
