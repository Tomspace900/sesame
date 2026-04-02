import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Home04Icon from '@hugeicons/core-free-icons/Home04Icon';
import DeliveryBox01Icon from '@hugeicons/core-free-icons/DeliveryBox01Icon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import { Icon, type IconSvgElement } from '@/components/ui/Icon.tsx';
import { cn } from '@/lib/utils.ts';

type NavItem = {
  label: string;
  path: string;
  icon: IconSvgElement;
  ariaLabel: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Accueil', path: '/', icon: Home04Icon, ariaLabel: 'Accueil' },
  { label: 'Dossiers', path: '/dossiers', icon: DeliveryBox01Icon, ariaLabel: 'Mes dossiers' },
  { label: 'Recherche', path: '/recherche', icon: Search01Icon, ariaLabel: 'Rechercher' },
  { label: 'Réglages', path: '/reglages', icon: Settings02Icon, ariaLabel: 'Réglages' },
];

export function BottomNav(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-sesame-surface border-t border-sesame-text lg:hidden"
      aria-label="Navigation principale"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded',
                'transition-colors min-w-[48px]',
                'bg-transparent border-none cursor-pointer',
                'focus-visible:outline-2 focus-visible:outline-sesame-accent focus-visible:outline-offset-2',
              )}
              aria-label={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                icon={item.icon}
                size={22}
                color={isActive ? 'var(--color-sesame-accent)' : 'var(--color-sesame-text-muted)'}
                strokeWidth={2}
                aria-hidden={true}
              />
              <span
                className={cn(
                  'text-[10px] font-body font-medium',
                  isActive ? 'text-sesame-accent' : 'text-sesame-text-muted',
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
