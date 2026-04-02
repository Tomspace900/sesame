import { Button } from "@/components/ui/Button.tsx";
import { DisconnectMailDialog } from "@/components/ui/DisconnectMailDialog.tsx";
import { Icon } from "@/components/ui/Icon.tsx";
import { Input } from "@/components/ui/Input.tsx";
import { Label } from "@/components/ui/Label.tsx";
import { Progress } from "@/components/ui/Progress.tsx";
import { SectionTitle } from "@/components/ui/SectionTitle.tsx";
import { formatAmount, formatRelativeTime } from "@/lib/format.ts";
import { supabase } from "@/lib/supabase.ts";
import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import Alert02Icon from "@hugeicons/core-free-icons/Alert02Icon";
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import * as Switch from "@radix-ui/react-switch";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DEFAULT_PREFS,
  useMailAccounts,
  useReglagesProfile,
  useStats,
  type MailAccount,
  type NotificationPreferences,
} from "./ReglagesPage.hooks.ts";

const TELEGRAM_BOT_NAME = import.meta.env["VITE_TELEGRAM_BOT_NAME"] as string | undefined;

// ============================================================
// Mon compte
// ============================================================

type MonCompteSectionProps = {
  displayName: string;
  email: string | undefined;
  isSavingName: boolean;
  onSave: (name: string) => void;
  onSignOut: () => void;
};

function MonCompteSection({
  displayName,
  email,
  isSavingName,
  onSave,
  onSignOut,
}: MonCompteSectionProps): React.JSX.Element {
  const [name, setName] = useState(displayName);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== displayName) onSave(trimmed);
  };

  return (
    <section>
      <SectionTitle>Mon compte</SectionTitle>
      <div className="p-4 rounded-lg border-2 border-sesame-text bg-sesame-surface shadow-brutal-sm space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="settings-name">Nom affiché</Label>
          <div className="flex items-center gap-2">
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              placeholder="Ton prénom ou pseudo"
              className="flex-1"
            />
            {isSavingName && (
              <Icon
                icon={Loading03Icon}
                size={16}
                color="#7A7065"
                className="animate-spin"
                aria-hidden
              />
            )}
          </div>
        </div>
        <div>
          <p className="font-body text-xs text-sesame-text-muted uppercase tracking-wide mb-0.5">
            Email
          </p>
          <p className="font-body text-sm text-sesame-text-muted">{email ?? "—"}</p>
        </div>
        <button
          onClick={onSignOut}
          className="font-body text-sm text-sesame-danger underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 hover:opacity-80 transition-opacity"
        >
          Se déconnecter
        </button>
      </div>
    </section>
  );
}

// ============================================================
// Boîtes mail
// ============================================================

type BoitesMailSectionProps = {
  accounts: MailAccount[];
  disconnectAccount: (id: string) => void;
  isDisconnecting: boolean;
  disconnectingId: string | null;
  onAddAccount: () => void;
};

