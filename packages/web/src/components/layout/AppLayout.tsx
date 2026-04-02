import React from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Header } from './Header.tsx';
import { BottomNav } from './BottomNav.tsx';
import { BackfillBanner } from './BackfillBanner.tsx';

export function AppLayout(): React.JSX.Element {
  return (
    <div className="min-h-svh bg-sesame-bg flex flex-col">
      <Header />
      <BackfillBanner />
      <main className="flex-1 pb-20 lg:pb-0">
        <Outlet />
      </main>
      <BottomNav />
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#FCFAF5',
            border: '2px solid #2A241F',
            boxShadow: '2px 2px 0px #2A241F',
            borderRadius: '8px',
            color: '#2A241F',
            fontFamily: 'Plus Jakarta Sans, Outfit, sans-serif',
            fontSize: '14px',
          },
        }}
      />
    </div>
  );
}
