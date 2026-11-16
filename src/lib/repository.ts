import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  createServiceRoleClient,
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasValidServiceRoleKey,
  isSupabaseConfigured,
} from "./supabase/client";
import { readLocalDb, writeLocalDb } from "./local-store";
import {
  createDefaultLivros,
  createInitialSeedState,
  getCapaPadraoPorOrdem,
  getDisciplinasPadraoPorSerie,
  getLivrosPadraoPorModulo,
  resolverCapaLivroParaSerie,
} from "./seed-data";
import {
  Colegio,
  Cupom,
  FormaPagamento,
  LancamentoCategoria,
  LancamentoFinanceiro,
  LancamentoTipo,
  Livro,
  LojaConfig,
  Modulo,
  ModuloLivroItem,
  ModuloPublico,
  Pedido,
  PedidoItem,
  PedidoStatus,
  Serie,
} from "@/types/database";
import {
  addDaysLocalISO,
  calcularTotaisPedido,
  onlyDigits,
  toLocalDateISO,
} from "./format";

const DEFAULT_LOJA_CONFIG: LojaConfig = createInitialSeedState().config;

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as never)
            );
          } catch {
            // Server Component read-only cookie context
          }
        },
      },
    }
  );
}

/**
 * Cliente Supabase para operações administrativas autenticadas:
 * Usa service_role quando configurada; caso contrário, usa a sessão autenticada (RLS TO authenticated).
 */
async function createAdminSupabase() {
  if (hasValidServiceRoleKey()) {
    return createServiceRoleClient();
  }
  return createServerSupabase();
}

/**
 * 1. DADOS PÚBLICOS PARA O FORMULÁRIO DE PEDIDO (/pedido)
 * Garante que link_arquivo NUNCA seja enviado ao navegador público.
 */
export async function getCatalogoPublico(): Promise<{
  colegios: Colegio[];
  series: Serie[];
  modulos: ModuloPublico[];
  config: LojaConfig;
}> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabase();
      const [colRes, serRes, modRes, livRes, cfgRes] = await Promise.all([
        supabase
          .from("colegios")
          .select("id, nome, ativo, criado_em")
          .eq("ativo", true)
          .order("nome", { ascending: true }),
        supabase
          .from("series")
          .select("id, colegio_id, nome, ordem, ativo")
          .eq("ativo", true)
          .order("ordem", { ascending: true }),
        supabase
          .from("modulos_publicos")
          .select("id, serie_id, nome, ordem, valor, ativo, disciplinas, livros, capa_url")
          .eq("ativo", true)
          .order("ordem", { ascending: true }),
        supabase
          .from("livros")
          .select("id, nome, categoria, valor, ativo, serie_nome, capa_url, capas_por_serie")
          .eq("ativo", true),
        supabase.from("config").select("*").eq("id", 1).maybeSingle(),
      ]);

      if (!colRes.error && !serRes.error && !modRes.error && !cfgRes.error) {
        const serieNomeMap = new Map(
          (serRes.data || []).map((s) => [s.id, s.nome])
        );
        const livrosCat = ((livRes.data || []) as Livro[]).map((l) => ({
          ...l,
          valor: Number(l.valor),
        }));

        return {
          colegios: colRes.data || [],
          series: serRes.data || [],
          modulos: (modRes.data || []).map((m) => {
            const mRec = m as Record<string, unknown>;
            const sNome = serieNomeMap.get(m.serie_id);
            const livrosRaw =
              Array.isArray(mRec.livros) && mRec.livros.length > 0
                ? (mRec.livros as ModuloLivroItem[])
                : getLivrosPadraoPorModulo(m.nome, sNome, livrosCat);

            const livrosGarantidos = livrosRaw.map((item) => {
              const catLivro = livrosCat.find(
                (l) =>
                  l.id === item.id ||
                  l.nome.toLowerCase() === item.nome.toLowerCase()
              );
              return {
                ...item,
                valor: Number(item.valor),
                serie_nome:
                  item.serie_nome || sNome || catLivro?.serie_nome || null,
                capa_url:
                  item.capa_url || resolverCapaLivroParaSerie(catLivro, sNome),
              };
            });

            const discs =
              Array.isArray(mRec.disciplinas) && mRec.disciplinas.length > 0
                ? (mRec.disciplinas as string[])
                : livrosGarantidos.map((l) => l.nome);
            const capa =
              typeof mRec.capa_url === "string" && mRec.capa_url.trim() !== ""
                ? mRec.capa_url
                : getCapaPadraoPorOrdem(Number(m.ordem) || 1);

            return {
              ...m,
              valor: Number(m.valor),
              disciplinas:
                discs.length > 0
                  ? discs
                  : getDisciplinasPadraoPorSerie(sNome),
              livros: livrosGarantidos,
              capa_url: capa,
            };
          }),
          config: (cfgRes.data as LojaConfig | null) || DEFAULT_LOJA_CONFIG,
        };
      }

      console.error("Erro ao consultar catálogo público no Supabase:", {
        colegios: colRes.error?.message,
        series: serRes.error?.message,
        modulos: modRes.error?.message,
        config: cfgRes.error?.message,
      });
    } catch (err) {
      console.error("Falha ao carregar catálogo público no Supabase:", err);
    }

    return {
      colegios: [],
      series: [],
      modulos: [],
      config: DEFAULT_LOJA_CONFIG,
    };
  }

  const db = readLocalDb();
  const serieNomeMapLocal = new Map(db.series.map((s) => [s.id, s.nome]));
  return {
    colegios: db.colegios
      .filter((c) => c.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    series: db.series
      .filter((s) => s.ativo)
      .sort((a, b) => a.ordem - b.ordem),
    // Remove explicitamente link_arquivo para segurança
    modulos: db.modulos
      .filter((m) => m.ativo)
      .sort((a, b) => a.ordem - b.ordem)
      .map(
        ({
          id,
          serie_id,
          nome,
          ordem,
          valor,
          ativo,
          disciplinas,
          livros,
          capa_url,
        }) => {
          const sNome = serieNomeMapLocal.get(serie_id);
          const livrosRaw =
            Array.isArray(livros) && livros.length > 0
              ? livros
              : getLivrosPadraoPorModulo(nome, sNome, db.livros);
          const livrosGarantidos = livrosRaw.map((item) => {
            const catLivro = db.livros?.find(
              (l) =>
                l.id === item.id ||
                l.nome.toLowerCase() === item.nome.toLowerCase()
            );
            return {
              ...item,
              serie_nome: item.serie_nome || sNome || catLivro?.serie_nome || null,
              capa_url:
                item.capa_url || resolverCapaLivroParaSerie(catLivro, sNome),
            };
          });
          return {
            id,
            serie_id,
            nome,
            ordem,
            valor: Number(valor),
            ativo,
            disciplinas:
              Array.isArray(disciplinas) && disciplinas.length > 0
                ? disciplinas
                : livrosGarantidos.map((l) => l.nome),
            livros: livrosGarantidos,
            capa_url: capa_url || getCapaPadraoPorOrdem(ordem || 1),
          };
        }
      ),
    config: db.config,
  };
}

/**
 * 2. VALIDAR CUPOM NO SERVIDOR
 */
export async function validarCupomServer(codigoInput: string): Promise<{
  valido: boolean;
  erro?: string;
  cupom?: {
    id: string;
    codigo: string;
    tipo: "percentual" | "valor";
    desconto: number;
  };
}> {
  const codigo = codigoInput.trim().toUpperCase();
  if (!codigo) {
    return { valido: false, erro: "Informe o código do cupom." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabase();
      const { data, error } = await supabase.rpc("validar_cupom", {
        p_codigo: codigo,
      });
      if (!error && data) {
        if (!data.valido) {
          return { valido: false, erro: data.erro || "Cupom inválido." };
        }
        return {
          valido: true,
          cupom: {
            id: data.id,
            codigo: data.codigo,
            tipo: data.tipo,
            desconto: Number(data.desconto),
          },
        };
      }
      if (error) {
        console.error("Erro ao validar cupom no Supabase:", error.message);
      }
    } catch (err) {
      console.error("Falha ao validar cupom no Supabase:", err);
    }
    return {
      valido: false,
      erro: "Não foi possível validar o cupom no momento. Tente novamente.",
    };
  }

  const db = readLocalDb();
  const cupom = db.cupons.find(
    (c) => c.codigo.toUpperCase() === codigo && c.ativo
  );

  if (!cupom) {
    return { valido: false, erro: "Cupom inválido ou expirado." };
  }

  const hoje = toLocalDateISO();
  if (cupom.validade && cupom.validade < hoje) {
    return { valido: false, erro: "Cupom inválido ou expirado." };
  }

  if (cupom.limite_usos !== null && cupom.usos >= cupom.limite_usos) {
    return {
      valido: false,
      erro: "Este cupom já atingiu o limite máximo de usos.",
    };
  }

  return {
    valido: true,
    cupom: {
      id: cupom.id,
      codigo: cupom.codigo,
      tipo: cupom.tipo,
      desconto: Number(cupom.desconto),
    },
  };
}