function BoitesMailSection({
  accounts,
  disconnectAccount,
  isDisconnecting,
  disconnectingId,
  onAddAccount,
}: BoitesMailSectionProps): React.JSX.Element {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmAccount = accounts.find((a) => a.id === confirmId) ?? null;

  return (
    <section>
      <SectionTitle>Boîtes mail</SectionTitle>
      <div className="space-y-3">
        {accounts.map((account) => {
          const { processed, total } = account.backfill_progress ?? { processed: 0, total: null };
          const pct = total ? Math.round((processed / total) * 100) : 0;

          return (
            <div
              key={account.id}
              className="p-4 rounded-lg border-2 border-sesame-text bg-sesame-surface shadow-brutal-sm space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sesame-accent/15 border-2 border-sesame-text flex items-center justify-center shrink-0">
                  <span className="font-heading font-bold text-sm text-sesame-text">
                    {account.provider.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body font-medium text-sm text-sesame-text truncate">
                    {account.email_address}
                  </p>
                  <p className="font-body text-xs text-sesame-text-muted">
                    {formatRelativeTime(account.last_sync_at)}
                  </p>
                </div>
                <button
                  onClick={() => setConfirmId(account.id)}
                  disabled={isDisconnecting && disconnectingId === account.id}
                  className="font-body text-xs text-sesame-danger underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 hover:opacity-80 transition-opacity disabled:opacity-50 shrink-0"
                >
                  {isDisconnecting && disconnectingId === account.id ? (
                    <Icon
                      icon={Loading03Icon}
                      size={14}
                      color="currentColor"
                      className="animate-spin"
                      aria-hidden
                    />
                  ) : (
                    "Déconnecter"
                  )}
                </button>
              </div>

              {account.backfill_status === "running" && account.backfill_progress && (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <p className="font-body text-xs text-sesame-text-muted">Import en cours...</p>
                    {total !== null && (
                      <p className="font-body text-xs text-sesame-text-muted">
                        {processed.toLocaleString("fr-FR")}/{total.toLocaleString("fr-FR")}
                      </p>
                    )}
                  </div>
                  <Progress value={pct} aria-label="Progression de l'import" />
                </div>
              )}
            </div>
          );
        })}

        <button
          onClick={onAddAccount}
          className="w-full flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-sesame-text/40 text-sesame-text-muted hover:border-sesame-text hover:text-sesame-text transition-colors cursor-pointer bg-transparent"
        >
          <Icon icon={Add01Icon} size={16} color="currentColor" aria-hidden />
          <span className="font-body text-sm">Ajouter un compte mail</span>
        </button>
      </div>

      <DisconnectMailDialog
        open={confirmId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
        emailAddress={confirmAccount?.email_address ?? ""}
        onConfirm={() => {
          if (confirmAccount) {
            disconnectAccount(confirmAccount.id);
            setConfirmId(null);
          }
        }}
        isPending={isDisconnecting && disconnectingId === confirmId}
      />
    </section>
  );
}

// ============================================================
// Telegram
// ============================================================

function TelegramStep({ n, text }: { n: number; text: string }): React.JSX.Element {
  return (
    <li className="flex items-start gap-2.5">
      <span className="w-5 h-5 rounded-pill bg-sesame-surface-muted border-2 border-sesame-text flex items-center justify-center shrink-0 mt-px">
        <span className="font-body text-xs font-medium text-sesame-text">{n}</span>
      </span>
      <p className="font-body text-sm text-sesame-text">{text}</p>
    </li>
  );
}

type TelegramSectionProps = {
  chatId: string | null;
  verifyTelegramCode: (code: string) => void;
  isVerifying: boolean;
  verifyError: string | null;
  sendTelegramTest: (_: undefined) => void;
  isSendingTest: boolean;
  disconnectTelegram: (_: undefined) => void;
};

function TelegramSection({
  chatId,
  verifyTelegramCode,
  isVerifying,
  verifyError,
  sendTelegramTest,
  isSendingTest,
  disconnectTelegram,
}: TelegramSectionProps): React.JSX.Element {
  const [code, setCode] = useState("");

  const handleVerify = () => {
    const trimmed = code.trim();
    if (trimmed) verifyTelegramCode(trimmed);
  };

  return (
    <section>
      <SectionTitle>Telegram</SectionTitle>
      {chatId ? (
        <div className="p-4 rounded-lg border-2 border-sesame-text bg-sesame-surface shadow-brutal-sm space-y-3">
          <div className="flex items-center gap-1.5 bg-sesame-positive/15 rounded-pill px-2 py-1 w-fit">
            <Icon icon={CheckmarkCircle02Icon} size={14} color="#2A241F" aria-hidden />
            <span className="font-body text-xs text-sesame-text font-medium">Connecté</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => sendTelegramTest(undefined)}
              disabled={isSendingTest}
            >
              {isSendingTest && (
                <Icon
                  icon={Loading03Icon}
                  size={14}
                  color="currentColor"
                  className="animate-spin"
                  aria-hidden
                />
              )}
              Tester
            </Button>
            <button
              onClick={() => disconnectTelegram(undefined)}
              className="font-body text-sm text-sesame-danger underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 hover:opacity-80 transition-opacity"
            >
              Déconnecter
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg border-2 border-sesame-text bg-sesame-surface shadow-brutal-sm space-y-4">
          <ol className="space-y-3">
            <TelegramStep
              n={1}
              text={
                TELEGRAM_BOT_NAME
                  ? `Ouvre Telegram et cherche @${TELEGRAM_BOT_NAME}`
                  : "Ouvre Telegram et cherche le bot Sésame"
              }
            />
            <TelegramStep n={2} text="Envoie /start au bot" />
            <TelegramStep n={3} text="Colle le code reçu ci-dessous" />
          </ol>

          {verifyError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-sesame-danger/15">
              <Icon icon={Alert02Icon} size={16} color="#2A241F" aria-hidden />
              <p className="font-body text-xs text-sesame-text">{verifyError}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleVerify();
              }}
              placeholder="Code à 6 chiffres"
              className="flex-1"
              maxLength={10}
            />
            <Button
              variant="primary"
              size="md"
              onClick={handleVerify}
              disabled={isVerifying || !code.trim()}
            >
              {isVerifying && (
                <Icon
                  icon={Loading03Icon}
                  size={16}
                  color="currentColor"
                  className="animate-spin"
                  aria-hidden
                />
              )}
              Vérifier
            </Button>
          </div>

          {TELEGRAM_BOT_NAME && (
            <a
              href={`https://t.me/${TELEGRAM_BOT_NAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-sm text-sesame-accent underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Ouvrir dans Telegram
            </a>
          )}
        </div>
      )}
    </section>
  );
}

// ============================================================
// Notifications
// ============================================================

function SwitchRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="font-body text-sm text-sesame-text cursor-pointer">
        {label}
      </label>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative w-11 h-6 rounded-pill border-2 border-sesame-text bg-sesame-surface-muted data-[state=checked]:bg-sesame-accent cursor-pointer focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2"
      >
        <Switch.Thumb className="block w-4 h-4 bg-sesame-text rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </div>
  );
}

function DelayInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="font-body text-sm text-sesame-text flex-1">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={365}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= 0) onChange(v);
        }}
        className="w-16 bg-sesame-surface border-2 border-sesame-text rounded h-9 px-2 text-center font-body text-sm text-sesame-text focus:outline-none focus:border-sesame-accent"
      />
    </div>
  );
}

type NotificationsSectionProps = {
  prefs: NotificationPreferences;
  updatePref: <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => void;
  isSavingPrefs: boolean;
};

function NotificationsSection({
  prefs,
  updatePref,
  isSavingPrefs,
}: NotificationsSectionProps): React.JSX.Element {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <SectionTitle className="mb-0">Notifications</SectionTitle>
        {isSavingPrefs && (
          <Icon
            icon={Loading03Icon}
            size={14}
            color="#7A7065"
            className="animate-spin"
            aria-hidden
          />
        )}
      </div>
      <div className="p-4 rounded-lg border-2 border-sesame-text bg-sesame-surface shadow-brutal-sm space-y-4">
        <SwitchRow
          id="notif-telegram"
          label="Telegram"
          checked={prefs.telegram}
          onChange={(v) => updatePref("telegram", v)}
        />
        <SwitchRow
          id="notif-calendar"
          label="Google Calendar"
          checked={prefs.calendar}
          onChange={(v) => updatePref("calendar", v)}
        />
        <div className="border-t-2 border-sesame-text/10 pt-4 space-y-3">
          <DelayInput
            id="delay-return"
            label="Rappel rétractation (jours avant)"
            value={prefs.return_reminder_days}
            onChange={(v) => updatePref("return_reminder_days", v)}
          />
          <DelayInput
            id="delay-warranty"
            label="Rappel garantie (jours avant)"
            value={prefs.warranty_reminder_days}
            onChange={(v) => updatePref("warranty_reminder_days", v)}
          />
          <DelayInput
            id="delay-renewal"
            label="Rappel renouvellement (jours avant)"
            value={prefs.renewal_reminder_days}
            onChange={(v) => updatePref("renewal_reminder_days", v)}
          />
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Statistiques
// ============================================================

function StatCard({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <div className="p-4 rounded-lg border-2 border-sesame-text bg-sesame-surface shadow-brutal-sm">
      <p className="font-heading font-semibold text-2xl text-sesame-text">{value}</p>
      <p className="font-body text-xs text-sesame-text-muted mt-0.5">{label}</p>
    </div>
  );
}

type StatistiquesSectionProps = {
  dossierCount: number;
  mailsAnalysed: number;
  sourceCount: number;
  totalValue: number;
};

function StatistiquesSection({
  dossierCount,
  mailsAnalysed,
  sourceCount,
  totalValue,
}: StatistiquesSectionProps): React.JSX.Element {
  return (
    <section>
      <SectionTitle>Statistiques</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <StatCard value={dossierCount.toLocaleString("fr-FR")} label="Dossiers" />
        <StatCard value={mailsAnalysed.toLocaleString("fr-FR")} label="Mails analysés" />
        <StatCard value={sourceCount.toLocaleString("fr-FR")} label="Sources" />
        <StatCard value={formatAmount(totalValue, "EUR") ?? "—"} label="Valeur totale" />
      </div>
    </section>
  );
}

// ============================================================
// Page
// ============================================================

export function ReglagesPage(): React.JSX.Element {
  const navigate = useNavigate();

  const {
    user,
    profile,
    isSavingName,
    saveDisplayName,
    isSavingPrefs,
    updatePref,
    verifyTelegramCode,
    isVerifying,
    verifyError,
    sendTelegramTest,
    isSendingTest,
    disconnectTelegram,
  } = useReglagesProfile();

  const { accounts, disconnectAccount, isDisconnecting, disconnectingId } = useMailAccounts();
  const { dossierCount, mailsAnalysed, sourceCount, totalValue } = useStats();

  const emailPrefix = user?.email?.split("@")[0] ?? "";
  const displayName = profile?.display_name ?? emailPrefix;
  const prefs = profile?.notification_preferences ?? DEFAULT_PREFS;

  const handleSignOut = () => {
    void supabase.auth.signOut().then(() => {
      navigate("/auth/connexion");
    });
  };

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-8">
      <h1 className="font-heading font-semibold text-2xl text-sesame-text">Réglages</h1>

      <MonCompteSection
        key={displayName || "init"}
        displayName={displayName}
        email={user?.email}
        isSavingName={isSavingName}
        onSave={saveDisplayName}
        onSignOut={handleSignOut}
      />

      <BoitesMailSection
        accounts={accounts}
        disconnectAccount={disconnectAccount}
        isDisconnecting={isDisconnecting}
        disconnectingId={disconnectingId}
        onAddAccount={() => navigate("/reglages/connecter/gmail")}
      />

      <TelegramSection
        chatId={profile?.telegram_chat_id ?? null}
        verifyTelegramCode={verifyTelegramCode}
        isVerifying={isVerifying}
        verifyError={verifyError}
        sendTelegramTest={sendTelegramTest}
        isSendingTest={isSendingTest}
        disconnectTelegram={disconnectTelegram}
      />

      <NotificationsSection prefs={prefs} updatePref={updatePref} isSavingPrefs={isSavingPrefs} />

      <StatistiquesSection
        dossierCount={dossierCount}
        mailsAnalysed={mailsAnalysed}
        sourceCount={sourceCount}
        totalValue={totalValue}
      />
    </div>
  );
}
