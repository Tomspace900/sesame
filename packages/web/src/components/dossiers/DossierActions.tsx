import React, { useState } from 'react';
import MoreHorizontalCircle01Icon from '@hugeicons/core-free-icons/MoreHorizontalCircle01Icon';
import Edit02Icon from '@hugeicons/core-free-icons/Edit02Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import CancelCircleIcon from '@hugeicons/core-free-icons/CancelCircleIcon';
import UndoIcon from '@hugeicons/core-free-icons/UndoIcon';
import { Icon, type IconSvgElement } from '@/components/ui/Icon.tsx';
import { cn } from '@/lib/utils.ts';

// ─── DeleteDialog ────────────────────────────────────────────────────────────

type DeleteDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteDialog({ open, onClose, onConfirm }: DeleteDialogProps): React.JSX.Element | null {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-sesame-text/40" onClick={onClose} />
      <div className="relative z-10 bg-sesame-surface border-2 border-sesame-text rounded-xl shadow-brutal w-full max-w-sm mx-4 p-6">
        <h2 className="font-heading font-bold text-xl text-sesame-text mb-2">Supprimer ce dossier ?</h2>
        <p className="font-body text-sm text-sesame-text-muted mb-6">
          Cette action est irréversible. Les emails associés seront conservés.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 font-body font-medium text-sm text-sesame-text bg-transparent border-none cursor-pointer rounded hover:bg-sesame-surface-muted transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 font-body font-medium text-sm text-sesame-surface bg-sesame-danger border-2 border-sesame-text rounded shadow-brutal-sm cursor-pointer"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ActionsMenu ─────────────────────────────────────────────────────────────

type ActionsMenuProps = {
  onDelete: () => void;
  onMarkReturned: () => void;
  onMarkCancelled: () => void;
};

export function ActionsMenu({ onDelete, onMarkReturned, onMarkCancelled }: ActionsMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-brutal w-10 h-10 flex items-center justify-center rounded border-2 border-sesame-text bg-sesame-surface cursor-pointer"
        aria-label="Actions"
      >
        <Icon icon={MoreHorizontalCircle01Icon} size={20} color="#2A241F" aria-hidden />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-30 w-56 bg-sesame-surface border-2 border-sesame-text rounded-lg shadow-brutal overflow-hidden">
            <MenuAction icon={Edit02Icon} label="Modifier les informations" onClick={() => setOpen(false)} />
            <MenuAction
              icon={UndoIcon}
              label="Marquer comme retourné"
              onClick={() => { setOpen(false); onMarkReturned(); }}
            />
            <MenuAction
              icon={CancelCircleIcon}
              label="Marquer comme annulé"
              onClick={() => { setOpen(false); onMarkCancelled(); }}
            />
            <div className="h-px bg-sesame-surface-muted" />
            <MenuAction
              icon={Delete02Icon}
              label="Supprimer ce dossier"
              onClick={() => { setOpen(false); onDelete(); }}
              danger
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── MenuAction (internal) ───────────────────────────────────────────────────

function MenuAction({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: IconSvgElement;
  label: string;
  onClick: () => void;
  danger?: boolean;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 font-body text-sm cursor-pointer',
        'hover:bg-sesame-surface-muted transition-colors text-left',
        danger ? 'text-sesame-danger' : 'text-sesame-text',
      )}
    >
      <Icon icon={icon} size={16} color={danger ? '#FF0055' : '#2A241F'} aria-hidden />
      {label}
    </button>
  );
}
