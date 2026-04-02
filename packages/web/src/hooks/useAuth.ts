import { supabase } from "@/lib/supabase.ts";
import { useAuthStore } from "@/stores/authStore.ts";
import { useEffect } from "react";

export function useAuth(): void {
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    // Récupère la session initiale — setSession(null) sur erreur pour sortir du loading
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch(() => {
        setSession(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setSession]);
}
