import { createClient } from "@supabase/supabase-js";

function cleanEnvValue(val: string | undefined): string {
  return (val || "").trim().replace(/^["']+|["']+$/g, "").trim();
}

export function getSupabaseUrl(): string {
  let raw = cleanEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  );
  if (!raw) return "";

  if (!/^https?:\/\//i.test(raw) && raw.includes(".supabase.co")) {
    raw = `https://${raw}`;
  }

  // Caso o usuário tenha colado a URL do painel do Supabase (ex: https://supabase.com/dashboard/project/xyz...)
  const dashboardMatch = raw.match(
    /supabase\.com\/dashboard\/project\/([a-z0-9]+)/i
  );
  if (dashboardMatch?.[1]) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  // Remove qualquer caminho extra como /rest/v1, /auth/v1 ou barras finais, mantendo apenas a origin (https://xyz.supabase.co)
  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return raw.replace(/\/rest\/v1\/?.*$/i, "").replace(/\/+$/, "");
  }
}

export function getSupabaseAnonKey(): string {
  return cleanEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function getSupabaseServiceRoleKey(): string {
  return cleanEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  );
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