/**
 * 3. CRIAR PEDIDO RECALCULANDO TUDO NO SERVIDOR
 */
export async function criarPedidoServer(input: {
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
}): Promise<{
  ok: boolean;
  erro?: string;
  pedido?: Pedido;
  config?: LojaConfig;
}> {
  const responsavel = input.responsavel_nome.trim();
  const aluno = (input.aluno_nome || "").trim() || responsavel;
  const whatsappLimpo = onlyDigits(input.whatsapp);
  const moduloIdsUnicos = Array.from(new Set(input.modulo_ids || []));

  if (!responsavel) return { ok: false, erro: "Informe o nome do responsável." };
  if (whatsappLimpo.length < 10 || whatsappLimpo.length > 11) {
    return { ok: false, erro: "Informe um WhatsApp válido com DDD." };
  }
  if (!input.colegio_id || !input.serie_id) {
    return { ok: false, erro: "Selecione o colégio e a série." };
  }
  if (moduloIdsUnicos.length === 0) {
    return { ok: false, erro: "Selecione pelo menos 1 módulo." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabase();
      const livrosPorModulo =
        input.livros_por_modulo || input.disciplinas_por_modulo || null;

      const paramsBase = {
        p_responsavel_nome: responsavel,
        p_aluno_nome: aluno,
        p_whatsapp: whatsappLimpo,
        p_colegio_id: input.colegio_id,
        p_serie_id: input.serie_id,
        p_modulo_ids: moduloIdsUnicos,
        p_forma_pagamento: input.forma_pagamento,
        p_parcelas:
          input.forma_pagamento === "credito_parcelado" ? input.parcelas : null,
        p_cupom_codigo: input.cupom_codigo || null,
        p_observacao: input.observacao || null,
      };

      let { data, error } = await supabase.rpc("criar_pedido_seguro", {
        ...paramsBase,
        p_livros_por_modulo: livrosPorModulo,
      });

      // Compatibilidade caso o banco ainda possua a assinatura anterior (10 parâmetros)
      if (
        error &&
        (error.code === "PGRST202" ||
          /p_livros_por_modulo/i.test(error.message || ""))
      ) {
        const retryRes = await supabase.rpc("criar_pedido_seguro", paramsBase);
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error || !data) {
        return {
          ok: false,
          erro: error?.message || "Erro ao registrar pedido no servidor.",
        };
      }

      const { data: cfgData } = await supabase
        .from("config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      let colegioNome: string = data.colegio_nome || "";
      let serieNome: string = data.serie_nome || "";
      if (!colegioNome || !serieNome) {
        const [colRes, serRes] = await Promise.all([
          supabase
            .from("colegios")
            .select("nome")
            .eq("id", input.colegio_id)
            .maybeSingle(),
          supabase
            .from("series")
            .select("nome")
            .eq("id", input.serie_id)
            .maybeSingle(),
        ]);
        colegioNome = colegioNome || colRes.data?.nome || "";
        serieNome = serieNome || serRes.data?.nome || "";
      }

      let itensCriados: PedidoItem[] = [];
      if (Array.isArray(data.itens)) {
        itensCriados = data.itens.map((i: Record<string, unknown>) => ({
          id: String(i.id),
          pedido_id: String(i.pedido_id),
          modulo_id: String(i.modulo_id),
          nome_modulo: String(i.nome_modulo),
          valor: Number(i.valor),
          impresso: Boolean(i.impresso),
        }));
      } else {
        const { data: modData } = await supabase
          .from("modulos_publicos")
          .select("id, nome, valor, ordem")
          .in("id", moduloIdsUnicos)
          .order("ordem", { ascending: true });
        itensCriados = (modData || []).map((m, idx) => ({
          id: `item-${data.id}-${idx + 1}`,
          pedido_id: String(data.id),
          modulo_id: String(m.id),
          nome_modulo: String(m.nome),
          valor: Number(m.valor),
          impresso: false,
        }));
      }

      const pedidoCriado: Pedido = {
        id: data.id,
        numero: data.numero,
        criado_em: data.criado_em,
        responsavel_nome: responsavel,
        aluno_nome: aluno,
        whatsapp: whatsappLimpo,
        colegio_id: input.colegio_id,
        serie_id: input.serie_id,
        colegio_nome: colegioNome,
        serie_nome: serieNome,
        forma_pagamento: input.forma_pagamento,
        parcelas:
          input.forma_pagamento === "credito_parcelado" ? input.parcelas : null,
        subtotal: Number(data.subtotal),
        desconto: Number(data.desconto),
        juros: Number(data.juros),
        total: Number(data.total),
        cupom_id: data.cupom_id || null,
        cupom_codigo:
          data.cupom_codigo || input.cupom_codigo?.trim().toUpperCase() || null,
        observacao: input.observacao?.trim() || null,
        status: "recebido",
        pago: false,
        previsao_retirada: data.previsao_retirada,
        pronto_em: null,
        entregue_em: null,
        itens: itensCriados,
      };

      return {
        ok: true,
        pedido: pedidoCriado,
        config: (cfgData as LojaConfig | null) || DEFAULT_LOJA_CONFIG,
      };
    } catch (err) {
      console.error("Erro ao criar pedido no Supabase:", err);
      return {
        ok: false,
        erro: "Não foi possível registrar seu pedido no momento. Tente novamente em instantes.",
      };
    }
  }

  // Fallback local recalculando tudo no servidor
  const db = readLocalDb();
  const colegio = db.colegios.find(
    (c) => c.id === input.colegio_id && c.ativo
  );
  const serie = db.series.find(
    (s) =>
      s.id === input.serie_id &&
      s.colegio_id === input.colegio_id &&
      s.ativo
  );

  if (!colegio || !serie) {
    return { ok: false, erro: "Colégio ou série selecionada inválida." };
  }

  const modulosEscolhidos = db.modulos
    .filter(
      (m) =>
        m.serie_id === serie.id &&
        m.ativo &&
        moduloIdsUnicos.includes(m.id)
    )
    .sort((a, b) => a.ordem - b.ordem);

  if (modulosEscolhidos.length !== moduloIdsUnicos.length) {
    return {
      ok: false,
      erro: "Um ou mais módulos escolhidos não pertencem à série selecionada.",
    };
  }

  if (
    input.forma_pagamento === "credito_parcelado" &&
    (!input.parcelas || input.parcelas < 2 || input.parcelas > 12)
  ) {
    return {
      ok: false,
      erro: "Escolha um número de parcelas válido entre 2x e 12x.",
    };
  }

  let cupomEncontrado: Cupom | null = null;
  if (input.cupom_codigo && input.cupom_codigo.trim() !== "") {
    const validacao = await validarCupomServer(input.cupom_codigo);
    if (!validacao.valido || !validacao.cupom) {
      return { ok: false, erro: validacao.erro || "Cupom inválido." };
    }
    cupomEncontrado =
      db.cupons.find((c) => c.id === validacao.cupom!.id) || null;
  }

  // Calcula o valor efetivo e o nome formatado de cada módulo de acordo com os livros selecionados
  const modulosProcessados: {
    modulo: Modulo;
    nomeFormatado: string;
    valorEfetivo: number;
  }[] = [];

  for (const m of modulosEscolhidos) {
    const livrosDisponiveis =
      Array.isArray(m.livros) && m.livros.length > 0
        ? m.livros
        : getLivrosPadraoPorModulo(m.nome, serie.nome, db.livros);

    const escolhidosRaw =
      input.livros_por_modulo?.[m.id] || input.disciplinas_por_modulo?.[m.id];

    const livrosEscolhidos =
      Array.isArray(escolhidosRaw) && escolhidosRaw.length > 0
        ? livrosDisponiveis.filter(
            (l) => escolhidosRaw.includes(l.id) || escolhidosRaw.includes(l.nome)
          )
        : livrosDisponiveis;

    if (livrosEscolhidos.length === 0) {
      return {
        ok: false,
        erro: `Selecione pelo menos 1 livro para o módulo ${m.nome}.`,
      };
    }

    const livrosExcluidos = livrosDisponiveis.filter(
      (l) => !livrosEscolhidos.some((esc) => esc.id === l.id)
    );
    const todosSelecionados = livrosExcluidos.length === 0;

    const somaTodos = Number(
      livrosDisponiveis
        .reduce((acc, l) => acc + Number(l.valor), 0)
        .toFixed(2)
    );
    const valorBase = somaTodos > 0 ? somaTodos : Number(m.valor);
    const valorEfetivo = todosSelecionados
      ? valorBase
      : Number(
          livrosEscolhidos
            .reduce((acc, l) => acc + Number(l.valor), 0)
            .toFixed(2)
        );

    const nomeFormatado = todosSelecionados
      ? m.nome
      : `${m.nome} — Todos os livros, exceto ${livrosExcluidos.map((l) => l.nome).join(", ")}`;

    modulosProcessados.push({
      modulo: m,
      nomeFormatado,
      valorEfetivo,
    });
  }

  const calculo = calcularTotaisPedido({
    valoresModulos: modulosProcessados.map((mp) => mp.valorEfetivo),
    cupom: cupomEncontrado
      ? { tipo: cupomEncontrado.tipo, desconto: cupomEncontrado.desconto }
      : null,
    formaPagamento: input.forma_pagamento,
    parcelas: input.parcelas,
    taxasParcelamento: db.config.taxas_parcelamento,
  });

  if (cupomEncontrado) {
    cupomEncontrado.usos += 1;
  }

  db.ultimoNumeroSeq += 1;
  const numeroFormatado = String(db.ultimoNumeroSeq).padStart(4, "0");
  const pedidoId = `ped-${Date.now()}`;
  const previsaoRetiradaStr = addDaysLocalISO(db.config.prazo_dias || 7);

  const itensPedido: PedidoItem[] = modulosProcessados.map((mp, idx) => ({
    id: `item-${pedidoId}-${idx + 1}`,
    pedido_id: pedidoId,
    modulo_id: mp.modulo.id,
    nome_modulo: mp.nomeFormatado,
    valor: mp.valorEfetivo,
    impresso: false,
    link_arquivo: mp.modulo.link_arquivo,
  }));

  const novoPedido: Pedido = {
    id: pedidoId,
    numero: numeroFormatado,
    criado_em: new Date().toISOString(),
    responsavel_nome: responsavel,
    aluno_nome: aluno,
    whatsapp: whatsappLimpo,
    colegio_id: colegio.id,
    serie_id: serie.id,
    colegio_nome: colegio.nome,
    serie_nome: serie.nome,
    forma_pagamento: input.forma_pagamento,
    parcelas: calculo.numParcelas,
    subtotal: calculo.subtotal,
    desconto: calculo.desconto,
    juros: calculo.juros,
    total: calculo.total,
    cupom_id: cupomEncontrado ? cupomEncontrado.id : null,
    cupom_codigo: cupomEncontrado ? cupomEncontrado.codigo : null,
    observacao: input.observacao?.trim() || null,
    status: "recebido",
    pago: false,
    previsao_retirada: previsaoRetiradaStr,
    pronto_em: null,
    entregue_em: null,
    itens: itensPedido,
  };

  db.pedidos.push(novoPedido);
  writeLocalDb(db);

  return {
    ok: true,
    pedido: novoPedido,
    config: db.config,
  };
}

/**
 * 4. OPERAÇÕES DO PAINEL DO ADMINISTRADOR (/admin)
 */
export async function getAdminData(): Promise<{
  pedidos: Pedido[];
  colegios: Colegio[];
  series: Serie[];
  modulos: Modulo[];
  livros: Livro[];
  cupons: Cupom[];
  config: LojaConfig;
  lancamentos: LancamentoFinanceiro[];
  modoSupabase: boolean;
}> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const [
        pedRes,
        itensRes,
        colRes,
        serRes,
        modRes,
        cupRes,
        cfgRes,
        lancRes,
        livRes,
      ] = await Promise.all([
        supabase
          .from("pedidos")
          .select("*")
          .order("criado_em", { ascending: true }),
        supabase.from("pedido_itens").select("*"),
        supabase
          .from("colegios")
          .select("*")
          .order("nome", { ascending: true }),
        supabase
          .from("series")
          .select("*")
          .order("ordem", { ascending: true }),
        supabase
          .from("modulos")
          .select("*")
          .order("ordem", { ascending: true }),
        supabase
          .from("cupons")
          .select("*")
          .order("codigo", { ascending: true }),
        supabase.from("config").select("*").eq("id", 1).maybeSingle(),
        supabase
          .from("lancamentos_financeiros")
          .select("*")
          .order("data", { ascending: false }),
        supabase
          .from("livros")
          .select("*")
          .order("nome", { ascending: true }),
      ]);

      if (!pedRes.error && !cfgRes.error) {
        const colegios = (colRes.data || []) as Colegio[];
        const series = (serRes.data || []) as Serie[];
        const serMap = new Map(series.map((s) => [s.id, s.nome]));
        const livrosSupabase: Livro[] =
          !livRes.error && Array.isArray(livRes.data)
            ? (livRes.data as Livro[]).map((l) => ({
                ...l,
                valor: Number(l.valor),
              }))
            : [];
        const modulos = ((modRes.data || []) as Modulo[]).map((m) => {
          const sNome = serMap.get(m.serie_id);
          const livrosMod =
            Array.isArray(m.livros) && m.livros.length > 0
              ? m.livros
              : getLivrosPadraoPorModulo(m.nome, sNome, livrosSupabase);
          return {
            ...m,
            valor: Number(m.valor),
            livros: livrosMod,
            disciplinas:
              Array.isArray(m.disciplinas) && m.disciplinas.length > 0
                ? m.disciplinas
                : livrosMod.map((l) => l.nome),
          };
        });
        const cupons = ((cupRes.data || []) as Cupom[]).map((c) => ({
          ...c,
          desconto: Number(c.desconto),
        }));
        const itens = (itensRes.data || []) as PedidoItem[];
        const lancamentos = (
          (lancRes.data || []) as LancamentoFinanceiro[]
        ).map((l) => ({
          ...l,
          quantidade: Number(l.quantidade),
          valor_unitario: Number(l.valor_unitario),
          valor_total: Number(l.valor_total),
        }));

        const colMap = new Map(colegios.map((c) => [c.id, c.nome]));
        const modMap = new Map(modulos.map((m) => [m.id, m.link_arquivo]));
        const cupMap = new Map(cupons.map((c) => [c.id, c.codigo]));

        const pedidos: Pedido[] = (pedRes.data || []).map((p) => ({
          ...p,
          subtotal: Number(p.subtotal),
          desconto: Number(p.desconto),
          juros: Number(p.juros),
          total: Number(p.total),
          colegio_nome: colMap.get(p.colegio_id) || "—",
          serie_nome: serMap.get(p.serie_id) || "—",
          cupom_codigo: p.cupom_id ? cupMap.get(p.cupom_id) || null : null,
          itens: itens
            .filter((i) => i.pedido_id === p.id)
            .map((i) => ({
              ...i,
              valor: Number(i.valor),
              link_arquivo: modMap.get(i.modulo_id) || "",
            })),
        }));

        return {
          pedidos,
          colegios,
          series,
          modulos,
          livros: livrosSupabase,
          cupons,
          config: (cfgRes.data as LojaConfig | null) || DEFAULT_LOJA_CONFIG,
          lancamentos,
          modoSupabase: true,
        };
      }

      console.error("Erro ao consultar painel admin no Supabase:", {
        pedidos: pedRes.error?.message,
        config: cfgRes.error?.message,
      });
    } catch (err) {
      console.error("Falha ao carregar dados do admin no Supabase:", err);
    }

    return {
      pedidos: [],
      colegios: [],
      series: [],
      modulos: [],
      livros: [],
      cupons: [],
      config: DEFAULT_LOJA_CONFIG,
      lancamentos: [],
      modoSupabase: true,
    };
  }

  const db = readLocalDb();
  const colMap = new Map(db.colegios.map((c) => [c.id, c.nome]));
  const serMap = new Map(db.series.map((s) => [s.id, s.nome]));
  const modMap = new Map(db.modulos.map((m) => [m.id, m.link_arquivo]));
  const cupMap = new Map(db.cupons.map((c) => [c.id, c.codigo]));

  const pedidosEnriquecidos = [...db.pedidos]
    .sort(
      (a, b) =>
        new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()
    )
    .map((p) => ({
      ...p,
      colegio_nome: colMap.get(p.colegio_id) || p.colegio_nome || "—",
      serie_nome: serMap.get(p.serie_id) || p.serie_nome || "—",
      cupom_codigo:
        (p.cupom_id ? cupMap.get(p.cupom_id) : null) || p.cupom_codigo || null,
      itens: p.itens.map((item) => ({
        ...item,
        link_arquivo:
          modMap.get(item.modulo_id) || item.link_arquivo || "",
      })),
    }));

  const lancamentosOrdenados = [...(db.lancamentos || [])].sort((a, b) =>
    b.data.localeCompare(a.data)
  );

  return {
    pedidos: pedidosEnriquecidos,
    colegios: db.colegios,
    series: db.series,
    modulos: db.modulos,
    livros: db.livros || [],
    cupons: db.cupons,
    config: db.config,
    lancamentos: lancamentosOrdenados,
    modoSupabase: false,
  };
}

