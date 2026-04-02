import React, { useState } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import ShoppingCart01Icon from '@hugeicons/core-free-icons/ShoppingCart01Icon';
import TruckDeliveryIcon from '@hugeicons/core-free-icons/TruckDeliveryIcon';
import PackageDelivered01Icon from '@hugeicons/core-free-icons/PackageDelivered01Icon';
import Invoice01Icon from '@hugeicons/core-free-icons/Invoice01Icon';
import MoneySend01Icon from '@hugeicons/core-free-icons/MoneySend01Icon';
import { Icon, type IconSvgElement } from '@/components/ui/Icon.tsx';
import { cn } from '@/lib/utils.ts';
import { formatShortDate } from '@/lib/format.ts';

export type TimelineEvent = {
  id: string;
  event_type: string;
  human_summary: string | null;
  extracted_data: Record<string, unknown>;
  extraction_confidence: number | null;
  created_at: string;
  email_id: string;
};

const EVENT_ICONS: Partial<Record<string, IconSvgElement>> = {
  order_confirmation: ShoppingCart01Icon,
  payment_confirmation: MoneySend01Icon,
  shipping_notification: TruckDeliveryIcon,
  delivery_notification: PackageDelivered01Icon,
  invoice: Invoice01Icon,
  booking_confirmation: ShoppingCart01Icon,
  subscription_confirmation: ShoppingCart01Icon,
  subscription_renewal: MoneySend01Icon,
};

const MAJOR_EVENT_TYPES = new Set([
  'order_confirmation',
  'delivery_notification',
  'booking_confirmation',
  'subscription_confirmation',
  'accommodation_confirmation',
]);

function EventItem({ event, isLast }: { event: TimelineEvent; isLast: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const isMajor = MAJOR_EVENT_TYPES.has(event.event_type);
  const icon = EVENT_ICONS[event.event_type];
  const lowConfidence = event.extraction_confidence !== null && event.extraction_confidence < 0.7;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="flex gap-3">
        {/* Ligne + point */}
        <div className="flex flex-col items-center">
          <div
            className={cn(
              'w-3 h-3 rounded-full border-2 border-sesame-text shrink-0 mt-1 flex items-center justify-center overflow-hidden',
              isMajor ? 'bg-sesame-text' : 'bg-sesame-surface',
            )}
          >
            {isMajor && icon && (
              <Icon icon={icon} size={8} color="#FCFAF5" strokeWidth={2.5} aria-hidden />
            )}
          </div>
          {!isLast && <div className="w-0.5 bg-sesame-surface-muted flex-1 mt-1" />}
        </div>

        {/* Contenu */}
        <div className={cn('flex-1 pb-4', isLast && 'pb-0')}>
          <Collapsible.Trigger asChild>
            <button className="w-full text-left cursor-pointer group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-body text-sm text-sesame-text leading-snug">
                    {event.human_summary ?? event.event_type}
                  </p>
                  <p className="font-body text-xs text-sesame-text-muted mt-0.5">
                    {formatShortDate(event.created_at)}
                  </p>
                </div>
                {!isMajor && icon && (
                  <Icon icon={icon} size={16} color="#7A7065" aria-hidden />
                )}
              </div>

              {lowConfidence && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Icon icon={Alert02Icon} size={14} color="#FF5C00" aria-hidden />
                  <span className="font-body text-xs text-sesame-text-muted">
                    Sésame n'est pas sûr de cette extraction
                  </span>
                </div>
              )}
            </button>
          </Collapsible.Trigger>

          <Collapsible.Content>
            <div className="mt-2 p-3 bg-sesame-surface-muted rounded text-xs space-y-1">
              {Object.entries(event.extracted_data)
                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                .slice(0, 8)
                .map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="font-body text-sesame-text-muted shrink-0">{key}</span>
                    <span className="font-body text-sesame-text truncate">{String(value)}</span>
                  </div>
                ))}
            </div>
          </Collapsible.Content>
        </div>
      </div>
    </Collapsible.Root>
  );
}

type TimelineProps = {
  events: TimelineEvent[];
};

export function Timeline({ events }: TimelineProps): React.JSX.Element {
  if (events.length === 0) {
    return (
      <p className="font-body text-sm text-sesame-text-muted py-4">
        Aucun mail lié à ce dossier pour le moment.
      </p>
    );
  }

  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="space-y-0">
      {sorted.map((event, i) => (
        <EventItem key={event.id} event={event} isLast={i === sorted.length - 1} />
      ))}
    </div>
  );
}
