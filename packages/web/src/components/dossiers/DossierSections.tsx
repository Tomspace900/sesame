import React from 'react';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import SquareArrowUpRightIcon from '@hugeicons/core-free-icons/SquareArrowUpRightIcon';
import { Icon } from '@/components/ui/Icon.tsx';
import { SectionTitle } from '@/components/ui/SectionTitle.tsx';
import { DeadlineBar } from '@/components/dossiers/DeadlineBar.tsx';
import { InfoRow } from '@/components/dossiers/InfoRow.tsx';
import { formatDateLong, formatDateTime, formatAmount, formatMonthYear } from '@/lib/format.ts';
import { toast } from 'sonner';
import type { DossierType, DossierStatus } from '@sesame/shared/types';

// ─── DossierDetail type ───────────────────────────────────────────────────────

export type DossierDetail = {
  id: string;
  dossier_type: DossierType;
  title: string | null;
  description: string | null;
  reference: string | null;
  amount: number | null;
  currency: string | null;
  status: DossierStatus;
  image_url: string | null;
  source_url: string | null;
  payment_method: string | null;
  started_at: string | null;
  ended_at: string | null;
  return_deadline: string | null;
  warranty_deadline: string | null;
  next_renewal_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  tracking_url: string | null;
  pickup_point_name: string | null;
  pickup_point_address: string | null;
  pickup_code: string | null;
  departure_location: string | null;
  arrival_location: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  flight_or_train_number: string | null;
  seat_info: string | null;
  booking_reference: string | null;
  accommodation_address: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  host_name: string | null;
  host_phone: string | null;
  number_of_guests: number | null;
  subscription_name: string | null;
  subscription_amount: number | null;
  subscription_period: string | null;
  participants: string[];
  action_links: { type: string; url: string; label?: string }[];
  notes: string | null;
  tags: string[];
  created_at: string;
  merchants: { canonical_name: string } | null;
};

type SectionProps = { dossier: DossierDetail };

// ─── Shared info block ────────────────────────────────────────────────────────

