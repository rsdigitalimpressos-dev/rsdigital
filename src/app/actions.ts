"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  alternarItemImpressoServer,
  alternarPagoPedidoServer,
  atualizarStatusPedidoServer,
  consultarPedidoPublicoServer,
  createServerSupabase,
  criarPedidoServer,
  duplicarSerieServer,
  excluirLancamentoFinanceiroServer,
  excluirLivroServer,
  getAdminData,
  marcarLoteImpressoServer,
  salvarColegioServer,
  salvarConfigServer,
  salvarCupomServer,
  salvarLancamentoFinanceiroServer,
  salvarLivroServer,
  salvarModuloServer,
  salvarSerieServer,
  validarCupomServer,
} from "@/lib/repository";
import {
  FormaPagamento,
  LancamentoCategoria,
  LancamentoTipo,
  LojaConfig,
  ModuloLivroItem,
  PedidoStatus,
} from "@/types/database";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const DEMO_SESSION_COOKIE = "rs_digital_admin_session";

function gerarTokenDemoAssinado(): string {
  const email = (process.env.ADMIN_DEMO_EMAIL || "admin@rsdigital.com.br").toLowerCase();
  const secret = process.env.ADMIN_DEMO_PASSWORD || "rsdigital123";
  return crypto
    .createHmac("sha256", `rs-digital-secret:${secret}`)
    .update(`demo-auth:${email}`)
    .digest("hex");
}

function validarTokenDemo(cookieVal: string | undefined): boolean {
  if (!cookieVal) return false;
  // Mantém compatibilidade com sessão local já aberta ou token assinado
  const esperado = gerarTokenDemoAssinado();
  if (cookieVal.length === esperado.length) {
    return crypto.timingSafeEqual(
      Buffer.from(cookieVal, "utf-8"),
      Buffer.from(esperado, "utf-8")
    );
  }
  return cookieVal === "authenticated" && !isSupabaseConfigured();
}

export async function validarCupomAction(codigo: string) {
  return validarCupomServer(codigo);
}

export async function consultarPedidoPublicoAction(
  numero: string,
  whatsapp: string
) {
  return consultarPedidoPublicoServer(numero, whatsapp);
}

export async function enviarPedidoAction(input: {
  responsavel_nome: string;
  aluno_nome?: string;
  whatsapp: string;
  colegio_id: string;
  serie_id: string;
  modulo_ids: string[];
  disciplinas_por_modulo?: Record<string, string[]>;
  livros_por_modulo?: Record<string, string[]>;
  forma_pagamento: FormaPagamento;
  parcelas: number | null;
  cupom_codigo?: string | null;
  observacao?: string | null;
}) {
  const res = await criarPedidoServer(input);
  if (res.ok) {
    revalidatePath("/admin");
  }
  return res;
}

export async function loginAdminAction(email: string, password: string) {
  const cleanEmail = email.trim();
  if (!cleanEmail || !password) {
    return { ok: false, erro: "Preencha o e-mail e a senha." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (!error) {
        revalidatePath("/admin");
        return { ok: true };
      }
      return {
        ok: false,
        erro: "E-mail ou senha inválidos.",
      };
    } catch {
      return {
        ok: false,
        erro: "Não foi possível autenticar no servidor. Tente novamente.",
      };
    }
  }

  // Modo demonstração local (apenas quando Supabase não está configurado)
  const demoPasswordEnv = process.env.ADMIN_DEMO_PASSWORD;
  if (process.env.NODE_ENV === "production" && !demoPasswordEnv) {
    return {
      ok: false,
      erro: "Configure as variáveis do Supabase na hospedagem para habilitar o acesso administrativo.",
    };
  }

  const expectedEmail =
    process.env.ADMIN_DEMO_EMAIL || "admin@rsdigital.com.br";
  const expectedPassword = demoPasswordEnv || "rsdigital123";

  if (
    cleanEmail.toLowerCase() === expectedEmail.toLowerCase() &&
    password === expectedPassword
  ) {
    const cookieStore = await cookies();
    cookieStore.set(DEMO_SESSION_COOKIE, gerarTokenDemoAssinado(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    revalidatePath("/admin");
    return { ok: true };
  }

  return {
    ok: false,
    erro: "E-mail ou senha incorretos.",
  };
}

export async function logoutAdminAction() {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabase();
      await supabase.auth.signOut();
    } catch {
      // ignora
    }
  }
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_SESSION_COOKIE);
  revalidatePath("/admin");
  return { ok: true };
}

