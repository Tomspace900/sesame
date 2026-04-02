import React from 'react';
import { useNavigate } from 'react-router-dom';
import Notification03Icon from '@hugeicons/core-free-icons/Notification03Icon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import { Icon } from '@/components/ui/Icon.tsx';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu.tsx';
import { useAuthStore } from '@/stores/authStore.ts';
import { supabase } from '@/lib/supabase.ts';

function getInitials(email: string | undefined): string {
  if (!email) return '?';
  return email.charAt(0).toUpperCase();
}

export function Header(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const handleSignOut = async (): Promise<void> => {
    await supabase.auth.signOut();
    navigate('/auth/connexion');
  };

  return (
    <header className="sticky top-0 z-40 bg-sesame-surface border-b-2 border-sesame-text">
      <div className="flex items-center justify-between px-4 h-14">
        <button
          onClick={() => navigate('/')}
          className="font-heading font-bold text-xl text-sesame-text tracking-tight cursor-pointer bg-transparent border-none p-0"
          aria-label="Sésame — Accueil"
        >
          Sésame
        </button>

        <div className="flex items-center gap-2">
          <button
            className="relative flex items-center justify-center w-9 h-9 rounded hover:bg-sesame-surface-muted transition-colors bg-transparent border-none cursor-pointer"
            aria-label="Notifications"
          >
            <Icon
              icon={Notification03Icon}
              size={20}
              color="#2A241F"
              strokeWidth={2}
              aria-hidden={true}
            />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-pill cursor-pointer bg-transparent border-none p-0 focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2"
                aria-label="Mon compte"
              >
                <Avatar>
                  <AvatarFallback>{getInitials(user?.email)}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-3 py-2 text-xs text-sesame-text-muted font-body">
                {user?.email ?? ''}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigate('/reglages')}>
                  <Icon
                    icon={Settings02Icon}
                    size={16}
                    color="currentColor"
                    strokeWidth={2}
                    aria-hidden={true}
                  />
                  Réglages
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void handleSignOut()}
                destructive
              >
                Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