export async function atualizarStatusPedidoServer(
  pedidoId: string,
  status: PedidoStatus
): Promise<{ ok: boolean; erro?: string }> {
  const agora = new Date().toISOString();
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const patch: Record<string, unknown> = { status };
      if (status === "pronto") patch.pronto_em = agora;
      if (status === "entregue") patch.entregue_em = agora;
      const { error } = await supabase
        .from("pedidos")
        .update(patch)
        .eq("id", pedidoId);
      if (error) {
        return { ok: false, erro: error.message || "Falha ao atualizar status." };
      }
      return { ok: true };
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao comunicar com o banco de dados." };
    }
  }

  const db = readLocalDb();
  const ped = db.pedidos.find((p) => p.id === pedidoId);
  if (!ped) {
    return { ok: false, erro: "Pedido não encontrado." };
  }
  ped.status = status;
  if (status === "pronto") ped.pronto_em = agora;
  if (status === "entregue") ped.entregue_em = agora;
  writeLocalDb(db);
  return { ok: true };
}

export async function alternarPagoPedidoServer(
  pedidoId: string,
  pago: boolean
): Promise<{ ok: boolean; erro?: string; pago_em?: string | null }> {
  const pagoEm = pago ? new Date().toISOString() : null;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const { error } = await supabase
        .from("pedidos")
        .update({ pago, pago_em: pagoEm })
        .eq("id", pedidoId);
      if (error) {
        return { ok: false, erro: error.message || "Falha ao atualizar pagamento." };
      }
      return { ok: true, pago_em: pagoEm };
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao comunicar com o banco de dados." };
    }
  }

  const db = readLocalDb();
  const ped = db.pedidos.find((p) => p.id === pedidoId);
  if (!ped) {
    return { ok: false, erro: "Pedido não encontrado." };
  }
  ped.pago = pago;
  ped.pago_em = pagoEm;
  writeLocalDb(db);
  return { ok: true, pago_em: pagoEm };
}

