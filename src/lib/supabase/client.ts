import { createClient } from "@supabase/supabase-js";

export function getSupabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
}

export function getSupabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  ).trim();
}

export function getSupabaseServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ""
  ).trim();
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return Boolean(
    url &&
      key &&
      url !== "https://SEU-PROJETO.supabase.co" &&
      !url.includes("SEU-PROJETO") &&
      key !== "SUA-CHAVE-ANON-PUBLICA"
  );
}

export function hasValidServiceRoleKey(): boolean {
  const serviceKey = getSupabaseServiceRoleKey();
  return Boolean(
    isSupabaseConfigured() &&
      serviceKey &&
      serviceKey !== "SUA-CHAVE-SERVICE-ROLE-SECRETA"
  );
}

export function createServiceRoleClient() {
  if (!hasValidServiceRoleKey()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  }
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