export function CommonInfoSection({ dossier }: SectionProps): React.JSX.Element {
  return (
    <section>
      <SectionTitle>Informations</SectionTitle>
      <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg px-4">
        <InfoRow label="Référence" value={dossier.reference} copiable />
        <InfoRow label="Date" value={formatDateLong(dossier.started_at)} />
        <InfoRow label="Paiement" value={dossier.payment_method} />
      </div>
    </section>
  );
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

export function PurchaseSections({ dossier }: SectionProps): React.JSX.Element {
  const hasTracking = dossier.tracking_number || dossier.carrier || dossier.tracking_url;
  const hasPickup = dossier.pickup_code || dossier.pickup_point_name;
  const hasDeadlines = dossier.return_deadline || dossier.warranty_deadline;

  return (
    <>
      {hasTracking && (
        <section>
          <SectionTitle>Suivi</SectionTitle>
          <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg px-4">
            <InfoRow label="Transporteur" value={dossier.carrier} />
            <InfoRow label="N° de suivi" value={dossier.tracking_number} copiable />
            {dossier.tracking_url && (
              <InfoRow label="Lien de suivi" value="Suivre mon colis" externalLink={dossier.tracking_url} />
            )}
          </div>
        </section>
      )}

      {hasPickup && (
        <section>
          <SectionTitle>Retrait</SectionTitle>
          <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg px-4">
            <InfoRow label="Point retrait" value={dossier.pickup_point_name} />
            <InfoRow label="Adresse" value={dossier.pickup_point_address} />
            {dossier.pickup_code && (
              <div className="py-3 flex items-center justify-between">
                <span className="font-body text-sm text-sesame-text-muted">Code retrait</span>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold text-2xl text-sesame-text tracking-widest">
                    {dossier.pickup_code}
                  </span>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(dossier.pickup_code ?? '');
                      toast.success('Code copié');
                    }}
                    className="cursor-pointer"
                    aria-label="Copier le code retrait"
                  >
                    <Icon icon={Copy01Icon} size={16} color="#7A7065" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {hasDeadlines && (
        <section>
          <SectionTitle>Échéances</SectionTitle>
          <div className="space-y-4 bg-sesame-surface border-2 border-sesame-text rounded-lg p-4">
            {dossier.return_deadline && (
              <DeadlineBar label="Rétractation" deadline={dossier.return_deadline} startDate={dossier.started_at} />
            )}
            {dossier.warranty_deadline && (
              <DeadlineBar
                label="Garantie"
                deadline={dossier.warranty_deadline}
                startDate={dossier.started_at}
                description={`Tu es tranquille jusqu'en ${formatMonthYear(dossier.warranty_deadline)}.`}
              />
            )}
          </div>
        </section>
      )}
    </>
  );
}

// ─── Trip ─────────────────────────────────────────────────────────────────────

export function TripSections({ dossier }: SectionProps): React.JSX.Element {
  const checkInLink = dossier.action_links?.find((l) => l.type === 'check_in');
  const hasParticipants = dossier.participants && dossier.participants.length > 0;

  return (
    <>
      <section>
        <SectionTitle>Trajet</SectionTitle>
        <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg px-4">
          <InfoRow label="Départ" value={dossier.departure_location} />
          <InfoRow label="Arrivée" value={dossier.arrival_location} />
          <InfoRow label="Départ le" value={formatDateTime(dossier.departure_time)} />
          <InfoRow label="Arrivée le" value={formatDateTime(dossier.arrival_time)} />
          <InfoRow label="Numéro" value={dossier.flight_or_train_number} />
          <InfoRow label="Siège" value={dossier.seat_info} />
          <InfoRow label="Référence" value={dossier.booking_reference} copiable />
        </div>
      </section>

      {hasParticipants && (
        <section>
          <SectionTitle>Participants</SectionTitle>
          <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg px-4">
            {dossier.participants.map((p, i) => (
              <div key={i} className="py-2.5 font-body text-sm text-sesame-text border-b border-sesame-surface-muted last:border-0">
                {p}
              </div>
            ))}
          </div>
        </section>
      )}

      {checkInLink && (
        <a
          href={checkInLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-sesame-accent text-sesame-surface border-2 border-sesame-text rounded shadow-brutal-sm font-body font-medium text-sm"
        >
          Enregistrement en ligne
          <Icon icon={SquareArrowUpRightIcon} size={16} color="#FCFAF5" aria-hidden />
        </a>
      )}

      {dossier.departure_time && (
        <section>
          <SectionTitle>Échéances</SectionTitle>
          <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg p-4">
            <DeadlineBar label="Départ" deadline={dossier.departure_time} startDate={dossier.started_at} />
          </div>
        </section>
      )}
    </>
  );
}

// ─── Accommodation ────────────────────────────────────────────────────────────

export function AccommodationSections({ dossier }: SectionProps): React.JSX.Element {
  const mapsUrl = dossier.accommodation_address
    ? `https://maps.google.com/?q=${encodeURIComponent(dossier.accommodation_address)}`
    : undefined;

  return (
    <>
      <section>
        <SectionTitle>Séjour</SectionTitle>
        <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg px-4">
          <InfoRow label="Check-in" value={dossier.check_in_time} />
          <InfoRow label="Check-out" value={dossier.check_out_time} />
          <InfoRow
            label="Adresse"
            value={dossier.accommodation_address}
            {...(mapsUrl ? { externalLink: mapsUrl } : {})}
          />
          {dossier.number_of_guests && (
            <InfoRow label="Convives" value={`${dossier.number_of_guests} personnes`} />
          )}
        </div>
      </section>

      {(dossier.host_name || dossier.host_phone) && (
        <section>
          <SectionTitle>Hôte</SectionTitle>
          <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg px-4">
            <InfoRow label="Nom" value={dossier.host_name} />
            <InfoRow label="Téléphone" value={dossier.host_phone} tel />
          </div>
        </section>
      )}

      {dossier.return_deadline && (
        <section>
          <SectionTitle>Échéances</SectionTitle>
          <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg p-4">
            <DeadlineBar label="Annulation gratuite" deadline={dossier.return_deadline} startDate={dossier.started_at} />
          </div>
        </section>
      )}
    </>
  );
}

// ─── Subscription ─────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensuel',
  yearly: 'Annuel',
  weekly: 'Hebdomadaire',
  other: 'Autre',
};

export function SubscriptionSections({ dossier }: SectionProps): React.JSX.Element {
  return (
    <>
      <section>
        <SectionTitle>Abonnement</SectionTitle>
        <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg px-4">
          <InfoRow label="Service" value={dossier.subscription_name} />
          {dossier.subscription_amount && (
            <InfoRow
              label="Montant"
              value={formatAmount(dossier.subscription_amount, dossier.currency) ?? ''}
            />
          )}
          {dossier.subscription_period && (
            <InfoRow
              label="Période"
              value={PERIOD_LABELS[dossier.subscription_period] ?? dossier.subscription_period}
            />
          )}
          <InfoRow label="Prochain renouvellement" value={formatDateLong(dossier.next_renewal_at)} />
        </div>
      </section>

      {dossier.next_renewal_at && (
        <section>
          <SectionTitle>Échéances</SectionTitle>
          <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg p-4">
            <DeadlineBar label="Renouvellement" deadline={dossier.next_renewal_at} startDate={dossier.started_at} />
          </div>
        </section>
      )}
    </>
  );
}

// ─── Reservation ─────────────────────────────────────────────────────────────

export function ReservationSections({ dossier }: SectionProps): React.JSX.Element {
  return (
    <section>
      <SectionTitle>Réservation</SectionTitle>
      <div className="bg-sesame-surface border-2 border-sesame-text rounded-lg px-4">
        <InfoRow label="Lieu" value={dossier.accommodation_address} />
        <InfoRow label="Date" value={formatDateTime(dossier.started_at)} />
        {dossier.number_of_guests && (
          <InfoRow label="Personnes" value={`${dossier.number_of_guests} personnes`} />
        )}
        <InfoRow label="Référence" value={dossier.booking_reference ?? dossier.reference} copiable />
      </div>
    </section>
  );
}
