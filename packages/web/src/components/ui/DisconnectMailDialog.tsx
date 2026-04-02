import { Button } from "@/components/ui/Button.tsx";
import { Icon } from "@/components/ui/Icon.tsx";
import { cn } from "@/lib/utils.ts";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import * as Dialog from "@radix-ui/react-dialog";
import React from "react";

type DisconnectMailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailAddress: string;
  onConfirm: () => void;
  isPending: boolean;
};

export function DisconnectMailDialog({
  open,
  onOpenChange,
  emailAddress,
  onConfirm,
  isPending,
}: DisconnectMailDialogProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-sesame-text/40" />
        <Dialog.Content
          className={cn(
            "fixed z-50 bg-sesame-surface border-2 border-sesame-text rounded-xl shadow-brutal",
            "bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2",
            "sm:-translate-x-1/2 sm:-translate-y-1/2",
            "w-full sm:max-w-sm p-6 space-y-4"
          )}
        >
          <div className="space-y-1">
            <Dialog.Title className="font-heading font-bold text-xl text-sesame-text">
              Déconnecter ce compte ?
            </Dialog.Title>
            <Dialog.Description className="font-body text-sm text-sesame-text-muted">
              <span className="font-medium text-sesame-text">{emailAddress}</span> sera déconnecté.
              Tes dossiers existants sont conservés.
            </Dialog.Description>
          </div>

          <div className="flex gap-3">
            <Dialog.Close asChild>
              <Button variant="secondary" size="md" className="flex-1" disabled={isPending}>
                Annuler
              </Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              size="md"
              className="flex-1"
              onClick={onConfirm}
              disabled={isPending}
            >
              {isPending ? (
                <Icon
                  icon={Loading03Icon}
                  size={16}
                  color="currentColor"
                  className="animate-spin"
                  aria-hidden
                />
              ) : null}
              Déconnecter
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
