import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout.tsx';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute.tsx';
import { LoginPage } from '@/pages/LoginPage.tsx';
import { DashboardPage } from '@/pages/DashboardPage.tsx';
import { DossiersPage } from '@/pages/DossiersPage.tsx';
import { RecherchePage } from '@/pages/RecherchePage.tsx';
import { ReglagesPage } from '@/pages/ReglagesPage.tsx';
import { ReglagesConnecterGmailPage } from '@/pages/ReglagesConnecterGmailPage.tsx';
import { DossierDetailPage } from '@/pages/DossierDetailPage.tsx';
import { OnboardingPage } from '@/pages/OnboardingPage.tsx';
import { useAuth } from '@/hooks/useAuth.ts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

function AuthWatcher(): null {
  useAuth();
  return null;
}

export default function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthWatcher />
        <Routes>
          {/* Auth public */}
          <Route path="/auth/connexion" element={<LoginPage />} />

          {/* Routes protégées */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="dossiers" element={<DossiersPage />} />
            <Route path="dossiers/:id" element={<DossierDetailPage />} />
            <Route path="recherche" element={<RecherchePage />} />
            <Route path="reglages" element={<ReglagesPage />} />
            <Route path="reglages/connecter/gmail" element={<ReglagesConnecterGmailPage />} />
          </Route>

          {/* Onboarding */}
          <Route
            path="/bienvenue"
            element={
              <ProtectedRoute>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