export async function alternarItemImpressoServer(
  pedidoId: string,
  itemId: string,
  impresso: boolean
): Promise<{ ok: boolean; erro?: string }> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const { error } = await supabase
        .from("pedido_itens")
        .update({ impresso })
        .eq("id", itemId);
      if (error) {
        return { ok: false, erro: error.message || "Falha ao atualizar item." };
      }
      return { ok: true };
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao comunicar com o banco de dados." };
    }
  }

  const db = readLocalDb();
  const ped = db.pedidos.find((p) => p.id === pedidoId);
  if (ped) {
    const item = ped.itens.find((i) => i.id === itemId);
    if (item) {
      item.impresso = impresso;
      writeLocalDb(db);
    }
  }
  return { ok: true };
}

/**
 * Marca todos os itens pendentes de um mesmo módulo (em lote por série) como impressos
 */
export async function marcarLoteImpressoServer(
  itemIds: string[]
): Promise<{ ok: boolean; erro?: string }> {
  if (!itemIds || itemIds.length === 0) {
    return { ok: true };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const { error } = await supabase
        .from("pedido_itens")
        .update({ impresso: true })
        .in("id", itemIds);
      if (error) {
        return {
          ok: false,
          erro: error.message || "Falha ao marcar lote como impresso.",
        };
      }
      return { ok: true };
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao comunicar com o banco de dados." };
    }
  }

  const setIds = new Set(itemIds);
  const db = readLocalDb();
  for (const ped of db.pedidos) {
    for (const item of ped.itens) {
      if (setIds.has(item.id)) {
        item.impresso = true;
      }
    }
  }
  writeLocalDb(db);
  return { ok: true };
}

export async function salvarColegioServer(dados: {
  id?: string;
  nome: string;
  ativo: boolean;
}): Promise<{ ok: boolean; erro?: string; colegio?: Colegio }> {
  const nomeLimpo = dados.nome.trim();
  if (!nomeLimpo) {
    return { ok: false, erro: "Informe o nome do colégio." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      if (dados.id) {
        const { data, error } = await supabase
          .from("colegios")
          .update({ nome: nomeLimpo, ativo: dados.ativo })
          .eq("id", dados.id)
          .select("*")
          .single();
        if (error) {
          return { ok: false, erro: error.message || "Erro ao atualizar colégio." };
        }
        return { ok: true, colegio: data as Colegio };
      } else {
        const { data, error } = await supabase
          .from("colegios")
          .insert({ nome: nomeLimpo, ativo: dados.ativo })
          .select("*")
          .single();
        if (error) {
          return { ok: false, erro: error.message || "Erro ao criar colégio." };
        }
        return { ok: true, colegio: data as Colegio };
      }
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao salvar colégio." };
    }
  }

  const db = readLocalDb();
  let colegioSalvo: Colegio | undefined;
  if (dados.id) {
    const col = db.colegios.find((c) => c.id === dados.id);
    if (!col) return { ok: false, erro: "Colégio não encontrado." };
    col.nome = nomeLimpo;
    col.ativo = dados.ativo;
    colegioSalvo = { ...col };
  } else {
    colegioSalvo = {
      id: `col-${Date.now()}`,
      nome: nomeLimpo,
      ativo: dados.ativo,
      criado_em: new Date().toISOString(),
    };
    db.colegios.push(colegioSalvo);
  }
  writeLocalDb(db);
  return { ok: true, colegio: colegioSalvo };
}

export async function salvarSerieServer(dados: {
  id?: string;
  colegio_id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}): Promise<{ ok: boolean; erro?: string; serie?: Serie }> {
  const nomeLimpo = dados.nome.trim();
  if (!nomeLimpo) {
    return { ok: false, erro: "Informe o nome da série." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      if (dados.id) {
        const { data, error } = await supabase
          .from("series")
          .update({
            colegio_id: dados.colegio_id,
            nome: nomeLimpo,
            ordem: Number(dados.ordem),
            ativo: dados.ativo,
          })
          .eq("id", dados.id)
          .select("*")
          .single();
        if (error) {
          return { ok: false, erro: error.message || "Erro ao atualizar série." };
        }
        return { ok: true, serie: data as Serie };
      } else {
        const { data, error } = await supabase
          .from("series")
          .insert({
            colegio_id: dados.colegio_id,
            nome: nomeLimpo,
            ordem: Number(dados.ordem),
            ativo: dados.ativo,
          })
          .select("*")
          .single();
        if (error) {
          return { ok: false, erro: error.message || "Erro ao criar série." };
        }
        return { ok: true, serie: data as Serie };
      }
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao salvar série." };
    }
  }

  const db = readLocalDb();
  let serieSalva: Serie | undefined;
  if (dados.id) {
    const ser = db.series.find((s) => s.id === dados.id);
    if (!ser) return { ok: false, erro: "Série não encontrada." };
    ser.colegio_id = dados.colegio_id;
    ser.nome = nomeLimpo;
    ser.ordem = Number(dados.ordem);
    ser.ativo = dados.ativo;
    serieSalva = { ...ser };
  } else {
    serieSalva = {
      id: `ser-${Date.now()}`,
      colegio_id: dados.colegio_id,
      nome: nomeLimpo,
      ordem: Number(dados.ordem),
      ativo: dados.ativo,
    };
    db.series.push(serieSalva);
  }
  writeLocalDb(db);
  return { ok: true, serie: serieSalva };
}