export async function verificarAdminAutenticado(): Promise<{
  autenticado: boolean;
  email: string | null;
  modoDemo: boolean;
}> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        return {
          autenticado: true,
          email: user.email || "Administrador",
          modoDemo: false,
        };
      }
    } catch {
      // Sem sessão válida no Supabase Auth
    }

    return {
      autenticado: false,
      email: null,
      modoDemo: false,
    };
  }

  const demoPermitido =
    process.env.NODE_ENV !== "production" ||
    Boolean(process.env.ADMIN_DEMO_PASSWORD);
  const cookieStore = await cookies();
  const demoSession = cookieStore.get(DEMO_SESSION_COOKIE)?.value;
  if (demoPermitido && validarTokenDemo(demoSession)) {
    return {
      autenticado: true,
      email: process.env.ADMIN_DEMO_EMAIL || "admin@rsdigital.com.br",
      modoDemo: true,
    };
  }

  return {
    autenticado: false,
    email: null,
    modoDemo: process.env.NODE_ENV !== "production",
  };
}

async function garantirAdminAutenticado(): Promise<{
  permitido: boolean;
  erro?: string;
}> {
  const sessao = await verificarAdminAutenticado();
  if (!sessao.autenticado) {
    return {
      permitido: false,
      erro: "Acesso não autorizado ou sessão expirada. Faça login novamente.",
    };
  }
  return { permitido: true };
}

export async function atualizarStatusPedidoAction(
  pedidoId: string,
  status: PedidoStatus
) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await atualizarStatusPedidoServer(pedidoId, status);
  if (res.ok) revalidatePath("/admin");
  return res;
}

export async function alternarPagoPedidoAction(
  pedidoId: string,
  pago: boolean
) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await alternarPagoPedidoServer(pedidoId, pago);
  if (res.ok) revalidatePath("/admin");
  return res;
}

export async function alternarItemImpressoAction(
  pedidoId: string,
  itemId: string,
  impresso: boolean
) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await alternarItemImpressoServer(pedidoId, itemId, impresso);
  if (res.ok) revalidatePath("/admin");
  return res;
}

export async function marcarLoteImpressoAction(itemIds: string[]) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await marcarLoteImpressoServer(itemIds);
  if (res.ok) revalidatePath("/admin");
  return res;
}

export async function salvarColegioAction(dados: {
  id?: string;
  nome: string;
  ativo: boolean;
}) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await salvarColegioServer(dados);
  if (res.ok) {
    revalidatePath("/admin");
    revalidatePath("/pedido");
  }
  return res;
}

export async function salvarSerieAction(dados: {
  id?: string;
  colegio_id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await salvarSerieServer(dados);
  if (res.ok) {
    revalidatePath("/admin");
    revalidatePath("/pedido");
  }
  return res;
}

export async function duplicarSerieAction(params: {
  serieOrigemId: string;
  colegioDestinoId: string;
  novoNomeSerie: string;
}) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await duplicarSerieServer(params);
  if (res.ok) {
    revalidatePath("/admin");
    revalidatePath("/pedido");
  }
  return res;
}

export async function salvarModuloAction(dados: {
  id?: string;
  serie_id: string;
  nome: string;
  ordem: number;
  valor: number;
  link_arquivo: string;
  ativo: boolean;
  disciplinas?: string[];
  livros?: ModuloLivroItem[];
  capa_url?: string | null;
}) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await salvarModuloServer(dados);
  if (res.ok) {
    revalidatePath("/admin");
    revalidatePath("/pedido");
  }
  return res;
}

export async function salvarLivroAction(dados: {
  id?: string;
  nome: string;
  categoria: "didatico" | "paradidatico";
  valor: number;
  ativo: boolean;
  serie_nome?: string | null;
  capa_url?: string | null;
  capas_por_serie?: Record<string, string>;
}) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await salvarLivroServer(dados);
  if (res.ok) {
    revalidatePath("/admin");
    revalidatePath("/pedido");
  }
  return res;
}

export async function excluirLivroAction(id: string) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await excluirLivroServer(id);
  if (res.ok) {
    revalidatePath("/admin");
    revalidatePath("/pedido");
  }
  return res;
}

export async function salvarCupomAction(dados: {
  id?: string;
  codigo: string;
  tipo: "percentual" | "valor";
  desconto: number;
  validade: string | null;
  limite_usos: number | null;
  ativo: boolean;
}) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await salvarCupomServer(dados);
  if (res.ok) revalidatePath("/admin");
  return res;
}

export async function salvarConfigAction(config: Omit<LojaConfig, "id">) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await salvarConfigServer(config);
  if (res.ok) {
    revalidatePath("/admin");
    revalidatePath("/pedido");
  }
  return res;
}

export async function salvarLancamentoFinanceiroAction(dados: {
  id?: string;
  data: string;
  tipo: LancamentoTipo;
  categoria: LancamentoCategoria;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  observacao?: string | null;
}) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await salvarLancamentoFinanceiroServer(dados);
  if (res.ok) revalidatePath("/admin");
  return res;
}

export async function excluirLancamentoFinanceiroAction(id: string) {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false, erro: auth.erro };

  const res = await excluirLancamentoFinanceiroServer(id);
  if (res.ok) revalidatePath("/admin");
  return res;
}

export async function obterDadosAdminAction() {
  const auth = await garantirAdminAutenticado();
  if (!auth.permitido) return { ok: false as const, erro: auth.erro };

  const dados = await getAdminData();
  return { ok: true as const, dados };
}
