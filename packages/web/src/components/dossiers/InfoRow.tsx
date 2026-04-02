import React from 'react';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import SquareArrowUpRightIcon from '@hugeicons/core-free-icons/SquareArrowUpRightIcon';
import { Icon } from '@/components/ui/Icon.tsx';
import { toast } from 'sonner';

type InfoRowProps = {
  label: string;
  value: string | null | undefined;
  copiable?: boolean;
  externalLink?: string;
  tel?: boolean;
};

export function InfoRow({ label, value, copiable, externalLink, tel }: InfoRowProps): React.JSX.Element | null {
  if (!value) return null;

  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
    toast.success('Référence copiée');
  };

  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-sesame-surface-muted last:border-0">
      <span className="font-body text-sm text-sesame-text-muted shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-body text-sm text-sesame-text text-right break-all">{value}</span>
        {copiable && (
          <button onClick={handleCopy} className="shrink-0 cursor-pointer" aria-label="Copier">
            <Icon icon={Copy01Icon} size={16} color="#7A7065" aria-hidden />
          </button>
        )}
        {externalLink && (
          <a
            href={externalLink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            aria-label="Ouvrir le lien"
          >
            <Icon icon={SquareArrowUpRightIcon} size={16} color="#7A7065" aria-hidden />
          </a>
        )}
        {tel && (
          <a href={`tel:${value}`} className="shrink-0" aria-label="Appeler">
            <Icon icon={SquareArrowUpRightIcon} size={16} color="#7A7065" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