export async function duplicarSerieServer(params: {
  serieOrigemId: string;
  colegioDestinoId: string;
  novoNomeSerie: string;
}): Promise<{
  ok: boolean;
  erro?: string;
  novaSerie?: Serie;
  novosModulos?: Modulo[];
}> {
  const nomeLimpo = params.novoNomeSerie.trim();
  if (!nomeLimpo) {
    return { ok: false, erro: "Informe o nome da nova série." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const { data: origemModulos, error: errOrigem } = await supabase
        .from("modulos")
        .select("*")
        .eq("serie_id", params.serieOrigemId)
        .order("ordem", { ascending: true });

      if (errOrigem) {
        return { ok: false, erro: errOrigem.message || "Erro ao ler série de origem." };
      }

      const { data: seriesExistentes } = await supabase
        .from("series")
        .select("ordem")
        .eq("colegio_id", params.colegioDestinoId);

      const maxOrdem =
        (seriesExistentes || []).reduce(
          (acc, s) => Math.max(acc, Number(s.ordem || 0)),
          0
        ) + 1;

      const { data: novaSerie, error } = await supabase
        .from("series")
        .insert({
          colegio_id: params.colegioDestinoId,
          nome: nomeLimpo,
          ordem: maxOrdem,
          ativo: true,
        })
        .select("*")
        .single();

      if (error || !novaSerie) {
        return { ok: false, erro: error?.message || "Erro ao criar série duplicada." };
      }

      let modulosCriados: Modulo[] = [];
      if (origemModulos && origemModulos.length > 0) {
        const { data: inseridos, error: errInsertMod } = await supabase
          .from("modulos")
          .insert(
            origemModulos.map((m) => ({
              serie_id: novaSerie.id,
              nome: m.nome,
              ordem: m.ordem,
              valor: m.valor,
              link_arquivo: m.link_arquivo,
              ativo: m.ativo,
              disciplinas: Array.isArray(m.disciplinas) ? m.disciplinas : [],
              livros: Array.isArray(m.livros) ? m.livros : [],
              capa_url: m.capa_url || null,
            }))
          )
          .select("*");

        if (errInsertMod) {
          return {
            ok: false,
            erro: errInsertMod.message || "Erro ao copiar módulos da série.",
          };
        }

        modulosCriados = ((inseridos || []) as Modulo[]).map((m) => ({
          ...m,
          valor: Number(m.valor),
        }));
      }

      return {
        ok: true,
        novaSerie: novaSerie as Serie,
        novosModulos: modulosCriados,
      };
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao duplicar série." };
    }
  }

  const db = readLocalDb();
  const modulosOrigem = db.modulos
    .filter((m) => m.serie_id === params.serieOrigemId)
    .sort((a, b) => a.ordem - b.ordem);
  const maxOrdem =
    db.series
      .filter((s) => s.colegio_id === params.colegioDestinoId)
      .reduce((acc, s) => Math.max(acc, s.ordem), 0) + 1;

  const novaSerieId = `ser-dup-${Date.now()}`;
  const novaSerie: Serie = {
    id: novaSerieId,
    colegio_id: params.colegioDestinoId,
    nome: nomeLimpo,
    ordem: maxOrdem,
    ativo: true,
  };
  db.series.push(novaSerie);

  const novosModulos: Modulo[] = modulosOrigem.map((m, idx) => {
    const livrosCopiados =
      Array.isArray(m.livros) && m.livros.length > 0
        ? m.livros.map((l) => {
            const livroCat = (db.livros || []).find((cat) => cat.id === l.id);
            return {
              ...l,
              serie_nome: nomeLimpo,
              capa_url: livroCat
                ? resolverCapaLivroParaSerie(livroCat, nomeLimpo)
                : l.capa_url || null,
            };
          })
        : getLivrosPadraoPorModulo(m.nome, nomeLimpo, db.livros);
    return {
      id: `mod-dup-${Date.now()}-${idx}`,
      serie_id: novaSerieId,
      nome: m.nome,
      ordem: m.ordem,
      valor: Number(m.valor),
      link_arquivo: m.link_arquivo,
      ativo: m.ativo,
      disciplinas:
        Array.isArray(m.disciplinas) && m.disciplinas.length > 0
          ? [...m.disciplinas]
          : livrosCopiados.map((l) => l.nome),
      livros: livrosCopiados,
      capa_url:
        m.capa_url ??
        (/paradid/i.test(m.nome)
          ? "preset:cmyk-indigo"
          : getCapaPadraoPorOrdem(m.ordem || 1)),
    };
  });

  db.modulos.push(...novosModulos);
  writeLocalDb(db);

  return { ok: true, novaSerie, novosModulos };
}

export async function salvarModuloServer(dados: {
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
}): Promise<{ ok: boolean; erro?: string; modulo?: Modulo }> {
  const nomeLimpo = dados.nome.trim();
  if (!nomeLimpo) {
    return { ok: false, erro: "Informe o nome do módulo." };
  }
  if (!Number.isFinite(Number(dados.valor)) || Number(dados.valor) < 0) {
    return { ok: false, erro: "Informe um valor válido para o módulo." };
  }

  const livrosLimpos: ModuloLivroItem[] | undefined = Array.isArray(
    dados.livros
  )
    ? dados.livros
        .filter((l) => l && l.nome && l.nome.trim() !== "")
        .map((l, idx) => ({
          id: l.id || `liv-mod-${idx + 1}`,
          nome: l.nome.trim(),
          valor: Math.max(0, Number(l.valor) || 0),
          serie_nome: l.serie_nome || null,
          capa_url: l.capa_url || null,
        }))
    : undefined;

  const disciplinasLimpas =
    livrosLimpos && livrosLimpos.length > 0
      ? livrosLimpos.map((l) => l.nome)
      : Array.isArray(dados.disciplinas)
        ? Array.from(
            new Set(dados.disciplinas.map((d) => d.trim()).filter(Boolean))
          )
        : undefined;

  const capaLimpa =
    typeof dados.capa_url === "string" && dados.capa_url.trim() !== ""
      ? dados.capa_url.trim()
      : undefined;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      let livrosParaSalvar =
        livrosLimpos && livrosLimpos.length > 0 ? livrosLimpos : undefined;

      if (!livrosParaSalvar) {
        const [serieRes, livrosRes] = await Promise.all([
          supabase
            .from("series")
            .select("nome")
            .eq("id", dados.serie_id)
            .maybeSingle(),
          supabase.from("livros").select("*").eq("ativo", true),
        ]);
        const livrosCat = ((livrosRes.data || []) as Livro[]).map((l) => ({
          ...l,
          valor: Number(l.valor),
        }));
        livrosParaSalvar = getLivrosPadraoPorModulo(
          nomeLimpo,
          serieRes.data?.nome,
          livrosCat
        );
      }

      const disciplinasParaSalvar =
        disciplinasLimpas && disciplinasLimpas.length > 0
          ? disciplinasLimpas
          : livrosParaSalvar.map((l) => l.nome);
      const capaParaSalvar =
        capaLimpa || getCapaPadraoPorOrdem(Number(dados.ordem) || 1);

      const payload: Record<string, unknown> = {
        serie_id: dados.serie_id,
        nome: nomeLimpo,
        ordem: Number(dados.ordem),
        valor: Number(dados.valor),
        link_arquivo: dados.link_arquivo.trim(),
        ativo: dados.ativo,
        disciplinas: disciplinasParaSalvar,
        livros: livrosParaSalvar,
        capa_url: capaParaSalvar,
      };
      if (dados.id) {
        const { data, error } = await supabase
          .from("modulos")
          .update(payload)
          .eq("id", dados.id)
          .select("*")
          .single();
        if (error) {
          return { ok: false, erro: error.message || "Erro ao atualizar módulo." };
        }
        return {
          ok: true,
          modulo: {
            ...(data as Modulo),
            valor: Number(data.valor),
            livros: Array.isArray(data.livros) && data.livros.length > 0 ? data.livros : livrosParaSalvar,
            disciplinas:
              Array.isArray(data.disciplinas) && data.disciplinas.length > 0
                ? data.disciplinas
                : disciplinasParaSalvar,
            capa_url: data.capa_url || capaParaSalvar,
          },
        };
      } else {
        const { data, error } = await supabase
          .from("modulos")
          .insert(payload)
          .select("*")
          .single();
        if (error) {
          return { ok: false, erro: error.message || "Erro ao criar módulo." };
        }
        return {
          ok: true,
          modulo: {
            ...(data as Modulo),
            valor: Number(data.valor),
            livros: Array.isArray(data.livros) && data.livros.length > 0 ? data.livros : livrosParaSalvar,
            disciplinas:
              Array.isArray(data.disciplinas) && data.disciplinas.length > 0
                ? data.disciplinas
                : disciplinasParaSalvar,
            capa_url: data.capa_url || capaParaSalvar,
          },
        };
      }
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao salvar módulo." };
    }
  }

  const db = readLocalDb();
  const serieDoMod = db.series.find((s) => s.id === dados.serie_id);
  const livrosPadrao = getLivrosPadraoPorModulo(
    nomeLimpo,
    serieDoMod?.nome,
    db.livros
  );
  const disciplinasPadrao = livrosPadrao.map((l) => l.nome);
  let moduloSalvo: Modulo | undefined;
  if (dados.id) {
    const mod = db.modulos.find((m) => m.id === dados.id);
    if (!mod) return { ok: false, erro: "Módulo não encontrado." };
    mod.serie_id = dados.serie_id;
    mod.nome = nomeLimpo;
    mod.ordem = Number(dados.ordem);
    mod.valor = Number(dados.valor);
    mod.link_arquivo = dados.link_arquivo.trim();
    mod.ativo = dados.ativo;
    mod.livros =
      livrosLimpos && livrosLimpos.length > 0
        ? livrosLimpos
        : mod.livros && mod.livros.length > 0
          ? mod.livros
          : livrosPadrao;
    mod.disciplinas =
      disciplinasLimpas && disciplinasLimpas.length > 0
        ? disciplinasLimpas
        : mod.livros.map((l) => l.nome);
    mod.capa_url =
      capaLimpa ||
      mod.capa_url ||
      getCapaPadraoPorOrdem(Number(dados.ordem) || 1);
    moduloSalvo = { ...mod };
  } else {
    const livrosFinais =
      livrosLimpos && livrosLimpos.length > 0 ? livrosLimpos : livrosPadrao;
    moduloSalvo = {
      id: `mod-${Date.now()}`,
      serie_id: dados.serie_id,
      nome: nomeLimpo,
      ordem: Number(dados.ordem),
      valor: Number(dados.valor),
      link_arquivo: dados.link_arquivo.trim(),
      ativo: dados.ativo,
      livros: livrosFinais,
      disciplinas:
        disciplinasLimpas && disciplinasLimpas.length > 0
          ? disciplinasLimpas
          : disciplinasPadrao,
      capa_url:
        capaLimpa || getCapaPadraoPorOrdem(Number(dados.ordem) || 1),
    };
    db.modulos.push(moduloSalvo);
  }
  writeLocalDb(db);
  return { ok: true, modulo: moduloSalvo };
}

