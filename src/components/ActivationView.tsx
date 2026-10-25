import React, { useState, useRef } from 'react';
import { useBot } from '../context/BotContext.tsx';
import { DEV_HANDLE } from '../constants.ts';
import {
  KeyRound,
  UserPlus,
  Zap,
  Crown,
  ShieldAlert,
  Copy,
  Check,
} from 'lucide-react';

export const ActivationView: React.FC = () => {
  const { navigateTo, activateKey, deviceId, appConfig, isAdmin } = useBot();

  const [activeTab, setActiveTab] = useState<'activate' | 'register'>('activate');
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Register Form State
  const [regForm, setRegForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    amount: '',
  });
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Logo secret click count
  const logoClicksRef = useRef<number>(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogoClick = () => {
    logoClicksRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      logoClicksRef.current = 0;
    }, 2500);

    if (logoClicksRef.current >= 5) {
      logoClicksRef.current = 0;
      navigateTo('/admin');
    }
  };

  const handleActivate = async (keyToUse?: string) => {
    const rawKey = (keyToUse || licenseKeyInput).trim();
    if (!rawKey) {
      setErrorMsg('Please enter your license key.');
      return;
    }

    setLicenseKeyInput(rawKey);
    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: rawKey,
          device: deviceId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        activateKey(rawKey, data.license);
        return;
      }
      setErrorMsg(data.error || 'License verification failed.');
    } catch (error) {
      console.error('License verification request failed:', error);
      setErrorMsg('Unable to reach the server. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regForm.full_name.trim() || !regForm.phone.trim() || !regForm.email.trim()) {
      setErrorMsg('Please fill in your name, phone number, and Gmail.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/register-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm),
      });

      const data = await res.json();
      if (res.ok && data.ok && data.key) {
        setGeneratedKey(data.key);
      } else {
        setErrorMsg(data.error || 'Registration failed.');
      }
    } catch {
      setErrorMsg('Network connection failed during registration.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyKeyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <main className="bot-page">
      <div className="license-shell">
        {/* Top bar */}
        <div className="w-full flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5 text-xs text-[#777777] font-mono">
            <span className="w-2 h-2 rounded-full bg-[#00D68F] animate-pulse" />
            <span>FR-KING AI TERMINAL</span>
          </div>

          <button
            onClick={() => navigateTo('/admin')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#202020] border border-[#34302A] text-[#B8B8B8] text-xs hover:text-white transition-colors cursor-pointer"
          >
            <ShieldAlert size={12} />
            <span>Admin Panel</span>
          </button>
        </div>

        {/* Logo */}
        <img
          className="bot-logo license-logo cursor-pointer select-none"
          src="/fr-kings-logo.jpg"
          alt="FR-KINGs logo"
          onClick={handleLogoClick}
          title="FR-KINGs AI Bot Pro (Click 5 times for Admin)"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />

        <h1 className="license-title">FR-KING AURA</h1>
        <p className="brand-subtitle">
          AI BOT{' '}
          <span className="tier-badge">
            <Crown size={11} />
            PRO MAX
          </span>{' '}
          NEW VERSION <span className="tier-badge">2.0</span>
        </p>

        {/* Tabs: Active Key / Register */}
        <div className="license-tabs">
          <button
            data-active={activeTab === 'activate'}
            onClick={() => {
              setActiveTab('activate');
              setErrorMsg('');
            }}
          >
            <KeyRound size={15} />
            <span>Active Key</span>
          </button>
          <button
            data-active={activeTab === 'register'}
            onClick={() => {
              setActiveTab('register');
              setErrorMsg('');
            }}
          >
            <UserPlus size={15} />
            <span>Register</span>
          </button>
        </div>

        {/* Card Body */}
        <div className="license-card">
          {activeTab === 'activate' ? (
            <>
              <h2>
                <KeyRound size={18} className="text-[#FFD000]" />
                <span>License Activation</span>
              </h2>
              <p className="text-muted-foreground text-xs mt-1">
                Enter your approved license key to unlock the signal terminal.
              </p>

              <input
                className="license-input uppercase font-mono tracking-wider"
                value={licenseKeyInput}
                onChange={(e) => {
                  setLicenseKeyInput(e.target.value);
                  setErrorMsg('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleActivate();
                }}
                placeholder="FRK-XXXX-XXXX-XXXX"
                aria-label="License key"
                autoComplete="off"
                spellCheck={false}
              />

              {errorMsg && (
                <p role="alert" className="text-[#FF4D6D] text-xs font-bold my-2">
                  {errorMsg}
                </p>
              )}

              <button
                className="bot-button bot-button-neon generate-button flex items-center justify-center gap-2 cursor-pointer"
                onClick={() => handleActivate()}
                disabled={isLoading}
              >
                <Zap size={16} />
                <span>{isLoading ? 'CHECKING...' : 'ACTIVATE LICENSE'}</span>
              </button>
            </>
          ) : generatedKey ? (
            <>
              <h2>
                <Zap size={18} className="text-[#00D68F]" />
                <span>Key Generated</span>
              </h2>
              <p className="text-muted-foreground text-xs mt-1">
                Save your key. It will activate once admin approves your payment in the Admin panel.
              </p>

              <div className="new-key font-mono">{generatedKey}</div>

              <div className="flex flex-col gap-2 mt-2">
                <button
                  className="bot-button bot-button-outline w-full flex items-center justify-center gap-2 cursor-pointer"
                  onClick={() => copyKeyToClipboard(generatedKey)}
                >
                  {isCopied ? <Check size={15} className="text-[#00D68F]" /> : <Copy size={15} />}
                  <span>{isCopied ? 'COPIED TO CLIPBOARD!' : 'COPY KEY'}</span>
                </button>

                <button
                  className="bot-button bot-button-neon generate-button flex items-center justify-center gap-2 cursor-pointer"
                  onClick={() => {
                    setLicenseKeyInput(generatedKey);
                    setActiveTab('activate');
                    setErrorMsg('');
                  }}
                >
                  <KeyRound size={16} />
                  <span>GO TO ACTIVATE</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>
                <UserPlus size={18} className="text-[#FFD000]" />
                <span>Register & Get Key</span>
              </h2>
              <p className="text-muted-foreground text-xs mt-1">
                Fill your real details and payment info.
              </p>

              <input
                className="license-input reg-input"
                placeholder="Real Full Name"
                value={regForm.full_name}
                onChange={(e) => {
                  setRegForm({ ...regForm, full_name: e.target.value });
                  setErrorMsg('');
                }}
              />

              <input
                className="license-input reg-input"
                placeholder="Number with country code (+966...)"
                type="tel"
                value={regForm.phone}
                onChange={(e) => {
                  setRegForm({ ...regForm, phone: e.target.value });
                  setErrorMsg('');
                }}
              />

              <input
                className="license-input reg-input"
                placeholder="Gmail address"
                type="email"
                value={regForm.email}
                onChange={(e) => {
                  setRegForm({ ...regForm, email: e.target.value });
                  setErrorMsg('');
                }}
              />

              <input
                className="license-input reg-input"
                placeholder="Amount paid (e.g. 20 USD)"
                value={regForm.amount}
                onChange={(e) => {
                  setRegForm({ ...regForm, amount: e.target.value });
                  setErrorMsg('');
                }}
              />

              {errorMsg && (
                <p role="alert" className="text-[#FF4D6D] text-xs font-bold my-2">
                  {errorMsg}
                </p>
              )}

              <button
                className="bot-button bot-button-neon generate-button flex items-center justify-center gap-2 mt-2 cursor-pointer"
                onClick={handleRegister}
                disabled={isLoading}
              >
                <Zap size={16} />
                <span>{isLoading ? 'SUBMITTING...' : 'GENERATE KEY'}</span>
              </button>
            </>
          )}

          <p className="license-hint">
            <KeyRound size={13} />
            <span>Device-locked license · Secured activation</span>
          </p>
        </div>

        <p className="dev-credit">Developer {DEV_HANDLE}</p>
      </div>
    </main>
  );
};
