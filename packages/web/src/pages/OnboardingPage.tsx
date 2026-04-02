import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MagicWand01Icon from '@hugeicons/core-free-icons/MagicWand01Icon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import Loading03Icon from '@hugeicons/core-free-icons/Loading03Icon';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import { Button } from '@/components/ui/Button.tsx';
import { Icon } from '@/components/ui/Icon.tsx';
import { Input } from '@/components/ui/Input.tsx';
import { Label } from '@/components/ui/Label.tsx';
import { Progress } from '@/components/ui/Progress.tsx';
import { type OnboardingStep, type BackfillInfo, useOnboarding } from './OnboardingPage.hooks.ts';

function OnboardingStepIndicator({ step }: { step: OnboardingStep }): React.JSX.Element {
  const steps = [1, 2, 3] as const;
  return (
    <div className="flex items-center mb-8">
      {steps.map((s, idx) => (
        <React.Fragment key={s}>
          {idx > 0 && (
            <div
              className={`flex-1 h-0.5 ${step > idx ? 'bg-sesame-positive' : 'bg-sesame-surface-muted'}`}
            />
          )}
          <div
            className={`w-7 h-7 rounded-pill border-2 border-sesame-text flex items-center justify-center shrink-0 ${
              step > s
                ? 'bg-sesame-positive'
                : step === s
                  ? 'bg-sesame-accent'
                  : 'bg-sesame-surface-muted'
            }`}
          >
            <span className="font-body text-xs font-medium text-sesame-text">{s}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

type Step1Props = {
  displayName: string;
  onNext: (name: string) => void;
};

function OnboardingStep1({ displayName, onNext }: Step1Props): React.JSX.Element {
  const [name, setName] = useState(displayName);
  const trimmed = name.trim();

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <Icon icon={MagicWand01Icon} size={48} color="#FF5C00" aria-hidden />
      </div>
      <div className="space-y-3">
        <h1 className="font-heading font-bold text-3xl text-sesame-text">
          {trimmed ? `Bienvenue, ${trimmed}` : 'Bienvenue'}
        </h1>
        <p className="font-body text-sesame-text-muted">
          Sésame va scanner tes mails pour retrouver tes commandes, suivre tes colis et surveiller
          tes garanties.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="display-name">Comment tu t'appelles ?</Label>
        <Input
          id="display-name"
          type="text"
          placeholder="Prénom ou pseudo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
        />
      </div>
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={() => onNext(trimmed || displayName)}
        disabled={trimmed.length === 0 && displayName.length === 0}
      >
        C'est parti
      </Button>
    </div>
  );
}

function oauthErrorMessage(error: string): string {
  if (error === 'no_refresh_token') {
    return "Autorise à nouveau l'accès depuis Google pour obtenir un token de rafraîchissement.";
  }
  if (error === 'email_already_used') {
    return 'Cette adresse Gmail est déjà connectée à un autre compte Sésame.';
  }
  return decodeURIComponent(error);
}

type Step2Props = {
  hasGmail: boolean;
  oauthError: string | null;
  onConnectGmail: () => void;
  onNext: () => void;
};

function OnboardingStep2({ hasGmail, oauthError, onConnectGmail, onNext }: Step2Props): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-heading font-bold text-2xl text-sesame-text">
          Connecte ta boîte mail
        </h2>
        <p className="font-body text-sm text-sesame-text-muted">
          Sésame surveille tes mails et crée des dossiers automatiquement pour chaque transaction.
        </p>
      </div>

      {oauthError && (
        <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-sesame-text bg-sesame-danger/15">
          <Icon icon={Alert02Icon} size={20} color="#2A241F" aria-hidden />
          <div>
            <p className="font-body text-sm text-sesame-text font-medium">Connexion échouée</p>
            <p className="font-body text-xs text-sesame-text-muted mt-0.5">
              {oauthErrorMessage(oauthError)}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="p-5 rounded-lg border-2 border-sesame-accent bg-sesame-surface shadow-brutal">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sesame-accent/15 border-2 border-sesame-text flex items-center justify-center shrink-0">
              <span className="font-heading font-bold text-sm text-sesame-text">G</span>
            </div>
            <div className="flex-1">
              <p className="font-body font-semibold text-sm text-sesame-text">Gmail</p>
              <p className="font-body text-xs text-sesame-text-muted">
                Via Google OAuth — accès lecture seule
              </p>
            </div>
            {hasGmail && (
              <div className="flex items-center gap-1.5 shrink-0 bg-sesame-positive/15 rounded-pill px-2 py-1">
                <Icon icon={CheckmarkCircle02Icon} size={14} color="#2A241F" aria-hidden />
                <span className="font-body text-xs text-sesame-text font-medium">Connecté</span>
              </div>
            )}
          </div>
          {!hasGmail && (
            <Button variant="primary" size="lg" className="w-full" onClick={onConnectGmail}>
              Connecter Gmail
            </Button>
          )}
        </div>

        <div className="p-4 rounded-lg border-2 border-sesame-text/30 bg-sesame-surface opacity-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sesame-surface-muted border-2 border-sesame-text/30 flex items-center justify-center shrink-0">
                <span className="font-heading font-bold text-sm text-sesame-text-muted">Y</span>
              </div>
              <p className="font-body font-semibold text-sm text-sesame-text-muted">Yahoo Mail</p>
            </div>
            <span className="font-body text-xs text-sesame-text-muted">Bientôt</span>
          </div>
        </div>

        <div className="p-4 rounded-lg border-2 border-sesame-text/30 bg-sesame-surface opacity-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sesame-surface-muted border-2 border-sesame-text/30 flex items-center justify-center shrink-0">
                <span className="font-heading font-bold text-sm text-sesame-text-muted">O</span>
              </div>
              <p className="font-body font-semibold text-sm text-sesame-text-muted">Outlook</p>
            </div>
            <span className="font-body text-xs text-sesame-text-muted">Bientôt</span>
          </div>
        </div>
      </div>

      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={onNext}
        disabled={!hasGmail}
      >
        Continuer
      </Button>
    </div>
  );
}

type Step3Props = {
  backfill: BackfillInfo;
  dossierCount: number;
  onDone: () => void;
};

function OnboardingStep3({ backfill, dossierCount, onDone }: Step3Props): React.JSX.Element {
  const pct =
    backfill.total !== null && backfill.total > 0
      ? Math.round((backfill.processed / backfill.total) * 100)
      : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-heading font-bold text-2xl text-sesame-text">
          Sésame fouille tes mails...
        </h2>
        <p className="font-body text-sm text-sesame-text-muted">
          Tes commandes, billets et abonnements apparaissent au fur et à mesure.
        </p>
      </div>

      <div className="p-5 rounded-lg border-2 border-sesame-text bg-sesame-surface shadow-brutal space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {backfill.isRunning ? (
                <>
                  <Icon
                    icon={Loading03Icon}
                    size={16}
                    color="#FF5C00"
                    className="animate-spin"
                    aria-hidden
                  />
                  <p className="font-body text-sm text-sesame-text">Analyse des mails...</p>
                </>
              ) : backfill.isDone ? (
                <>
                  <Icon icon={CheckmarkCircle02Icon} size={16} color="#2A241F" aria-hidden />
                  <p className="font-body text-sm text-sesame-text">Import terminé</p>
                </>
              ) : (
                <p className="font-body text-sm text-sesame-text-muted">
                  Import pas encore démarré
                </p>
              )}
            </div>
            {backfill.total !== null && (
              <span className="font-body text-xs text-sesame-text-muted">
                {backfill.processed.toLocaleString('fr-FR')}/
                {backfill.total.toLocaleString('fr-FR')}
              </span>
            )}
          </div>
          <Progress value={pct ?? 0} aria-label="Progression de l'import" />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t-2 border-sesame-text/10">
          <div>
            <p className="font-heading font-semibold text-2xl text-sesame-text">
              {backfill.processed.toLocaleString('fr-FR')}
            </p>
            <p className="font-body text-xs text-sesame-text-muted">mails analysés</p>
          </div>
          <div>
            <p className="font-heading font-semibold text-2xl text-sesame-text">
              {dossierCount.toLocaleString('fr-FR')}
            </p>
            <p className="font-body text-xs text-sesame-text-muted">dossiers retrouvés</p>
          </div>
        </div>
      </div>

      <Button variant="primary" size="lg" className="w-full" onClick={onDone}>
        Explorer mon coffre-fort
      </Button>

      <p className="font-body text-xs text-sesame-text-muted text-center">
        L'import continue en arrière-plan, tes dossiers apparaissent au fur et à mesure
      </p>
    </div>
  );
}

export function OnboardingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialStep: OnboardingStep = searchParams.get('status') === 'success' ? 3 : 1;
  const [step, setStep] = useState<OnboardingStep>(initialStep);

  const oauthError = searchParams.get('error');

  const { displayName, saveDisplayName, hasGmail, backfill, dossierCount, handleConnectGmail } =
    useOnboarding(step);

  return (
    <div className="min-h-svh bg-sesame-bg flex flex-col">
      <header className="sticky top-0 z-10 bg-sesame-surface border-b-2 border-sesame-text h-14 flex items-center px-4">
        <span className="font-heading font-bold text-xl text-sesame-text tracking-tight">
          Sésame
        </span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <OnboardingStepIndicator step={step} />

          {step === 1 && (
            <OnboardingStep1
              key={displayName || 'init'}
              displayName={displayName}
              onNext={(name) => {
                saveDisplayName(name);
                setStep(2);
              }}
            />
          )}
          {step === 2 && (
            <OnboardingStep2
              hasGmail={hasGmail}
              oauthError={oauthError}
              onConnectGmail={handleConnectGmail}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <OnboardingStep3
              backfill={backfill}
              dossierCount={dossierCount}
              onDone={() => void navigate('/')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