export async function salvarLivroServer(dados: {
  id?: string;
  nome: string;
  categoria: "didatico" | "paradidatico";
  valor: number;
  ativo: boolean;
  serie_nome?: string | null;
  capa_url?: string | null;
  capas_por_serie?: Record<string, string>;
}): Promise<{ ok: boolean; erro?: string; livro?: Livro; modulosAtualizados?: Modulo[] }> {
  const nomeLimpo = dados.nome.trim();
  if (!nomeLimpo) {
    return { ok: false, erro: "Informe o nome do livro." };
  }
  const valorNum = Number(dados.valor);
  if (!Number.isFinite(valorNum) || valorNum < 0) {
    return { ok: false, erro: "Informe um preço válido para o livro." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const idLivro = dados.id || `liv-${Date.now()}`;
      const payload = {
        id: idLivro,
        nome: nomeLimpo,
        categoria: dados.categoria,
        valor: valorNum,
        ativo: dados.ativo,
        serie_nome: dados.serie_nome ?? null,
        capa_url: dados.capa_url ?? null,
        capas_por_serie: dados.capas_por_serie ?? {},
      };
      const { data, error } = await supabase
        .from("livros")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();

      if (error) {
        return { ok: false, erro: error.message || "Erro ao salvar livro." };
      }

      const livroSalvoSupabase: Livro = {
        ...(data as Livro),
        valor: Number(data.valor),
      };

      const [{ data: seriesData }, { data: modulosData }] = await Promise.all([
        supabase.from("series").select("id, nome"),
        supabase.from("modulos").select("*").order("ordem", { ascending: true }),
      ]);

      const serieNomeMapSupa = new Map(
        (seriesData || []).map((s) => [s.id, s.nome])
      );
      const modulosAtualizadosSupa: Modulo[] = [];

      for (const modRaw of (modulosData || []) as Modulo[]) {
        const mod: Modulo = { ...modRaw, valor: Number(modRaw.valor) };
        if (Array.isArray(mod.livros)) {
          let alterouMod = false;
          const nomeSerieMod = serieNomeMapSupa.get(mod.serie_id) || "";
          const novosLivros = mod.livros.map((item) => {
            if (item.id === livroSalvoSupabase.id) {
              alterouMod = true;
              const capaDaSerie =
                (nomeSerieMod &&
                  livroSalvoSupabase.capas_por_serie &&
                  livroSalvoSupabase.capas_por_serie[nomeSerieMod]) ||
                livroSalvoSupabase.capa_url ||
                item.capa_url ||
                null;
              return {
                ...item,
                nome: livroSalvoSupabase.nome,
                valor: livroSalvoSupabase.valor,
                serie_nome:
                  nomeSerieMod ||
                  livroSalvoSupabase.serie_nome ||
                  item.serie_nome ||
                  null,
                capa_url: capaDaSerie,
              };
            }
            return item;
          });
          if (alterouMod) {
            mod.livros = novosLivros;
            mod.disciplinas = novosLivros.map((l) => l.nome);
            mod.valor = Number(
              novosLivros
                .reduce((acc, l) => acc + Number(l.valor), 0)
                .toFixed(2)
            );
            await supabase
              .from("modulos")
              .update({
                livros: mod.livros,
                disciplinas: mod.disciplinas,
                valor: mod.valor,
              })
              .eq("id", mod.id);
          }
        }
        modulosAtualizadosSupa.push(mod);
      }

      return {
        ok: true,
        livro: livroSalvoSupabase,
        modulosAtualizados: modulosAtualizadosSupa,
      };
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao salvar livro no banco de dados." };
    }
  }

  const db = readLocalDb();
  if (!Array.isArray(db.livros)) {
    db.livros = createDefaultLivros();
  }
  const serieNomeMap = new Map(db.series.map((s) => [s.id, s.nome]));

  let livroSalvo: Livro;
  if (dados.id) {
    const existente = db.livros.find((l) => l.id === dados.id);
    if (!existente) {
      return { ok: false, erro: "Livro não encontrado." };
    }
    existente.nome = nomeLimpo;
    existente.categoria = dados.categoria;
    existente.valor = valorNum;
    existente.ativo = dados.ativo;
    if (dados.serie_nome !== undefined) {
      existente.serie_nome = dados.serie_nome || null;
    }
    if (dados.capa_url !== undefined) {
      existente.capa_url = dados.capa_url || null;
    }
    if (dados.capas_por_serie !== undefined) {
      existente.capas_por_serie = dados.capas_por_serie;
    }
    livroSalvo = { ...existente };

    // Sincroniza nome, valor e capa (por série) do livro nos módulos que o utilizam
    for (const mod of db.modulos) {
      if (Array.isArray(mod.livros)) {
        let alterouMod = false;
        const nomeSerieMod = serieNomeMap.get(mod.serie_id) || "";
        mod.livros = mod.livros.map((item) => {
          if (item.id === livroSalvo.id) {
            alterouMod = true;
            const capaDaSerie =
              (nomeSerieMod &&
                livroSalvo.capas_por_serie &&
                livroSalvo.capas_por_serie[nomeSerieMod]) ||
              livroSalvo.capa_url ||
              item.capa_url ||
              null;
            return {
              ...item,
              nome: livroSalvo.nome,
              valor: livroSalvo.valor,
              serie_nome: nomeSerieMod || livroSalvo.serie_nome || item.serie_nome || null,
              capa_url: capaDaSerie,
            };
          }
          return item;
        });
        if (alterouMod) {
          mod.disciplinas = mod.livros.map((l) => l.nome);
          mod.valor = Number(
            mod.livros.reduce((acc, l) => acc + Number(l.valor), 0).toFixed(2)
          );
        }
      }
    }
  } else {
    livroSalvo = {
      id: `liv-${Date.now()}`,
      nome: nomeLimpo,
      categoria: dados.categoria,
      valor: valorNum,
      ativo: dados.ativo,
      serie_nome: dados.serie_nome || null,
      capa_url: dados.capa_url || null,
      capas_por_serie: dados.capas_por_serie || {},
    };
    db.livros.push(livroSalvo);
  }

  writeLocalDb(db);
  return {
    ok: true,
    livro: livroSalvo,
    modulosAtualizados: db.modulos,
  };
}

