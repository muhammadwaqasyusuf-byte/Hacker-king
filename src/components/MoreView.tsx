import React, { useState } from 'react';
import { Shell } from './Shell.tsx';
import { useBot } from '../context/BotContext.tsx';
import { FAQ_ITEMS, WHATSAPP_URL, TELEGRAM_URL } from '../constants.ts';
import {
  ShieldCheck,
  KeyRound,
  ShieldAlert,
  MessageSquare,
  Send,
  CircleHelp,
  ChevronDown,
  LogOut,
} from 'lucide-react';

export const MoreView: React.FC = () => {
  const {
    deactivateKey,
    navigateTo,
    setAuthSettingsOpen,
    activeLicense,
    licenseDetails,
    isAdmin,
    appConfig,
  } = useBot();

  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const whatsapp = appConfig?.whatsappUrl || WHATSAPP_URL;
  const telegram = appConfig?.telegramUrl || TELEGRAM_URL;

  return (
    <Shell>
      <section className="terminal">
        <h2 className="terminal-heading">
          MORE <span>OPTIONS</span>
        </h2>
        <p className="terminal-subtitle">Settings, FAQ, and account management</p>

        <div className="support-list">
          {/* Active License Info */}
          <div className="link-row">
            <ShieldCheck className="text-[#00D68F]" />
            <div>
              <strong>License Active</strong>
              <small className="font-mono text-[#FFE166]">
                {activeLicense || 'PRO MAX'} · {licenseDetails?.duration_label || 'Approved'}
              </small>
            </div>
          </div>

          {/* Admin Tools Shortcuts */}
          {isAdmin && (
            <>
              <button
                onClick={() => setAuthSettingsOpen(true)}
                className="link-row w-full text-left bg-transparent border-0 border-b border-border cursor-pointer hover:bg-[#151515]/40"
              >
                <KeyRound className="text-[#FFD000]" />
                <div>
                  <strong>API & MongoDB Settings</strong>
                  <small>Manage the master key, admin password, and MongoDB status</small>
                </div>
              </button>

              <button
                onClick={() => navigateTo('/admin')}
                className="link-row w-full text-left bg-transparent border-0 border-b border-border cursor-pointer hover:bg-[#151515]/40"
              >
                <ShieldAlert className="text-[#FFC247]" />
                <div>
                  <strong>Admin Panel</strong>
                  <small>Manage and approve licenses, reset devices</small>
                </div>
              </button>
            </>
          )}

          {/* Social Links */}
          <a
            className="link-row"
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
          >
            <MessageSquare className="text-[#00D68F]" />
            <div>
              <strong>WhatsApp Group</strong>
              <small>Join our community</small>
            </div>
          </a>

          <a
            className="link-row"
            href={telegram}
            target="_blank"
            rel="noreferrer"
          >
            <Send className="text-[#FFD000]" />
            <div>
              <strong>Telegram Channel</strong>
              <small>@frking786</small>
            </div>
          </a>
        </div>

        {/* FAQ Section */}
        <h3 className="faq-heading">
          <CircleHelp size={16} className="text-[#FFD000]" />
          <span>Frequently Asked Questions</span>
        </h3>

        <div className="faq-list">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = expandedFaq === idx;
            return (
              <div key={item.q} className="faq-item">
                <button
                  className="faq-question"
                  onClick={() => setExpandedFaq(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                >
                  <span>{item.q}</span>
                  <ChevronDown size={15} data-open={isOpen} />
                </button>
                {isOpen && <p className="faq-answer">{item.a}</p>}
              </div>
            );
          })}
        </div>

        {/* Logout / Deactivate License */}
        <button className="logout-button" onClick={deactivateKey}>
          <LogOut size={15} />
          <span>Deactivate License</span>
        </button>
      </section>
    </Shell>
  );
};
