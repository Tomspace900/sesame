import { createClient } from "npm:@supabase/supabase-js@2";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonSuccess } from "../_shared/response.ts";
import { createLogger } from "../_shared/logger.ts";
const logger = createLogger("manual-link");

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req);
  if (cors) return cors;

  logger.info(`Received ${req.method} request`);

  if (req.method !== "POST") {
    return jsonError("Method not allowed", "METHOD_NOT_ALLOWED", 405);
  }

  // Auth : verify_jwt = true (configuré dans config.toml)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Unauthorized", "UNAUTHORIZED", 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // Récupère l'utilisateur authentifié
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonError("Unauthorized", "UNAUTHORIZED", 401);
  }

  // Parse le body
  let body: { event_id?: string; dossier_id?: string };
  try {
    body = await req.json() as { event_id?: string; dossier_id?: string };
  } catch {
    return jsonError("Invalid JSON body", "INVALID_BODY", 400);
  }

  const { event_id, dossier_id } = body;
  logger.info(`Linking event ${event_id} to dossier ${dossier_id}`);
  if (!event_id || !dossier_id) {
    return jsonError(
      "event_id and dossier_id are required",
      "MISSING_FIELDS",
      400,
    );
  }

  // Vérifie que l'event appartient à l'utilisateur
  const { data: event, error: eventError } = await supabase
    .from("dossier_events")
    .select("id, user_id")
    .eq("id", event_id)
    .eq("user_id", user.id)
    .single();

  if (eventError || !event) {
    return jsonError("Event not found", "EVENT_NOT_FOUND", 404);
  }

  // Vérifie que le dossier appartient à l'utilisateur
  const { data: dossier, error: dossierError } = await supabase
    .from("dossiers")
    .select("id, user_id, status")
    .eq("id", dossier_id)
    .eq("user_id", user.id)
    .single();

  if (dossierError || !dossier) {
    return jsonError("Dossier not found", "DOSSIER_NOT_FOUND", 404);
  }

  // Lie l'event au dossier
  const { error: updateEventError } = await supabase
    .from("dossier_events")
    .update({ dossier_id, linked_by: "manual" })
    .eq("id", event_id)
    .eq("user_id", user.id);

  if (updateEventError) {
    logger.error(`Failed to link event:`, updateEventError);
    return jsonError("Failed to link event", "UPDATE_ERROR", 500);
  }

  logger.success(`Event linked successfully. Recalculating status...`);

  // Récupère le dernier event du dossier pour recalculer le statut
  const { data: latestEvents } = await supabase
    .from("dossier_events")
    .select("event_type, created_at")
    .eq("dossier_id", dossier_id)
    .order("created_at", { ascending: false })
    .limit(1);

  // Recalcule le statut à partir du dernier event_type
  const newStatus = inferStatus(latestEvents?.[0]?.event_type ?? null);
  if (newStatus) {
    await supabase
      .from("dossiers")
      .update({ status: newStatus })
      .eq("id", dossier_id)
      .eq("user_id", user.id);
  }

  // Retourne le dossier mis à jour
  const { data: updatedDossier } = await supabase
    .from("dossiers")
    .select("*, merchants(canonical_name)")
    .eq("id", dossier_id)
    .eq("user_id", user.id)
    .single();

  return jsonSuccess({ dossier: updatedDossier });
});

function inferStatus(eventType: string | null): string | null {
  if (!eventType) return null;

  const statusMap: Record<string, string> = {
    order_confirmation: "confirmed",
    payment_confirmation: "confirmed",
    booking_confirmation: "confirmed",
    subscription_confirmation: "confirmed",
    accommodation_confirmation: "confirmed",
    shipping_notification: "in_progress",
    check_in_open: "in_progress",
    booking_update: "in_progress",
    delivery_notification: "completed",
    return_confirmation: "returned",
    cancellation: "cancelled",
    subscription_cancellation: "cancelled",
  };

  return statusMap[eventType] ?? null;
}