export async function excluirLivroServer(
  id: string
): Promise<{ ok: boolean; erro?: string; modulosAtualizados?: Modulo[] }> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const { data: livroRemovido } = await supabase
        .from("livros")
        .select("id, nome")
        .eq("id", id)
        .maybeSingle();

      const { error } = await supabase.from("livros").delete().eq("id", id);
      if (error) {
        return { ok: false, erro: error.message || "Erro ao excluir livro." };
      }

      const { data: modulosData } = await supabase
        .from("modulos")
        .select("*")
        .order("ordem", { ascending: true });

      const modulosAtualizadosSupa: Modulo[] = [];
      for (const modRaw of (modulosData || []) as Modulo[]) {
        const mod: Modulo = { ...modRaw, valor: Number(modRaw.valor) };
        if (
          livroRemovido &&
          Array.isArray(mod.livros) &&
          mod.livros.length > 1
        ) {
          const filtrados = mod.livros.filter(
            (ml) => ml.id !== id && ml.nome !== livroRemovido.nome
          );
          if (filtrados.length > 0 && filtrados.length !== mod.livros.length) {
            mod.livros = filtrados;
            mod.disciplinas = filtrados.map((ml) => ml.nome);
            mod.valor = Number(
              filtrados.reduce((acc, ml) => acc + Number(ml.valor), 0).toFixed(2)
            );
            await supabase
              .from("modulos")
              .update({
                livros: mod.livros,
                disciplinas: mod.disciplinas,
                valor: mod.valor,
              })
              .eq("id", mod.id);
          }
        }
        modulosAtualizadosSupa.push(mod);
      }

      return { ok: true, modulosAtualizados: modulosAtualizadosSupa };
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao excluir livro no banco de dados." };
    }
  }

  const db = readLocalDb();
  if (!Array.isArray(db.livros)) {
    return { ok: true, modulosAtualizados: db.modulos };
  }
  const livroRemovido = db.livros.find((l) => l.id === id);
  db.livros = db.livros.filter((l) => l.id !== id);

  if (livroRemovido && Array.isArray(db.modulos)) {
    for (const mod of db.modulos) {
      if (Array.isArray(mod.livros) && mod.livros.length > 1) {
        const filtrados = mod.livros.filter(
          (ml) => ml.id !== id && ml.nome !== livroRemovido.nome
        );
        if (filtrados.length > 0 && filtrados.length !== mod.livros.length) {
          mod.livros = filtrados;
          mod.disciplinas = filtrados.map((ml) => ml.nome);
          mod.valor = Number(
            filtrados.reduce((acc, ml) => acc + Number(ml.valor), 0).toFixed(2)
          );
        }
      }
    }
  }

  writeLocalDb(db);
  return { ok: true, modulosAtualizados: db.modulos };
}

export async function salvarCupomServer(dados: {
  id?: string;
  codigo: string;
  tipo: "percentual" | "valor";
  desconto: number;
  validade: string | null;
  limite_usos: number | null;
  ativo: boolean;
}): Promise<{ ok: boolean; erro?: string; cupom?: Cupom }> {
  const codigoUpper = dados.codigo.trim().toUpperCase().replace(/\s+/g, "");
  if (!codigoUpper) {
    return { ok: false, erro: "Informe o código do cupom." };
  }
  const descontoNum = Number(dados.desconto);
  if (!Number.isFinite(descontoNum) || descontoNum <= 0) {
    return { ok: false, erro: "O desconto deve ser maior que zero." };
  }
  if (dados.tipo === "percentual" && descontoNum > 100) {
    return { ok: false, erro: "O desconto percentual não pode passar de 100%." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const payload = {
        codigo: codigoUpper,
        tipo: dados.tipo,
        desconto: descontoNum,
        validade: dados.validade || null,
        limite_usos: dados.limite_usos ? Number(dados.limite_usos) : null,
        ativo: dados.ativo,
      };
      if (dados.id) {
        const { data, error } = await supabase
          .from("cupons")
          .update(payload)
          .eq("id", dados.id)
          .select("*")
          .single();
        if (error) {
          if (error.code === "23505") {
            return { ok: false, erro: "Já existe outro cupom com este código." };
          }
          return { ok: false, erro: error.message || "Erro ao atualizar cupom." };
        }
        return {
          ok: true,
          cupom: { ...(data as Cupom), desconto: Number(data.desconto) },
        };
      } else {
        const { data, error } = await supabase
          .from("cupons")
          .insert(payload)
          .select("*")
          .single();
        if (error) {
          if (error.code === "23505") {
            return { ok: false, erro: "Já existe um cupom cadastrado com este código." };
          }
          return { ok: false, erro: error.message || "Erro ao criar cupom." };
        }
        return {
          ok: true,
          cupom: { ...(data as Cupom), desconto: Number(data.desconto) },
        };
      }
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao salvar cupom." };
    }
  }

  const db = readLocalDb();
  const duplicado = db.cupons.find(
    (item) =>
      item.codigo.toUpperCase() === codigoUpper && item.id !== dados.id
  );
  if (duplicado) {
    return {
      ok: false,
      erro: `Já existe um cupom cadastrado com o código ${codigoUpper}.`,
    };
  }

  let cupomSalvo: Cupom | undefined;
  if (dados.id) {
    const c = db.cupons.find((item) => item.id === dados.id);
    if (!c) return { ok: false, erro: "Cupom não encontrado." };
    c.codigo = codigoUpper;
    c.tipo = dados.tipo;
    c.desconto = descontoNum;
    c.validade = dados.validade || null;
    c.limite_usos = dados.limite_usos ? Number(dados.limite_usos) : null;
    c.ativo = dados.ativo;
    cupomSalvo = { ...c };
  } else {
    cupomSalvo = {
      id: `cup-${Date.now()}`,
      codigo: codigoUpper,
      tipo: dados.tipo,
      desconto: descontoNum,
      validade: dados.validade || null,
      limite_usos: dados.limite_usos ? Number(dados.limite_usos) : null,
      usos: 0,
      ativo: dados.ativo,
    };
    db.cupons.push(cupomSalvo);
  }
  writeLocalDb(db);
  return { ok: true, cupom: cupomSalvo };
}

export async function salvarConfigServer(
  config: Omit<LojaConfig, "id">
): Promise<{ ok: boolean; erro?: string; config?: LojaConfig }> {
  if (!config.nome_loja.trim()) {
    return { ok: false, erro: "Informe o nome da loja." };
  }
  const foneLoja = onlyDigits(config.whatsapp_loja);
  if (foneLoja.length < 10 || foneLoja.length > 13) {
    return { ok: false, erro: "Informe um WhatsApp da loja válido com DDD." };
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const { data, error } = await supabase
        .from("config")
        .upsert(
          {
            id: 1,
            nome_loja: config.nome_loja.trim(),
            whatsapp_loja: foneLoja,
            prazo_dias: Math.max(1, Number(config.prazo_dias) || 7),
            endereco_retirada: config.endereco_retirada.trim(),
            horario_retirada: config.horario_retirada.trim(),
            taxas_parcelamento: config.taxas_parcelamento,
            mensagem_pronto: config.mensagem_pronto,
          },
          { onConflict: "id" }
        )
        .select("*")
        .single();
      if (error) {
        if (error.code === "PGRST116" || error.code === "42501") {
          return {
            ok: false,
            erro: "Permissão negada no Supabase ao salvar configurações. Verifique se a variável SUPABASE_SERVICE_ROLE_KEY está configurada na Vercel (Settings > Environment Variables) ou faça login com seu usuário do Supabase Auth.",
          };
        }
        return {
          ok: false,
          erro: error.message || "Erro ao salvar configurações.",
        };
      }
      return { ok: true, config: data as LojaConfig };
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao salvar configurações." };
    }
  }

  const db = readLocalDb();
  db.config = {
    id: 1,
    nome_loja: config.nome_loja.trim(),
    whatsapp_loja: foneLoja,
    prazo_dias: Math.max(1, Number(config.prazo_dias) || 7),
    endereco_retirada: config.endereco_retirada.trim(),
    horario_retirada: config.horario_retirada.trim(),
    taxas_parcelamento: config.taxas_parcelamento,
    mensagem_pronto: config.mensagem_pronto,
  };
  writeLocalDb(db);
  return { ok: true, config: db.config };
}

export async function salvarLancamentoFinanceiroServer(dados: {
  id?: string;
  data: string;
  tipo: LancamentoTipo;
  categoria: LancamentoCategoria;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  observacao?: string | null;
}): Promise<{
  ok: boolean;
  erro?: string;
  lancamento?: LancamentoFinanceiro;
}> {
  const descricaoLimpa = dados.descricao.trim();
  if (!descricaoLimpa) {
    return { ok: false, erro: "Informe a descrição do lançamento." };
  }
  const qtd = Math.max(0.01, Number(dados.quantidade) || 1);
  const vUnit = Math.max(0, Number(dados.valor_unitario) || 0);
  const vTotal = Math.round(qtd * vUnit * 100) / 100;
  if (vTotal <= 0) {
    return { ok: false, erro: "O valor do lançamento deve ser maior que zero." };
  }
  const dataValida = dados.data || toLocalDateISO();

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const payload = {
        data: dataValida,
        tipo: dados.tipo,
        categoria: dados.categoria,
        descricao: descricaoLimpa,
        quantidade: qtd,
        valor_unitario: vUnit,
        valor_total: vTotal,
        observacao: dados.observacao?.trim() || null,
      };
      if (dados.id) {
        const { data, error } = await supabase
          .from("lancamentos_financeiros")
          .update(payload)
          .eq("id", dados.id)
          .select("*")
          .single();
        if (error) {
          return {
            ok: false,
            erro: error.message || "Erro ao atualizar lançamento.",
          };
        }
        return {
          ok: true,
          lancamento: {
            ...(data as LancamentoFinanceiro),
            quantidade: Number(data.quantidade),
            valor_unitario: Number(data.valor_unitario),
            valor_total: Number(data.valor_total),
          },
        };
      } else {
        const { data, error } = await supabase
          .from("lancamentos_financeiros")
          .insert(payload)
          .select("*")
          .single();
        if (error) {
          return {
            ok: false,
            erro: error.message || "Erro ao registrar lançamento.",
          };
        }
        return {
          ok: true,
          lancamento: {
            ...(data as LancamentoFinanceiro),
            quantidade: Number(data.quantidade),
            valor_unitario: Number(data.valor_unitario),
            valor_total: Number(data.valor_total),
          },
        };
      }
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao salvar lançamento financeiro." };
    }
  }

  const db = readLocalDb();
  let salvo: LancamentoFinanceiro | undefined;
  if (dados.id) {
    const item = db.lancamentos.find((l) => l.id === dados.id);
    if (!item) return { ok: false, erro: "Lançamento não encontrado." };
    item.data = dataValida;
    item.tipo = dados.tipo;
    item.categoria = dados.categoria;
    item.descricao = descricaoLimpa;
    item.quantidade = qtd;
    item.valor_unitario = vUnit;
    item.valor_total = vTotal;
    item.observacao = dados.observacao?.trim() || null;
    salvo = { ...item };
  } else {
    salvo = {
      id: `lanc-${Date.now()}`,
      data: dataValida,
      tipo: dados.tipo,
      categoria: dados.categoria,
      descricao: descricaoLimpa,
      quantidade: qtd,
      valor_unitario: vUnit,
      valor_total: vTotal,
      observacao: dados.observacao?.trim() || null,
      criado_em: new Date().toISOString(),
    };
    db.lancamentos.unshift(salvo);
  }
  writeLocalDb(db);
  return { ok: true, lancamento: salvo };
}

export async function excluirLancamentoFinanceiroServer(
  id: string
): Promise<{ ok: boolean; erro?: string }> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createAdminSupabase();
      const { error } = await supabase
        .from("lancamentos_financeiros")
        .delete()
        .eq("id", id);
      if (error) {
        return {
          ok: false,
          erro: error.message || "Erro ao excluir lançamento.",
        };
      }
      return { ok: true };
    } catch (e) {
      console.warn(e);
      return { ok: false, erro: "Erro ao excluir lançamento financeiro." };
    }
  }

  const db = readLocalDb();
  db.lancamentos = (db.lancamentos || []).filter((l) => l.id !== id);
  writeLocalDb(db);
  return { ok: true };
}

/**
 * 5. CONSULTA PÚBLICA DE STATUS DO PEDIDO (busca por WhatsApp + nº do pedido opcional)
 * Nunca retorna link_arquivo.
 */
export interface PedidoPublicoConsultado {
  numero: string;
  aluno_nome: string;
  responsavel_nome: string;
  whatsapp?: string;
  colegio_nome: string;
  serie_nome: string;
  forma_pagamento?: FormaPagamento;
  parcelas?: number | null;
  subtotal?: number;
  desconto?: number;
  juros?: number;
  observacao?: string | null;
  status: PedidoStatus;
  pago: boolean;
  total: number;
  previsao_retirada: string;
  criado_em: string;
  itens: { nome_modulo: string; valor: number }[];
}

export async function consultarPedidoPublicoServer(
  numeroInput: string,
  whatsappInput: string
): Promise<{
  encontrado: boolean;
  erro?: string;
  pedido?: PedidoPublicoConsultado;
  pedidos?: PedidoPublicoConsultado[];
}> {
  const numDigits = onlyDigits(numeroInput || "");
  const foneDigits = onlyDigits(whatsappInput || "");

  if (foneDigits.length < 10) {
    return {
      encontrado: false,
      erro: "Informe o WhatsApp usado no pedido com DDD.",
    };
  }
  const numeroPad = numDigits ? numDigits.padStart(4, "0") : "";

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createServerSupabase();
      const { data, error } = await supabase.rpc("consultar_pedido_publico", {
        p_numero: numeroPad,
        p_whatsapp: foneDigits,
      });
      if (!error && data) {
        if (!data.encontrado) {
          return {
            encontrado: false,
            erro:
              data.erro ||
              "Nenhum pedido encontrado com este WhatsApp.",
          };
        }
        const listaRaw: Record<string, unknown>[] = Array.isArray(data.pedidos)
          ? data.pedidos
          : data.numero
            ? [data]
            : [];

        const lista: PedidoPublicoConsultado[] = listaRaw.map((item) => ({
          numero: String(item.numero),
          aluno_nome: String(item.aluno_nome),
          responsavel_nome: String(item.responsavel_nome),
          whatsapp: item.whatsapp ? String(item.whatsapp) : foneDigits,
          colegio_nome: String(item.colegio_nome || ""),
          serie_nome: String(item.serie_nome || ""),
          forma_pagamento: (item.forma_pagamento as FormaPagamento) || undefined,
          parcelas:
            typeof item.parcelas === "number" ? item.parcelas : undefined,
          subtotal:
            typeof item.subtotal === "number"
              ? Number(item.subtotal)
              : undefined,
          desconto:
            typeof item.desconto === "number"
              ? Number(item.desconto)
              : undefined,
          juros:
            typeof item.juros === "number" ? Number(item.juros) : undefined,
          observacao: item.observacao ? String(item.observacao) : null,
          status: item.status as PedidoStatus,
          pago: Boolean(item.pago),
          total: Number(item.total),
          previsao_retirada: String(item.previsao_retirada),
          criado_em: String(item.criado_em),
          itens: Array.isArray(item.itens)
            ? item.itens.map((i: Record<string, unknown>) => ({
                nome_modulo: String(i.nome_modulo),
                valor: Number(i.valor),
              }))
            : [],
        }));

        if (lista.length === 0) {
          return {
            encontrado: false,
            erro: "Nenhum pedido encontrado com os dados informados.",
          };
        }

        return {
          encontrado: true,
          pedido: lista[0],
          pedidos: lista,
        };
      }
      if (error) {
        console.error("Erro ao consultar pedido público no Supabase:", error.message);
      }
    } catch (e) {
      console.error("Falha ao consultar pedido público no Supabase:", e);
    }

    return {
      encontrado: false,
      erro: "Não foi possível consultar seu pedido no momento. Tente novamente em instantes.",
    };
  }

  const db = readLocalDb();
  const colMap = new Map(db.colegios.map((c) => [c.id, c.nome]));
  const serMap = new Map(db.series.map((s) => [s.id, s.nome]));

  const encontrados = [...db.pedidos]
    .filter((item) => {
      const matchFone = onlyDigits(item.whatsapp) === foneDigits;
      if (!matchFone) return false;
      if (!numDigits) return true;
      return (
        item.numero === numeroInput.trim() ||
        item.numero === numeroPad ||
        onlyDigits(item.numero) === numDigits
      );
    })
    .sort(
      (a, b) =>
        new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
    )
    .map((p) => ({
      numero: p.numero,
      aluno_nome: p.aluno_nome,
      responsavel_nome: p.responsavel_nome,
      whatsapp: p.whatsapp,
      colegio_nome: colMap.get(p.colegio_id) || p.colegio_nome || "",
      serie_nome: serMap.get(p.serie_id) || p.serie_nome || "",
      forma_pagamento: p.forma_pagamento,
      parcelas: p.parcelas,
      subtotal: Number(p.subtotal),
      desconto: Number(p.desconto),
      juros: Number(p.juros),
      observacao: p.observacao,
      status: p.status,
      pago: p.pago,
      total: Number(p.total),
      previsao_retirada: p.previsao_retirada,
      criado_em: p.criado_em,
      itens: p.itens.map((i) => ({
        nome_modulo: i.nome_modulo,
        valor: Number(i.valor),
      })),
    }));

  if (encontrados.length === 0) {
    return {
      encontrado: false,
      erro: numDigits
        ? "Pedido não encontrado. Confira o nº do pedido ou busque apenas pelo seu WhatsApp."
        : "Nenhum pedido encontrado para este número de WhatsApp.",
    };
  }

  return {
    encontrado: true,
    pedido: encontrados[0],
    pedidos: encontrados,
  };
}
