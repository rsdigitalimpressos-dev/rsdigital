"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Layers,
  LogOut,
  MessageCircle,
  PackageCheck,
  Plus,
  Printer,
  Search,
  Settings,
  Tag,
  X,
  Edit3,
  Check,
  AlertCircle,
  RefreshCw,
  LayoutGrid,
  List,
  DollarSign,
  Clock,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Database,
  FileText,
  TrendingUp,
  Trash2,
  BookOpen,
  SlidersHorizontal,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LogoIcon } from "@/components/brand/LogoIcon";
import {
  CAPA_EXEMPLOS,
  LivroCapaPreview,
  ModuloCapaPreview,
} from "@/components/brand/ModuloCapaPreview";
import { SplashScreen } from "@/components/brand/SplashScreen";
import {
  Colegio,
  Cupom,
  LancamentoCategoria,
  LancamentoFinanceiro,
  LancamentoTipo,
  Livro,
  LojaConfig,
  Modulo,
  ModuloLivroItem,
  OrcamentoRegistrado,
  OrcamentoStatus,
  Pedido,
  PedidoStatus,
  Serie,
} from "@/types/database";
import {
  FORMA_PAGAMENTO_LABEL,
  formatCurrency,
  formatDateBR,
  formatDateTimeBR,
  gerarLinkWhatsApp,
  maskWhatsApp,
  montarMensagemPronto,
  STATUS_PEDIDO_LABEL,
  toLocalDateISO,
} from "@/lib/format";
import {
  alternarItemImpressoAction,
  alternarPagoPedidoAction,
  atualizarStatusOrcamentoAction,
  atualizarStatusPedidoAction,
  duplicarSerieAction,
  enviarPedidoAction,
  excluirLancamentoFinanceiroAction,
  excluirLivroAction,
  excluirOrcamentoAction,
  logoutAdminAction,
  marcarLoteImpressoAction,
  obterDadosAdminAction,
  salvarColegioAction,
  salvarConfigAction,
  salvarCupomAction,
  salvarLancamentoFinanceiroAction,
  salvarLivroAction,
  salvarModuloAction,
  salvarSerieAction,
} from "@/app/actions";
import {
  createDefaultLivros,
  getCapaPadraoPorOrdem,
  getDisciplinasPadraoPorSerie,
  getLivrosPadraoPorModulo,
  resolverCapaLivroParaSerie,
  SERIES_PADRAO_ESCOLARES,
  TODAS_DISCIPLINAS_SUGESTOES,
} from "@/lib/seed-data";
import {
  exportarRelatorioExtratoExcel,
  exportarRelatorioPedidosExcel,
} from "@/lib/relatorio-excel";
import { baixarDocumentoPedidoPDF } from "@/lib/documento-pedido";
import { AdminOrcamentosSection } from "@/components/admin/AdminOrcamentosSection";

interface AdminDashboardProps {
  initialPedidos: Pedido[];
  initialOrcamentos?: OrcamentoRegistrado[];
  initialColegios: Colegio[];
  initialSeries: Serie[];
  initialModulos: Modulo[];
  initialLivros?: Livro[];
  initialCupons: Cupom[];
  initialConfig: LojaConfig;
  initialLancamentos: LancamentoFinanceiro[];
  adminEmail: string;
  modoSupabase: boolean;
}

type AdminSection =
  | "pedidos"
  | "orcamentos"
  | "imprimir_serie"
  | "faturamento"
  | "contas_pagar"
  | "cadastros"
  | "cupons"
  | "config";

const LANCAMENTO_TIPO_LABEL: Record<LancamentoTipo, string> = {
  custo: "Custo",
  investimento: "Investimento",
  perda: "Perda",
};

const LANCAMENTO_CATEGORIA_LABEL: Record<LancamentoCategoria, string> = {
  papel: "Papel / Sulfite",
  tinta: "Tinta / Toner",
  impressora: "Impressora / Manutenção",
  materiais: "Materiais / Acabamento",
  equipamentos: "Equipamentos",
  perda_impressao: "Perda de Impressão",
  outros: "Outros",
};

type StatusTab =
  | "a_fazer"
  | "prontos"
  | "entregues"
  | "cancelados"
  | "todos";
type ViewMode = "lista" | "lotes" | "kanban";

const FLUXO_STATUS: { key: PedidoStatus; label: string }[] = [
  { key: "recebido", label: "Recebido" },
  { key: "em_producao", label: "Em produção" },
  { key: "pronto", label: "Pronto" },
  { key: "entregue", label: "Entregue" },
];

const STATUS_PEDIDO_CURTO: Record<PedidoStatus, string> = {
  recebido: "Recebido",
  em_producao: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const FORMA_PAGAMENTO_CURTO: Record<Pedido["forma_pagamento"], string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito_avista: "Crédito 1x",
  credito_parcelado: "Crédito",
};

/** Calcula diferença em dias entre hoje (fuso BR) e a data prevista (YYYY-MM-DD) */
function calcularDiasAtePrevisao(previsaoStr: string): number {
  const [hy, hm, hd] = toLocalDateISO().split("-").map(Number);
  const [py, pm, pd] = previsaoStr.split("-").map(Number);
  const hojeUTC = Date.UTC(hy, (hm || 1) - 1, hd || 1);
  const prevUTC = Date.UTC(py, (pm || 1) - 1, pd || 1);
  return Math.round((prevUTC - hojeUTC) / 86400000);
}

/** Formata a série mantendo o ano/série legível e abreviando apenas o segmento longo */
function formatarSerieCurta(serieNome?: string): string {
  const sNome = (serieNome || "").trim();
  if (!sNome) return "";

  const serCurta = sNome
    .replace(/ensino\s+fundamental/gi, "EF")
    .replace(/ensino\s+m[eé]dio/gi, "EM")
    .replace(/educa[cç][aã]o\s+infantil/gi, "EI")
    .replace(/[—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return serCurta || sNome;
}

/** Formata data YYYY-MM-DD ou ISO em DD/MM curto para scanning rápido */
function formatarDataCurtaDDMM(dataStr?: string | null): string {
  if (!dataStr) return "";
  const iso = dataStr.includes("T") ? toLocalDateISO(dataStr) : dataStr;
  const [, m, d] = iso.split("-");
  if (!m || !d) return formatDateBR(iso);
  return `${d}/${m}`;
}

/** Resumo curto para exceções de matérias (evita textos longos na fila) */
function resumirTextoExcecao(texto: string): string {
  const limpo = texto.trim();
  if (!limpo) return "";
  return limpo
    .replace(/^todos\s+os\s+livros,\s*exceto\s*/i, "Sem: ")
    .replace(/^apenas:\s*/i, "Só: ");
}

/** Extrai o número do módulo/trimestre, nome base e eventual exceção após " — " */
function extrairInfoModuloChip(
  nomeModulo: string,
  idx: number
): { numeroChip: string; nomeBase: string; excecao: string } {
  const partes = nomeModulo.split(" — ");
  const nomeBase = partes[0]?.trim() || nomeModulo;
  const excecaoBruta = partes.slice(1).join(" — ").trim();
  const excecao = resumirTextoExcecao(excecaoBruta);
  const matchNum = nomeBase.match(/\d+/);
  const numeroChip = matchNum ? matchNum[0] : String(idx + 1);
  return { numeroChip, nomeBase, excecao };
}

/** Verifica se o link do arquivo é uma URL web (Drive/OneDrive) ou caminho de rede/local */
function isWebUrl(link: string): boolean {
  return /^https?:\/\//i.test(link.trim());
}

/** Escapa caracteres especiais HTML para impressão segura de etiqueta */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Retorna estilo limpo do selo de status (sem cor de fundo e sem borda) */
function getStatusBadgeClasses(status: PedidoStatus): string {
  switch (status) {
    case "recebido":
      return "bg-transparent text-brand-cyan";
    case "em_producao":
      return "bg-transparent text-brand-magenta";
    case "pronto":
      return "bg-transparent text-amber-700";
    case "entregue":
      return "bg-transparent text-emerald-700";
    case "cancelado":
      return "bg-transparent text-red-600";
  }
}

export function AdminDashboard({
  initialPedidos,
  initialOrcamentos,
  initialColegios,
  initialSeries,
  initialModulos,
  initialLivros,
  initialCupons,
  initialConfig,
  initialLancamentos,
  adminEmail,
  modoSupabase,
}: AdminDashboardProps) {
  const router = useRouter();
  const [section, setSection] = useState<AdminSection>("pedidos");
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [sincronizando, setSincronizando] = useState(false);

  // Estados locais sincronizados para resposta instantânea na UI
  const [pedidos, setPedidos] = useState<Pedido[]>(initialPedidos);
  const [orcamentos, setOrcamentos] = useState<OrcamentoRegistrado[]>(
    initialOrcamentos ?? []
  );
  const [filtroOrcamentoStatus, setFiltroOrcamentoStatus] = useState<
    "todos" | OrcamentoStatus
  >("todos");
  const [buscaOrcamento, setBuscaOrcamento] = useState<string>("");
  const [convertendoOrcamentoId, setConvertendoOrcamentoId] = useState<
    string | null
  >(null);
  const [colegios, setColegios] = useState<Colegio[]>(initialColegios);
  const [series, setSeries] = useState<Serie[]>(initialSeries);
  const [modulos, setModulos] = useState<Modulo[]>(initialModulos);
  const [livros, setLivros] = useState<Livro[]>(initialLivros ?? []);
  const [cupons, setCupons] = useState<Cupom[]>(initialCupons);
  const [config, setConfig] = useState<LojaConfig>(initialConfig);
  const [lancamentos, setLancamentos] =
    useState<LancamentoFinanceiro[]>(initialLancamentos);

  // Feedback visual global no painel
  const [avisoPainel, setAvisoPainel] = useState<{
    tipo: "ok" | "erro";
    texto: string;
  } | null>(null);

  const exibirAviso = (tipo: "ok" | "erro", texto: string) => {
    setAvisoPainel({ tipo, texto });
    setTimeout(() => {
      setAvisoPainel((atual) => (atual?.texto === texto ? null : atual));
    }, 4000);
  };

  // Sincronização manual de novos pedidos sem recarregar a página inteira
  const handleSincronizarDados = async () => {
    setSincronizando(true);
    try {
      const res = await obterDadosAdminAction();
      if (!res.ok) {
        exibirAviso("erro", res.erro || "Erro ao sincronizar dados.");
        return;
      }
      setPedidos(res.dados.pedidos);
      if (res.dados.orcamentos) setOrcamentos(res.dados.orcamentos);
      setColegios(res.dados.colegios);
      setSeries(res.dados.series);
      setModulos(res.dados.modulos);
      if (res.dados.livros) setLivros(res.dados.livros);
      setCupons(res.dados.cupons);
      setConfig(res.dados.config);
      setLancamentos(res.dados.lancamentos);
      exibirAviso("ok", "Pedidos e catálogo sincronizados!");
    } catch {
      exibirAviso("erro", "Falha ao atualizar pedidos.");
    } finally {
      setSincronizando(false);
    }
  };

  // Filtros da Central de Pedidos
  const [statusTab, setStatusTab] = useState<StatusTab>("a_fazer");
  const [filtroCardTopo, setFiltroCardTopo] = useState<
    "nenhum" | "urgentes"
  >("nenhum");
  const [filtroColegio, setFiltroColegio] = useState<string>("");
  const [filtroSerie, setFiltroSerie] = useState<string>("");
  const [filtroPagamento, setFiltroPagamento] = useState<
    "todos" | "pagos" | "pendentes"
  >("todos");
  const [ordenacaoPedidos, setOrdenacaoPedidos] = useState<
    "recentes" | "prazo" | "antigos"
  >("prazo");
  const [busca, setBusca] = useState<string>("");
  const [paginaPedidos, setPaginaPedidos] = useState<number>(1);
  const [exportDataInicio, setExportDataInicio] = useState<string>("");
  const [exportDataFim, setExportDataFim] = useState<string>("");
  const [exportPopoverAberto, setExportPopoverAberto] =
    useState<boolean>(false);
  const [toastPedidoPronto, setToastPedidoPronto] = useState<{
    pedidoId: string;
    numero: string;
  } | null>(null);

  // Volta para a página 1 sempre que filtros ou abas mudarem
  useEffect(() => {
    setPaginaPedidos(1);
  }, [
    statusTab,
    filtroCardTopo,
    filtroColegio,
    filtroSerie,
    filtroPagamento,
    ordenacaoPedidos,
    busca,
  ]);

  // Atualização silenciosa automática a cada 60s ou ao retornar à aba do navegador
  useEffect(() => {
    let ativo = true;
    const sincronizarSilencioso = async () => {
      if (!ativo || sincronizando) return;
      try {
        const res = await obterDadosAdminAction();
        if (!ativo || !res.ok) return;
        setPedidos(res.dados.pedidos);
        if (res.dados.orcamentos) setOrcamentos(res.dados.orcamentos);
        setColegios(res.dados.colegios);
        setSeries(res.dados.series);
        setModulos(res.dados.modulos);
        if (res.dados.livros) setLivros(res.dados.livros);
        setCupons(res.dados.cupons);
        setLancamentos(res.dados.lancamentos);
      } catch {
        // silêncio em atualização em segundo plano
      }
    };

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void sincronizarSilencioso();
      }
    }, 60000);

    const onFocus = () => {
      void sincronizarSilencioso();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      ativo = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [sincronizando]);

  // Filtro da Visão Imprimir por Série
  const [filtroColegioLote, setFiltroColegioLote] = useState<string>("");
  const [caminhoCopiadoId, setCaminhoCopiadoId] = useState<string | null>(null);

  // Pedido aberto na gaveta lateral (Slide-Over Drawer) + confirmação inline de cancelamento
  const [pedidoSelecionadoId, setPedidoSelecionadoId] = useState<string | null>(
    null
  );
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);

  // Popovers rápidos na tabela da Central de Pedidos (Módulos, Ação e Filtros)
  const [moduloPopoverId, setModuloPopoverId] = useState<string | null>(null);
  const [acaoPopoverId, setAcaoPopoverId] = useState<string | null>(null);
  const [filtrosPopoverAberto, setFiltrosPopoverAberto] = useState(false);
  const [kanbanDragPedidoId, setKanbanDragPedidoId] = useState<string | null>(
    null
  );
  const [kanbanDropColuna, setKanbanDropColuna] = useState<PedidoStatus | null>(
    null
  );
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);

  const pedidoDetalhe = useMemo(
    () => pedidos.find((p) => p.id === pedidoSelecionadoId) || null,
    [pedidos, pedidoSelecionadoId]
  );

  // KPIs executivos no topo
  const kpis = useMemo(() => {
    let aFazer = 0;
    let recebidos = 0;
    let emProducao = 0;
    let modulosPendentesFila = 0;
    let atrasados = 0;
    let vencemHojeAmanha = 0;
    let vencendoBreve = 0;
    let prontos = 0;
    let entregues = 0;
    let cancelados = 0;
    let valorTotalAtivo = 0;
    let valorPago = 0;
    let valorPendente = 0;

    for (const p of pedidos) {
      if (p.status !== "cancelado") {
        // Valor real sem os juros de parcelamento do cartão de crédito
        const valorReal = Math.max(0, p.total - (p.juros || 0));
        valorTotalAtivo += valorReal;
        if (p.pago) {
          valorPago += valorReal;
        } else {
          valorPendente += valorReal;
        }
      }

      if (p.status === "recebido" || p.status === "em_producao") {
        aFazer += 1;
        if (p.status === "recebido") recebidos += 1;
        if (p.status === "em_producao") emProducao += 1;

        modulosPendentesFila += p.itens.filter((i) => !i.impresso).length;

        const dias = calcularDiasAtePrevisao(p.previsao_retirada);
        if (dias < 0) {
          atrasados += 1;
        } else if (dias === 0 || dias === 1) {
          vencemHojeAmanha += 1;
        }
        if (dias >= 0 && dias <= 2) {
          vencendoBreve += 1;
        }
      } else if (p.status === "pronto") {
        prontos += 1;
      } else if (p.status === "entregue") {
        entregues += 1;
      } else if (p.status === "cancelado") {
        cancelados += 1;
      }
    }

    return {
      aFazer,
      recebidos,
      emProducao,
      modulosPendentesFila,
      atrasados,
      vencemHojeAmanha,
      vencendoBreve,
      prontos,
      entregues,
      cancelados,
      valorTotalAtivo,
      valorPago,
      valorPendente,
    };
  }, [pedidos]);

  // Base filtrada por busca, colégio, série e pagamento (usada na Lista e no Kanban)
  const pedidosBaseFiltrados = useMemo(() => {
    return [...pedidos]
      .filter((p) => {
        if (filtroColegio && p.colegio_id !== filtroColegio) return false;
        if (filtroSerie && p.serie_id !== filtroSerie) return false;
        if (filtroPagamento === "pagos" && !p.pago) return false;
        if (filtroPagamento === "pendentes" && p.pago) return false;

        if (busca.trim()) {
          const q = busca.trim().toLowerCase();
          const colNome = (
            colegios.find((c) => c.id === p.colegio_id)?.nome ||
            p.colegio_nome ||
            ""
          ).toLowerCase();
          const serNome = (
            series.find((s) => s.id === p.serie_id)?.nome ||
            p.serie_nome ||
            ""
          ).toLowerCase();
          const matchNumero =
            p.numero.toLowerCase().includes(q) ||
            `#${p.numero.toLowerCase()}`.includes(q);
          const matchCliente = (p.responsavel_nome || p.aluno_nome || "")
            .toLowerCase()
            .includes(q);
          const matchWpp = p.whatsapp.includes(q);
          const matchCol = colNome.includes(q) || serNome.includes(q);
          if (!matchNumero && !matchCliente && !matchWpp && !matchCol)
            return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (ordenacaoPedidos === "prazo") {
          const rankEtapa = (p: Pedido): number => {
            const emFila =
              p.status === "recebido" || p.status === "em_producao";
            if (emFila) {
              return calcularDiasAtePrevisao(p.previsao_retirada) < 0 ? 0 : 1;
            }
            if (p.status === "pronto") return 2;
            return 3;
          };

          const ra = rankEtapa(a);
          const rb = rankEtapa(b);
          if (ra !== rb) return ra - rb;

          const cmpPrazo = a.previsao_retirada.localeCompare(
            b.previsao_retirada
          );
          if (cmpPrazo !== 0) return cmpPrazo;
          return (
            new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
          );
        }
        if (ordenacaoPedidos === "antigos") {
          return (
            new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()
          );
        }
        // Mais recentes primeiro
        return (
          new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
        );
      });
  }, [
    pedidos,
    colegios,
    series,
    filtroColegio,
    filtroSerie,
    filtroPagamento,
    ordenacaoPedidos,
    busca,
  ]);

  // Lista filtrada pelo card do topo ou pela aba de status
  const pedidosFiltrados = useMemo(() => {
    return pedidosBaseFiltrados.filter((p) => {
      if (filtroCardTopo === "urgentes") {
        return (
          (p.status === "recebido" || p.status === "em_producao") &&
          calcularDiasAtePrevisao(p.previsao_retirada) <= 1
        );
      }

      if (statusTab === "a_fazer") {
        return p.status === "recebido" || p.status === "em_producao";
      }
      if (statusTab === "prontos") {
        return p.status === "pronto";
      }
      if (statusTab === "entregues") {
        return p.status === "entregue";
      }
      if (statusTab === "cancelados") {
        return p.status === "cancelado";
      }
      return true;
    });
  }, [pedidosBaseFiltrados, statusTab, filtroCardTopo]);

  // Agrupamento da visão "Lotes" na Central de Pedidos (pedidos na fila: recebido + em_producao, só módulos pendentes)
  const lotesAgrupadosCentral = useMemo(() => {
    const mapa = new Map<
      string,
      {
        key: string;
        tituloGrupo: string;
        colegioNome: string;
        serieCurta: string;
        serieNome: string;
        serieOrdem: number;
        trimestreNome: string;
        moduloOrdem: number;
        linkArquivo: string;
        pedidosRefs: { pedidoId: string; numero: string; cliente: string }[];
        excecoes: {
          pedidoId: string;
          numero: string;
          cliente: string;
          texto: string;
        }[];
        itemIds: string[];
      }
    >();

    for (const ped of pedidosBaseFiltrados) {
      if (ped.status !== "recebido" && ped.status !== "em_producao") continue;
      const colObj = colegios.find((c) => c.id === ped.colegio_id);
      const serObj = series.find((s) => s.id === ped.serie_id);
      const colNome = colObj?.nome || ped.colegio_nome || "Colégio";
      const serNome = serObj?.nome || ped.serie_nome || "Série";
      const serCurta = formatarSerieCurta(serNome);
      const nomeCliente = ped.responsavel_nome || ped.aluno_nome || "Cliente";

      ped.itens.forEach((item, idx) => {
        if (item.impresso) return;
        const { nomeBase, excecao } = extrairInfoModuloChip(
          item.nome_modulo,
          idx
        );
        const modObj = modulos.find((m) => m.id === item.modulo_id);
        const key = `${ped.colegio_id}::${ped.serie_id}::${nomeBase}`;
        const textoExcecao = [excecao, ped.observacao]
          .filter(Boolean)
          .join(" · ");

        const atual = mapa.get(key);
        if (atual) {
          atual.itemIds.push(item.id);
          if (!atual.pedidosRefs.some((r) => r.pedidoId === ped.id)) {
            atual.pedidosRefs.push({
              pedidoId: ped.id,
              numero: ped.numero,
              cliente: nomeCliente,
            });
          }
          if (!atual.linkArquivo && (modObj?.link_arquivo || item.link_arquivo)) {
            atual.linkArquivo = modObj?.link_arquivo || item.link_arquivo || "";
          }
          if (
            textoExcecao &&
            !atual.excecoes.some((e) => e.pedidoId === ped.id)
          ) {
            atual.excecoes.push({
              pedidoId: ped.id,
              numero: ped.numero,
              cliente: nomeCliente,
              texto: textoExcecao,
            });
          }
        } else {
          mapa.set(key, {
            key,
            tituloGrupo: `${colNome} · ${serCurta} · ${nomeBase}`,
            colegioNome: colNome,
            serieCurta: serCurta,
            serieNome: serNome,
            serieOrdem: serObj?.ordem || 1,
            trimestreNome: nomeBase,
            moduloOrdem: modObj?.ordem || idx + 1,
            linkArquivo: modObj?.link_arquivo || item.link_arquivo || "",
            pedidosRefs: [
              {
                pedidoId: ped.id,
                numero: ped.numero,
                cliente: nomeCliente,
              },
            ],
            excecoes: textoExcecao
              ? [
                  {
                    pedidoId: ped.id,
                    numero: ped.numero,
                    cliente: nomeCliente,
                    texto: textoExcecao,
                  },
                ]
              : [],
            itemIds: [item.id],
          });
        }
      });
    }

    return Array.from(mapa.values()).sort((a, b) => {
      const colCmp = a.colegioNome.localeCompare(b.colegioNome);
      if (colCmp !== 0) return colCmp;
      if (a.serieOrdem !== b.serieOrdem) return a.serieOrdem - b.serieOrdem;
      return a.moduloOrdem - b.moduloOrdem;
    });
  }, [pedidosBaseFiltrados, colegios, series, modulos]);

  // Agrupamento da visão "Imprimir por série" (pedidos pendentes: recebido + em_producao)
  const lotesImpressao = useMemo(() => {
    const mapa = new Map<
      string,
      {
        colegioId: string;
        colegioNome: string;
        serieId: string;
        serieNome: string;
        serieOrdem: number;
        moduloId: string;
        moduloNome: string;
        moduloOrdem: number;
        linkArquivo: string;
        copiasPendentes: number;
        pedidosRefs: { id: string; numero: string; responsavel: string }[];
        itemIds: string[];
      }
    >();

    const pendentes = pedidos.filter(
      (p) =>
        (p.status === "recebido" || p.status === "em_producao") &&
        (!filtroColegioLote || p.colegio_id === filtroColegioLote)
    );

    for (const ped of pendentes) {
      const colObj = colegios.find((c) => c.id === ped.colegio_id);
      const serObj = series.find((s) => s.id === ped.serie_id);
      const nomeCliente = ped.responsavel_nome || ped.aluno_nome || "Cliente";
      for (const item of ped.itens) {
        if (item.impresso) continue;
        const modObj = modulos.find((m) => m.id === item.modulo_id);
        const key = `${ped.colegio_id}::${ped.serie_id}::${item.modulo_id}::${item.nome_modulo}`;
        const atual = mapa.get(key);
        if (atual) {
          atual.copiasPendentes += 1;
          atual.itemIds.push(item.id);
          if (!atual.pedidosRefs.some((r) => r.id === ped.id)) {
            atual.pedidosRefs.push({
              id: ped.id,
              numero: ped.numero,
              responsavel: nomeCliente,
            });
          }
        } else {
          mapa.set(key, {
            colegioId: ped.colegio_id,
            colegioNome: colObj?.nome || ped.colegio_nome || "Colégio",
            serieId: ped.serie_id,
            serieNome: serObj?.nome || ped.serie_nome || "Série",
            serieOrdem: serObj?.ordem || 1,
            moduloId: item.modulo_id,
            moduloNome: item.nome_modulo,
            moduloOrdem: modObj?.ordem || 1,
            linkArquivo: modObj?.link_arquivo || item.link_arquivo || "",
            copiasPendentes: 1,
            pedidosRefs: [
              { id: ped.id, numero: ped.numero, responsavel: nomeCliente },
            ],
            itemIds: [item.id],
          });
        }
      }
    }

    return Array.from(mapa.values()).sort((a, b) => {
      const colCmp = a.colegioNome.localeCompare(b.colegioNome);
      if (colCmp !== 0) return colCmp;
      if (a.serieOrdem !== b.serieOrdem) return a.serieOrdem - b.serieOrdem;
      return a.moduloOrdem - b.moduloOrdem;
    });
  }, [pedidos, colegios, series, modulos, filtroColegioLote]);

  const totalCopiasPendentesGeral = useMemo(() => {
    let count = 0;
    for (const ped of pedidos) {
      if (ped.status === "recebido" || ped.status === "em_producao") {
        for (const item of ped.itens) {
          if (!item.impresso) count += 1;
        }
      }
    }
    return count;
  }, [pedidos]);

  const copiarCaminhoRede = async (idRef: string, caminho: string) => {
    try {
      await navigator.clipboard.writeText(caminho);
      setCaminhoCopiadoId(idRef);
      setTimeout(() => setCaminhoCopiadoId(null), 2500);
    } catch {
      exibirAviso("erro", `Caminho do arquivo: ${caminho}`);
    }
  };

  // Ações de Pedido
  const handleMudarStatus = async (
    pedido: Pedido,
    novoStatus: PedidoStatus
  ) => {
    const agora = new Date().toISOString();
    const statusAnterior = pedido.status;
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === pedido.id
          ? {
              ...p,
              status: novoStatus,
              pronto_em: novoStatus === "pronto" ? agora : p.pronto_em,
              entregue_em: novoStatus === "entregue" ? agora : p.entregue_em,
            }
          : p
      )
    );
    const res = await atualizarStatusPedidoAction(pedido.id, novoStatus);
    if (!res.ok) {
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedido.id ? { ...p, status: statusAnterior } : p
        )
      );
      exibirAviso("erro", res.erro || "Não foi possível alterar o status.");
    }
  };

  const abrirWhatsAppPronto = (pedido: Pedido) => {
    const colNome =
      colegios.find((c) => c.id === pedido.colegio_id)?.nome ||
      pedido.colegio_nome ||
      "";
    const serNome =
      series.find((s) => s.id === pedido.serie_id)?.nome ||
      pedido.serie_nome ||
      "";
    const msg = montarMensagemPronto(config.mensagem_pronto, {
      responsavel: pedido.responsavel_nome,
      aluno: pedido.aluno_nome,
      serie: serNome,
      colegio: colNome,
      numero: pedido.numero,
      endereco: config.endereco_retirada,
      horario: config.horario_retirada,
    });
    const url = gerarLinkWhatsApp(pedido.whatsapp, msg);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleProntoAvisarCliente = async (pedido: Pedido) => {
    // Abre a aba do WhatsApp de forma síncrona no clique para evitar bloqueio de pop-up
    abrirWhatsAppPronto(pedido);
    await handleMudarStatus(pedido, "pronto");
  };

  const handleTogglePago = async (pedido: Pedido) => {
    const novoPago = !pedido.pago;
    const pagoEmLocal = novoPago ? new Date().toISOString() : null;
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === pedido.id ? { ...p, pago: novoPago, pago_em: pagoEmLocal } : p
      )
    );
    const res = await alternarPagoPedidoAction(pedido.id, novoPago);
    if (!res.ok) {
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedido.id
            ? { ...p, pago: !novoPago, pago_em: pedido.pago_em ?? null }
            : p
        )
      );
      exibirAviso("erro", res.erro || "Erro ao atualizar pagamento.");
    } else if (res.pago_em !== undefined) {
      setPedidos((prev) =>
        prev.map((p) =>
          p.id === pedido.id ? { ...p, pago_em: res.pago_em ?? null } : p
        )
      );
    }
  };

  const handleToggleItemImpresso = async (
    pedidoId: string,
    itemId: string,
    atual: boolean
  ) => {
    const novoValor = !atual;
    const pedAlvo = pedidos.find((p) => p.id === pedidoId);
    if (pedAlvo && novoValor) {
      const todosImpressosApos = pedAlvo.itens.every((i) =>
        i.id === itemId ? true : i.impresso
      );
      if (
        todosImpressosApos &&
        pedAlvo.itens.length > 0 &&
        (pedAlvo.status === "recebido" || pedAlvo.status === "em_producao")
      ) {
        setToastPedidoPronto({
          pedidoId: pedAlvo.id,
          numero: pedAlvo.numero,
        });
      }
    } else if (!novoValor && toastPedidoPronto?.pedidoId === pedidoId) {
      setToastPedidoPronto(null);
    }

    setPedidos((prev) =>
      prev.map((p) =>
        p.id === pedidoId
          ? {
              ...p,
              itens: p.itens.map((i) =>
                i.id === itemId ? { ...i, impresso: novoValor } : i
              ),
            }
          : p
      )
    );
    const res = await alternarItemImpressoAction(pedidoId, itemId, novoValor);
    if (!res.ok) {
      exibirAviso("erro", res.erro || "Erro ao marcar item.");
    }
  };

  const handleMarcarLoteImpresso = async (
    itemIds: string[],
    descricaoLote: string
  ) => {
    const setIds = new Set(itemIds);
    setPedidos((prev) =>
      prev.map((p) => ({
        ...p,
        itens: p.itens.map((i) =>
          setIds.has(i.id) ? { ...i, impresso: true } : i
        ),
      }))
    );
    const res = await marcarLoteImpressoAction(itemIds);
    if (!res.ok) {
      exibirAviso("erro", res.erro || "Erro ao marcar lote como impresso.");
      return;
    }
    exibirAviso("ok", `Lote marcado como impresso: ${descricaoLote}`);
  };

  // Impressão de comanda / etiqueta para colar no pacote de apostilas do aluno
  const handleImprimirEtiqueta = (pedido: Pedido) => {
    const colNome =
      colegios.find((c) => c.id === pedido.colegio_id)?.nome ||
      pedido.colegio_nome ||
      "";
    const serNome =
      series.find((s) => s.id === pedido.serie_id)?.nome ||
      pedido.serie_nome ||
      "";
    const pagTexto = `${FORMA_PAGAMENTO_LABEL[pedido.forma_pagamento]}${
      pedido.parcelas ? ` (${pedido.parcelas}x)` : ""
    }`;

    const win = window.open("", "_blank", "width=460,height=640");
    if (!win) {
      exibirAviso(
        "erro",
        "Permita pop-ups no navegador para imprimir a comanda."
      );
      return;
    }

    const itensHtml = pedido.itens
      .map(
        (i) =>
          `<li style="padding:4px 0;border-bottom:1px dashed #ddd;display:flex;justify-content:space-between;">
            <span>[ ${i.impresso ? "X" : "&nbsp;"} ] ${escapeHtml(i.nome_modulo)}</span>
            <strong>${escapeHtml(formatCurrency(i.valor))}</strong>
          </li>`
      )
      .join("");

    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Etiqueta Pedido #${escapeHtml(pedido.numero)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #161616; margin: 20px; font-size: 13px; }
    .box { border: 2px solid #161616; border-radius: 10px; padding: 16px; max-width: 380px; margin: 0 auto; }
    .top { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #161616; padding-bottom: 10px; margin-bottom: 12px; }
    .num { font-size: 24px; font-weight: 900; }
    .tag { padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; text-transform: uppercase; border: 1px solid #161616; }
    .field { margin-bottom: 8px; }
    .label { font-size: 10px; text-transform: uppercase; color: #575757; font-weight: bold; }
    .val { font-size: 15px; font-weight: bold; }
    ul { list-style: none; padding: 0; margin: 10px 0; }
    .tot { border-top: 2px solid #161616; padding-top: 10px; margin-top: 10px; display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; }
  </style>
</head>
<body>
  <div class="box">
    <div class="top">
      <div>
        <div style="font-weight:900;font-size:15px;">${escapeHtml(config.nome_loja)}</div>
        <div style="font-size:11px;color:#575757;">Recebido em ${escapeHtml(formatDateTimeBR(pedido.criado_em))}</div>
      </div>
      <div class="num">#${escapeHtml(pedido.numero)}</div>
    </div>
    <div class="field">
      <div class="label">Cliente / Responsável</div>
      <div class="val">${escapeHtml(pedido.responsavel_nome || pedido.aluno_nome)}</div>
      <div style="font-size:12px;color:#575757;margin-top:2px;">WhatsApp: ${escapeHtml(maskWhatsApp(pedido.whatsapp))}</div>
    </div>
    <div class="field">
      <div class="label">Colégio / Série</div>
      <div class="val">${escapeHtml(colNome)} — ${escapeHtml(serNome)}</div>
    </div>
    <div class="field">
      <div class="label">Módulos (${pedido.itens.length})</div>
      <ul>${itensHtml}</ul>
    </div>
    ${
      pedido.observacao
        ? `<div class="field" style="background:#fff8cc;padding:8px;border-radius:6px;border:1px solid #ffd200;">
            <div class="label">Observação</div>
            <div>${escapeHtml(pedido.observacao)}</div>
          </div>`
        : ""
    }
    <div class="tot">
      <span>${escapeHtml(pagTexto)}</span>
      <span>${escapeHtml(formatCurrency(pedido.total))}</span>
    </div>
    <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
      <span class="tag">${pedido.pago ? "PAGO" : "COBRAR NA ENTREGA"}</span>
      <span style="font-size:11px;font-weight:bold;">Prev. Retirada: ${escapeHtml(formatDateBR(pedido.previsao_retirada))}</span>
    </div>
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  // Exportação para Relatório Excel (.xlsx) estilizado com as cores da marca RS Digital
  const handleExportarCSV = () => {
    const filtradosPeriodo = pedidos.filter((p) => {
      const dataCriacao = toLocalDateISO(p.criado_em);
      if (exportDataInicio && dataCriacao < exportDataInicio) return false;
      if (exportDataFim && dataCriacao > exportDataFim) return false;
      if (filtroColegio && p.colegio_id !== filtroColegio) return false;
      if (filtroSerie && p.serie_id !== filtroSerie) return false;
      return true;
    });

    const listaExportar = (
      filtradosPeriodo.length > 0 ? filtradosPeriodo : pedidos
    ).map((p) => ({
      ...p,
      colegio_nome:
        colegios.find((c) => c.id === p.colegio_id)?.nome ||
        p.colegio_nome ||
        "—",
      serie_nome:
        series.find((s) => s.id === p.serie_id)?.nome || p.serie_nome || "—",
    }));

    const mapTabLabel: Record<StatusTab, string> = {
      a_fazer: "A fazer (Fila de Produção)",
      prontos: "Prontos p/ Retirada",
      entregues: "Entregues",
      cancelados: "Cancelados",
      todos: "Todos os pedidos",
    };

    exportarRelatorioPedidosExcel({
      pedidos: listaExportar,
      config,
      dataInicio: exportDataInicio || undefined,
      dataFim: exportDataFim || undefined,
      filtroStatusLabel: mapTabLabel[statusTab] || "Todos",
    });
  };

  // --- Estados de Cadastros (Colégios, Séries, Módulos) ---
  const [colegioAtivoCadastro, setColegioAtivoCadastro] = useState<string>(
    initialColegios[0]?.id || ""
  );
  const [serieAtivaCadastro, setSerieAtivaCadastro] = useState<string>(
    initialSeries.find((s) => s.colegio_id === initialColegios[0]?.id)?.id || ""
  );

  // Colégio
  const [novoColegioNome, setNovoColegioNome] = useState("");
  const [editandoColegio, setEditandoColegio] = useState<Colegio | null>(null);
  const [mostrarFormColegio, setMostrarFormColegio] = useState(false);

  // Série (criação e edição)
  const [editandoSerie, setEditandoSerie] = useState<Serie | null>(null);
  const [novaSerieNome, setNovaSerieNome] = useState("");
  const [novaSerieOrdem, setNovaSerieOrdem] = useState(1);
  const [mostrarFormSerie, setMostrarFormSerie] = useState(false);
  const [filtroNivelSerie, setFiltroNivelSerie] = useState<
    "todas" | "fundamental" | "medio"
  >("todas");

  // Duplicação de Série
  const [duplicarModalSerie, setDuplicarModalSerie] = useState<Serie | null>(
    null
  );
  const [duplicarColegioDestino, setDuplicarColegioDestino] = useState("");
  const [duplicarNovoNome, setDuplicarNovoNome] = useState("");

  // Módulo
  const [mostrarFormModulo, setMostrarFormModulo] = useState(false);
  const [moduloVitrineAbertoId, setModuloVitrineAbertoId] = useState<
    string | null
  >(null);
  const [moduloForm, setModuloForm] = useState<{
    id?: string;
    nome: string;
    ordem: number;
    valor: number;
    link_arquivo: string;
    ativo: boolean;
    disciplinas: string[];
    livros: ModuloLivroItem[];
    capa_url: string;
  }>({
    nome: "",
    ordem: 1,
    valor: 300,
    link_arquivo: "",
    ativo: true,
    disciplinas: getDisciplinasPadraoPorSerie(),
    livros: getLivrosPadraoPorModulo("1º Trimestre", "1º ano", livros),
    capa_url: "preset:cmyk-cyan",
  });

  // Livro (Catálogo de Livros Didáticos & Paradidáticos dentro de Catálogo Escolar)
  const [abaCatalogo, setAbaCatalogo] = useState<"modulos" | "livros">(
    "modulos"
  );
  const [serieLivroReferencia, setSerieLivroReferencia] = useState<string>(
    SERIES_PADRAO_ESCOLARES[0]?.nome || "1º ano — Ensino Fundamental"
  );
  const [livroForm, setLivroForm] = useState<{
    id?: string;
    nome: string;
    categoria: "didatico" | "paradidatico";
    valor: number;
    ativo: boolean;
    capa_url: string;
  }>({
    nome: "",
    categoria: "didatico",
    valor: 50,
    ativo: true,
    capa_url: "",
  });
  const [filtroCategoriaLivro, setFiltroCategoriaLivro] = useState<
    "todos" | "didatico" | "paradidatico"
  >("todos");
  const [buscaLivro, setBuscaLivro] = useState<string>("");

  // Cupom
  const [cupomForm, setCupomForm] = useState<{
    id?: string;
    codigo: string;
    tipo: "percentual" | "valor";
    desconto: number;
    validade: string;
    limite_usos: string;
    ativo: boolean;
  }>({
    codigo: "",
    tipo: "percentual",
    desconto: 10,
    validade: "",
    limite_usos: "",
    ativo: true,
  });

  // Configuração
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // --- Estados de Faturamento, Custos, Investimentos e Perdas ---
  const [abaFinanceiro, setAbaFinanceiro] = useState<
    "fluxo" | "extrato" | "dre"
  >("fluxo");
  const [regimeFinanceiro, setRegimeFinanceiro] = useState<
    "competencia" | "caixa"
  >("competencia");
  const [filtroPagoExtrato, setFiltroPagoExtrato] = useState<
    "todos" | "pagos" | "pendentes"
  >("todos");
  const [fatDataInicio, setFatDataInicio] = useState<string>("");
  const [fatDataFim, setFatDataFim] = useState<string>("");
  const [buscaFinanceiro, setBuscaFinanceiro] = useState<string>("");
  const [filtroTipoLancamento, setFiltroTipoLancamento] = useState<
    "todos" | "entradas" | LancamentoTipo
  >("todos");
  const [filtroCategoriaLancamento, setFiltroCategoriaLancamento] =
    useState<string>("");
  const [modalLancamentoAberto, setModalLancamentoAberto] = useState(false);
  const [salvandoLancamento, setSalvandoLancamento] = useState(false);
  const [lancamentoForm, setLancamentoForm] = useState<{
    id?: string;
    data: string;
    tipo: LancamentoTipo;
    categoria: LancamentoCategoria;
    descricao: string;
    quantidade: number;
    valor_unitario: number;
    observacao: string;
  }>({
    data: toLocalDateISO(),
    tipo: "custo",
    categoria: "papel",
    descricao: "",
    quantidade: 1,
    valor_unitario: 0,
    observacao: "",
  });

  const abrirModalNovoLancamento = () => {
    setLancamentoForm({
      data: toLocalDateISO(),
      tipo: "custo",
      categoria: "papel",
      descricao: "",
      quantidade: 1,
      valor_unitario: 0,
      observacao: "",
    });
    setModalLancamentoAberto(true);
  };

  const abrirModalEditarLancamento = (l: LancamentoFinanceiro) => {
    setLancamentoForm({
      id: l.id,
      data: l.data,
      tipo: l.tipo,
      categoria: l.categoria,
      descricao: l.descricao,
      quantidade: l.quantidade,
      valor_unitario: l.valor_unitario,
      observacao: l.observacao || "",
    });
    setModalLancamentoAberto(true);
  };

  // Cálculo consolidado de Faturamento Real (SEM juros do cartão), Custos, Investimentos, Perdas e Lucro
  const resumoFinanceiro = useMemo(() => {
    const getDataPedidoRef = (p: Pedido) =>
      regimeFinanceiro === "caixa"
        ? toLocalDateISO(p.pago_em || p.criado_em)
        : toLocalDateISO(p.criado_em);

    const pedidosPeriodoTodos = pedidos.filter((p) => {
      if (p.status === "cancelado") return false;
      const d = getDataPedidoRef(p);
      if (fatDataInicio && d < fatDataInicio) return false;
      if (fatDataFim && d > fatDataFim) return false;
      return true;
    });

    const pedidosPeriodo =
      regimeFinanceiro === "caixa"
        ? pedidosPeriodoTodos.filter((p) => p.pago)
        : pedidosPeriodoTodos;

    const lancamentosPeriodo = lancamentos.filter((l) => {
      if (fatDataInicio && l.data < fatDataInicio) return false;
      if (fatDataFim && l.data > fatDataFim) return false;
      return true;
    });

    // Total a receber no período (sempre calculado sobre os pedidos não cancelados do período)
    let totalAReceberPeriodo = 0;
    let totalRecebidoCaixaPeriodo = 0;
    for (const p of pedidosPeriodoTodos) {
      const valReal = Math.max(0, p.total - (p.juros || 0));
      if (p.pago) {
        totalRecebidoCaixaPeriodo += valReal;
      } else {
        totalAReceberPeriodo += valReal;
      }
    }

    let faturamentoCobradoComJuros = 0;
    let totalJurosCartao = 0;
    let faturamentoBruto = 0; // Valor REAL sem juros do cartão (subtotal - desconto)
    let faturamentoPago = 0; // Valor REAL pago sem juros
    let faturamentoPendente = 0; // Valor REAL pendente sem juros
    let totalModulosVendidos = 0;

    const porFormaPagamento: Record<
      string,
      {
        qtd: number;
        cobrado: number;
        juros: number;
        total: number;
        pago: number;
      }
    > = {};

    const mapaPorColegio = new Map<
      string,
      {
        id: string;
        nome: string;
        pedidos: number;
        modulos: number;
        impressos: number;
        receita: number;
      }
    >();

    const mapaPorModulo = new Map<
      string,
      {
        nome: string;
        copias: number;
        impressos: number;
        receita: number;
      }
    >();

    for (const p of pedidosPeriodo) {
      const jurosPedido = p.juros || 0;
      const valorRealPedido = Math.max(0, p.total - jurosPedido);

      faturamentoCobradoComJuros += p.total;
      totalJurosCartao += jurosPedido;
      faturamentoBruto += valorRealPedido;

      if (p.pago) {
        faturamentoPago += valorRealPedido;
      } else {
        faturamentoPendente += valorRealPedido;
      }
      totalModulosVendidos += p.itens.length;

      // Agrupamento por Colégio
      const colNome =
        colegios.find((c) => c.id === p.colegio_id)?.nome ||
        p.colegio_nome ||
        "Outros";
      const colKey = p.colegio_id || colNome;
      const colAtual = mapaPorColegio.get(colKey) || {
        id: colKey,
        nome: colNome,
        pedidos: 0,
        modulos: 0,
        impressos: 0,
        receita: 0,
      };
      colAtual.pedidos += 1;
      colAtual.modulos += p.itens.length;
      colAtual.impressos += p.itens.filter((i) => i.impresso).length;
      colAtual.receita += valorRealPedido;
      mapaPorColegio.set(colKey, colAtual);

      // Agrupamento por Módulo (1º Trimestre, 2º Trimestre, etc.)
      for (const item of p.itens) {
        const modNome = item.nome_modulo || "Módulo";
        const modAtual = mapaPorModulo.get(modNome) || {
          nome: modNome,
          copias: 0,
          impressos: 0,
          receita: 0,
        };
        modAtual.copias += 1;
        if (item.impresso) modAtual.impressos += 1;
        modAtual.receita += item.valor;
        mapaPorModulo.set(modNome, modAtual);
      }

      const fp = p.forma_pagamento;
      if (!porFormaPagamento[fp]) {
        porFormaPagamento[fp] = {
          qtd: 0,
          cobrado: 0,
          juros: 0,
          total: 0,
          pago: 0,
        };
      }
      porFormaPagamento[fp].qtd += 1;
      porFormaPagamento[fp].cobrado += p.total;
      porFormaPagamento[fp].juros += jurosPedido;
      porFormaPagamento[fp].total += valorRealPedido;
      if (p.pago) porFormaPagamento[fp].pago += valorRealPedido;
    }

    const rankingColegios = Array.from(mapaPorColegio.values()).sort(
      (a, b) => b.receita - a.receita
    );
    const rankingModulos = Array.from(mapaPorModulo.values()).sort(
      (a, b) => b.copias - a.copias || b.receita - a.receita
    );

    let totalCustos = 0;
    let totalInvestimentos = 0;
    let totalPerdas = 0;

    const porCategoria: Record<LancamentoCategoria, number> = {
      papel: 0,
      tinta: 0,
      impressora: 0,
      materiais: 0,
      equipamentos: 0,
      perda_impressao: 0,
      outros: 0,
    };

    for (const l of lancamentosPeriodo) {
      if (l.tipo === "custo") totalCustos += l.valor_total;
      if (l.tipo === "investimento") totalInvestimentos += l.valor_total;
      if (l.tipo === "perda") totalPerdas += l.valor_total;
      porCategoria[l.categoria] =
        (porCategoria[l.categoria] || 0) + l.valor_total;
    }

    const totalSaidas = totalCustos + totalInvestimentos + totalPerdas;
    const lucroOperacional = faturamentoBruto - totalCustos - totalPerdas;
    const margemOperacional =
      faturamentoBruto > 0 ? (lucroOperacional / faturamentoBruto) * 100 : 0;
    const saldoLiquidoFinal = lucroOperacional - totalInvestimentos;
    const margemLiquida =
      faturamentoBruto > 0 ? (saldoLiquidoFinal / faturamentoBruto) * 100 : 0;
    const custoMedioPorModulo =
      totalModulosVendidos > 0
        ? (totalCustos + totalPerdas) / totalModulosVendidos
        : 0;
    const taxaPerdaSobreReceita =
      faturamentoBruto > 0 ? (totalPerdas / faturamentoBruto) * 100 : 0;

    // Monta extrato unificado de movimentações (Entradas de Pedidos s/ juros + Saídas de Lançamentos)
    type ItemExtrato = {
      id: string;
      data: string;
      natureza: "entrada" | "saida";
      tipoKey: "entradas" | LancamentoTipo;
      tipoLabel: string;
      categoriaKey: string;
      categoriaLabel: string;
      descricao: string;
      subtitulo: string;
      detalheCalculo: string;
      valorReal: number;
      valorCobrado?: number;
      jurosAbatido?: number;
      pago?: boolean;
      lancamentoOriginal?: LancamentoFinanceiro;
      pedidoOriginal?: Pedido;
    };

    const itensExtrato: ItemExtrato[] = [];

    for (const p of pedidosPeriodo) {
      const jurosPedido = p.juros || 0;
      const valorRealPedido = Math.max(0, p.total - jurosPedido);
      const colNome =
        colegios.find((c) => c.id === p.colegio_id)?.nome ||
        p.colegio_nome ||
        "";
      const serNome =
        series.find((s) => s.id === p.serie_id)?.nome || p.serie_nome || "";
      const fpLabel = `${FORMA_PAGAMENTO_LABEL[p.forma_pagamento]}${
        p.parcelas ? ` (${p.parcelas}x)` : ""
      }`;

      itensExtrato.push({
        id: `ped-${p.id}`,
        data: getDataPedidoRef(p),
        natureza: "entrada",
        tipoKey: "entradas",
        tipoLabel: p.pago ? "Receita (Pago)" : "Receita (A receber)",
        categoriaKey: "venda_pedido",
        categoriaLabel: fpLabel,
        descricao: `Pedido #${p.numero} — ${p.responsavel_nome || p.aluno_nome}`,
        subtitulo: `${colNome} · ${serNome} (${p.itens.length} ${
          p.itens.length === 1 ? "módulo" : "módulos"
        })`,
        detalheCalculo:
          jurosPedido > 0
            ? `Cobrado ${formatCurrency(p.total)} (− ${formatCurrency(jurosPedido)} juros cartão)`
            : `Venda s/ juros`,
        valorReal: valorRealPedido,
        valorCobrado: p.total,
        jurosAbatido: jurosPedido,
        pago: p.pago,
        pedidoOriginal: p,
      });
    }

    for (const l of lancamentosPeriodo) {
      itensExtrato.push({
        id: `lanc-${l.id}`,
        data: l.data,
        natureza: "saida",
        tipoKey: l.tipo,
        tipoLabel: LANCAMENTO_TIPO_LABEL[l.tipo],
        categoriaKey: l.categoria,
        categoriaLabel: LANCAMENTO_CATEGORIA_LABEL[l.categoria],
        descricao: l.descricao,
        subtitulo: l.observacao || "Lançamento manual de despesa",
        detalheCalculo: `${l.quantidade} × ${formatCurrency(l.valor_unitario)}`,
        valorReal: l.valor_total,
        lancamentoOriginal: l,
      });
    }

    itensExtrato.sort((a, b) => b.data.localeCompare(a.data));

    const extratoFiltrado = itensExtrato.filter((item) => {
      if (
        filtroTipoLancamento !== "todos" &&
        item.tipoKey !== filtroTipoLancamento
      ) {
        return false;
      }
      if (
        filtroCategoriaLancamento &&
        item.categoriaKey !== filtroCategoriaLancamento
      ) {
        return false;
      }
      if (filtroPagoExtrato === "pagos") {
        if (item.natureza === "entrada" && !item.pago) return false;
      } else if (filtroPagoExtrato === "pendentes") {
        if (item.natureza !== "entrada" || item.pago) return false;
      }
      if (buscaFinanceiro.trim()) {
        const q = buscaFinanceiro.trim().toLowerCase();
        const matchDesc = item.descricao.toLowerCase().includes(q);
        const matchSub = item.subtitulo.toLowerCase().includes(q);
        const matchCat = item.categoriaLabel.toLowerCase().includes(q);
        if (!matchDesc && !matchSub && !matchCat) return false;
      }
      return true;
    });

    let somaEntradasExtrato = 0;
    let somaSaidasExtrato = 0;
    for (const item of extratoFiltrado) {
      if (item.natureza === "entrada") somaEntradasExtrato += item.valorReal;
      else somaSaidasExtrato += item.valorReal;
    }

    const lancamentosFiltradosTabela = lancamentosPeriodo.filter((l) => {
      if (
        filtroTipoLancamento !== "todos" &&
        filtroTipoLancamento !== "entradas" &&
        l.tipo !== filtroTipoLancamento
      ) {
        return false;
      }
      if (
        filtroCategoriaLancamento &&
        l.categoria !== filtroCategoriaLancamento
      ) {
        return false;
      }
      return true;
    });

    // Agrupamento cronológico por data para o Gráfico de Fluxo de Caixa
    const mapaDiario = new Map<
      string,
      { data: string; entradas: number; saidas: number }
    >();
    for (const item of itensExtrato) {
      const atual = mapaDiario.get(item.data) || {
        data: item.data,
        entradas: 0,
        saidas: 0,
      };
      if (item.natureza === "entrada") {
        atual.entradas += item.valorReal;
      } else {
        atual.saidas += item.valorReal;
      }
      mapaDiario.set(item.data, atual);
    }
    const serieDiariaFluxo = Array.from(mapaDiario.values()).sort((a, b) =>
      a.data.localeCompare(b.data)
    );

    return {
      pedidosCount: pedidosPeriodo.length,
      lancamentosCount: lancamentosPeriodo.length,
      totalModulosVendidos,
      faturamentoCobradoComJuros,
      totalJurosCartao,
      faturamentoBruto,
      faturamentoPago: totalRecebidoCaixaPeriodo,
      faturamentoPendente: totalAReceberPeriodo,
      totalCustos,
      totalInvestimentos,
      totalPerdas,
      totalSaidas,
      lucroOperacional,
      margemOperacional,
      saldoLiquidoFinal,
      saldoRealCaixa: totalRecebidoCaixaPeriodo - totalSaidas,
      margemLiquida,
      custoMedioPorModulo,
      taxaPerdaSobreReceita,
      porCategoria,
      porFormaPagamento,
      rankingColegios,
      rankingModulos,
      serieDiariaFluxo,
      extratoFiltrado,
      somaEntradasExtrato,
      somaSaidasExtrato,
      lancamentosFiltradosTabela,
    };
  }, [
    pedidos,
    lancamentos,
    colegios,
    series,
    regimeFinanceiro,
    fatDataInicio,
    fatDataFim,
    filtroTipoLancamento,
    filtroCategoriaLancamento,
    filtroPagoExtrato,
    buscaFinanceiro,
  ]);

  const handleExportarFinanceiroCSV = () => {
    exportarRelatorioExtratoExcel({
      extrato: resumoFinanceiro.extratoFiltrado,
      resumo: {
        faturamentoCobradoComJuros: resumoFinanceiro.faturamentoCobradoComJuros,
        totalJurosCartao: resumoFinanceiro.totalJurosCartao,
        faturamentoBruto: resumoFinanceiro.faturamentoBruto,
        faturamentoPago: resumoFinanceiro.faturamentoPago,
        faturamentoPendente: resumoFinanceiro.faturamentoPendente,
        totalCustos: resumoFinanceiro.totalCustos,
        totalPerdas: resumoFinanceiro.totalPerdas,
        totalInvestimentos: resumoFinanceiro.totalInvestimentos,
        totalSaidas: resumoFinanceiro.totalSaidas,
        lucroOperacional: resumoFinanceiro.lucroOperacional,
        margemOperacional: resumoFinanceiro.margemOperacional,
        saldoLiquidoFinal: resumoFinanceiro.saldoLiquidoFinal,
        margemLiquida: resumoFinanceiro.margemLiquida,
        somaEntradasExtrato: resumoFinanceiro.somaEntradasExtrato,
        somaSaidasExtrato: resumoFinanceiro.somaSaidasExtrato,
        porFormaPagamento: resumoFinanceiro.porFormaPagamento,
        porCategoria: resumoFinanceiro.porCategoria,
      },
      config,
      dataInicio: fatDataInicio || undefined,
      dataFim: fatDataFim || undefined,
    });
  };

  // Funções auxiliares de reordenação rápida (↑ / ↓)
  const moverOrdemSerie = async (
    listaOrdenada: Serie[],
    indexAtual: number,
    direcao: -1 | 1
  ) => {
    const novoIndex = indexAtual + direcao;
    if (novoIndex < 0 || novoIndex >= listaOrdenada.length) return;
    const itemA = listaOrdenada[indexAtual];
    const itemB = listaOrdenada[novoIndex];
    const ordemA = indexAtual + 1;
    const ordemB = novoIndex + 1;

    setSeries((prev) =>
      prev.map((s) => {
        if (s.id === itemA.id) return { ...s, ordem: ordemB };
        if (s.id === itemB.id) return { ...s, ordem: ordemA };
        return s;
      })
    );

    await Promise.all([
      salvarSerieAction({ ...itemA, ordem: ordemB }),
      salvarSerieAction({ ...itemB, ordem: ordemA }),
    ]);
  };

  const moverOrdemModulo = async (
    listaOrdenada: Modulo[],
    indexAtual: number,
    direcao: -1 | 1
  ) => {
    const novoIndex = indexAtual + direcao;
    if (novoIndex < 0 || novoIndex >= listaOrdenada.length) return;
    const itemA = listaOrdenada[indexAtual];
    const itemB = listaOrdenada[novoIndex];
    const ordemA = indexAtual + 1;
    const ordemB = novoIndex + 1;

    setModulos((prev) =>
      prev.map((m) => {
        if (m.id === itemA.id) return { ...m, ordem: ordemB };
        if (m.id === itemB.id) return { ...m, ordem: ordemA };
        return m;
      })
    );

    await Promise.all([
      salvarModuloAction({ ...itemA, ordem: ordemB }),
      salvarModuloAction({ ...itemB, ordem: ordemA }),
    ]);
  };

  const seriesDoColegioAtivo = useMemo(
    () =>
      series
        .filter((s) => s.colegio_id === colegioAtivoCadastro)
        .sort((a, b) => a.ordem - b.ordem),
    [series, colegioAtivoCadastro]
  );

  const modulosDaSerieAtiva = useMemo(
    () =>
      modulos
        .filter((m) => m.serie_id === serieAtivaCadastro)
        .sort((a, b) => a.ordem - b.ordem),
    [modulos, serieAtivaCadastro]
  );

  const hojeISO = toLocalDateISO();

  const navItems: {
    id: AdminSection;
    label: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeTone?: "cyan" | "yellow" | "offline";
  }[] = [
    {
      id: "pedidos",
      label: "Central de Pedidos",
      desc: "Recebimento, fila de produção, Kanban e entregas",
      icon: ClipboardList,
      badge: kpis.aFazer > 0 ? kpis.aFazer : undefined,
      badgeTone: "cyan",
    },
    {
      id: "orcamentos",
      label: "Orçamentos",
      desc: "Criação de orçamentos pelo Admin e solicitações recebidas dos clientes",
      icon: FileText,
      badge:
        orcamentos.filter(
          (o) => o.status === "solicitado" || o.status === "enviado"
        ).length > 0
          ? orcamentos.filter(
              (o) => o.status === "solicitado" || o.status === "enviado"
            ).length
          : undefined,
      badgeTone: orcamentos.some((o) => o.status === "solicitado")
        ? "yellow"
        : "cyan",
    },
    {
      id: "imprimir_serie",
      label: "Imprimir por Série",
      desc: "Agrupamento inteligente de cópias pendentes em lote",
      icon: Printer,
      badge:
        totalCopiasPendentesGeral > 0 ? totalCopiasPendentesGeral : undefined,
      badgeTone: "yellow",
    },
    {
      id: "faturamento",
      label: "Faturamento & Custos",
      desc: "Receita, custos, investimentos e perdas",
      icon: TrendingUp,
    },
    {
      id: "contas_pagar",
      label: "Contas a Pagar",
      desc: "Controle de boletos, fornecedores e vencimentos (Offline)",
      icon: DollarSign,
      badge: "OFF",
      badgeTone: "offline",
    },
    {
      id: "cadastros",
      label: "Catálogo Escolar",
      desc: "Colégios, séries, módulos, livros e capas por série",
      icon: Layers,
    },
    {
      id: "cupons",
      label: "Cupons de Desconto",
      desc: "Campanhas promocionais, validades e limites de uso",
      icon: Tag,
    },
    {
      id: "config",
      label: "Configurações",
      desc: "Dados da gráfica, prazos, juros e mensagem WhatsApp",
      icon: Settings,
    },
  ];

  const secaoAtualMeta =
    navItems.find((item) => item.id === section) || navItems[0];

  return (
    <>
      <SplashScreen triggerKey={`${section}-${moduloVitrineAbertoId || ""}`} />

      <div className="min-h-screen bg-[#F4F6F9] text-brand-ink flex flex-col lg:flex-row">
        {/* =================================================================
            SIDEBAR ESCURA EXECUTIVA (#161616) - DESKTOP (RECOLHÍVEL)
        ================================================================= */}
        <aside
          className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-brand-ink text-white z-30 select-none transition-all duration-200 ${
            sidebarRecolhida ? "lg:w-[68px]" : "lg:w-60"
          }`}
        >
          {/* Topo CMYK */}
          <div className="h-1 w-full flex">
            <div className="flex-1 bg-brand-cyan" />
            <div className="flex-1 bg-brand-magenta" />
            <div className="flex-1 bg-brand-yellow" />
          </div>

          <div
            className={`py-4 flex items-center border-b border-white/10 ${
              sidebarRecolhida
                ? "px-2 justify-center"
                : "px-4 justify-between"
            }`}
          >
            {sidebarRecolhida ? (
              <button
                type="button"
                onClick={() => setSidebarRecolhida(false)}
                title="Expandir menu lateral"
                className="p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <LogoIcon size={32} className="rounded-[7px]" />
              </button>
            ) : (
              <>
                <BrandLogo size="sm" theme="dark" />
                <button
                  type="button"
                  onClick={() => setSidebarRecolhida(true)}
                  title="Recolher menu lateral"
                  className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Menu Principal */}
          <nav
            className={`flex-1 py-4 overflow-y-auto flex flex-col justify-between ${
              sidebarRecolhida ? "px-2" : "px-3"
            }`}
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const ativo = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSection(item.id)}
                      title={
                        sidebarRecolhida
                          ? `${item.label}${item.badge !== undefined ? ` (${item.badge})` : ""}`
                          : undefined
                      }
                      className={`w-full relative flex items-center rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        sidebarRecolhida
                          ? "justify-center p-2.5"
                          : "justify-between gap-2.5 px-3 py-2"
                      } ${
                        ativo
                          ? "bg-brand-magenta text-white shadow-sm shadow-brand-magenta/20"
                          : "text-white/70 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className="w-4 h-4 shrink-0" />
                        {!sidebarRecolhida && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </span>
                      {!sidebarRecolhida && item.badge !== undefined && (
                        <span
                          className={`min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center text-[10px] font-semibold rounded-full ${
                            ativo
                              ? "bg-white text-brand-magenta"
                              : item.badgeTone === "offline"
                                ? "bg-white/10 text-white/50 border border-white/15"
                                : item.badgeTone === "yellow"
                                  ? "bg-brand-yellow text-brand-ink"
                                  : "bg-brand-cyan text-white"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {sidebarRecolhida &&
                        item.badge !== undefined &&
                        item.badgeTone !== "offline" && (
                          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-yellow" />
                        )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-white/10 space-y-1">
                <a
                  href="/pedido"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir página pública de pedidos"
                  className={`w-full flex items-center rounded-lg text-xs font-medium text-white/75 hover:text-white hover:bg-white/5 transition-colors ${
                    sidebarRecolhida
                      ? "justify-center p-2.5"
                      : "justify-between px-3 py-2"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <ExternalLink className="w-4 h-4 text-brand-cyan shrink-0" />
                    {!sidebarRecolhida && <span>Página de Pedidos</span>}
                  </span>
                  {!sidebarRecolhida && (
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  )}
                </a>

                <a
                  href="/orcamento"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir página de construção de orçamento"
                  className={`w-full flex items-center rounded-lg text-xs font-medium text-white/75 hover:text-white hover:bg-white/5 transition-colors ${
                    sidebarRecolhida
                      ? "justify-center p-2.5"
                      : "justify-between px-3 py-2"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-brand-yellow shrink-0" />
                    {!sidebarRecolhida && <span>Página de Orçamento</span>}
                  </span>
                  {!sidebarRecolhida && (
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  )}
                </a>
              </div>
            </div>
          </nav>

          {/* Rodapé da Sidebar */}
          <div
            className={`border-t border-white/10 bg-black/20 ${
              sidebarRecolhida ? "p-2.5 flex flex-col items-center gap-2" : "p-3.5 space-y-2.5"
            }`}
          >
            {!sidebarRecolhida && (
              <div className="flex items-center gap-2 text-[11px]">
                <Database className="w-3.5 h-3.5 text-brand-yellow shrink-0" />
                <span className="text-white/80 truncate">
                  {modoSupabase ? "Supabase" : "Banco Local"}
                </span>
              </div>
            )}

            <div
              className={`flex items-center ${
                sidebarRecolhida ? "justify-center" : "justify-between gap-2"
              }`}
            >
              {!sidebarRecolhida && (
                <p className="text-[11px] font-medium text-white/80 truncate">
                  {adminEmail}
                </p>
              )}
              <button
                type="button"
                onClick={async () => {
                  await logoutAdminAction();
                  router.refresh();
                }}
                className="p-2 rounded-lg bg-white/10 hover:bg-brand-magenta text-white transition-colors shrink-0 cursor-pointer"
                title="Sair do painel"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>

        {/* =================================================================
            ÁREA PRINCIPAL DE CONTEÚDO
        ================================================================= */}
        <div
          className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
            sidebarRecolhida ? "lg:pl-[68px]" : "lg:pl-60"
          }`}
        >
          {/* Header Mobile + Topbar Executiva */}
          <header className="bg-white border-b border-brand-border sticky top-0 z-20">
            {/* Barra Mobile Escura */}
            <div className="lg:hidden bg-brand-ink text-white px-4 py-3 flex items-center justify-between">
              <BrandLogo size="sm" theme="dark" />
              <div className="flex items-center gap-2">
                <a
                  href="/pedido"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white/10 text-white inline-flex items-center gap-1"
                >
                  <span>/pedido</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    await logoutAdminAction();
                    router.refresh();
                  }}
                  className="p-1.5 rounded-lg bg-white/10 text-white"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Navegação Mobile Horizontal */}
            <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto px-4 py-2 bg-white border-b border-brand-border">
              {navItems.map((item) => {
                const Icon = item.icon;
                const ativo = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                      ativo
                        ? "bg-brand-magenta text-white"
                        : "bg-gray-100 text-brand-muted"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={`px-1.5 py-0.2 text-[10px] rounded-full font-extrabold ${
                          item.badgeTone === "offline"
                            ? ativo
                              ? "bg-white/20 text-white"
                              : "bg-gray-200 text-brand-muted"
                            : "bg-brand-yellow text-brand-ink"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Barra de Título da Seção + Ações Globais */}
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSidebarRecolhida((v) => !v)}
                  title={
                    sidebarRecolhida
                      ? "Expandir menu lateral"
                      : "Recolher menu lateral"
                  }
                  className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-lg border border-brand-border/80 bg-white hover:bg-gray-50 text-brand-muted hover:text-brand-ink transition-colors cursor-pointer"
                >
                  {sidebarRecolhida ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronLeft className="w-4 h-4" />
                  )}
                </button>
                <h1 className="text-lg font-semibold text-brand-ink tracking-tight">
                  {secaoAtualMeta.label}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSincronizarDados}
                  disabled={sincronizando}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-brand-ink bg-white hover:bg-gray-50 border border-brand-border rounded-xl shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                  title="Buscar novos pedidos enviados na página pública"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-brand-cyan ${
                      sincronizando ? "animate-spin" : ""
                    }`}
                  />
                  <span>
                    {sincronizando ? "Atualizando..." : "Atualizar"}
                  </span>
                </button>

                {section === "pedidos" && (
                  <div className="inline-flex bg-gray-100 p-1 rounded-xl border border-brand-border/60">
                    <button
                      type="button"
                      onClick={() => setViewMode("lista")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        viewMode === "lista"
                          ? "bg-white text-brand-ink shadow-xs"
                          : "text-brand-muted hover:text-brand-ink"
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      Pedidos
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("lotes")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        viewMode === "lotes"
                          ? "bg-white text-brand-ink shadow-xs"
                          : "text-brand-muted hover:text-brand-ink"
                      }`}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Lotes</span>
                      {lotesAgrupadosCentral.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-brand-cyan/15 text-brand-cyan text-[10px] font-extrabold tabular-nums">
                          {lotesAgrupadosCentral.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("kanban")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        viewMode === "kanban"
                          ? "bg-white text-brand-ink shadow-xs"
                          : "text-brand-muted hover:text-brand-ink"
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Kanban
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Conteúdo Principal */}
          <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Banner de feedback de operações */}
            {avisoPainel && (
              <div
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs font-semibold shadow-sm ${
                  avisoPainel.tipo === "ok"
                    ? "bg-brand-cyan/10 border-brand-cyan/40 text-brand-ink"
                    : "bg-brand-magenta/10 border-brand-magenta/40 text-brand-magenta"
                }`}
              >
                <div className="flex items-center gap-2">
                  {avisoPainel.tipo === "ok" ? (
                    <CheckCircle2 className="w-4 h-4 text-brand-cyan shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-brand-magenta shrink-0" />
                  )}
                  <span>{avisoPainel.texto}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAvisoPainel(null)}
                  className="p-0.5 text-brand-muted hover:text-brand-ink"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ===============================================================
                SEÇÃO 1: CENTRAL DE PEDIDOS (KPIS + LISTA + KANBAN)
            =============================================================== */}
            {section === "pedidos" && (
              <>
                {/* Backdrop invisível para fechar popovers da tabela ao clicar fora */}
                {(moduloPopoverId ||
                  acaoPopoverId ||
                  exportPopoverAberto ||
                  filtrosPopoverAberto) && (
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => {
                      setModuloPopoverId(null);
                      setAcaoPopoverId(null);
                      setExportPopoverAberto(false);
                      setFiltrosPopoverAberto(false);
                    }}
                  />
                )}

                {/* Toast Automático: Todos os itens impressos */}
                {toastPedidoPronto && (
                  <div className="fixed bottom-5 right-5 z-50 bg-brand-ink text-white rounded-2xl shadow-2xl border border-white/15 p-4 flex flex-wrap items-center gap-3 max-w-md">
                    <div className="flex-1 min-w-[200px] text-xs font-semibold">
                      Todos os itens impressos. Marcar pedido #
                      {toastPedidoPronto.numero} como pronto?
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const alvo = pedidos.find(
                            (x) => x.id === toastPedidoPronto.pedidoId
                          );
                          setToastPedidoPronto(null);
                          if (alvo) {
                            await handleMudarStatus(alvo, "pronto");
                            exibirAviso(
                              "ok",
                              `Pedido #${alvo.numero} marcado como pronto!`
                            );
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        Marcar pronto
                      </button>
                      <button
                        type="button"
                        onClick={() => setToastPedidoPronto(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Agora não
                      </button>
                    </div>
                  </div>
                )}

                {/* SUPERFÍCIE PRINCIPAL: BARRA ÚNICA LIMPA + LISTA / LOTES */}
                <div className="bg-white border border-brand-border/80 rounded-2xl shadow-2xs">
                  {/* Barra Única: Abas à esquerda · Busca + Filtros + Exportar à direita */}
                  <div
                    className={`px-4 flex flex-wrap items-center justify-between gap-3 ${
                      viewMode !== "kanban"
                        ? "border-b border-brand-border/70"
                        : ""
                    }`}
                  >
                    {viewMode === "lista" ? (
                      <div className="flex items-center gap-0.5 overflow-x-auto -mb-px">
                        {(
                          [
                            {
                              id: "a_fazer",
                              label: "Fila",
                              count: kpis.aFazer,
                            },
                            {
                              id: "prontos",
                              label: "Prontos",
                              count: kpis.prontos,
                            },
                            {
                              id: "entregues",
                              label: "Entregues",
                              count: kpis.entregues,
                            },
                            {
                              id: "cancelados",
                              label: "Cancelados",
                              count: kpis.cancelados,
                            },
                            {
                              id: "todos",
                              label: "Todos",
                              count: pedidos.length,
                            },
                          ] as { id: StatusTab; label: string; count: number }[]
                        ).map((tab) => {
                          const ativa =
                            statusTab === tab.id && filtroCardTopo === "nenhum";
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setFiltroCardTopo("nenhum");
                                setStatusTab(tab.id);
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-3 text-xs border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                                ativa
                                  ? "border-brand-ink text-brand-ink font-semibold"
                                  : "border-transparent text-brand-muted hover:text-brand-ink font-medium"
                              }`}
                            >
                              <span>{tab.label}</span>
                              <span
                                className={`text-[11px] tabular-nums ${
                                  ativa
                                    ? "text-brand-ink font-semibold"
                                    : "text-brand-muted/80"
                                }`}
                              >
                                {tab.count}
                              </span>
                            </button>
                          );
                        })}

                        {(kpis.atrasados > 0 || kpis.vencemHojeAmanha > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setStatusTab("a_fazer");
                              setFiltroCardTopo((atual) =>
                                atual === "urgentes" ? "nenhum" : "urgentes"
                              );
                            }}
                            className={`ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                              filtroCardTopo === "urgentes"
                                ? "bg-amber-100 text-amber-800"
                                : "text-amber-700 hover:bg-amber-50"
                            }`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>
                              Prazo curto (
                              {kpis.atrasados + kpis.vencemHojeAmanha})
                            </span>
                          </button>
                        )}
                      </div>
                    ) : viewMode === "lotes" ? (
                      <div className="py-3 text-xs font-medium text-brand-ink flex items-center gap-2">
                        <Printer className="w-3.5 h-3.5 text-brand-cyan" />
                        <span>Lotes pendentes</span>
                        <span className="text-brand-muted tabular-nums">
                          · {kpis.modulosPendentesFila}
                        </span>
                      </div>
                    ) : (
                      <div className="py-3 text-xs text-brand-muted flex items-center gap-2">
                        <LayoutGrid className="w-3.5 h-3.5 text-brand-ink" />
                        <span className="font-medium text-brand-ink">
                          Fluxo de produção
                        </span>
                        <span>· arraste os cartões para avançar etapas</span>
                      </div>
                    )}

                    {/* Controles discretos à direita: Busca + Filtros (Popover) + Exportar */}
                    <div className="flex flex-wrap items-center gap-2 py-2">
                      <div className="relative w-48 sm:w-56">
                        <Search className="w-3.5 h-3.5 text-brand-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Buscar pedido ou cliente..."
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#F8FAFC] focus:bg-white border border-brand-border/80 rounded-lg focus:outline-none focus:border-brand-ink transition-colors"
                        />
                        {busca && (
                          <button
                            type="button"
                            onClick={() => setBusca("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-ink cursor-pointer"
                            title="Limpar busca"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Botão único de Filtros com Popover limpo */}
                      {(() => {
                        const qtdFiltrosAtivos =
                          (filtroColegio ? 1 : 0) +
                          (filtroSerie ? 1 : 0) +
                          (filtroPagamento !== "todos" ? 1 : 0) +
                          (ordenacaoPedidos !== "prazo" ? 1 : 0);
                        return (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => {
                                setModuloPopoverId(null);
                                setAcaoPopoverId(null);
                                setExportPopoverAberto(false);
                                setFiltrosPopoverAberto((v) => !v);
                              }}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                                qtdFiltrosAtivos > 0 || filtrosPopoverAberto
                                  ? "border-brand-ink text-brand-ink bg-gray-50"
                                  : "border-brand-border/80 text-brand-muted hover:text-brand-ink bg-white"
                              }`}
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              <span>Filtros</span>
                              {qtdFiltrosAtivos > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full bg-brand-ink text-white text-[10px] font-semibold tabular-nums">
                                  {qtdFiltrosAtivos}
                                </span>
                              )}
                            </button>

                            {filtrosPopoverAberto && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1.5 z-30 w-64 bg-white border border-brand-border rounded-xl shadow-xl p-3.5 space-y-3 text-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-brand-ink">
                                    Filtrar pedidos
                                  </span>
                                  {qtdFiltrosAtivos > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFiltroColegio("");
                                        setFiltroSerie("");
                                        setFiltroPagamento("todos");
                                        setOrdenacaoPedidos("prazo");
                                      }}
                                      className="text-[11px] text-brand-muted hover:text-brand-ink underline cursor-pointer"
                                    >
                                      Limpar
                                    </button>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[11px] text-brand-muted">
                                    Colégio
                                  </label>
                                  <select
                                    value={filtroColegio}
                                    onChange={(e) => {
                                      setFiltroColegio(e.target.value);
                                      setFiltroSerie("");
                                    }}
                                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-brand-border rounded-lg text-brand-ink cursor-pointer"
                                  >
                                    <option value="">Todos</option>
                                    {colegios.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.nome}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[11px] text-brand-muted">
                                    Série
                                  </label>
                                  <select
                                    value={filtroSerie}
                                    onChange={(e) =>
                                      setFiltroSerie(e.target.value)
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-brand-border rounded-lg text-brand-ink cursor-pointer"
                                  >
                                    <option value="">Todas</option>
                                    {series
                                      .filter(
                                        (s) =>
                                          !filtroColegio ||
                                          s.colegio_id === filtroColegio
                                      )
                                      .map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {formatarSerieCurta(s.nome)}
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[11px] text-brand-muted">
                                    Pagamento
                                  </label>
                                  <select
                                    value={filtroPagamento}
                                    onChange={(e) =>
                                      setFiltroPagamento(
                                        e.target.value as
                                          | "todos"
                                          | "pagos"
                                          | "pendentes"
                                      )
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-brand-border rounded-lg text-brand-ink cursor-pointer"
                                  >
                                    <option value="todos">Todos</option>
                                    <option value="pagos">Pagos</option>
                                    <option value="pendentes">A receber</option>
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[11px] text-brand-muted">
                                    Ordenação
                                  </label>
                                  <select
                                    value={ordenacaoPedidos}
                                    onChange={(e) =>
                                      setOrdenacaoPedidos(
                                        e.target.value as
                                          | "recentes"
                                          | "prazo"
                                          | "antigos"
                                      )
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-brand-border rounded-lg text-brand-ink cursor-pointer"
                                  >
                                    <option value="prazo">Mais urgentes</option>
                                    <option value="recentes">
                                      Mais recentes
                                    </option>
                                    <option value="antigos">
                                      Mais antigos
                                    </option>
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Botão Exportar com Popover de Período opcional */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setModuloPopoverId(null);
                            setAcaoPopoverId(null);
                            setFiltrosPopoverAberto(false);
                            setExportPopoverAberto((v) => !v);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-brand-muted hover:text-brand-ink bg-white hover:bg-gray-50 border border-brand-border/80 rounded-lg transition-colors cursor-pointer"
                          title="Exportar planilha (.xlsx)"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Exportar</span>
                        </button>

                        {exportPopoverAberto && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full mt-1.5 z-30 w-64 bg-white border border-brand-border rounded-xl shadow-xl p-3 space-y-2.5 text-xs"
                          >
                            <div className="font-semibold text-brand-ink">
                              Exportar planilha (.xlsx)
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-[11px] text-brand-muted">
                                De (opcional)
                              </label>
                              <input
                                type="date"
                                value={exportDataInicio}
                                onChange={(e) =>
                                  setExportDataInicio(e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 border border-brand-border rounded-lg text-xs bg-white"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-[11px] text-brand-muted">
                                Até (opcional)
                              </label>
                              <input
                                type="date"
                                value={exportDataFim}
                                onChange={(e) =>
                                  setExportDataFim(e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 border border-brand-border rounded-lg text-xs bg-white"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                handleExportarCSV();
                                setExportPopoverAberto(false);
                              }}
                              className="w-full py-1.5 bg-brand-ink hover:bg-brand-ink/90 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              Baixar .xlsx
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MODO 1: LOTES DE IMPRESSÃO AGRUPADOS */}
                  {viewMode === "lotes" && (
                    <div className="divide-y divide-brand-border/70">
                      {lotesAgrupadosCentral.length === 0 ? (
                        <div className="py-14 px-4 text-center space-y-1.5">
                          <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                          <p className="text-sm font-bold text-brand-ink">
                            Nenhum módulo pendente na fila
                          </p>
                          <p className="text-xs text-brand-muted">
                            Todos os módulos em aberto já foram impressos.
                          </p>
                        </div>
                      ) : (
                        lotesAgrupadosCentral.map((lote) => {
                          const ehUrlWeb =
                            Boolean(lote.linkArquivo) &&
                            isWebUrl(lote.linkArquivo);
                          return (
                            <div
                              key={lote.key}
                              className="px-5 py-4 bg-white hover:bg-[#F8FAFC] transition-colors grid grid-cols-1 lg:grid-cols-[minmax(200px,1fr)_minmax(240px,1.5fr)_auto] gap-4 lg:gap-6 items-start lg:items-center"
                            >
                              {/* Esquerda: Escola, Série e Módulo bem separados */}
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                  <span className="font-bold text-brand-ink">
                                    {lote.colegioNome}
                                  </span>
                                  <span className="text-brand-muted">·</span>
                                  <span className="text-brand-muted font-medium">
                                    {lote.serieCurta}
                                  </span>
                                </div>
                                <div className="text-sm font-extrabold text-brand-ink">
                                  {lote.trimestreNome}
                                </div>
                              </div>

                              {/* Centro: Pedidos clicáveis + Exceções curtas */}
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  {lote.pedidosRefs.map((ref) => (
                                    <button
                                      key={ref.pedidoId}
                                      type="button"
                                      onClick={() => {
                                        setConfirmandoCancelamento(false);
                                        setPedidoSelecionadoId(ref.pedidoId);
                                      }}
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:text-brand-cyan bg-transparent cursor-pointer transition-colors"
                                      title={`Abrir pedido #${ref.numero}`}
                                    >
                                      <span className="font-extrabold tabular-nums">
                                        #{ref.numero}
                                      </span>
                                      <span className="text-brand-muted">
                                        ({ref.cliente.split(" ")[0]})
                                      </span>
                                    </button>
                                  ))}
                                </div>

                                {lote.excecoes.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {lote.excecoes.map((ex) => (
                                      <button
                                        key={ex.pedidoId}
                                        type="button"
                                        onClick={() => {
                                          setConfirmandoCancelamento(false);
                                          setPedidoSelecionadoId(ex.pedidoId);
                                        }}
                                        className="inline-flex items-center gap-1 bg-transparent text-[11px] font-semibold text-amber-800 hover:underline cursor-pointer"
                                      >
                                        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                        <span>
                                          #{ex.numero}: {ex.texto}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Direita: Contador + Abrir PDF + Marcar impresso discreto */}
                              <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 pt-1 lg:pt-0">
                                <span className="text-xs font-bold text-brand-muted tabular-nums">
                                  {lote.itemIds.length}{" "}
                                  {lote.itemIds.length === 1
                                    ? "cópia"
                                    : "cópias"}
                                </span>

                                {lote.linkArquivo ? (
                                  ehUrlWeb ? (
                                    <a
                                      href={lote.linkArquivo}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-brand-border/80 bg-transparent hover:border-brand-ink/50 text-brand-ink font-medium text-xs transition-colors"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5 text-brand-muted" />
                                      <span>PDF</span>
                                    </a>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void copiarCaminhoRede(
                                          lote.key,
                                          lote.linkArquivo
                                        )
                                      }
                                      title={lote.linkArquivo}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-brand-border/80 bg-transparent hover:border-brand-ink/50 text-brand-ink font-medium text-xs transition-colors cursor-pointer"
                                    >
                                      <Copy className="w-3.5 h-3.5 text-brand-muted" />
                                      <span>
                                        {caminhoCopiadoId === lote.key
                                          ? "Copiado!"
                                          : "Pasta"}
                                      </span>
                                    </button>
                                  )
                                ) : (
                                  <span className="text-[11px] text-brand-muted">
                                    Sem PDF
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Marcar todos os ${lote.itemIds.length} módulo(s) do lote "${lote.tituloGrupo}" como impressos?`
                                      )
                                    ) {
                                      void handleMarcarLoteImpresso(
                                        lote.itemIds,
                                        lote.tituloGrupo
                                      );
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-brand-border/80 bg-transparent hover:border-brand-ink text-brand-ink font-semibold text-xs transition-colors cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                                  <span>Marcar impresso</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* MODO 2: LISTA EM LINHA ÚNICA LIMPA E ESCANEÁVEL */}
                  {viewMode === "lista" && (
                    <>
                      {/* Cabeçalho Desktop — uma palavra por coluna, sem poluição */}
                      <div className="hidden lg:grid lg:grid-cols-[minmax(165px,1.15fr)_minmax(175px,1.2fr)_minmax(195px,1.35fr)_minmax(145px,0.95fr)_minmax(150px,0.95fr)_88px] gap-4 px-5 py-2.5 border-b border-brand-border/60 bg-[#FAFAFB] text-[11px] font-medium uppercase tracking-wider text-brand-muted">
                        <span>Cliente</span>
                        <span>Turma</span>
                        <span>Módulos</span>
                        <span>Pagamento</span>
                        <span>Etapa</span>
                        <span>Seleção</span>
                      </div>

                      <div className="divide-y divide-brand-border/60">
                        {pedidosFiltrados.length === 0 ? (
                          <div className="py-14 px-4 text-center space-y-1">
                            <p className="text-sm font-semibold text-brand-ink">
                              Nenhum pedido encontrado.
                            </p>
                            <p className="text-xs text-brand-muted">
                              Altere a aba acima ou ajuste os filtros.
                            </p>
                          </div>
                        ) : (
                          pedidosFiltrados
                            .slice(
                              (paginaPedidos - 1) * 25,
                              paginaPedidos * 25
                            )
                            .map((p) => {
                              const emFila =
                                p.status === "recebido" ||
                                p.status === "em_producao";
                              const diasRestantes = calcularDiasAtePrevisao(
                                p.previsao_retirada
                              );
                              const atrasado = emFila && diasRestantes < 0;

                              const colNome =
                                colegios.find((c) => c.id === p.colegio_id)
                                  ?.nome ||
                                p.colegio_nome ||
                                "Colégio";
                              const serNome =
                                series.find((s) => s.id === p.serie_id)?.nome ||
                                p.serie_nome ||
                                "";
                              const serCurta = formatarSerieCurta(serNome);
                              const nomeCliente =
                                p.responsavel_nome ||
                                p.aluno_nome ||
                                "Cliente";

                              const totalItens = p.itens.length;
                              const impressosCount = p.itens.filter(
                                (i) => i.impresso
                              ).length;

                              const acaoAberta = acaoPopoverId === p.id;
                              const temSinal =
                                !p.pago &&
                                Boolean(
                                  p.observacao &&
                                    /\bsinal\b/i.test(p.observacao)
                                );

                              const dotStatusClass =
                                p.status === "recebido"
                                  ? "bg-sky-500"
                                  : p.status === "em_producao"
                                    ? "bg-brand-cyan"
                                    : p.status === "pronto"
                                      ? "bg-amber-500"
                                      : p.status === "entregue"
                                        ? "bg-emerald-600"
                                        : "bg-gray-400";

                              const dataRefCurta =
                                p.status === "pronto" && p.pronto_em
                                  ? formatarDataCurtaDDMM(p.pronto_em)
                                  : p.status === "entregue" && p.entregue_em
                                    ? formatarDataCurtaDDMM(p.entregue_em)
                                    : formatarDataCurtaDDMM(
                                        p.previsao_retirada
                                      );

                              const ressalvasLista = [
                                ...p.itens
                                  .map((it, idx) => {
                                    const info = extrairInfoModuloChip(
                                      it.nome_modulo,
                                      idx
                                    );
                                    return info.excecao
                                      ? `${info.nomeBase}: ${info.excecao}`
                                      : null;
                                  })
                                  .filter((x): x is string => x !== null),
                                ...(p.observacao
                                  ? [`Obs: ${p.observacao}`]
                                  : []),
                              ];

                              return (
                                <div
                                  key={p.id}
                                  onClick={() => {
                                    setModuloPopoverId(null);
                                    setAcaoPopoverId(null);
                                    setFiltrosPopoverAberto(false);
                                    setConfirmandoCancelamento(false);
                                    setPedidoSelecionadoId(p.id);
                                  }}
                                  className={`grid grid-cols-1 lg:grid-cols-[minmax(165px,1.15fr)_minmax(175px,1.2fr)_minmax(195px,1.35fr)_minmax(145px,0.95fr)_minmax(150px,0.95fr)_88px] gap-2.5 lg:gap-4 px-4 sm:px-5 py-3.5 items-center bg-white hover:bg-[#F8FAFC] transition-colors cursor-pointer ${
                                    atrasado
                                      ? "border-l-2 border-l-red-500"
                                      : ""
                                  }`}
                                >
                                  {/* COLUNA 1: CLIENTE (#0004 + Nome em linha única) */}
                                  <div className="min-w-0 flex items-center gap-2">
                                    <span className="text-xs text-brand-muted tabular-nums shrink-0">
                                      #{p.numero}
                                    </span>
                                    <span className="text-[13px] font-medium text-brand-ink truncate">
                                      {nomeCliente}
                                    </span>
                                  </div>

                                  {/* COLUNA 2: TURMA (Colégio · Série em linha única) */}
                                  <div className="min-w-0 flex items-center gap-1.5 truncate">
                                    <span className="text-[13px] text-brand-ink truncate">
                                      {colNome}
                                    </span>
                                    {serCurta && (
                                      <span className="text-xs text-brand-muted shrink-0">
                                        · {serCurta}
                                      </span>
                                    )}
                                  </div>

                                  {/* COLUNA 3: MÓDULOS (Checklist compacto sem parágrafos longos) */}
                                  <div
                                    className="min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {p.itens.slice(0, 2).map((i, idx) => {
                                      const { nomeBase } =
                                        extrairInfoModuloChip(
                                          i.nome_modulo,
                                          idx
                                        );
                                      const modCat = modulos.find(
                                        (m) => m.id === i.modulo_id
                                      );
                                      const linkArquivo =
                                        modCat?.link_arquivo ||
                                        i.link_arquivo ||
                                        "";
                                      const ehUrlWeb = linkArquivo
                                        ? isWebUrl(linkArquivo)
                                        : false;

                                      return (
                                        <div
                                          key={i.id}
                                          className="inline-flex items-center gap-1 text-[13px]"
                                        >
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleToggleItemImpresso(
                                                p.id,
                                                i.id,
                                                i.impresso
                                              )
                                            }
                                            title={
                                              i.impresso
                                                ? "Clique para voltar para pendente"
                                                : "Clique para marcar como impresso"
                                            }
                                            className={`inline-flex items-center gap-1.5 bg-transparent cursor-pointer select-none whitespace-nowrap hover:underline ${
                                              i.impresso
                                                ? "text-emerald-700"
                                                : "text-brand-ink"
                                            }`}
                                          >
                                            {i.impresso ? (
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            ) : (
                                              <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-gray-400 shrink-0" />
                                            )}
                                            <span>{nomeBase}</span>
                                          </button>

                                          {linkArquivo &&
                                            (ehUrlWeb ? (
                                              <a
                                                href={linkArquivo}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={`Abrir PDF (${nomeBase})`}
                                                className="text-brand-muted/70 hover:text-brand-ink transition-colors"
                                              >
                                                <ExternalLink className="w-3 h-3" />
                                              </a>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  void copiarCaminhoRede(
                                                    i.id,
                                                    linkArquivo
                                                  )
                                                }
                                                title={`Copiar pasta (${linkArquivo})`}
                                                className="text-brand-muted/70 hover:text-brand-ink transition-colors cursor-pointer"
                                              >
                                                <Copy className="w-3 h-3" />
                                              </button>
                                            ))}
                                        </div>
                                      );
                                    })}

                                    {totalItens > 2 && (
                                      <span className="text-xs text-brand-muted tabular-nums">
                                        +{totalItens - 2} ({impressosCount}/
                                        {totalItens})
                                      </span>
                                    )}

                                    {ressalvasLista.length > 0 && (
                                      <span
                                        title={ressalvasLista.join(" | ")}
                                        className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium max-w-[200px]"
                                      >
                                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                        <span className="truncate">
                                          {ressalvasLista[0]}
                                          {ressalvasLista.length > 1
                                            ? ` (+${ressalvasLista.length - 1})`
                                            : ""}
                                        </span>
                                      </span>
                                    )}
                                  </div>

                                  {/* COLUNA 4: PAGAMENTO (Valor + Status em linha única) */}
                                  <div
                                    className="min-w-0 flex items-center gap-2 tabular-nums whitespace-nowrap"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="text-[13px] font-medium text-brand-ink">
                                      {formatCurrency(p.total)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void handleTogglePago(p)}
                                      title="Clique para alternar pagamento"
                                      className={`inline-flex items-center gap-1 text-xs bg-transparent cursor-pointer hover:underline ${
                                        p.pago
                                          ? "text-emerald-700"
                                          : temSinal
                                            ? "text-sky-700"
                                            : "text-amber-700"
                                      }`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          p.pago
                                            ? "bg-emerald-600"
                                            : temSinal
                                              ? "bg-sky-600"
                                              : "bg-amber-500"
                                        }`}
                                      />
                                      <span>
                                        {p.pago
                                          ? "Pago"
                                          : temSinal
                                            ? "Sinal"
                                            : "Pendente"}
                                      </span>
                                    </button>
                                  </div>

                                  {/* COLUNA 5: ETAPA (Status + Data curta em linha única) */}
                                  <div className="min-w-0 flex items-center gap-1.5 tabular-nums whitespace-nowrap">
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStatusClass}`}
                                    />
                                    <span className="text-[13px] text-brand-ink">
                                      {STATUS_PEDIDO_CURTO[p.status]}
                                    </span>
                                    <span
                                      className={`text-xs ${
                                        atrasado
                                          ? "text-red-600 font-medium"
                                          : emFila && diasRestantes <= 1
                                            ? "text-amber-600 font-medium"
                                            : "text-brand-muted"
                                      }`}
                                    >
                                      · {dataRefCurta}
                                    </span>
                                  </div>

                                  {/* COLUNA 6: SELEÇÃO */}
                                  <div
                                    className="relative flex items-center justify-start"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setModuloPopoverId(null);
                                        setFiltrosPopoverAberto(false);
                                        setAcaoPopoverId(
                                          acaoAberta ? null : p.id
                                        );
                                      }}
                                      className={`inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium bg-transparent cursor-pointer transition-colors ${
                                        acaoAberta
                                          ? "border-brand-ink text-brand-ink"
                                          : "border-brand-border/80 text-brand-muted hover:text-brand-ink hover:border-brand-ink/40"
                                      }`}
                                    >
                                      <span>Ações</span>
                                      <ChevronDown
                                        className={`w-3.5 h-3.5 transition-transform ${
                                          acaoAberta
                                            ? "rotate-180 text-brand-ink"
                                            : ""
                                        }`}
                                      />
                                    </button>

                                    {acaoAberta && (
                                      <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-brand-border rounded-xl shadow-lg py-1.5 z-30 text-left text-xs">
                                        {p.status !== "em_producao" && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAcaoPopoverId(null);
                                              void handleMudarStatus(
                                                p,
                                                "em_producao"
                                              );
                                            }}
                                            className="w-full px-3 py-1.5 text-left font-medium text-brand-ink hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan shrink-0" />
                                            <span>Iniciar produção</span>
                                          </button>
                                        )}

                                        {p.status !== "pronto" && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAcaoPopoverId(null);
                                              void handleMudarStatus(
                                                p,
                                                "pronto"
                                              );
                                            }}
                                            className="w-full px-3 py-1.5 text-left font-medium text-brand-ink hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                            <span>Marcar como pronto</span>
                                          </button>
                                        )}

                                        {p.status !== "entregue" && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAcaoPopoverId(null);
                                              void handleMudarStatus(
                                                p,
                                                "entregue"
                                              );
                                            }}
                                            className="w-full px-3 py-1.5 text-left font-medium text-brand-ink hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
                                            <span>Registrar entrega</span>
                                          </button>
                                        )}

                                        {p.status !== "recebido" && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAcaoPopoverId(null);
                                              void handleMudarStatus(
                                                p,
                                                "recebido"
                                              );
                                            }}
                                            className="w-full px-3 py-1.5 text-left font-medium text-brand-muted hover:text-brand-ink hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                                            <span>Voltar para fila</span>
                                          </button>
                                        )}

                                        <div className="my-1 border-t border-brand-border/70" />

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAcaoPopoverId(null);
                                            handleImprimirEtiqueta(p);
                                          }}
                                          className="w-full px-3 py-1.5 text-left font-medium text-brand-ink hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                                        >
                                          <Printer className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                                          <span>Imprimir etiqueta</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAcaoPopoverId(null);
                                            void baixarDocumentoPedidoPDF(
                                              {
                                                ...p,
                                                colegio_nome: colNome,
                                                serie_nome: serNome,
                                              },
                                              config
                                            );
                                          }}
                                          className="w-full px-3 py-1.5 text-left font-medium text-brand-ink hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                                          <span>Baixar ficha PDF</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAcaoPopoverId(null);
                                            abrirWhatsAppPronto(p);
                                          }}
                                          className="w-full px-3 py-1.5 text-left font-medium text-brand-ink hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                                        >
                                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                          <span>Avisar no WhatsApp</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAcaoPopoverId(null);
                                            setConfirmandoCancelamento(false);
                                            setPedidoSelecionadoId(p.id);
                                          }}
                                          className="w-full px-3 py-1.5 text-left font-medium text-brand-ink hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                                        >
                                          <ClipboardList className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                                          <span>Ver detalhes</span>
                                        </button>

                                        <div className="my-1 border-t border-brand-border/70" />

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAcaoPopoverId(null);
                                            void handleTogglePago(p);
                                          }}
                                          className="w-full px-3 py-1.5 text-left font-medium text-brand-ink hover:bg-[#F8FAFC] flex items-center gap-2 cursor-pointer"
                                        >
                                          <DollarSign className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                                          <span>
                                            {p.pago
                                              ? "Voltar p/ Pendente"
                                              : "Marcar como Pago"}
                                          </span>
                                        </button>

                                        {p.status !== "cancelado" && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAcaoPopoverId(null);
                                              if (
                                                window.confirm(
                                                  `Deseja cancelar o pedido #${p.numero}?`
                                                )
                                              ) {
                                                void handleMudarStatus(
                                                  p,
                                                  "cancelado"
                                                );
                                              }
                                            }}
                                            className="w-full px-3 py-1.5 text-left font-medium text-red-600 hover:bg-red-50/60 flex items-center gap-2 cursor-pointer"
                                          >
                                            <X className="w-3.5 h-3.5 shrink-0" />
                                            <span>Cancelar pedido</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                        )}
                      </div>

                      {/* Paginação da Central de Pedidos */}
                      {pedidosFiltrados.length > 25 && (
                        <div className="px-4 py-3 border-t border-brand-border/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-brand-muted">
                            Mostrando{" "}
                            <strong className="text-brand-ink">
                              {(paginaPedidos - 1) * 25 + 1}–
                              {Math.min(
                                paginaPedidos * 25,
                                pedidosFiltrados.length
                              )}
                            </strong>{" "}
                            de{" "}
                            <strong className="text-brand-ink">
                              {pedidosFiltrados.length}
                            </strong>{" "}
                            pedidos
                          </span>
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={paginaPedidos <= 1}
                              onClick={() =>
                                setPaginaPedidos((p) => Math.max(1, p - 1))
                              }
                              className="px-3 py-1.5 rounded-lg border border-brand-border bg-white text-brand-ink font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-default hover:bg-gray-50"
                            >
                              Anterior
                            </button>
                            <span className="px-2 font-semibold text-brand-ink tabular-nums">
                              {paginaPedidos} /{" "}
                              {Math.ceil(pedidosFiltrados.length / 25)}
                            </span>
                            <button
                              type="button"
                              disabled={
                                paginaPedidos >=
                                Math.ceil(pedidosFiltrados.length / 25)
                              }
                              onClick={() =>
                                setPaginaPedidos((p) =>
                                  Math.min(
                                    Math.ceil(pedidosFiltrados.length / 25),
                                    p + 1
                                  )
                                )
                              }
                              className="px-3 py-1.5 rounded-lg border border-brand-border bg-white text-brand-ink font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-default hover:bg-gray-50"
                            >
                              Próxima
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* MODO 3: QUADRO KANBAN LIMPO COM DRAG-AND-DROP */}
                {viewMode === "kanban" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
                    {FLUXO_STATUS.map((col) => {
                      const pedidosColuna = pedidosBaseFiltrados.filter(
                        (p) => p.status === col.key
                      );
                      const dotColClass =
                        col.key === "recebido"
                          ? "bg-sky-500"
                          : col.key === "em_producao"
                            ? "bg-brand-cyan"
                            : col.key === "pronto"
                              ? "bg-amber-500"
                              : "bg-emerald-600";
                      const isDropTarget = kanbanDropColuna === col.key;

                      return (
                        <div
                          key={col.key}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (kanbanDropColuna !== col.key) {
                              setKanbanDropColuna(col.key);
                            }
                          }}
                          onDragLeave={() => {
                            if (kanbanDropColuna === col.key) {
                              setKanbanDropColuna(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const draggedId =
                              e.dataTransfer.getData("text/plain") ||
                              kanbanDragPedidoId;
                            setKanbanDragPedidoId(null);
                            setKanbanDropColuna(null);
                            if (!draggedId) return;
                            const pedidoAlvo = pedidos.find(
                              (x) => x.id === draggedId
                            );
                            if (pedidoAlvo && pedidoAlvo.status !== col.key) {
                              void handleMudarStatus(pedidoAlvo, col.key);
                            }
                          }}
                          className={`bg-[#F4F5F7]/90 border rounded-2xl p-3 flex flex-col gap-2.5 min-h-[460px] transition-all ${
                            isDropTarget
                              ? "border-brand-cyan ring-2 ring-brand-cyan/25 bg-brand-cyan/[0.04]"
                              : "border-brand-border/60"
                          }`}
                        >
                          {/* Cabeçalho limpo da coluna */}
                          <div className="flex items-center justify-between px-1.5 py-0.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${dotColClass}`}
                              />
                              <span className="text-xs font-semibold text-brand-ink">
                                {col.label}
                              </span>
                            </div>
                            <span className="text-xs font-medium text-brand-muted tabular-nums">
                              {pedidosColuna.length}
                            </span>
                          </div>

                          <div className="space-y-2.5 flex-1">
                            {pedidosColuna.length === 0 ? (
                              <div className="h-28 flex items-center justify-center text-xs text-brand-muted/70">
                                Nenhum pedido
                              </div>
                            ) : (
                              pedidosColuna.map((p) => {
                                const colNome =
                                  colegios.find((c) => c.id === p.colegio_id)
                                    ?.nome || p.colegio_nome;
                                const serNome =
                                  series.find((s) => s.id === p.serie_id)
                                    ?.nome || p.serie_nome;
                                const serCurta = formatarSerieCurta(serNome);
                                const nomeCliente =
                                  p.responsavel_nome ||
                                  p.aluno_nome ||
                                  "Cliente";
                                const emFilaKanban =
                                  p.status === "recebido" ||
                                  p.status === "em_producao";
                                const diasRestantesKanban =
                                  calcularDiasAtePrevisao(p.previsao_retirada);
                                const atrasadoKanban =
                                  emFilaKanban && diasRestantesKanban < 0;

                                const notaCurtaKanban =
                                  p.itens
                                    .map(
                                      (it, idx) =>
                                        extrairInfoModuloChip(
                                          it.nome_modulo,
                                          idx
                                        ).excecao
                                    )
                                    .find(Boolean) ||
                                  p.observacao ||
                                  "";

                                return (
                                  <div
                                    key={p.id}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData(
                                        "text/plain",
                                        p.id
                                      );
                                      e.dataTransfer.effectAllowed = "move";
                                      setKanbanDragPedidoId(p.id);
                                    }}
                                    onDragEnd={() => {
                                      setKanbanDragPedidoId(null);
                                      setKanbanDropColuna(null);
                                    }}
                                    onClick={() => {
                                      setConfirmandoCancelamento(false);
                                      setPedidoSelecionadoId(p.id);
                                    }}
                                    className={`bg-white rounded-xl p-3.5 border border-brand-border/75 shadow-2xs cursor-grab active:cursor-grabbing hover:border-brand-ink/35 transition-all space-y-2.5 ${
                                      kanbanDragPedidoId === p.id
                                        ? "opacity-50"
                                        : ""
                                    }`}
                                  >
                                    {/* Linha 1: #Pedido + Data prevista */}
                                    <div className="flex items-center justify-between text-xs tabular-nums">
                                      <span className="text-brand-muted font-medium">
                                        #{p.numero}
                                      </span>
                                      <span
                                        className={
                                          atrasadoKanban
                                            ? "text-red-600 font-medium"
                                            : emFilaKanban &&
                                                diasRestantesKanban <= 1
                                              ? "text-amber-600 font-medium"
                                              : "text-brand-muted"
                                        }
                                      >
                                        {formatarDataCurtaDDMM(
                                          p.previsao_retirada
                                        )}
                                      </span>
                                    </div>

                                    {/* Linha 2: Cliente + Turma */}
                                    <div>
                                      <p className="text-[13px] font-semibold text-brand-ink leading-snug truncate">
                                        {nomeCliente}
                                      </p>
                                      <p className="text-xs text-brand-muted truncate mt-0.5">
                                        {colNome}
                                        {serCurta ? ` · ${serCurta}` : ""}
                                      </p>
                                    </div>

                                    {/* Linha 3: Checklist limpo dos módulos */}
                                    <div
                                      className="space-y-1 pt-0.5"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {p.itens.map((i, idx) => {
                                        const { nomeBase } =
                                          extrairInfoModuloChip(
                                            i.nome_modulo,
                                            idx
                                          );
                                        return (
                                          <button
                                            key={i.id}
                                            type="button"
                                            onClick={() =>
                                              void handleToggleItemImpresso(
                                                p.id,
                                                i.id,
                                                i.impresso
                                              )
                                            }
                                            className={`flex items-center gap-1.5 text-xs bg-transparent cursor-pointer hover:underline ${
                                              i.impresso
                                                ? "text-emerald-700"
                                                : "text-brand-ink"
                                            }`}
                                          >
                                            {i.impresso ? (
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                            ) : (
                                              <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-gray-400 shrink-0" />
                                            )}
                                            <span className="truncate">
                                              {nomeBase}
                                            </span>
                                          </button>
                                        );
                                      })}

                                      {notaCurtaKanban && (
                                        <p
                                          title={notaCurtaKanban}
                                          className="flex items-center gap-1 text-[11px] text-amber-700 truncate pt-0.5"
                                        >
                                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                          <span className="truncate">
                                            {notaCurtaKanban}
                                          </span>
                                        </p>
                                      )}
                                    </div>

                                    {/* Linha 4: Rodapé sutil (Pagamento + Avançar discreto) */}
                                    <div
                                      className="pt-2.5 border-t border-brand-border/50 flex items-center justify-between gap-2"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => void handleTogglePago(p)}
                                        title={
                                          p.pago
                                            ? "Pago — clique para voltar a pendente"
                                            : "Pendente — clique para marcar pago"
                                        }
                                        className={`inline-flex items-center gap-1.5 text-xs tabular-nums bg-transparent cursor-pointer hover:underline ${
                                          p.pago
                                            ? "text-emerald-700 font-medium"
                                            : "text-brand-muted"
                                        }`}
                                      >
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full ${
                                            p.pago
                                              ? "bg-emerald-600"
                                              : "bg-amber-500"
                                          }`}
                                        />
                                        <span>{formatCurrency(p.total)}</span>
                                      </button>

                                      {p.status === "recebido" && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleMudarStatus(
                                              p,
                                              "em_producao"
                                            )
                                          }
                                          className="px-2.5 py-1 rounded-lg border border-brand-border hover:border-brand-ink text-brand-ink bg-white text-[11px] font-medium transition-colors cursor-pointer"
                                        >
                                          Produzir →
                                        </button>
                                      )}
                                      {p.status === "em_producao" && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleProntoAvisarCliente(p)
                                          }
                                          className="px-2.5 py-1 rounded-lg border border-brand-border hover:border-brand-ink text-brand-ink bg-white text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                                        >
                                          <MessageCircle className="w-3 h-3 text-emerald-600" />
                                          <span>Pronto</span>
                                        </button>
                                      )}
                                      {p.status === "pronto" && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleMudarStatus(
                                              p,
                                              "entregue"
                                            )
                                          }
                                          className="px-2.5 py-1 rounded-lg border border-brand-border hover:border-brand-ink text-brand-ink bg-white text-[11px] font-medium transition-colors cursor-pointer"
                                        >
                                          Entregar ✓
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ===============================================================
                SEÇÃO 2: VISÃO "IMPRIMIR POR SÉRIE" (MODO CARD SEM QUEBRAS)
            =============================================================== */}
            {section === "imprimir_serie" && (
              <div className="space-y-4">
                {/* Barra Superior Compacta: Filtro de Colégio + Contador */}
                <div className="bg-white border border-brand-border rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFiltroColegioLote("")}
                      className={`px-3 py-1.5 rounded-lg border font-bold cursor-pointer transition-colors whitespace-nowrap ${
                        !filtroColegioLote
                          ? "bg-brand-ink text-white border-brand-ink"
                          : "bg-white text-brand-muted border-brand-border hover:text-brand-ink"
                      }`}
                    >
                      Todos os colégios
                    </button>
                    {colegios.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setFiltroColegioLote(c.id)}
                        className={`px-3 py-1.5 rounded-lg border font-bold cursor-pointer transition-colors whitespace-nowrap ${
                          filtroColegioLote === c.id
                            ? "bg-brand-ink text-white border-brand-ink"
                            : "bg-white text-brand-muted border-brand-border hover:text-brand-ink"
                        }`}
                      >
                        {c.nome}
                      </button>
                    ))}
                  </div>

                  <span className="text-brand-muted font-semibold tabular-nums whitespace-nowrap">
                    Pendentes:{" "}
                    <strong className="text-brand-ink font-extrabold">
                      {lotesImpressao.reduce(
                        (acc, l) => acc + l.copiasPendentes,
                        0
                      )}{" "}
                      {lotesImpressao.reduce(
                        (acc, l) => acc + l.copiasPendentes,
                        0
                      ) === 1
                        ? "cópia"
                        : "cópias"}
                    </strong>
                  </span>
                </div>

                {lotesImpressao.length === 0 ? (
                  <div className="bg-white border border-brand-border rounded-2xl py-14 text-center space-y-1.5 shadow-xs">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                    <p className="text-sm font-bold text-brand-ink">
                      Fila de impressão em dia
                    </p>
                    <p className="text-xs text-brand-muted">
                      Nenhuma cópia pendente no momento.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {lotesImpressao.map((lote) => {
                      const loteKey = `${lote.colegioId}-${lote.serieId}-${lote.moduloId}-${lote.moduloNome}`;
                      const ehUrlWeb = isWebUrl(lote.linkArquivo);
                      const partesModulo = lote.moduloNome
                        .split("—")
                        .map((s) => s.trim());
                      const tituloModuloPrincipal =
                        partesModulo[0] || lote.moduloNome;
                      const subtituloLivrosModulo =
                        partesModulo.length > 1
                          ? resumirTextoExcecao(partesModulo.slice(1).join(" — "))
                          : "";
                      const modObj = modulos.find(
                        (m) => m.id === lote.moduloId
                      );

                      return (
                        <div
                          key={loteKey}
                          className="bg-white border border-brand-border hover:border-brand-ink/40 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-xs transition-all"
                        >
                          {/* Topo do Card: Capa + Colégio/Série/Módulo + Badge de Cópias */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3.5 min-w-0">
                              <ModuloCapaPreview
                                nomeModulo={tituloModuloPrincipal}
                                nomeSerie={lote.serieNome}
                                nomeColegio={lote.colegioNome}
                                ordem={modObj?.ordem || 1}
                                capaUrl={modObj?.capa_url}
                                size="sm"
                              />
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-brand-muted">
                                  <span className="text-brand-ink font-extrabold whitespace-nowrap">
                                    {lote.colegioNome}
                                  </span>
                                  <span>·</span>
                                  <span className="text-[11px] font-medium text-brand-muted whitespace-nowrap">
                                    {formatarSerieCurta(lote.serieNome)}
                                  </span>
                                </div>
                                <h3 className="text-base font-extrabold text-brand-ink leading-snug">
                                  {tituloModuloPrincipal}
                                </h3>
                                {subtituloLivrosModulo && (
                                  <p className="text-xs text-amber-700 font-medium">
                                    {subtituloLivrosModulo}
                                  </p>
                                )}
                              </div>
                            </div>

                            <span className="shrink-0 inline-flex items-center text-brand-ink text-xs font-extrabold tabular-nums whitespace-nowrap">
                              {lote.copiasPendentes}{" "}
                              {lote.copiasPendentes === 1 ? "cópia" : "cópias"}
                            </span>
                          </div>

                          {/* Meio do Card: Pedidos vinculados sem quebra de linha */}
                          <div className="pt-3 border-t border-brand-border/70 flex flex-wrap items-center gap-2">
                            {lote.pedidosRefs.map((ref) => (
                              <button
                                key={ref.id}
                                type="button"
                                onClick={() => {
                                  setConfirmandoCancelamento(false);
                                  setPedidoSelecionadoId(ref.id);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-transparent border border-brand-border/70 hover:border-brand-ink text-brand-ink cursor-pointer whitespace-nowrap transition-colors"
                                title={`Abrir pedido de ${ref.responsavel}`}
                              >
                                <span className="text-brand-ink font-extrabold">
                                  #{ref.numero}
                                </span>
                                <span className="text-brand-muted">·</span>
                                <span className="text-brand-muted font-medium">{ref.responsavel.split(" ")[0]}</span>
                              </button>
                            ))}
                          </div>

                          {/* Rodapé do Card: Arquivo PDF + Botão Marcar Impresso */}
                          <div className="pt-3 border-t border-brand-border/70 flex items-center justify-between gap-3 text-xs">
                            <div className="whitespace-nowrap">
                              {lote.linkArquivo ? (
                                ehUrlWeb ? (
                                  <a
                                    href={lote.linkArquivo}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-transparent border border-brand-border/80 hover:border-brand-ink text-brand-muted hover:text-brand-ink font-semibold transition-colors"
                                  >
                                    <span>Abrir PDF</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copiarCaminhoRede(
                                        loteKey,
                                        lote.linkArquivo
                                      )
                                    }
                                    title={lote.linkArquivo}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-transparent border border-brand-border/80 hover:border-brand-ink font-semibold text-brand-muted hover:text-brand-ink cursor-pointer transition-colors"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>
                                      {caminhoCopiadoId === loteKey
                                        ? "Copiado!"
                                        : "Copiar pasta"}
                                    </span>
                                  </button>
                                )
                              ) : (
                                <span className="text-brand-muted font-medium">
                                  Sem arquivo PDF vinculado
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                handleMarcarLoteImpresso(
                                  lote.itemIds,
                                  `${lote.colegioNome} – ${lote.serieNome} – ${lote.moduloNome}`
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-transparent border border-brand-border/80 hover:border-brand-ink text-brand-ink font-semibold cursor-pointer whitespace-nowrap transition-colors"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                              <span>Marcar impresso</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===============================================================
                SEÇÃO 2.5: MÓDULO FINANCEIRO (ESTILO ERP / FLUXO DE CAIXA & DRE)
            =============================================================== */}
            {section === "faturamento" && (
              <div className="space-y-5">
                {/* 1. Barra Superior: 3 Abas Separadas + Período + Ações */}
                <div className="bg-white border border-brand-border rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                  {/* 3 Abas Independentes: Fluxo de Caixa | Extrato | DRE */}
                  <div className="inline-flex bg-white p-1 rounded-xl border border-brand-border gap-1">
                    <button
                      type="button"
                      onClick={() => setAbaFinanceiro("fluxo")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        abaFinanceiro === "fluxo"
                          ? "bg-brand-ink text-white"
                          : "text-brand-muted hover:text-brand-ink"
                      }`}
                    >
                      Fluxo de Caixa
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbaFinanceiro("extrato")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        abaFinanceiro === "extrato"
                          ? "bg-brand-ink text-white"
                          : "text-brand-muted hover:text-brand-ink"
                      }`}
                    >
                      Extrato
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbaFinanceiro("dre")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        abaFinanceiro === "dre"
                          ? "bg-brand-ink text-white"
                          : "text-brand-muted hover:text-brand-ink"
                      }`}
                    >
                      DRE & Pagamentos
                    </button>
                  </div>

                  {/* Filtro de Regime + Período + Ações */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div
                      className="inline-flex bg-[#F4F5F7] p-0.5 rounded-xl border border-brand-border/70"
                      title="Competência soma todos os pedidos; Caixa Real considera apenas pedidos pagos na data do pagamento"
                    >
                      <button
                        type="button"
                        onClick={() => setRegimeFinanceiro("competencia")}
                        className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                          regimeFinanceiro === "competencia"
                            ? "bg-white text-brand-ink shadow-2xs"
                            : "text-brand-muted hover:text-brand-ink"
                        }`}
                      >
                        Competência
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegimeFinanceiro("caixa")}
                        className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                          regimeFinanceiro === "caixa"
                            ? "bg-white text-emerald-700 shadow-2xs"
                            : "text-brand-muted hover:text-brand-ink"
                        }`}
                      >
                        Caixa Real (Pagos)
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 border border-brand-border rounded-xl px-2.5 py-1 bg-white">
                      <span className="font-bold text-brand-muted">De</span>
                      <input
                        type="date"
                        value={fatDataInicio}
                        onChange={(e) => setFatDataInicio(e.target.value)}
                        className="bg-white text-xs text-brand-ink focus:outline-none"
                      />
                      <span className="text-brand-muted">até</span>
                      <input
                        type="date"
                        value={fatDataFim}
                        onChange={(e) => setFatDataFim(e.target.value)}
                        className="bg-white text-xs text-brand-ink focus:outline-none"
                      />
                      {(fatDataInicio || fatDataFim) && (
                        <button
                          type="button"
                          onClick={() => {
                            setFatDataInicio("");
                            setFatDataFim("");
                          }}
                          className="ml-1 text-brand-magenta font-bold hover:underline"
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleExportarFinanceiroCSV}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-brand-ink border border-brand-border font-bold rounded-xl transition-colors cursor-pointer"
                      title="Baixar planilha Excel (.xlsx) do Extrato Bancário e DRE com as cores da marca"
                    >
                      <Download className="w-3.5 h-3.5 text-brand-cyan" />
                      Exportar Excel
                    </button>

                    <button
                      type="button"
                      onClick={abrirModalNovoLancamento}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-magenta hover:bg-brand-magenta/90 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Nova Saída
                    </button>
                  </div>
                </div>

                {/* ===========================================================
                    ABA 1: FLUXO DE CAIXA (LIMPO, DIRETO E SEM EXCESSO DE TEXTO)
                =========================================================== */}
                {abaFinanceiro === "fluxo" && (
                  <div className="space-y-4 tabular-nums">
                    {/* 4 KPIs limpos e compactos: Caixa Real x A Receber x Saídas x Saldo */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      <div className="bg-white border border-brand-border rounded-xl px-4 py-3.5 shadow-2xs flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                          Recebido
                        </span>
                        <span className="text-lg font-extrabold text-emerald-700">
                          {formatCurrency(resumoFinanceiro.faturamentoPago)}
                        </span>
                      </div>

                      <div className="bg-white border border-brand-border rounded-xl px-4 py-3.5 shadow-2xs flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                          A Receber
                        </span>
                        <span className="text-lg font-extrabold text-amber-700">
                          {formatCurrency(resumoFinanceiro.faturamentoPendente)}
                        </span>
                      </div>

                      <div className="bg-white border border-brand-border rounded-xl px-4 py-3.5 shadow-2xs flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                          Saídas
                        </span>
                        <span className="text-lg font-extrabold text-brand-ink">
                          − {formatCurrency(resumoFinanceiro.totalSaidas)}
                        </span>
                      </div>

                      <div className="bg-white border border-brand-border rounded-xl px-4 py-3.5 shadow-2xs flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                          {regimeFinanceiro === "caixa"
                            ? "Saldo em Caixa"
                            : "Saldo Previsto"}
                        </span>
                        <span
                          className={`text-lg font-extrabold ${
                            (regimeFinanceiro === "caixa"
                              ? resumoFinanceiro.saldoRealCaixa
                              : resumoFinanceiro.saldoLiquidoFinal) >= 0
                              ? "text-brand-cyan"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(
                            regimeFinanceiro === "caixa"
                              ? resumoFinanceiro.saldoRealCaixa
                              : resumoFinanceiro.saldoLiquidoFinal
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Gráficos do Fluxo de Caixa */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      {/* Gráfico 1: Fluxo Diário */}
                      <div className="lg:col-span-7 bg-white border border-brand-border rounded-2xl p-5 flex flex-col justify-between shadow-xs">
                        <div className="flex items-center justify-between border-b border-brand-border pb-3">
                          <h3 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                            Fluxo Diário
                          </h3>
                          <div className="flex items-center gap-4 text-xs font-semibold">
                            <span className="inline-flex items-center gap-1.5 text-brand-ink">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                              Entradas
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-brand-ink">
                              <span className="w-2.5 h-2.5 rounded-full bg-brand-magenta inline-block" />
                              Saídas
                            </span>
                          </div>
                        </div>

                        {resumoFinanceiro.serieDiariaFluxo.length === 0 ? (
                          <div className="py-16 text-center text-xs text-brand-muted">
                            Sem movimentações no período.
                          </div>
                        ) : (
                          (() => {
                            const maxDia = Math.max(
                              1,
                              ...resumoFinanceiro.serieDiariaFluxo.map((d) =>
                                Math.max(d.entradas, d.saidas)
                              )
                            );

                            return (
                              <div className="pt-5 pb-1 overflow-x-auto">
                                <div className="min-w-fit">
                                  <div className="relative h-48 flex items-end justify-around gap-3 border-b border-brand-border px-3">
                                    {/* Linhas sutis de fundo */}
                                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                      {[0, 1, 2, 3].map((idx) => (
                                        <div
                                          key={idx}
                                          className="w-full border-t border-dashed border-brand-border/50"
                                        />
                                      ))}
                                      <div className="w-full" />
                                    </div>

                                    {resumoFinanceiro.serieDiariaFluxo.map(
                                      (dia) => {
                                        const altEntrada = Math.round(
                                          (dia.entradas / maxDia) * 150
                                        );
                                        const altSaida = Math.round(
                                          (dia.saidas / maxDia) * 150
                                        );

                                        return (
                                          <div
                                            key={dia.data}
                                            className="relative z-10 flex-1 flex flex-col items-center min-w-[64px] max-w-[110px]"
                                          >
                                            <div className="w-full flex items-end justify-center gap-1.5 h-44">
                                              {dia.entradas > 0 && (
                                                <div className="flex flex-col items-center justify-end w-6">
                                                  <span className="text-[10px] font-bold text-emerald-700 mb-1 whitespace-nowrap leading-none">
                                                    {formatCurrency(
                                                      dia.entradas
                                                    ).replace("R$", "")}
                                                  </span>
                                                  <div
                                                    className="w-6 rounded-t-md bg-emerald-600 transition-all"
                                                    style={{
                                                      height: `${Math.max(8, altEntrada)}px`,
                                                    }}
                                                  />
                                                </div>
                                              )}

                                              {dia.saidas > 0 && (
                                                <div className="flex flex-col items-center justify-end w-6">
                                                  <span className="text-[10px] font-bold text-brand-magenta mb-1 whitespace-nowrap leading-none">
                                                    {formatCurrency(
                                                      dia.saidas
                                                    ).replace("R$", "")}
                                                  </span>
                                                  <div
                                                    className="w-6 rounded-t-md bg-brand-magenta transition-all"
                                                    style={{
                                                      height: `${Math.max(8, altSaida)}px`,
                                                    }}
                                                  />
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>

                                  {/* Datas */}
                                  <div className="flex items-center justify-around gap-3 pt-2.5 px-3">
                                    {resumoFinanceiro.serieDiariaFluxo.map(
                                      (dia) => (
                                        <div
                                          key={dia.data}
                                          className="flex-1 text-center text-[11px] font-bold text-brand-muted min-w-[64px] max-w-[110px]"
                                        >
                                          {formatDateBR(dia.data).slice(0, 5)}
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>

                      {/* Gráfico 2: Saídas por Categoria */}
                      <div className="lg:col-span-5 bg-white border border-brand-border rounded-2xl p-5 flex flex-col justify-between shadow-xs">
                        <div className="border-b border-brand-border pb-3">
                          <h3 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                            Saídas por Categoria
                          </h3>
                        </div>

                        {(() => {
                          const configCategorias: {
                            key: LancamentoCategoria;
                            label: string;
                            color: string;
                          }[] = [
                            {
                              key: "papel",
                              label: "Papel / Sulfite",
                              color: "#009FE3",
                            },
                            {
                              key: "tinta",
                              label: "Tinta / Toner",
                              color: "#E6007E",
                            },
                            {
                              key: "impressora",
                              label: "Impressora / Manut.",
                              color: "#161616",
                            },
                            {
                              key: "materiais",
                              label: "Materiais / Capa",
                              color: "#F59E0B",
                            },
                            {
                              key: "equipamentos",
                              label: "Equipamentos",
                              color: "#6366F1",
                            },
                            {
                              key: "perda_impressao",
                              label: "Perdas",
                              color: "#DC2626",
                            },
                            {
                              key: "outros",
                              label: "Outros",
                              color: "#64748B",
                            },
                          ];

                          const totalSaidasCat = Math.max(
                            1,
                            configCategorias.reduce(
                              (acc, c) =>
                                acc +
                                (resumoFinanceiro.porCategoria[c.key] || 0),
                              0
                            )
                          );

                          const raio = 52;
                          const circunferencia = 2 * Math.PI * raio;
                          let acumuladoOffset = 0;

                          return (
                            <div className="flex flex-col sm:flex-row items-center gap-5 py-3">
                              {/* Donut SVG */}
                              <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                                <svg
                                  viewBox="0 0 140 140"
                                  className="w-full h-full -rotate-90"
                                >
                                  <circle
                                    cx="70"
                                    cy="70"
                                    r={raio}
                                    fill="transparent"
                                    stroke="#F3F4F6"
                                    strokeWidth="16"
                                  />
                                  {configCategorias.map((cat) => {
                                    const val =
                                      resumoFinanceiro.porCategoria[cat.key] ||
                                      0;
                                    if (val <= 0) return null;
                                    const frac = val / totalSaidasCat;
                                    const arco = Math.max(
                                      0,
                                      frac * circunferencia - 2
                                    );
                                    const dashOffset = -acumuladoOffset;
                                    acumuladoOffset += frac * circunferencia;
                                    return (
                                      <circle
                                        key={cat.key}
                                        cx="70"
                                        cy="70"
                                        r={raio}
                                        fill="transparent"
                                        stroke={cat.color}
                                        strokeWidth="16"
                                        strokeDasharray={`${arco} ${circunferencia}`}
                                        strokeDashoffset={dashOffset}
                                      />
                                    );
                                  })}
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                                  <span className="text-xs font-extrabold text-brand-ink">
                                    {formatCurrency(
                                      resumoFinanceiro.totalSaidas
                                    )}
                                  </span>
                                </div>
                              </div>

                              {/* Legenda limpa */}
                              <div className="flex-1 w-full space-y-1.5 text-xs">
                                {configCategorias.map((cat) => {
                                  const val =
                                    resumoFinanceiro.porCategoria[cat.key] || 0;
                                  return (
                                    <button
                                      key={cat.key}
                                      type="button"
                                      onClick={() => {
                                        setFiltroCategoriaLancamento(cat.key);
                                        setAbaFinanceiro("extrato");
                                      }}
                                      className="w-full flex items-center justify-between gap-2 py-1 px-2 rounded-lg hover:bg-gray-50 transition-colors text-left cursor-pointer"
                                    >
                                      <span className="flex items-center gap-2 truncate">
                                        <span
                                          className="w-2.5 h-2.5 rounded-full shrink-0"
                                          style={{
                                            backgroundColor: cat.color,
                                          }}
                                        />
                                        <span className="font-semibold text-brand-ink truncate">
                                          {cat.label}
                                        </span>
                                      </span>
                                      <span className="font-bold text-brand-ink whitespace-nowrap">
                                        {formatCurrency(val)}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Gráfico 3: Por Colégio */}
                      <div className="lg:col-span-6 bg-white border border-brand-border rounded-2xl p-5 flex flex-col justify-between shadow-xs">
                        <div className="border-b border-brand-border pb-3">
                          <h3 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                            Receita por Colégio
                          </h3>
                        </div>

                        {resumoFinanceiro.rankingColegios.length === 0 ? (
                          <div className="py-10 text-center text-xs text-brand-muted">
                            Sem pedidos no período.
                          </div>
                        ) : (
                          <div className="space-y-3.5 pt-4">
                            {resumoFinanceiro.rankingColegios.map(
                              (col, index) => {
                                const pctReceita =
                                  resumoFinanceiro.faturamentoBruto > 0
                                    ? Math.round(
                                        (col.receita /
                                          resumoFinanceiro.faturamentoBruto) *
                                          100
                                      )
                                    : 0;
                                const barColors = [
                                  "#009FE3",
                                  "#E6007E",
                                  "#F59E0B",
                                  "#161616",
                                ];
                                const barColor =
                                  barColors[index % barColors.length];

                                return (
                                  <div key={col.id} className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className="font-bold text-brand-ink truncate">
                                        {col.nome}
                                      </span>
                                      <strong className="font-extrabold text-brand-ink">
                                        {formatCurrency(col.receita)}
                                      </strong>
                                    </div>

                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                          width: `${Math.max(6, pctReceita)}%`,
                                          backgroundColor: barColor,
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        )}
                      </div>

                      {/* Gráfico 4: Por Módulo */}
                      <div className="lg:col-span-6 bg-white border border-brand-border rounded-2xl p-5 flex flex-col justify-between shadow-xs">
                        <div className="border-b border-brand-border pb-3">
                          <h3 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                            Vendas por Módulo
                          </h3>
                        </div>

                        {resumoFinanceiro.rankingModulos.length === 0 ? (
                          <div className="py-10 text-center text-xs text-brand-muted">
                            Nenhum módulo vendido no período.
                          </div>
                        ) : (
                          <div className="space-y-3.5 pt-4">
                            {resumoFinanceiro.rankingModulos.map((mod) => {
                              const maxCopias = Math.max(
                                1,
                                ...resumoFinanceiro.rankingModulos.map(
                                  (m) => m.copias
                                )
                              );
                              const pctVolume = Math.round(
                                (mod.copias / maxCopias) * 100
                              );

                              return (
                                <div key={mod.nome} className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="font-bold text-brand-ink truncate">
                                      {mod.nome}
                                    </span>
                                    <span className="text-brand-muted shrink-0">
                                      {mod.copias} un. ·{" "}
                                      <strong className="text-brand-ink font-extrabold">
                                        {formatCurrency(mod.receita)}
                                      </strong>
                                    </span>
                                  </div>

                                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-brand-cyan rounded-full transition-all"
                                      style={{
                                        width: `${Math.max(8, pctVolume)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ===========================================================
                    ABA 2: EXTRATO FINANCEIRO (ESTILO EXTRATO BANCÁRIO / ERP)
                =========================================================== */}
                {abaFinanceiro === "extrato" &&
                  (() => {
                    // Calcula saldo progressivo (acumulado) em ordem cronológica (do mais antigo para o mais recente)
                    const ordemCronologica = [
                      ...resumoFinanceiro.extratoFiltrado,
                    ].sort((a, b) => a.data.localeCompare(b.data));

                    const mapaSaldoApos = new Map<string, number>();
                    const mapaResumoDia = new Map<
                      string,
                      {
                        creditos: number;
                        debitos: number;
                        saldoFinalDia: number;
                      }
                    >();

                    let saldoCorrente = 0;
                    for (const mov of ordemCronologica) {
                      if (mov.natureza === "entrada") {
                        saldoCorrente += mov.valorReal;
                      } else {
                        saldoCorrente -= mov.valorReal;
                      }
                      mapaSaldoApos.set(mov.id, saldoCorrente);

                      const diaAtual = mapaResumoDia.get(mov.data) || {
                        creditos: 0,
                        debitos: 0,
                        saldoFinalDia: saldoCorrente,
                      };
                      if (mov.natureza === "entrada") {
                        diaAtual.creditos += mov.valorReal;
                      } else {
                        diaAtual.debitos += mov.valorReal;
                      }
                      diaAtual.saldoFinalDia = saldoCorrente;
                      mapaResumoDia.set(mov.data, diaAtual);
                    }

                    // Agrupa por data (mais recente no topo, padrão extrato bancário moderno)
                    const datasUnicas = Array.from(
                      new Set(
                        resumoFinanceiro.extratoFiltrado.map((i) => i.data)
                      )
                    ).sort((a, b) => b.localeCompare(a));

                    const saldoPeriodo =
                      resumoFinanceiro.somaEntradasExtrato -
                      resumoFinanceiro.somaSaidasExtrato;

                    return (
                      <div className="bg-white border border-brand-border rounded-2xl overflow-hidden shadow-xs tabular-nums">
                        {/* Resumo compacto do Extrato */}
                        <div className="px-5 py-3.5 border-b border-brand-border flex flex-wrap items-center justify-between gap-4 bg-[#FAFAFB]">
                          <div className="flex flex-wrap items-center gap-6 sm:gap-8">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
                                Entradas
                              </span>
                              <span className="text-base font-extrabold text-emerald-700">
                                +{" "}
                                {formatCurrency(
                                  resumoFinanceiro.somaEntradasExtrato
                                )}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
                                Saídas
                              </span>
                              <span className="text-base font-extrabold text-red-600">
                                −{" "}
                                {formatCurrency(
                                  resumoFinanceiro.somaSaidasExtrato
                                )}
                              </span>
                            </div>

                            <div className="pl-0 sm:pl-6 sm:border-l sm:border-brand-border">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
                                Saldo do Período
                              </span>
                              <span
                                className={`text-base font-extrabold ${
                                  saldoPeriodo >= 0
                                    ? "text-brand-ink"
                                    : "text-red-600"
                                }`}
                              >
                                {formatCurrency(saldoPeriodo)}
                              </span>
                            </div>
                          </div>

                          <span className="text-xs font-semibold text-brand-muted">
                            {resumoFinanceiro.extratoFiltrado.length}{" "}
                            {resumoFinanceiro.extratoFiltrado.length === 1
                              ? "movimentação"
                              : "movimentações"}
                          </span>
                        </div>

                        {/* Barra de Filtros Enxuta */}
                        <div className="px-5 py-3 border-b border-brand-border flex flex-wrap items-center justify-between gap-2.5">
                          <div className="inline-flex flex-wrap items-center bg-[#F3F4F6] p-1 rounded-xl gap-0.5">
                            {(
                              [
                                { id: "todos", label: "Todos" },
                                { id: "entradas", label: "Entradas" },
                                { id: "custo", label: "Custos" },
                                { id: "investimento", label: "Invest." },
                                { id: "perda", label: "Perdas" },
                              ] as const
                            ).map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setFiltroTipoLancamento(t.id)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                  filtroTipoLancamento === t.id
                                    ? "bg-white text-brand-ink shadow-xs"
                                    : "text-brand-muted hover:text-brand-ink"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial justify-end">
                            <div className="relative min-w-[190px]">
                              <Search className="w-3.5 h-3.5 text-brand-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type="text"
                                placeholder="Buscar movimentação..."
                                value={buscaFinanceiro}
                                onChange={(e) =>
                                  setBuscaFinanceiro(e.target.value)
                                }
                                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                              />
                            </div>

                            <select
                              value={filtroPagoExtrato}
                              onChange={(e) =>
                                setFiltroPagoExtrato(
                                  e.target.value as
                                    | "todos"
                                    | "pagos"
                                    | "pendentes"
                                )
                              }
                              className="px-2.5 py-1.5 text-xs bg-white border border-brand-border rounded-xl font-semibold text-brand-ink cursor-pointer"
                            >
                              <option value="todos">Todos os status</option>
                              <option value="pagos">✓ Pagos / Saídas</option>
                              <option value="pendentes">⏳ A Receber</option>
                            </select>

                            <select
                              value={filtroCategoriaLancamento}
                              onChange={(e) =>
                                setFiltroCategoriaLancamento(e.target.value)
                              }
                              className="px-2.5 py-1.5 text-xs bg-white border border-brand-border rounded-xl font-semibold text-brand-ink cursor-pointer"
                            >
                              <option value="">Todas as categorias</option>
                              <option value="venda_pedido">
                                Receita de Pedidos
                              </option>
                              {(
                                Object.keys(
                                  LANCAMENTO_CATEGORIA_LABEL
                                ) as LancamentoCategoria[]
                              ).map((catKey) => (
                                <option key={catKey} value={catKey}>
                                  {LANCAMENTO_CATEGORIA_LABEL[catKey]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Lista Limpa de Movimentações Agrupadas por Dia */}
                        {datasUnicas.length === 0 ? (
                          <div className="py-14 text-center text-xs text-brand-muted">
                            Nenhuma movimentação encontrada para o filtro
                            selecionado.
                          </div>
                        ) : (
                          <div className="divide-y divide-brand-border">
                            {datasUnicas.map((dataRef) => {
                              const itensDoDia =
                                resumoFinanceiro.extratoFiltrado.filter(
                                  (i) => i.data === dataRef
                                );
                              const resumoDia = mapaResumoDia.get(dataRef);

                              return (
                                <div key={dataRef}>
                                  {/* Cabeçalho discreto do dia */}
                                  <div className="px-5 py-2 bg-[#F8FAFC] border-b border-brand-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                    <span className="font-extrabold text-brand-ink uppercase tracking-wider">
                                      {formatDateBR(dataRef)}
                                    </span>
                                    <div className="flex items-center gap-3 font-semibold">
                                      {resumoDia && resumoDia.creditos > 0 && (
                                        <span className="text-emerald-700">
                                          +{formatCurrency(resumoDia.creditos)}
                                        </span>
                                      )}
                                      {resumoDia && resumoDia.debitos > 0 && (
                                        <span className="text-red-600">
                                          −{formatCurrency(resumoDia.debitos)}
                                        </span>
                                      )}
                                      <span className="text-brand-ink font-extrabold">
                                        Saldo:{" "}
                                        {formatCurrency(
                                          resumoDia?.saldoFinalDia || 0
                                        )}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Movimentações do dia */}
                                  <div className="divide-y divide-brand-border/50">
                                    {itensDoDia.map((item) => {
                                      const isEntrada =
                                        item.natureza === "entrada";

                                      return (
                                        <div
                                          key={item.id}
                                          className="px-5 py-3 bg-white hover:bg-[#FAFAFB] transition-colors flex items-center justify-between gap-4"
                                        >
                                          {/* Lado Esquerdo: Ícone + Descrição + Metadado curto */}
                                          <div className="flex items-center gap-3 min-w-0">
                                            <span
                                              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                                                isEntrada
                                                  ? "bg-emerald-50 text-emerald-700"
                                                  : "bg-red-50 text-red-600"
                                              }`}
                                              title={
                                                isEntrada
                                                  ? "Entrada (Crédito)"
                                                  : "Saída (Débito)"
                                              }
                                            >
                                              {isEntrada ? (
                                                <ArrowUp className="w-4 h-4" />
                                              ) : (
                                                <ArrowDown className="w-4 h-4" />
                                              )}
                                            </span>

                                            <div className="min-w-0">
                                              <p className="text-xs sm:text-sm font-bold text-brand-ink truncate">
                                                {item.descricao}
                                              </p>
                                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-brand-muted mt-0.5">
                                                <span>
                                                  {item.categoriaLabel}
                                                </span>
                                                <span>·</span>
                                                <span
                                                  className={`font-semibold ${
                                                    isEntrada
                                                      ? item.pago
                                                        ? "text-emerald-700"
                                                        : "text-amber-700"
                                                      : item.tipoKey === "perda"
                                                        ? "text-red-600"
                                                        : "text-brand-muted"
                                                  }`}
                                                >
                                                  {item.tipoLabel}
                                                </span>
                                              </div>
                                            </div>
                                          </div>

                                          {/* Lado Direito: Valor + Ações discretas */}
                                          <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right">
                                              <p
                                                className={`text-xs sm:text-sm font-extrabold ${
                                                  isEntrada
                                                    ? "text-emerald-700"
                                                    : "text-red-600"
                                                }`}
                                              >
                                                {isEntrada ? "+ " : "− "}
                                                {formatCurrency(item.valorReal)}
                                              </p>
                                            </div>

                                            {item.lancamentoOriginal ? (
                                              <div className="inline-flex items-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    abrirModalEditarLancamento(
                                                      item.lancamentoOriginal!
                                                    )
                                                  }
                                                  className="p-1.5 text-brand-muted hover:text-brand-cyan border border-transparent hover:border-brand-border rounded-lg cursor-pointer transition-colors"
                                                  title="Editar lançamento"
                                                >
                                                  <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={async () => {
                                                    const idDel =
                                                      item.lancamentoOriginal!
                                                        .id;
                                                    setLancamentos((prev) =>
                                                      prev.filter(
                                                        (l) => l.id !== idDel
                                                      )
                                                    );
                                                    const res =
                                                      await excluirLancamentoFinanceiroAction(
                                                        idDel
                                                      );
                                                    if (!res.ok) {
                                                      exibirAviso(
                                                        "erro",
                                                        res.erro ||
                                                          "Erro ao excluir lançamento."
                                                      );
                                                    } else {
                                                      exibirAviso(
                                                        "ok",
                                                        "Lançamento removido."
                                                      );
                                                    }
                                                  }}
                                                  className="p-1.5 text-brand-muted hover:text-red-600 border border-transparent hover:border-brand-border rounded-lg cursor-pointer transition-colors"
                                                  title="Excluir lançamento"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            ) : item.pedidoOriginal ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setPedidoSelecionadoId(
                                                    item.pedidoOriginal!.id
                                                  );
                                                  setConfirmandoCancelamento(
                                                    false
                                                  );
                                                }}
                                                className="px-2.5 py-1 text-[11px] font-bold text-brand-muted hover:text-brand-ink border border-brand-border rounded-lg bg-white cursor-pointer transition-colors"
                                              >
                                                Ver
                                              </button>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* ===========================================================
                    VISÃO 2: DEMONSTRATIVO DE RESULTADO (DRE) & MEIOS DE PAGAMENTO
                =========================================================== */}
                {abaFinanceiro === "dre" && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 tabular-nums">
                    {/* Coluna 1: DRE Gerencial Passo a Passo (Sem Juros do Cartão) */}
                    <div className="lg:col-span-6 bg-white border border-brand-border rounded-2xl overflow-hidden shadow-xs">
                      <div className="p-4 sm:p-5 border-b border-brand-border">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                          Demonstrativo de Resultado (DRE)
                        </h3>
                        <p className="text-[11px] text-brand-muted mt-0.5">
                          Apuração contábil abatendo juros de parcelamento do
                          cartão
                        </p>
                      </div>

                      <div className="divide-y divide-brand-border text-xs">
                        <div className="py-3.5 px-5 flex items-center justify-between">
                          <span className="text-brand-muted font-medium">
                            1. Valor Bruto Cobrado (c/ cartão)
                          </span>
                          <span className="font-bold text-brand-ink">
                            {formatCurrency(
                              resumoFinanceiro.faturamentoCobradoComJuros
                            )}
                          </span>
                        </div>

                        <div className="py-3.5 px-5 flex items-center justify-between">
                          <span className="text-red-600 font-medium">
                            2. (−) Juros de Parcelamento do Cartão
                          </span>
                          <span className="font-bold text-red-600">
                            − {formatCurrency(resumoFinanceiro.totalJurosCartao)}
                          </span>
                        </div>

                        <div className="py-3.5 px-5 flex items-center justify-between bg-white">
                          <span className="font-extrabold text-brand-ink">
                            3. (=) RECEITA LÍQUIDA DE VENDAS
                          </span>
                          <span className="text-sm font-extrabold text-emerald-700">
                            {formatCurrency(resumoFinanceiro.faturamentoBruto)}
                          </span>
                        </div>

                        <div className="py-3.5 px-5 flex items-center justify-between">
                          <span className="text-brand-muted font-medium">
                            4. (−) Custos de Produção (Papel, Tinta, Materiais)
                          </span>
                          <span className="font-bold text-brand-ink">
                            − {formatCurrency(resumoFinanceiro.totalCustos)}
                          </span>
                        </div>

                        <div className="py-3.5 px-5 flex items-center justify-between">
                          <span className="text-brand-muted font-medium">
                            5. (−) Perdas e Reimpressões
                          </span>
                          <span className="font-bold text-red-600">
                            − {formatCurrency(resumoFinanceiro.totalPerdas)}
                          </span>
                        </div>

                        <div className="py-3.5 px-5 flex items-center justify-between">
                          <div>
                            <span className="font-extrabold text-brand-ink block">
                              6. (=) LUCRO OPERACIONAL
                            </span>
                            <span className="text-[11px] text-brand-muted">
                              Margem:{" "}
                              {resumoFinanceiro.margemOperacional.toFixed(1)}%
                            </span>
                          </div>
                          <span className="text-sm font-extrabold text-brand-ink">
                            {formatCurrency(resumoFinanceiro.lucroOperacional)}
                          </span>
                        </div>

                        <div className="py-3.5 px-5 flex items-center justify-between">
                          <span className="text-brand-muted font-medium">
                            7. (−) Investimentos e Equipamentos
                          </span>
                          <span className="font-bold text-brand-cyan">
                            −{" "}
                            {formatCurrency(resumoFinanceiro.totalInvestimentos)}
                          </span>
                        </div>

                        <div className="py-4 px-5 flex items-center justify-between">
                          <div>
                            <span className="text-sm font-extrabold text-brand-ink block">
                              8. (=) SALDO LÍQUIDO
                            </span>
                            <span className="text-[11px] text-brand-muted">
                              Margem líquida:{" "}
                              {resumoFinanceiro.margemLiquida.toFixed(1)}%
                            </span>
                          </div>
                          <span
                            className={`text-lg font-extrabold ${
                              resumoFinanceiro.saldoLiquidoFinal >= 0
                                ? "text-emerald-700"
                                : "text-red-600"
                            }`}
                          >
                            {formatCurrency(resumoFinanceiro.saldoLiquidoFinal)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Coluna 2: Vendas por Forma de Pagamento */}
                    <div className="lg:col-span-6 bg-white border border-brand-border rounded-2xl overflow-hidden shadow-xs">
                      <div className="p-4 sm:p-5 border-b border-brand-border">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                          Vendas por Forma de Pagamento
                        </h3>
                        <p className="text-[11px] text-brand-muted mt-0.5">
                          Valor cobrado versus valor líquido sem juros
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-brand-border text-brand-muted uppercase font-bold text-[11px]">
                              <th className="py-3 px-4">Forma</th>
                              <th className="py-3 px-3 text-center">Pedidos</th>
                              <th className="py-3 px-3 text-right">
                                Bruto
                              </th>
                              <th className="py-3 px-3 text-right">
                                Juros
                              </th>
                              <th className="py-3 px-4 text-right">
                                Líquido
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border/70">
                            {(
                              [
                                "pix",
                                "dinheiro",
                                "debito",
                                "credito_avista",
                                "credito_parcelado",
                              ] as const
                            ).map((fpKey) => {
                              const d = resumoFinanceiro.porFormaPagamento[
                                fpKey
                              ] || {
                                qtd: 0,
                                cobrado: 0,
                                juros: 0,
                                total: 0,
                                pago: 0,
                              };
                              return (
                                <tr key={fpKey} className="bg-white">
                                  <td className="py-3.5 px-4 font-bold text-brand-ink">
                                    {FORMA_PAGAMENTO_LABEL[fpKey]}
                                  </td>
                                  <td className="py-3.5 px-3 text-center text-brand-muted font-semibold">
                                    {d.qtd}
                                  </td>
                                  <td className="py-3.5 px-3 text-right text-brand-muted">
                                    {formatCurrency(d.cobrado)}
                                  </td>
                                  <td className="py-3.5 px-3 text-right text-red-600 font-semibold">
                                    {d.juros > 0
                                      ? `− ${formatCurrency(d.juros)}`
                                      : "R$ 0,00"}
                                  </td>
                                  <td className="py-3.5 px-4 text-right font-extrabold text-emerald-700">
                                    {formatCurrency(d.total)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-brand-border font-extrabold text-brand-ink">
                              <td className="py-3.5 px-4">Total</td>
                              <td className="py-3.5 px-3 text-center">
                                {resumoFinanceiro.pedidosCount}
                              </td>
                              <td className="py-3.5 px-3 text-right">
                                {formatCurrency(
                                  resumoFinanceiro.faturamentoCobradoComJuros
                                )}
                              </td>
                              <td className="py-3.5 px-3 text-right text-red-600">
                                −{" "}
                                {formatCurrency(
                                  resumoFinanceiro.totalJurosCartao
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right text-emerald-700">
                                {formatCurrency(
                                  resumoFinanceiro.faturamentoBruto
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Modal de Lançamento de Custo / Investimento / Perda */}
                {modalLancamentoAberto && (
                  <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white border border-brand-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                      <div className="flex items-center justify-between border-b border-brand-border pb-3">
                        <div>
                          <h3 className="text-sm font-extrabold uppercase tracking-wider text-brand-ink">
                            {lancamentoForm.id
                              ? "Editar Lançamento Financeiro"
                              : "Novo Lançamento de Saída"}
                          </h3>
                          <p className="text-[11px] text-brand-muted mt-0.5">
                            Registre custos com insumos, investimentos ou perdas
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setModalLancamentoAberto(false)}
                          className="p-1.5 text-brand-muted hover:text-brand-ink border border-brand-border rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!lancamentoForm.descricao.trim()) return;
                          setSalvandoLancamento(true);
                          try {
                            const res = await salvarLancamentoFinanceiroAction({
                              id: lancamentoForm.id,
                              data: lancamentoForm.data,
                              tipo: lancamentoForm.tipo,
                              categoria: lancamentoForm.categoria,
                              descricao: lancamentoForm.descricao,
                              quantidade: Number(lancamentoForm.quantidade),
                              valor_unitario: Number(
                                lancamentoForm.valor_unitario
                              ),
                              observacao: lancamentoForm.observacao || null,
                            });
                            if (!res.ok || !res.lancamento) {
                              exibirAviso(
                                "erro",
                                res.erro || "Erro ao salvar lançamento."
                              );
                              return;
                            }
                            const salvo = res.lancamento;
                            if (lancamentoForm.id) {
                              setLancamentos((prev) =>
                                prev.map((l) => (l.id === salvo.id ? salvo : l))
                              );
                              exibirAviso("ok", "Lançamento atualizado!");
                            } else {
                              setLancamentos((prev) => [salvo, ...prev]);
                              exibirAviso("ok", "Lançamento registrado!");
                            }
                            setModalLancamentoAberto(false);
                          } finally {
                            setSalvandoLancamento(false);
                          }
                        }}
                        className="space-y-4 text-xs"
                      >
                        {/* Seletor Visual de Tipo (3 Botões Estilo Sistema Financeiro) */}
                        <div>
                          <label className="block font-bold text-brand-ink mb-1.5">
                            Classificação da Saída *
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {(
                              [
                                {
                                  id: "custo",
                                  titulo: "Custo",
                                  sub: "Papel, tinta, capas",
                                },
                                {
                                  id: "investimento",
                                  titulo: "Investimento",
                                  sub: "Máquinas e peças",
                                },
                                {
                                  id: "perda",
                                  titulo: "Perda",
                                  sub: "Refugo / reimpressão",
                                },
                              ] as {
                                id: LancamentoTipo;
                                titulo: string;
                                sub: string;
                              }[]
                            ).map((op) => {
                              const selecionado = lancamentoForm.tipo === op.id;
                              return (
                                <button
                                  key={op.id}
                                  type="button"
                                  onClick={() =>
                                    setLancamentoForm((prev) => ({
                                      ...prev,
                                      tipo: op.id,
                                      categoria:
                                        op.id === "perda"
                                          ? "perda_impressao"
                                          : op.id === "investimento"
                                            ? "impressora"
                                            : prev.categoria ===
                                                "perda_impressao"
                                              ? "papel"
                                              : prev.categoria,
                                    }))
                                  }
                                  className={`p-2.5 rounded-xl border text-left transition-all bg-white ${
                                    selecionado
                                      ? "border-brand-ink ring-2 ring-brand-ink/10"
                                      : "border-brand-border hover:border-brand-ink/40"
                                  }`}
                                >
                                  <span className="font-extrabold text-brand-ink block">
                                    {op.titulo}
                                  </span>
                                  <span className="text-[10px] text-brand-muted block mt-0.5">
                                    {op.sub}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-bold text-brand-ink mb-1">
                              Categoria / Insumo *
                            </label>
                            <select
                              value={lancamentoForm.categoria}
                              onChange={(e) =>
                                setLancamentoForm((prev) => ({
                                  ...prev,
                                  categoria: e.target
                                    .value as LancamentoCategoria,
                                }))
                              }
                              className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl"
                            >
                              <option value="papel">Papel / Sulfite</option>
                              <option value="tinta">Tinta / Toner</option>
                              <option value="materiais">
                                Materiais / Acabamento
                              </option>
                              <option value="impressora">
                                Impressora / Manutenção
                              </option>
                              <option value="equipamentos">Equipamentos</option>
                              <option value="perda_impressao">
                                Perda de Impressão
                              </option>
                              <option value="outros">Outros</option>
                            </select>
                          </div>

                          <div>
                            <label className="block font-bold text-brand-ink mb-1">
                              Data *
                            </label>
                            <input
                              type="date"
                              required
                              value={lancamentoForm.data}
                              onChange={(e) =>
                                setLancamentoForm((prev) => ({
                                  ...prev,
                                  data: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-brand-ink mb-1">
                            Descrição do Lançamento *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ex.: Caixa de Papel A4 (10 resmas), Kit Tinta CMYK..."
                            value={lancamentoForm.descricao}
                            onChange={(e) =>
                              setLancamentoForm((prev) => ({
                                ...prev,
                                descricao: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block font-bold text-brand-ink mb-1">
                              Quantidade *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={lancamentoForm.quantidade}
                              onChange={(e) =>
                                setLancamentoForm((prev) => ({
                                  ...prev,
                                  quantidade: Number(e.target.value),
                                }))
                              }
                              className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl"
                            />
                          </div>

                          <div>
                            <label className="block font-bold text-brand-ink mb-1">
                              Valor Unitário (R$) *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={lancamentoForm.valor_unitario || ""}
                              placeholder="0,00"
                              onChange={(e) =>
                                setLancamentoForm((prev) => ({
                                  ...prev,
                                  valor_unitario: Number(e.target.value),
                                }))
                              }
                              className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-brand-ink mb-1">
                            Fornecedor / Observação (opcional)
                          </label>
                          <input
                            type="text"
                            placeholder="Ex.: Fornecedor Atacado, Nota Fiscal, motivo da perda..."
                            value={lancamentoForm.observacao}
                            onChange={(e) =>
                              setLancamentoForm((prev) => ({
                                ...prev,
                                observacao: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-brand-border tabular-nums">
                          <span className="text-brand-muted font-semibold">
                            Valor Total da Saída:
                          </span>
                          <strong className="text-lg font-extrabold text-brand-ink">
                            {formatCurrency(
                              (Number(lancamentoForm.quantidade) || 0) *
                                (Number(lancamentoForm.valor_unitario) || 0)
                            )}
                          </strong>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setModalLancamentoAberto(false)}
                            className="px-4 py-2.5 bg-white border border-brand-border rounded-xl font-semibold text-brand-ink"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={salvandoLancamento}
                            className="px-5 py-2.5 bg-brand-magenta hover:bg-brand-magenta/90 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
                          >
                            {salvandoLancamento
                              ? "Salvando..."
                              : lancamentoForm.id
                                ? "Salvar Alterações"
                                : "Confirmar Lançamento"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===============================================================
                SEÇÃO CONTAS A PAGAR — MODO OFFLINE (AGUARDANDO COMANDO)
            =============================================================== */}
            {section === "contas_pagar" && (
              <div className="bg-white border border-brand-border rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-border pb-5">
                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-100 border border-brand-border text-[11px] font-extrabold uppercase tracking-wider text-brand-muted">
                      <span className="w-2 h-2 rounded-full bg-gray-400" />
                      Módulo Offline · Aguardando comando para iniciar
                    </div>
                    <h2 className="text-xl font-extrabold text-brand-ink">
                      Contas a Pagar & Compromissos Financeiros
                    </h2>
                    <p className="text-xs text-brand-muted max-w-2xl leading-relaxed">
                      Esta aba já foi estruturada e reservada no painel, mas permanece{" "}
                      <strong className="text-brand-ink">desativada (offline)</strong>{" "}
                      sem interferir no seu caixa atual até que você autorize o início.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-brand-border bg-[#FAFAFB] space-y-1.5">
                    <div className="flex items-center gap-2 text-brand-cyan font-extrabold text-xs uppercase tracking-wider">
                      <Clock className="w-4 h-4" />
                      <span>1. Controle de Vencimentos</span>
                    </div>
                    <p className="text-xs text-brand-muted leading-relaxed">
                      Cadastro de boletos de fornecedores (papel, tinta, espiral),
                      parcelas de equipamentos e despesas fixas (aluguel, energia,
                      internet) com alerta de contas vencendo na semana.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-brand-border bg-[#FAFAFB] space-y-1.5">
                    <div className="flex items-center gap-2 text-brand-magenta font-extrabold text-xs uppercase tracking-wider">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>2. Baixa Integrada ao Caixa</span>
                    </div>
                    <p className="text-xs text-brand-muted leading-relaxed">
                      Ao marcar uma conta como <strong>Paga</strong>, o sistema
                      poderá lançar automaticamente a saída no{" "}
                      <strong>Extrato de Caixa</strong> sem precisar digitar duas
                      vezes.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-brand-border bg-[#FAFAFB] space-y-1.5">
                    <div className="flex items-center gap-2 text-brand-ink font-extrabold text-xs uppercase tracking-wider">
                      <Download className="w-4 h-4 text-brand-yellow" />
                      <span>3. Relatório Excel Simples</span>
                    </div>
                    <p className="text-xs text-brand-muted leading-relaxed">
                      Planilha direta nas cores da RS Digital separando o que{" "}
                      <strong>Falta Pagar</strong>, o que está{" "}
                      <strong>Vencido</strong> e o que <strong>Já Foi Pago</strong> no mês.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-dashed border-brand-border bg-gray-50/70 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="text-brand-muted font-medium">
                    Status atual:{" "}
                    <strong className="text-brand-ink">
                      Offline (nenhum dado sendo cobrado ou somado ao financeiro)
                    </strong>
                  </span>
                  <span className="text-[11px] font-bold text-brand-cyan">
                    Pronto para ativação quando você solicitar
                  </span>
                </div>
              </div>
            )}

            {/* ===============================================================
                SEÇÃO 3: CATÁLOGO VISUAL DE MÓDULOS COM CAPAS
            =============================================================== */}
            {section === "cadastros" &&
              (() => {
                const colegioAtualObj =
                  colegios.find((c) => c.id === colegioAtivoCadastro) || null;
                const serieAtualObj =
                  series.find((s) => s.id === serieAtivaCadastro) || null;

                const seriesFund = seriesDoColegioAtivo.filter((s) =>
                  /fund/i.test(s.nome)
                );
                const seriesMedio = seriesDoColegioAtivo.filter((s) =>
                  /m[eé]d/i.test(s.nome)
                );
                const seriesOutras = seriesDoColegioAtivo.filter(
                  (s) => !/fund/i.test(s.nome) && !/m[eé]d/i.test(s.nome)
                );

                const handleUploadFotoCapa = (
                  e: React.ChangeEvent<HTMLInputElement>
                ) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement("canvas");
                      const maxW = 420;
                      const maxH = 580;
                      let w = img.width;
                      let h = img.height;
                      if (w > maxW || h > maxH) {
                        const ratio = Math.min(maxW / w, maxH / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                      }
                      canvas.width = w;
                      canvas.height = h;
                      const ctx = canvas.getContext("2d");
                      if (ctx) {
                        ctx.drawImage(img, 0, 0, w, h);
                        const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
                        setModuloForm((prev) => ({
                          ...prev,
                          capa_url: dataUrl,
                        }));
                      }
                    };
                    if (typeof reader.result === "string") {
                      img.src = reader.result;
                    }
                  };
                  reader.readAsDataURL(file);
                };

                return (
                  <div className="space-y-4">
                    {/* Sub-abas simples dentro de Catálogo Escolar */}
                    <div className="bg-white border border-brand-border rounded-2xl p-2 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAbaCatalogo("modulos");
                            setModuloVitrineAbertoId(null);
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            abaCatalogo === "modulos"
                              ? "bg-brand-ink text-white"
                              : "text-brand-muted hover:text-brand-ink bg-white"
                          }`}
                        >
                          Módulos por Colégio & Série
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAbaCatalogo("livros");
                            setModuloVitrineAbertoId(null);
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            abaCatalogo === "livros"
                              ? "bg-brand-ink text-white"
                              : "text-brand-muted hover:text-brand-ink bg-white"
                          }`}
                        >
                          Livros & Preços ({livros.length})
                        </button>
                      </div>

                      {abaCatalogo === "livros" && (
                        <span className="text-xs text-brand-muted px-3">
                          Valores individuais usados na composição dos módulos
                        </span>
                      )}
                    </div>

                    {abaCatalogo === "modulos" && (
                      <>
                        {/* BARRA DE NAVEGAÇÃO DO CATÁLOGO: COLÉGIO + SÉRIES (oculta quando dentro da página de um módulo) */}
                        {!moduloVitrineAbertoId && (
                          <div className="bg-white border border-brand-border rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
                            {/* Linha 1: Seleção de Colégio em Caixa de Seleção (Dropdown) */}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
                                <label
                                  htmlFor="catalogo-select-colegio"
                                  className="text-xs font-extrabold text-brand-muted shrink-0 w-14"
                                >
                                  Colégio:
                                </label>
                                <div className="relative w-full sm:w-80">
                                  <select
                                    id="catalogo-select-colegio"
                                    value={colegioAtivoCadastro}
                                    onChange={(e) => {
                                      const novoColId = e.target.value;
                                      setColegioAtivoCadastro(novoColId);
                                      setEditandoSerie(null);
                                      setMostrarFormSerie(false);
                                      setModuloVitrineAbertoId(null);
                                      setMostrarFormModulo(false);
                                      const primeiraSerie = series
                                        .filter((s) => s.colegio_id === novoColId)
                                        .sort((a, b) => a.ordem - b.ordem)[0];
                                      setSerieAtivaCadastro(
                                        primeiraSerie?.id || ""
                                      );
                                    }}
                                    className="w-full appearance-none pl-3.5 pr-9 py-2 text-xs font-bold text-brand-ink bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan cursor-pointer"
                                  >
                                    {colegios.length === 0 ? (
                                      <option value="">
                                        Nenhum colégio cadastrado
                                      </option>
                                    ) : (
                                      colegios.map((col) => (
                                        <option key={col.id} value={col.id}>
                                          {col.nome}
                                          {!col.ativo ? " (Inativo)" : ""}
                                        </option>
                                      ))
                                    )}
                                  </select>
                                  <ChevronDown className="w-4 h-4 text-brand-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                              </div>

                        <div className="flex items-center gap-3 text-xs">
                          {colegioAtualObj && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditandoColegio(colegioAtualObj);
                                  setNovoColegioNome(colegioAtualObj.nome);
                                  setMostrarFormColegio(true);
                                }}
                                className="text-brand-muted hover:text-brand-ink font-semibold cursor-pointer"
                              >
                                Renomear
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const novoAtivo = !colegioAtualObj.ativo;
                                  setColegios((prev) =>
                                    prev.map((c) =>
                                      c.id === colegioAtualObj.id
                                        ? { ...c, ativo: novoAtivo }
                                        : c
                                    )
                                  );
                                  await salvarColegioAction({
                                    id: colegioAtualObj.id,
                                    nome: colegioAtualObj.nome,
                                    ativo: novoAtivo,
                                  });
                                }}
                                className="text-brand-muted hover:text-brand-ink font-semibold cursor-pointer"
                              >
                                {colegioAtualObj.ativo
                                  ? "Desativar"
                                  : "Ativar"}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditandoColegio(null);
                              setNovoColegioNome("");
                              setMostrarFormColegio((v) => !v);
                            }}
                            className="inline-flex items-center gap-1 font-bold text-brand-cyan hover:text-brand-ink cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Novo colégio
                          </button>
                        </div>
                      </div>

                      {mostrarFormColegio && (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!novoColegioNome.trim()) return;
                            const res = await salvarColegioAction({
                              id: editandoColegio?.id,
                              nome: novoColegioNome,
                              ativo: editandoColegio
                                ? editandoColegio.ativo
                                : true,
                            });
                            if (!res.ok || !res.colegio) {
                              exibirAviso(
                                "erro",
                                res.erro || "Erro ao salvar colégio."
                              );
                              return;
                            }
                            const salvo = res.colegio;
                            if (editandoColegio) {
                              setColegios((prev) =>
                                prev.map((c) =>
                                  c.id === salvo.id ? salvo : c
                                )
                              );
                              exibirAviso("ok", "Colégio atualizado!");
                            } else {
                              setColegios((prev) => [...prev, salvo]);
                              setColegioAtivoCadastro(salvo.id);
                              setSerieAtivaCadastro("");
                              exibirAviso("ok", "Colégio adicionado!");
                            }
                            setEditandoColegio(null);
                            setNovoColegioNome("");
                            setMostrarFormColegio(false);
                          }}
                          className="flex flex-wrap items-center gap-2 pt-2 border-t border-brand-border/60 max-w-md"
                        >
                          <input
                            type="text"
                            autoFocus
                            placeholder="Nome do colégio..."
                            value={novoColegioNome}
                            onChange={(e) => setNovoColegioNome(e.target.value)}
                            className="flex-1 px-3 py-2 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                          />
                          <button
                            type="submit"
                            className="px-3.5 py-2 bg-brand-ink text-white text-xs font-bold rounded-xl cursor-pointer"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMostrarFormColegio(false);
                              setEditandoColegio(null);
                              setNovoColegioNome("");
                            }}
                            className="px-3 py-2 text-xs font-semibold text-brand-muted hover:text-brand-ink cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </form>
                      )}

                      {/* Linha 2: Seleção de Série em Caixa de Seleção (Dropdown) */}
                      {colegioAtivoCadastro && (
                        <div className="pt-3.5 border-t border-brand-border space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
                              <label
                                htmlFor="catalogo-select-serie"
                                className="text-xs font-extrabold text-brand-muted shrink-0 w-14"
                              >
                                Série:
                              </label>
                              <div className="relative w-full sm:w-80">
                                <select
                                  id="catalogo-select-serie"
                                  value={serieAtivaCadastro}
                                  onChange={(e) => {
                                    setSerieAtivaCadastro(e.target.value);
                                    setModuloVitrineAbertoId(null);
                                    setMostrarFormModulo(false);
                                  }}
                                  className="w-full appearance-none pl-3.5 pr-9 py-2 text-xs font-bold text-brand-ink bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan cursor-pointer"
                                >
                                  {seriesDoColegioAtivo.length === 0 ? (
                                    <option value="">
                                      Nenhuma série cadastrada
                                    </option>
                                  ) : (
                                    <>
                                      {seriesFund.length > 0 && (
                                        <optgroup label="Ensino Fundamental (1º ao 9º ano)">
                                          {seriesFund.map((ser) => (
                                            <option key={ser.id} value={ser.id}>
                                              {ser.nome}
                                              {!ser.ativo ? " (Inativa)" : ""}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      {seriesMedio.length > 0 && (
                                        <optgroup label="Ensino Médio (1ª à 3ª série)">
                                          {seriesMedio.map((ser) => (
                                            <option key={ser.id} value={ser.id}>
                                              {ser.nome}
                                              {!ser.ativo ? " (Inativa)" : ""}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      {seriesOutras.length > 0 && (
                                        <optgroup label="Outras Séries">
                                          {seriesOutras.map((ser) => (
                                            <option key={ser.id} value={ser.id}>
                                              {ser.nome}
                                              {!ser.ativo ? " (Inativa)" : ""}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                    </>
                                  )}
                                </select>
                                <ChevronDown className="w-4 h-4 text-brand-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-xs shrink-0">
                              {seriesDoColegioAtivo.length < 12 && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const faltantes =
                                      SERIES_PADRAO_ESCOLARES.filter(
                                        (padrao) =>
                                          !seriesDoColegioAtivo.some(
                                            (s) =>
                                              s.nome.toLowerCase() ===
                                              padrao.nome.toLowerCase()
                                          )
                                      );
                                    if (faltantes.length === 0) return;
                                    const novas: Serie[] = [];
                                    for (const f of faltantes) {
                                      const res = await salvarSerieAction({
                                        colegio_id: colegioAtivoCadastro,
                                        nome: f.nome,
                                        ordem: f.ordem,
                                        ativo: true,
                                      });
                                      if (res.ok && res.serie) {
                                        novas.push(res.serie);
                                      }
                                    }
                                    if (novas.length > 0) {
                                      setSeries((prev) => [...prev, ...novas]);
                                      if (!serieAtivaCadastro) {
                                        setSerieAtivaCadastro(novas[0].id);
                                      }
                                      exibirAviso(
                                        "ok",
                                        "Séries do Fundamental e Médio adicionadas!"
                                      );
                                    }
                                  }}
                                  className="font-semibold text-brand-muted hover:text-brand-ink cursor-pointer"
                                >
                                  Gerar séries padrão
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditandoSerie(null);
                                  setNovaSerieNome("");
                                  setNovaSerieOrdem(
                                    seriesDoColegioAtivo.length + 1
                                  );
                                  setMostrarFormSerie((v) => !v);
                                }}
                                className="inline-flex items-center gap-1 font-bold text-brand-cyan hover:text-brand-ink cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Nova série
                              </button>
                            </div>
                          </div>

                          {mostrarFormSerie && (
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (!novaSerieNome.trim()) return;
                                const padraoMatch =
                                  SERIES_PADRAO_ESCOLARES.find(
                                    (p) => p.nome === novaSerieNome.trim()
                                  );
                                const ordemFinal = editandoSerie
                                  ? novaSerieOrdem
                                  : padraoMatch?.ordem ||
                                    seriesDoColegioAtivo.length + 1;
                                const res = await salvarSerieAction({
                                  id: editandoSerie?.id,
                                  colegio_id: colegioAtivoCadastro,
                                  nome: novaSerieNome,
                                  ordem: ordemFinal,
                                  ativo: editandoSerie
                                    ? editandoSerie.ativo
                                    : true,
                                });
                                if (!res.ok || !res.serie) {
                                  exibirAviso(
                                    "erro",
                                    res.erro || "Erro ao salvar série."
                                  );
                                  return;
                                }
                                const salva = res.serie;
                                if (editandoSerie) {
                                  setSeries((prev) =>
                                    prev.map((s) =>
                                      s.id === salva.id ? salva : s
                                    )
                                  );
                                  exibirAviso("ok", "Série atualizada!");
                                } else {
                                  setSeries((prev) => [...prev, salva]);
                                  setSerieAtivaCadastro(salva.id);
                                  exibirAviso("ok", "Série criada!");
                                }
                                setEditandoSerie(null);
                                setNovaSerieNome("");
                                setMostrarFormSerie(false);
                              }}
                              className="flex flex-wrap items-center gap-2 pt-2 border-t border-brand-border/60 max-w-lg"
                            >
                              <input
                                type="text"
                                autoFocus
                                list="series-padrao-escolar-list"
                                placeholder="Ex.: 6º ano — Ensino Fundamental"
                                value={novaSerieNome}
                                onChange={(e) =>
                                  setNovaSerieNome(e.target.value)
                                }
                                className="flex-1 px-3 py-2 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                              />
                              <datalist id="series-padrao-escolar-list">
                                {SERIES_PADRAO_ESCOLARES.map((p) => (
                                  <option key={p.slug} value={p.nome} />
                                ))}
                              </datalist>
                              <button
                                type="submit"
                                className="px-3.5 py-2 bg-brand-ink text-white text-xs font-bold rounded-xl cursor-pointer"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMostrarFormSerie(false);
                                  setEditandoSerie(null);
                                  setNovaSerieNome("");
                                }}
                                className="px-3 py-2 text-xs font-semibold text-brand-muted hover:text-brand-ink cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                          </div>
                        )}

                    {/* VITRINE VISUAL DE MÓDULOS DA SÉRIE (CARDS COM CAPA) */}
                    {serieAtualObj && (
                      <div className="space-y-4">
                        {/* Cabeçalho da Série (exibido na visão geral dos módulos) */}
                        {!moduloVitrineAbertoId && (
                          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                            <div>
                              <h3 className="text-base font-extrabold text-brand-ink">
                                {serieAtualObj.nome}
                              </h3>
                              <p className="text-xs text-brand-muted">
                                {colegioAtualObj?.nome} ·{" "}
                                {modulosDaSerieAtiva.length}{" "}
                                {modulosDaSerieAtiva.length === 1
                                  ? "módulo na vitrine"
                                  : "módulos na vitrine"}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditandoSerie(serieAtualObj);
                                  setNovaSerieNome(serieAtualObj.nome);
                                  setNovaSerieOrdem(serieAtualObj.ordem);
                                  setMostrarFormSerie(true);
                                }}
                                className="px-3 py-1.5 border border-brand-border rounded-xl font-semibold text-brand-muted hover:text-brand-ink bg-white cursor-pointer"
                              >
                                Renomear série
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDuplicarModalSerie(serieAtualObj);
                                  setDuplicarColegioDestino(
                                    serieAtualObj.colegio_id
                                  );
                                  setDuplicarNovoNome(
                                    `${serieAtualObj.nome} (Cópia)`
                                  );
                                }}
                                className="px-3 py-1.5 border border-brand-border rounded-xl font-semibold text-brand-muted hover:text-brand-ink bg-white cursor-pointer"
                              >
                                Duplicar série
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const proxOrdem =
                                    modulosDaSerieAtiva.length + 1;
                                  const livrosPadrao = getLivrosPadraoPorModulo(
                                    "1º Trimestre",
                                    serieAtualObj.nome,
                                    livros
                                  );
                                  const somaPadrao = Number(
                                    livrosPadrao
                                      .reduce(
                                        (acc, item) => acc + Number(item.valor),
                                        0
                                      )
                                      .toFixed(2)
                                  );
                                  setModuloForm({
                                    nome: "",
                                    ordem: proxOrdem,
                                    valor: somaPadrao || 300,
                                    link_arquivo: "",
                                    ativo: true,
                                    disciplinas: livrosPadrao.map((l) => l.nome),
                                    livros: livrosPadrao,
                                    capa_url: getCapaPadraoPorOrdem(proxOrdem),
                                  });
                                  setMostrarFormModulo((v) => !v);
                                }}
                                className="px-4 py-2 bg-brand-magenta hover:bg-brand-magenta/90 text-white font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Plus className="w-4 h-4" />
                                Novo módulo
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Painel de Criação/Edição de Módulo com Prévia da Capa ao Vivo */}
                        {mostrarFormModulo && (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (!moduloForm.nome.trim()) return;
                              const ordemFinal = moduloForm.id
                                ? moduloForm.ordem
                                : modulosDaSerieAtiva.length + 1;
                              const livrosSalvar =
                                moduloForm.livros.length > 0
                                  ? moduloForm.livros
                                  : getLivrosPadraoPorModulo(
                                      moduloForm.nome,
                                      serieAtualObj.nome,
                                      livros
                                    );
                              const res = await salvarModuloAction({
                                id: moduloForm.id,
                                serie_id: serieAtivaCadastro,
                                nome: moduloForm.nome,
                                ordem: ordemFinal,
                                valor: moduloForm.valor,
                                link_arquivo: moduloForm.link_arquivo,
                                ativo: moduloForm.ativo,
                                disciplinas: livrosSalvar.map((l) => l.nome),
                                livros: livrosSalvar,
                                capa_url:
                                  moduloForm.capa_url ||
                                  getCapaPadraoPorOrdem(ordemFinal),
                              });
                              if (!res.ok || !res.modulo) {
                                exibirAviso(
                                  "erro",
                                  res.erro || "Erro ao salvar módulo."
                                );
                                return;
                              }
                              const salvo = res.modulo;
                              if (moduloForm.id) {
                                setModulos((prev) =>
                                  prev.map((m) =>
                                    m.id === salvo.id ? salvo : m
                                  )
                                );
                                exibirAviso("ok", "Módulo atualizado!");
                              } else {
                                setModulos((prev) => [...prev, salvo]);
                                exibirAviso("ok", "Módulo adicionado!");
                              }
                              const novaOrdem = modulosDaSerieAtiva.length + 2;
                              const livrosProx = getLivrosPadraoPorModulo(
                                "1º Trimestre",
                                serieAtualObj.nome,
                                livros
                              );
                              setModuloForm({
                                nome: "",
                                ordem: novaOrdem,
                                valor: Number(
                                  livrosProx
                                    .reduce(
                                      (acc, item) => acc + Number(item.valor),
                                      0
                                    )
                                    .toFixed(2)
                                ),
                                link_arquivo: "",
                                ativo: true,
                                disciplinas: livrosProx.map((l) => l.nome),
                                livros: livrosProx,
                                capa_url: getCapaPadraoPorOrdem(novaOrdem),
                              });
                              setMostrarFormModulo(false);
                            }}
                            className="p-5 rounded-2xl border border-brand-border bg-white shadow-sm space-y-4 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border pb-3">
                              <span className="text-sm font-extrabold text-brand-ink">
                                {moduloForm.id
                                  ? `Editando: ${moduloForm.nome}`
                                  : "Cadastrar novo módulo"}
                              </span>
                              <div className="flex flex-wrap items-center gap-1">
                                {[
                                  {
                                    nome: "1º Trimestre",
                                    capa: "preset:cmyk-cyan",
                                  },
                                  {
                                    nome: "2º Trimestre",
                                    capa: "preset:cmyk-magenta",
                                  },
                                  {
                                    nome: "3º Trimestre",
                                    capa: "preset:cmyk-amber",
                                  },
                                  {
                                    nome: "4º Trimestre",
                                    capa: "preset:cmyk-emerald",
                                  },
                                  {
                                    nome: "Paradidáticos",
                                    capa: "preset:cmyk-indigo",
                                  },
                                  {
                                    nome: "Volume Único",
                                    capa: "preset:cmyk-dark",
                                  },
                                ].map((sug) => (
                                  <button
                                    key={sug.nome}
                                    type="button"
                                    onClick={() => {
                                      const livrosSug =
                                        getLivrosPadraoPorModulo(
                                          sug.nome,
                                          serieAtualObj.nome,
                                          livros
                                        );
                                      const somaSug = Number(
                                        livrosSug
                                          .reduce(
                                            (acc, item) =>
                                              acc + Number(item.valor),
                                            0
                                          )
                                          .toFixed(2)
                                      );
                                      setModuloForm((prev) => ({
                                        ...prev,
                                        nome: sug.nome,
                                        valor: somaSug || prev.valor,
                                        livros: livrosSug,
                                        disciplinas: livrosSug.map(
                                          (l) => l.nome
                                        ),
                                        capa_url: prev.capa_url.startsWith(
                                          "preset:"
                                        )
                                          ? sug.capa
                                          : prev.capa_url,
                                      }));
                                    }}
                                    className="px-2.5 py-1 rounded-lg border border-brand-border text-[11px] font-semibold text-brand-muted hover:text-brand-ink bg-white cursor-pointer"
                                  >
                                    {sug.nome}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                              {/* Coluna Esquerda do Form: Prévia da Capa + Seletor de Capas */}
                              <div className="md:col-span-4 flex flex-col items-center p-4 rounded-xl border border-brand-border bg-[#FAFAFB] space-y-3">
                                <ModuloCapaPreview
                                  nomeModulo={
                                    moduloForm.nome || "Nome do Módulo"
                                  }
                                  nomeSerie={serieAtualObj.nome}
                                  nomeColegio={colegioAtualObj?.nome}
                                  ordem={moduloForm.ordem}
                                  capaUrl={moduloForm.capa_url}
                                  qtdDisciplinas={moduloForm.livros.length}
                                  size="lg"
                                />

                                <div className="w-full space-y-2 text-center">
                                  <span className="text-[11px] font-bold text-brand-ink block">
                                    Modelos de capa prontos:
                                  </span>
                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    {CAPA_EXEMPLOS.map((preset) => {
                                      const selecionado =
                                        moduloForm.capa_url === preset.id;
                                      return (
                                        <button
                                          key={preset.id}
                                          type="button"
                                          title={preset.nome}
                                          onClick={() =>
                                            setModuloForm((prev) => ({
                                              ...prev,
                                              capa_url: preset.id,
                                            }))
                                          }
                                          style={{
                                            backgroundColor:
                                              preset.corPrincipal,
                                          }}
                                          className={`w-6 h-6 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                                            selecionado
                                              ? "ring-2 ring-offset-2 ring-brand-ink scale-110"
                                              : "opacity-80 hover:opacity-100"
                                          }`}
                                        >
                                          {selecionado && (
                                            <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  <div className="pt-1 flex flex-col gap-1.5">
                                    <label className="w-full py-1.5 px-3 rounded-lg border border-brand-border bg-white hover:border-brand-ink text-[11px] font-bold text-brand-ink cursor-pointer inline-flex items-center justify-center gap-1.5 transition-colors">
                                      <span>📷 Enviar foto de capa</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleUploadFotoCapa}
                                        className="hidden"
                                      />
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="Ou cole URL da imagem..."
                                      value={
                                        moduloForm.capa_url.startsWith(
                                          "preset:"
                                        ) ||
                                        moduloForm.capa_url.startsWith("data:")
                                          ? ""
                                          : moduloForm.capa_url
                                      }
                                      onChange={(e) =>
                                        setModuloForm((prev) => ({
                                          ...prev,
                                          capa_url:
                                            e.target.value ||
                                            "preset:cmyk-cyan",
                                        }))
                                      }
                                      className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-brand-border rounded-lg focus:outline-none focus:border-brand-cyan"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Coluna Direita do Form: Dados, Livros que compõem o módulo e Ações */}
                              <div className="md:col-span-8 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                                  <div className="sm:col-span-8">
                                    <label className="block font-bold text-brand-ink mb-1">
                                      Nome do módulo
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      placeholder="Ex.: 1º Trimestre ou Paradidáticos"
                                      value={moduloForm.nome}
                                      onChange={(e) =>
                                        setModuloForm((prev) => ({
                                          ...prev,
                                          nome: e.target.value,
                                        }))
                                      }
                                      className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                                    />
                                  </div>
                                  <div className="sm:col-span-4">
                                    <label className="block font-bold text-brand-ink mb-1">
                                      Valor total do módulo (R$)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      required
                                      value={moduloForm.valor}
                                      onChange={(e) =>
                                        setModuloForm((prev) => ({
                                          ...prev,
                                          valor: Number(e.target.value),
                                        }))
                                      }
                                      className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl font-bold tabular-nums focus:outline-none focus:border-brand-cyan"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="block font-bold text-brand-ink mb-1">
                                    Link do arquivo PDF (Drive / OneDrive) ou
                                    pasta na rede
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="https://drive.google.com/..."
                                    value={moduloForm.link_arquivo}
                                    onChange={(e) =>
                                      setModuloForm((prev) => ({
                                        ...prev,
                                        link_arquivo: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                                  />
                                </div>

                                {/* Livros que compõem este módulo */}
                                <div className="space-y-2.5 pt-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-bold text-brand-ink">
                                      Livros que compõem este módulo (
                                      {moduloForm.livros.length}{" "}
                                      {moduloForm.livros.length === 1
                                        ? "livro"
                                        : "livros"}{" "}
                                      ·{" "}
                                      {formatCurrency(
                                        moduloForm.livros.reduce(
                                          (acc, l) => acc + Number(l.valor),
                                          0
                                        )
                                      )}
                                      ):
                                    </span>
                                    <div className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const livrosPadrao =
                                            getLivrosPadraoPorModulo(
                                              moduloForm.nome || "1º Trimestre",
                                              serieAtualObj.nome,
                                              livros
                                            );
                                          const somaPadrao = Number(
                                            livrosPadrao
                                              .reduce(
                                                (acc, l) =>
                                                  acc + Number(l.valor),
                                                0
                                              )
                                              .toFixed(2)
                                          );
                                          setModuloForm((prev) => ({
                                            ...prev,
                                            livros: livrosPadrao,
                                            disciplinas: livrosPadrao.map(
                                              (l) => l.nome
                                            ),
                                            valor: somaPadrao || prev.valor,
                                          }));
                                        }}
                                        className="text-[11px] font-semibold text-brand-cyan hover:text-brand-ink cursor-pointer"
                                      >
                                        Restaurar padrão da série
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setAbaCatalogo("livros")}
                                        className="text-[11px] font-bold text-brand-ink hover:text-brand-cyan underline cursor-pointer"
                                      >
                                        + Cadastrar / Editar preços de livros
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
                                    {livros
                                      .filter((l) => l.ativo)
                                      .map((livroCat) => {
                                        const itemNoModulo =
                                          moduloForm.livros.find(
                                            (item) =>
                                              item.id === livroCat.id ||
                                              item.nome.toLowerCase() ===
                                                livroCat.nome.toLowerCase()
                                          );
                                        const ativoNoModulo = Boolean(itemNoModulo);
                                        return (
                                          <button
                                            key={livroCat.id}
                                            type="button"
                                            onClick={() =>
                                              setModuloForm((prev) => {
                                                const jaTem = prev.livros.some(
                                                  (item) =>
                                                    item.id === livroCat.id ||
                                                    item.nome.toLowerCase() ===
                                                      livroCat.nome.toLowerCase()
                                                );
                                                if (
                                                  jaTem &&
                                                  prev.livros.length <= 1
                                                ) {
                                                  return prev;
                                                }
                                                const novosLivros = jaTem
                                                  ? prev.livros.filter(
                                                      (item) =>
                                                        item.id !==
                                                          livroCat.id &&
                                                        item.nome.toLowerCase() !==
                                                          livroCat.nome.toLowerCase()
                                                    )
                                                  : [
                                                      ...prev.livros,
                                                      {
                                                        id: livroCat.id,
                                                        nome: livroCat.nome,
                                                        valor: livroCat.valor,
                                                        serie_nome:
                                                          serieAtualObj.nome,
                                                        capa_url:
                                                          resolverCapaLivroParaSerie(
                                                            livroCat,
                                                            serieAtualObj.nome
                                                          ),
                                                      },
                                                    ];
                                                const novaSoma = Number(
                                                  novosLivros
                                                    .reduce(
                                                      (acc, item) =>
                                                        acc +
                                                        Number(item.valor),
                                                      0
                                                    )
                                                    .toFixed(2)
                                                );
                                                return {
                                                  ...prev,
                                                  livros: novosLivros,
                                                  disciplinas: novosLivros.map(
                                                    (item) => item.nome
                                                  ),
                                                  valor: novaSoma,
                                                };
                                              })
                                            }
                                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left text-xs transition-all bg-white cursor-pointer ${
                                              ativoNoModulo
                                                ? "border-brand-ink text-brand-ink font-bold"
                                                : "border-brand-border text-brand-muted hover:text-brand-ink"
                                            }`}
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span
                                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                                  ativoNoModulo
                                                    ? "border-brand-ink text-brand-ink"
                                                    : "border-brand-border text-transparent"
                                                }`}
                                              >
                                                <Check className="w-3 h-3 stroke-[3]" />
                                              </span>
                                              <span className="truncate block">
                                                {livroCat.nome}
                                              </span>
                                            </div>
                                            <span className="font-bold tabular-nums shrink-0 text-brand-ink">
                                              {formatCurrency(livroCat.valor)}
                                            </span>
                                          </button>
                                        );
                                      })}
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-brand-border">
                                  <button
                                    type="button"
                                    onClick={() => setMostrarFormModulo(false)}
                                    className="px-3.5 py-2 text-brand-muted hover:text-brand-ink font-semibold cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="submit"
                                    className="px-5 py-2 bg-brand-ink text-white font-bold rounded-xl cursor-pointer"
                                  >
                                    Salvar módulo
                                  </button>
                                </div>
                              </div>
                            </div>
                          </form>
                        )}

                        {/* PÁGINA DEDICADA DAS MATÉRIAS DO MÓDULO OU GRADE DE MÓDULOS DA SÉRIE */}
                        {(() => {
                          const modAberto = moduloVitrineAbertoId
                            ? modulosDaSerieAtiva.find(
                                (m) => m.id === moduloVitrineAbertoId
                              ) || null
                            : null;

                          if (modAberto) {
                            const livrosModAberto =
                              Array.isArray(modAberto.livros) &&
                              modAberto.livros.length > 0
                                ? modAberto.livros
                                : getLivrosPadraoPorModulo(
                                    modAberto.nome,
                                    serieAtualObj.nome,
                                    livros
                                  );
                            const discsAberto = livrosModAberto.map(
                              (l) => l.nome
                            );

                            return (
                              <div className="space-y-4">
                                {/* Barra de Navegação da Página do Módulo */}
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModuloVitrineAbertoId(null);
                                      setMostrarFormModulo(false);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-brand-border bg-white hover:border-brand-ink text-xs font-bold text-brand-ink transition-colors cursor-pointer shadow-2xs"
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                    <span>Voltar para módulos</span>
                                  </button>

                                  {modulosDaSerieAtiva.length > 1 && (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {modulosDaSerieAtiva.map((mNav) => {
                                        const isAtivo =
                                          mNav.id === modAberto.id;
                                        return (
                                          <button
                                            key={mNav.id}
                                            type="button"
                                            onClick={() => {
                                              setModuloVitrineAbertoId(mNav.id);
                                              setMostrarFormModulo(false);
                                            }}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                              isAtivo
                                                ? "bg-brand-ink text-white border-brand-ink"
                                                : "bg-white text-brand-muted hover:text-brand-ink border-brand-border"
                                            }`}
                                          >
                                            {mNav.nome}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* Cabeçalho da Página do Módulo */}
                                <div className="bg-white border border-brand-border rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
                                  <div className="flex items-center gap-4 min-w-0">
                                    <div className="bg-[#F6F7F9] border border-brand-border/80 rounded-xl p-2.5 shrink-0">
                                      <ModuloCapaPreview
                                        nomeModulo={modAberto.nome}
                                        nomeSerie={serieAtualObj.nome}
                                        nomeColegio={colegioAtualObj?.nome}
                                        ordem={modAberto.ordem}
                                        capaUrl={modAberto.capa_url}
                                        qtdDisciplinas={livrosModAberto.length}
                                        size="sm"
                                      />
                                    </div>

                                    <div className="space-y-1 min-w-0">
                                      <p className="text-xs font-semibold text-brand-muted truncate">
                                        {colegioAtualObj?.nome} ·{" "}
                                        {serieAtualObj.nome}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-lg font-extrabold text-brand-ink leading-tight">
                                          {modAberto.nome}
                                        </h3>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const novoAtivo = !modAberto.ativo;
                                            setModulos((prev) =>
                                              prev.map((m) =>
                                                m.id === modAberto.id
                                                  ? { ...m, ativo: novoAtivo }
                                                  : m
                                              )
                                            );
                                            await salvarModuloAction({
                                              id: modAberto.id,
                                              serie_id: modAberto.serie_id,
                                              nome: modAberto.nome,
                                              ordem: modAberto.ordem,
                                              valor: modAberto.valor,
                                              link_arquivo:
                                                modAberto.link_arquivo,
                                              ativo: novoAtivo,
                                              disciplinas: discsAberto,
                                              livros: livrosModAberto,
                                              capa_url: modAberto.capa_url,
                                            });
                                          }}
                                          className={`px-2 py-0.5 rounded-md border text-[10px] font-bold cursor-pointer ${
                                            modAberto.ativo
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                              : "border-brand-border bg-gray-50 text-brand-muted"
                                          }`}
                                        >
                                          {modAberto.ativo
                                            ? "Ativo"
                                            : "Inativo"}
                                        </button>
                                      </div>
                                      <p className="text-xs text-brand-muted">
                                        <strong className="text-brand-ink">
                                          {livrosModAberto.length}{" "}
                                          {livrosModAberto.length === 1
                                            ? "matéria"
                                            : "matérias"}
                                        </strong>{" "}
                                        neste módulo · Valor total:{" "}
                                        <strong className="text-brand-ink tabular-nums">
                                          {formatCurrency(modAberto.valor)}
                                        </strong>
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    {modAberto.link_arquivo &&
                                      (isWebUrl(modAberto.link_arquivo) ? (
                                        <a
                                          href={modAberto.link_arquivo}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="px-3.5 py-2 rounded-xl border border-brand-border bg-white hover:border-brand-cyan font-bold text-brand-cyan inline-flex items-center gap-1.5"
                                        >
                                          <span>Abrir PDF</span>
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            copiarCaminhoRede(
                                              modAberto.id,
                                              modAberto.link_arquivo
                                            )
                                          }
                                          className="px-3.5 py-2 rounded-xl border border-brand-border bg-white hover:border-brand-ink font-semibold text-brand-ink inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <Copy className="w-3.5 h-3.5 text-brand-cyan" />
                                          <span>
                                            {caminhoCopiadoId === modAberto.id
                                              ? "Copiado!"
                                              : "Copiar pasta"}
                                          </span>
                                        </button>
                                      ))}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setModuloForm({
                                          id: modAberto.id,
                                          nome: modAberto.nome,
                                          ordem: modAberto.ordem,
                                          valor: modAberto.valor,
                                          link_arquivo: modAberto.link_arquivo,
                                          ativo: modAberto.ativo,
                                          disciplinas: discsAberto,
                                          livros: livrosModAberto,
                                          capa_url:
                                            modAberto.capa_url ||
                                            getCapaPadraoPorOrdem(
                                              modAberto.ordem
                                            ),
                                        });
                                        setMostrarFormModulo((v) => !v);
                                      }}
                                      className="px-4 py-2 rounded-xl bg-brand-ink hover:bg-brand-ink/90 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      <span>
                                        {mostrarFormModulo
                                          ? "Fechar edição"
                                          : "Editar módulo / matérias"}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {/* Grade de Todas as Matérias do Módulo */}
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                                    <h4 className="text-sm font-extrabold text-brand-ink">
                                      Todas as matérias de {modAberto.nome} (
                                      {livrosModAberto.length})
                                    </h4>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSerieLivroReferencia(
                                          serieAtualObj.nome
                                        );
                                        setAbaCatalogo("livros");
                                        setModuloVitrineAbertoId(null);
                                      }}
                                      className="text-xs font-bold text-brand-cyan hover:text-brand-ink cursor-pointer"
                                    >
                                      Gerenciar catálogo geral de livros →
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {livrosModAberto.map((liv) => {
                                      const livroCat = livros.find(
                                        (c) =>
                                          c.id === liv.id ||
                                          c.nome.toLowerCase() ===
                                            liv.nome.toLowerCase()
                                      );
                                      const capaMateria =
                                        resolverCapaLivroParaSerie(
                                          livroCat,
                                          serieAtualObj.nome
                                        ) ||
                                        liv.capa_url ||
                                        null;
                                      const isParadidatico =
                                        livroCat?.categoria === "paradidatico";

                                      return (
                                        <div
                                          key={liv.id}
                                          className="bg-white border border-brand-border hover:border-brand-ink/40 rounded-2xl overflow-hidden flex flex-col justify-between transition-all shadow-xs"
                                        >
                                          <div>
                                            <div className="relative bg-[#F6F7F9] border-b border-brand-border/70 py-5 px-4 flex items-center justify-center">
                                              <LivroCapaPreview
                                                nomeLivro={liv.nome}
                                                nomeSerie={serieAtualObj.nome}
                                                nomeModulo={modAberto.nome}
                                                capaUrl={capaMateria}
                                                size="md"
                                              />
                                              <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md border border-brand-border bg-white text-[10px] font-bold text-brand-muted">
                                                {isParadidatico
                                                  ? "Paradidático"
                                                  : "Didático"}
                                              </span>
                                            </div>

                                            <div className="p-4 flex items-start justify-between gap-2">
                                              <div className="min-w-0">
                                                <h5 className="text-sm font-extrabold text-brand-ink leading-tight truncate">
                                                  {liv.nome}
                                                </h5>
                                                <p className="text-[11px] text-brand-muted mt-0.5 truncate">
                                                  {serieAtualObj.nome.split(
                                                    "—"
                                                  )[0]?.trim()}{" "}
                                                  · {modAberto.nome}
                                                </p>
                                              </div>
                                              <span className="text-sm font-extrabold text-brand-ink tabular-nums shrink-0">
                                                {formatCurrency(liv.valor)}
                                              </span>
                                            </div>
                                          </div>

                                          <div className="px-4 py-2.5 border-t border-brand-border/70 flex items-center justify-between text-xs bg-white">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSerieLivroReferencia(
                                                  serieAtualObj.nome
                                                );
                                                if (livroCat) {
                                                  setLivroForm({
                                                    id: livroCat.id,
                                                    nome: livroCat.nome,
                                                    categoria:
                                                      livroCat.categoria,
                                                    valor: livroCat.valor,
                                                    ativo: livroCat.ativo,
                                                    capa_url:
                                                      resolverCapaLivroParaSerie(
                                                        livroCat,
                                                        serieAtualObj.nome
                                                      ) || "",
                                                  });
                                                }
                                                setModuloVitrineAbertoId(null);
                                                setAbaCatalogo("livros");
                                              }}
                                              className="font-bold text-brand-cyan hover:underline cursor-pointer"
                                            >
                                              Editar livro / capa
                                            </button>

                                            {livrosModAberto.length > 1 && (
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  const novosLivros =
                                                    livrosModAberto.filter(
                                                      (item) =>
                                                        item.id !== liv.id
                                                    );
                                                  const novaSoma = Number(
                                                    novosLivros
                                                      .reduce(
                                                        (acc, item) =>
                                                          acc +
                                                          Number(item.valor),
                                                        0
                                                      )
                                                      .toFixed(2)
                                                  );
                                                  const novasDiscs =
                                                    novosLivros.map(
                                                      (item) => item.nome
                                                    );
                                                  setModulos((prev) =>
                                                    prev.map((m) =>
                                                      m.id === modAberto.id
                                                        ? {
                                                            ...m,
                                                            livros: novosLivros,
                                                            disciplinas:
                                                              novasDiscs,
                                                            valor: novaSoma,
                                                          }
                                                        : m
                                                    )
                                                  );
                                                  await salvarModuloAction({
                                                    id: modAberto.id,
                                                    serie_id:
                                                      modAberto.serie_id,
                                                    nome: modAberto.nome,
                                                    ordem: modAberto.ordem,
                                                    valor: novaSoma,
                                                    link_arquivo:
                                                      modAberto.link_arquivo,
                                                    ativo: modAberto.ativo,
                                                    disciplinas: novasDiscs,
                                                    livros: novosLivros,
                                                    capa_url:
                                                      modAberto.capa_url,
                                                  });
                                                  exibirAviso(
                                                    "ok",
                                                    `Matéria "${liv.nome}" removida do ${modAberto.nome}.`
                                                  );
                                                }}
                                                className="font-semibold text-brand-muted hover:text-red-600 cursor-pointer"
                                              >
                                                Remover
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              {modulosDaSerieAtiva.map((mod) => {
                                const livrosMod =
                                  Array.isArray(mod.livros) &&
                                  mod.livros.length > 0
                                    ? mod.livros
                                    : getLivrosPadraoPorModulo(
                                        mod.nome,
                                        serieAtualObj.nome,
                                        livros
                                      );
                                const discs = livrosMod.map((l) => l.nome);
                                return (
                                  <div
                                    key={mod.id}
                                    className={`group bg-white border border-brand-border hover:border-brand-ink/40 rounded-2xl overflow-hidden flex flex-col justify-between transition-all shadow-xs ${
                                      !mod.ativo ? "opacity-60" : ""
                                    }`}
                                  >
                                    {/* Área Clicável do Card: Direciona para a Página de Matérias do Módulo */}
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => {
                                        setModuloVitrineAbertoId(mod.id);
                                        setMostrarFormModulo(false);
                                      }}
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" ||
                                          e.key === " "
                                        ) {
                                          e.preventDefault();
                                          setModuloVitrineAbertoId(mod.id);
                                          setMostrarFormModulo(false);
                                        }
                                      }}
                                      className="cursor-pointer text-left"
                                    >
                                      <div className="relative bg-[#F6F7F9] border-b border-brand-border/70 py-5 px-4 flex items-center justify-center">
                                        <ModuloCapaPreview
                                          nomeModulo={mod.nome}
                                          nomeSerie={serieAtualObj.nome}
                                          nomeColegio={colegioAtualObj?.nome}
                                          ordem={mod.ordem}
                                          capaUrl={mod.capa_url}
                                          qtdDisciplinas={livrosMod.length}
                                          size="md"
                                          className="group-hover:scale-[1.03] transition-transform duration-200"
                                        />

                                        {/* Status discreto no canto superior direito */}
                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const novoAtivo = !mod.ativo;
                                            setModulos((prev) =>
                                              prev.map((m) =>
                                                m.id === mod.id
                                                  ? { ...m, ativo: novoAtivo }
                                                  : m
                                              )
                                            );
                                            await salvarModuloAction({
                                              id: mod.id,
                                              serie_id: mod.serie_id,
                                              nome: mod.nome,
                                              ordem: mod.ordem,
                                              valor: mod.valor,
                                              link_arquivo: mod.link_arquivo,
                                              ativo: novoAtivo,
                                              disciplinas: discs,
                                              livros: livrosMod,
                                              capa_url: mod.capa_url,
                                            });
                                          }}
                                          className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md border bg-white text-[10px] font-bold cursor-pointer ${
                                            mod.ativo
                                              ? "border-brand-border text-emerald-700"
                                              : "border-brand-border text-brand-muted"
                                          }`}
                                        >
                                          {mod.ativo ? "Ativo" : "Inativo"}
                                        </button>
                                      </div>

                                      {/* Corpo do Card Limpo: Nome, Preço e Link Direto para Página de Matérias */}
                                      <div className="p-4 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                          <h4 className="text-sm font-extrabold text-brand-ink leading-tight group-hover:text-brand-cyan transition-colors">
                                            {mod.nome}
                                          </h4>
                                          <span className="text-sm font-extrabold text-brand-ink tabular-nums shrink-0">
                                            {formatCurrency(mod.valor)}
                                          </span>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-brand-muted pt-0.5">
                                          <span>
                                            {livrosMod.length}{" "}
                                            {livrosMod.length === 1
                                              ? "matéria"
                                              : "matérias"}
                                          </span>
                                          <span className="inline-flex items-center gap-0.5 font-bold text-brand-cyan group-hover:translate-x-0.5 transition-transform">
                                            <span>Ver matérias</span>
                                            <ChevronRight className="w-3.5 h-3.5" />
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Rodapé do Card: Arquivo PDF + Editar */}
                                    <div className="px-4 py-2.5 border-t border-brand-border/70 flex items-center justify-between text-xs bg-white">
                                      {mod.link_arquivo ? (
                                        isWebUrl(mod.link_arquivo) ? (
                                          <a
                                            href={mod.link_arquivo}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 font-bold text-brand-cyan hover:underline"
                                          >
                                            <span>Abrir PDF</span>
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              copiarCaminhoRede(
                                                mod.id,
                                                mod.link_arquivo
                                              )
                                            }
                                            className="inline-flex items-center gap-1 font-semibold text-brand-muted hover:text-brand-ink cursor-pointer"
                                          >
                                            <Copy className="w-3 h-3 text-brand-cyan" />
                                            <span>
                                              {caminhoCopiadoId === mod.id
                                                ? "Copiado!"
                                                : "Copiar pasta"}
                                            </span>
                                          </button>
                                        )
                                      ) : (
                                        <span className="text-[11px] text-brand-muted">
                                          Sem PDF
                                        </span>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setModuloForm({
                                            id: mod.id,
                                            nome: mod.nome,
                                            ordem: mod.ordem,
                                            valor: mod.valor,
                                            link_arquivo: mod.link_arquivo,
                                            ativo: mod.ativo,
                                            disciplinas: discs,
                                            livros: livrosMod,
                                            capa_url:
                                              mod.capa_url ||
                                              getCapaPadraoPorOrdem(mod.ordem),
                                          });
                                          setMostrarFormModulo(true);
                                        }}
                                        className="font-bold text-brand-ink hover:text-brand-cyan cursor-pointer"
                                      >
                                        Editar
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {/* ABA INTERNA DO CATÁLOGO: LIVROS, PREÇOS & CAPAS POR SÉRIE */}
                {abaCatalogo === "livros" &&
                  (() => {
                    const livrosFiltrados = livros.filter((l) => {
                      if (
                        filtroCategoriaLivro !== "todos" &&
                        l.categoria !== filtroCategoriaLivro
                      ) {
                        return false;
                      }
                      if (buscaLivro.trim()) {
                        return l.nome
                          .toLowerCase()
                          .includes(buscaLivro.trim().toLowerCase());
                      }
                      return true;
                    });

                    const sincronizarLivroNosModulosEmMemoria = (
                      salvo: Livro
                    ) => {
                      const mapSerieNome = new Map(
                        series.map((s) => [s.id, s.nome])
                      );
                      setModulos((prev) =>
                        prev.map((mod) => {
                          if (
                            !Array.isArray(mod.livros) ||
                            !mod.livros.some(
                              (item) =>
                                item.id === salvo.id ||
                                item.nome.toLowerCase() ===
                                  salvo.nome.toLowerCase()
                            )
                          ) {
                            return mod;
                          }
                          const sNomeMod = mapSerieNome.get(mod.serie_id) || "";
                          const novosLivros = mod.livros.map((item) =>
                            item.id === salvo.id ||
                            item.nome.toLowerCase() === salvo.nome.toLowerCase()
                              ? {
                                  ...item,
                                  id: salvo.id,
                                  nome: salvo.nome,
                                  valor: salvo.valor,
                                  serie_nome: sNomeMod || item.serie_nome || null,
                                  capa_url:
                                    resolverCapaLivroParaSerie(
                                      salvo,
                                      sNomeMod
                                    ) || item.capa_url,
                                }
                              : item
                          );
                          const novaSoma = Number(
                            novosLivros
                              .reduce(
                                (acc, item) => acc + Number(item.valor),
                                0
                              )
                              .toFixed(2)
                          );
                          return {
                            ...mod,
                            livros: novosLivros,
                            disciplinas: novosLivros.map((item) => item.nome),
                            valor: novaSoma,
                          };
                        })
                      );
                    };

                    const handleUploadCapaLivro = (
                      e: React.ChangeEvent<HTMLInputElement>
                    ) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const img = new Image();
                        img.onload = () => {
                          const canvas = document.createElement("canvas");
                          const maxW = 360;
                          const maxH = 500;
                          let w = img.width;
                          let h = img.height;
                          if (w > maxW || h > maxH) {
                            const ratio = Math.min(maxW / w, maxH / h);
                            w = Math.round(w * ratio);
                            h = Math.round(h * ratio);
                          }
                          canvas.width = w;
                          canvas.height = h;
                          const ctx = canvas.getContext("2d");
                          if (ctx) {
                            ctx.drawImage(img, 0, 0, w, h);
                            const dataUrl = canvas.toDataURL(
                              "image/jpeg",
                              0.84
                            );
                            setLivroForm((prev) => ({
                              ...prev,
                              capa_url: dataUrl,
                            }));
                          }
                        };
                        if (typeof reader.result === "string") {
                          img.src = reader.result;
                        }
                      };
                      reader.readAsDataURL(file);
                    };

                    return (
                      <div className="bg-white border border-brand-border rounded-2xl overflow-hidden shadow-xs tabular-nums">
                        {/* Barra Superior: Escolha da Série para visualizar/definir a Capa de cada Livro */}
                        <div className="px-4 py-3 border-b border-brand-border bg-brand-cyan/5 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-brand-cyan shrink-0" />
                            <span className="font-bold text-brand-ink">
                              Série da capa dos livros:
                            </span>
                            <span className="text-brand-muted hidden sm:inline">
                              (Cada livro possui sua própria capa vinculada à série)
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={serieLivroReferencia}
                              onChange={(e) => {
                                const novaSerieRef = e.target.value;
                                setSerieLivroReferencia(novaSerieRef);
                                if (livroForm.id) {
                                  const livAtual = livros.find(
                                    (x) => x.id === livroForm.id
                                  );
                                  setLivroForm((prev) => ({
                                    ...prev,
                                    capa_url:
                                      resolverCapaLivroParaSerie(
                                        livAtual,
                                        novaSerieRef
                                      ) || "",
                                  }));
                                }
                              }}
                              className="px-3 py-1.5 bg-white border border-brand-border rounded-xl font-bold text-brand-ink focus:outline-none focus:border-brand-cyan cursor-pointer"
                            >
                              {SERIES_PADRAO_ESCOLARES.map((s) => (
                                <option key={s.slug} value={s.nome}>
                                  {s.nome}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Formulário com Prévia da Capa do Livro na Série */}
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!livroForm.nome.trim()) return;
                            const livroExistente = livroForm.id
                              ? livros.find((l) => l.id === livroForm.id)
                              : undefined;
                            const capasPorSerieAtualizadas: Record<
                              string,
                              string
                            > = {
                              ...(livroExistente?.capas_por_serie || {}),
                            };
                            if (serieLivroReferencia) {
                              if (livroForm.capa_url.trim()) {
                                capasPorSerieAtualizadas[serieLivroReferencia] =
                                  livroForm.capa_url.trim();
                              } else {
                                delete capasPorSerieAtualizadas[
                                  serieLivroReferencia
                                ];
                              }
                            }

                            const res = await salvarLivroAction({
                              id: livroForm.id,
                              nome: livroForm.nome.trim(),
                              categoria: livroForm.categoria,
                              valor: Number(livroForm.valor),
                              ativo: livroForm.ativo,
                              serie_nome: serieLivroReferencia,
                              capa_url:
                                livroExistente?.capa_url ||
                                livroForm.capa_url.trim() ||
                                null,
                              capas_por_serie: capasPorSerieAtualizadas,
                            });
                            if (!res.ok || !res.livro) {
                              exibirAviso(
                                "erro",
                                res.erro || "Erro ao salvar livro."
                              );
                              return;
                            }
                            const salvo = res.livro;
                            if (livroForm.id) {
                              setLivros((prev) =>
                                prev.map((l) => (l.id === salvo.id ? salvo : l))
                              );
                              sincronizarLivroNosModulosEmMemoria(salvo);
                              exibirAviso(
                                "ok",
                                `Livro "${salvo.nome}" (${serieLivroReferencia.split("—")[0]?.trim()}) atualizado!`
                              );
                            } else {
                              setLivros((prev) => [...prev, salvo]);
                              exibirAviso(
                                "ok",
                                `Livro "${salvo.nome}" adicionado!`
                              );
                            }
                            setLivroForm({
                              nome: "",
                              categoria: "didatico",
                              valor: 50,
                              ativo: true,
                              capa_url: "",
                            });
                          }}
                          className="p-4 border-b border-brand-border bg-[#FAFAFB] flex flex-wrap items-end gap-3 text-xs"
                        >
                          {/* Prévia ao vivo da capa do livro na série escolhida */}
                          <div className="flex items-center gap-2.5 pr-2">
                            <LivroCapaPreview
                              nomeLivro={livroForm.nome || "Disciplina"}
                              nomeSerie={serieLivroReferencia}
                              capaUrl={livroForm.capa_url}
                              size="sm"
                            />
                          </div>

                          <div className="flex-1 min-w-[200px]">
                            <label className="block font-bold text-brand-ink mb-1">
                              {livroForm.id
                                ? "Editando livro"
                                : "Nome do livro"}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Ex.: Português ou Paradidático"
                              value={livroForm.nome}
                              onChange={(e) =>
                                setLivroForm((prev) => ({
                                  ...prev,
                                  nome: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                            />
                          </div>

                          <div className="w-40">
                            <label className="block font-bold text-brand-ink mb-1">
                              Tipo
                            </label>
                            <select
                              value={livroForm.categoria}
                              onChange={(e) =>
                                setLivroForm((prev) => ({
                                  ...prev,
                                  categoria: e.target.value as
                                    | "didatico"
                                    | "paradidatico",
                                }))
                              }
                              className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                            >
                              <option value="didatico">Livro Didático</option>
                              <option value="paradidatico">Paradidático</option>
                            </select>
                          </div>

                          <div className="w-28">
                            <label className="block font-bold text-brand-ink mb-1">
                              Preço (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              required
                              value={livroForm.valor}
                              onChange={(e) =>
                                setLivroForm((prev) => ({
                                  ...prev,
                                  valor: Number(e.target.value),
                                }))
                              }
                              className="w-full px-3 py-2 bg-white border border-brand-border rounded-xl font-bold focus:outline-none focus:border-brand-cyan"
                            />
                          </div>

                          <div className="min-w-[210px] flex-1">
                            <label className="block font-bold text-brand-ink mb-1">
                              Capa no {serieLivroReferencia.split("—")[0]?.trim()}{" "}
                              <span className="text-brand-muted font-normal">
                                (automática ou foto)
                              </span>
                            </label>
                            <div className="flex items-center gap-1.5">
                              <label className="px-2.5 py-2 rounded-xl border border-brand-border bg-white hover:border-brand-ink font-bold text-brand-ink cursor-pointer shrink-0">
                                <span>📷 Foto</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleUploadCapaLivro}
                                  className="hidden"
                                />
                              </label>
                              <input
                                type="text"
                                placeholder="URL da capa (opcional)..."
                                value={
                                  livroForm.capa_url.startsWith("data:")
                                    ? ""
                                    : livroForm.capa_url
                                }
                                onChange={(e) =>
                                  setLivroForm((prev) => ({
                                    ...prev,
                                    capa_url: e.target.value,
                                  }))
                                }
                                className="w-full px-2.5 py-2 bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                              />
                              {livroForm.capa_url && (
                                <button
                                  type="button"
                                  title="Usar capa ilustrada da série"
                                  onClick={() =>
                                    setLivroForm((prev) => ({
                                      ...prev,
                                      capa_url: "",
                                    }))
                                  }
                                  className="px-2 py-2 text-brand-muted hover:text-red-600 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {livroForm.id && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLivroForm({
                                    nome: "",
                                    categoria: "didatico",
                                    valor: 50,
                                    ativo: true,
                                    capa_url: "",
                                  })
                                }
                                className="px-3 py-2 rounded-xl border border-brand-border bg-white font-semibold text-brand-muted hover:text-brand-ink cursor-pointer"
                              >
                                Cancelar
                              </button>
                            )}
                            <button
                              type="submit"
                              className="px-4 py-2 bg-brand-ink hover:bg-brand-ink/90 text-white font-bold rounded-xl cursor-pointer inline-flex items-center gap-1.5"
                            >
                              {livroForm.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Salvar</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Adicionar livro</span>
                                </>
                              )}
                            </button>
                          </div>
                        </form>

                        {/* Barra de Filtro e Busca */}
                        <div className="px-4 py-3 border-b border-brand-border flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-1.5">
                            {(
                              [
                                { id: "todos", label: "Todos" },
                                { id: "didatico", label: "Didáticos" },
                                { id: "paradidatico", label: "Paradidáticos" },
                              ] as const
                            ).map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setFiltroCategoriaLivro(tab.id)}
                                className={`px-3 py-1.5 rounded-lg border font-bold cursor-pointer transition-colors ${
                                  filtroCategoriaLivro === tab.id
                                    ? "bg-brand-ink text-white border-brand-ink"
                                    : "bg-white border-brand-border text-brand-muted hover:text-brand-ink"
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          <div className="relative min-w-[220px]">
                            <Search className="w-3.5 h-3.5 text-brand-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              placeholder="Buscar livro..."
                              value={buscaLivro}
                              onChange={(e) => setBuscaLivro(e.target.value)}
                              className="w-full pl-8 pr-3 py-1.5 bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                            />
                          </div>
                        </div>

                        {/* Tabela Simples e Funcional de Livros com Capa da Série */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-brand-border text-brand-muted uppercase font-bold text-[10px] tracking-wider bg-white">
                                <th className="py-3 px-5">Livro</th>
                                <th className="py-3 px-4">Tipo</th>
                                <th className="py-3 px-4 text-right">Preço</th>
                                <th className="py-3 px-4 text-center">
                                  Status
                                </th>
                                <th className="py-3 px-5 text-right">
                                  Seleção
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border/60">
                              {livrosFiltrados.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={5}
                                    className="py-10 text-center text-brand-muted"
                                  >
                                    Nenhum livro encontrado.
                                  </td>
                                </tr>
                              ) : (
                                livrosFiltrados.map((l) => {
                                  const capaDaSerie = resolverCapaLivroParaSerie(
                                    l,
                                    serieLivroReferencia
                                  );
                                  const temFotoCustomSerie = Boolean(
                                    l.capas_por_serie &&
                                      l.capas_por_serie[serieLivroReferencia]
                                  );
                                  return (
                                    <tr
                                      key={l.id}
                                      className="bg-white hover:bg-gray-50/70 transition-colors"
                                    >
                                      <td className="py-3 px-5">
                                        <div className="flex items-center gap-3">
                                          <LivroCapaPreview
                                            nomeLivro={l.nome}
                                            nomeSerie={serieLivroReferencia}
                                            capaUrl={capaDaSerie}
                                            size="xs"
                                          />
                                          <div>
                                            <span className="font-bold text-brand-ink block">
                                              {l.nome}
                                            </span>
                                            {temFotoCustomSerie && (
                                              <span className="text-[10px] text-brand-cyan font-semibold block">
                                                Capa personalizada
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-3 px-4 text-brand-muted font-medium">
                                        {l.categoria === "paradidatico"
                                          ? "Paradidático"
                                          : "Didático"}
                                      </td>
                                      <td className="py-3 px-4 text-right font-extrabold text-brand-ink text-sm">
                                        {formatCurrency(l.valor)}
                                      </td>
                                      <td className="py-3 px-4 text-center">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const novoAtivo = !l.ativo;
                                            setLivros((prev) =>
                                              prev.map((item) =>
                                                item.id === l.id
                                                  ? { ...item, ativo: novoAtivo }
                                                  : item
                                              )
                                            );
                                            await salvarLivroAction({
                                              id: l.id,
                                              nome: l.nome,
                                              categoria: l.categoria,
                                              valor: l.valor,
                                              ativo: novoAtivo,
                                              serie_nome: l.serie_nome,
                                              capa_url: l.capa_url,
                                              capas_por_serie: l.capas_por_serie,
                                            });
                                          }}
                                          className={`font-bold cursor-pointer bg-transparent ${
                                            l.ativo
                                              ? "text-emerald-700"
                                              : "text-brand-muted"
                                          }`}
                                        >
                                          {l.ativo ? "Ativo" : "Inativo"}
                                        </button>
                                      </td>
                                      <td className="py-3 px-5 text-right whitespace-nowrap">
                                        <div className="inline-flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setLivroForm({
                                                id: l.id,
                                                nome: l.nome,
                                                categoria: l.categoria,
                                                valor: l.valor,
                                                ativo: l.ativo,
                                                capa_url:
                                                  resolverCapaLivroParaSerie(
                                                    l,
                                                    serieLivroReferencia
                                                  ) || "",
                                              })
                                            }
                                            className="px-2.5 py-1 rounded-lg border border-brand-border hover:border-brand-ink font-bold text-brand-ink bg-white cursor-pointer"
                                          >
                                            Editar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              const res =
                                                await excluirLivroAction(l.id);
                                              if (!res.ok) {
                                                exibirAviso(
                                                  "erro",
                                                  res.erro ||
                                                    "Erro ao excluir livro."
                                                );
                                                return;
                                              }
                                              setLivros((prev) =>
                                                prev.filter(
                                                  (item) => item.id !== l.id
                                                )
                                              );
                                              if (res.modulosAtualizados) {
                                                setModulos(
                                                  res.modulosAtualizados
                                                );
                                              }
                                              exibirAviso(
                                                "ok",
                                                "Livro removido."
                                              );
                                            }}
                                            className="p-1.5 rounded-lg border border-brand-border text-brand-muted hover:text-red-600 hover:border-red-300 bg-white cursor-pointer"
                                            title="Excluir livro"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            );
          })()}

            {/* ===============================================================
                SEÇÃO 4: CUPONS DE DESCONTO
            =============================================================== */}
            {section === "cupons" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-brand-border/80 rounded-2xl p-5 space-y-4 shadow-xs">
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-brand-ink border-b border-brand-border pb-3">
                    {cupomForm.id ? "Editar Cupom" : "Novo Cupom"}
                  </h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!cupomForm.codigo.trim()) return;
                      const res = await salvarCupomAction({
                        id: cupomForm.id,
                        codigo: cupomForm.codigo,
                        tipo: cupomForm.tipo,
                        desconto: Number(cupomForm.desconto),
                        validade: cupomForm.validade || null,
                        limite_usos: cupomForm.limite_usos
                          ? Number(cupomForm.limite_usos)
                          : null,
                        ativo: cupomForm.ativo,
                      });
                      if (!res.ok || !res.cupom) {
                        exibirAviso(
                          "erro",
                          res.erro || "Erro ao salvar cupom."
                        );
                        return;
                      }
                      const salvo = res.cupom;
                      if (cupomForm.id) {
                        setCupons((prev) =>
                          prev.map((c) => (c.id === salvo.id ? salvo : c))
                        );
                        exibirAviso("ok", `Cupom ${salvo.codigo} atualizado!`);
                      } else {
                        setCupons((prev) => [...prev, salvo]);
                        exibirAviso("ok", `Cupom ${salvo.codigo} criado!`);
                      }
                      setCupomForm({
                        codigo: "",
                        tipo: "percentual",
                        desconto: 10,
                        validade: "",
                        limite_usos: "",
                        ativo: true,
                      });
                    }}
                    className="space-y-3 text-xs"
                  >
                    <div>
                      <label className="block font-bold mb-1">
                        Código (maiúsculo)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex.: BEMVINDO10"
                        value={cupomForm.codigo}
                        onChange={(e) =>
                          setCupomForm((p) => ({
                            ...p,
                            codigo: e.target.value
                              .toUpperCase()
                              .replace(/\s+/g, ""),
                          }))
                        }
                        className="w-full px-3 py-2.5 bg-white border border-brand-border rounded-xl uppercase font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold mb-1">Tipo</label>
                        <select
                          value={cupomForm.tipo}
                          onChange={(e) =>
                            setCupomForm((p) => ({
                              ...p,
                              tipo: e.target.value as "percentual" | "valor",
                            }))
                          }
                          className="w-full px-3 py-2.5 bg-white border border-brand-border rounded-xl"
                        >
                          <option value="percentual">Percentual (%)</option>
                          <option value="valor">Valor fixo (R$)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold mb-1">Desconto</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={cupomForm.desconto}
                          onChange={(e) =>
                            setCupomForm((p) => ({
                              ...p,
                              desconto: Number(e.target.value),
                            }))
                          }
                          className="w-full px-3 py-2.5 bg-white border border-brand-border rounded-xl"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold mb-1">
                          Validade (opcional)
                        </label>
                        <input
                          type="date"
                          value={cupomForm.validade}
                          onChange={(e) =>
                            setCupomForm((p) => ({
                              ...p,
                              validade: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2.5 bg-white border border-brand-border rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block font-bold mb-1">
                          Limite de usos
                        </label>
                        <input
                          type="number"
                          min={1}
                          placeholder="Sem limite"
                          value={cupomForm.limite_usos}
                          onChange={(e) =>
                            setCupomForm((p) => ({
                              ...p,
                              limite_usos: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2.5 bg-white border border-brand-border rounded-xl"
                        />
                      </div>
                    </div>

                    <label className="inline-flex items-center gap-2 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cupomForm.ativo}
                        onChange={(e) =>
                          setCupomForm((p) => ({
                            ...p,
                            ativo: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 accent-brand-magenta rounded"
                      />
                      <span className="font-semibold text-brand-ink">
                        Ativo
                      </span>
                    </label>

                    <div className="flex gap-2 pt-1">
                      {cupomForm.id && (
                        <button
                          type="button"
                          onClick={() =>
                            setCupomForm({
                              codigo: "",
                              tipo: "percentual",
                              desconto: 10,
                              validade: "",
                              limite_usos: "",
                              ativo: true,
                            })
                          }
                          className="px-3 py-2.5 bg-white border border-brand-border rounded-xl font-semibold"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-brand-magenta text-white font-bold rounded-xl cursor-pointer"
                      >
                        {cupomForm.id ? "Salvar" : "Adicionar"}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="md:col-span-2 bg-white border border-brand-border/80 rounded-2xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-brand-border pb-3">
                    <div>
                      <h2 className="text-sm font-extrabold uppercase tracking-wider text-brand-ink">
                        Cupons ({cupons.length})
                      </h2>
                      <p className="text-xs text-brand-muted mt-0.5">
                        Clique no código para copiar
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {cupons.map((c) => {
                      const expirado = Boolean(
                        c.validade && c.validade < hojeISO
                      );
                      const esgotado =
                        c.limite_usos !== null && c.usos >= c.limite_usos;
                      const disponivel = c.ativo && !expirado && !esgotado;

                      return (
                        <div
                          key={c.id}
                          className={`group relative border rounded-2xl p-5 flex flex-col justify-between gap-4 bg-white transition-all ${
                            disponivel
                              ? "border-brand-border hover:border-brand-ink/40 shadow-2xs"
                              : "border-brand-border/70 opacity-75"
                          }`}
                        >
                          {/* Topo: Código estilo Voucher + Status limpo */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                title="Clique para copiar o código do cupom"
                                onClick={() => {
                                  navigator.clipboard?.writeText(c.codigo);
                                  setCaminhoCopiadoId(`cupom-${c.id}`);
                                  setTimeout(() => {
                                    setCaminhoCopiadoId((atual) =>
                                      atual === `cupom-${c.id}` ? null : atual
                                    );
                                  }, 2000);
                                }}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-dashed border-brand-ink/35 hover:border-brand-ink bg-transparent text-brand-ink font-mono font-extrabold text-xs tracking-wider cursor-pointer transition-colors"
                              >
                                <Tag className="w-3.5 h-3.5 text-brand-magenta shrink-0" />
                                <span>{c.codigo}</span>
                                {caminhoCopiadoId === `cupom-${c.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <Copy className="w-3 h-3 text-brand-muted group-hover:text-brand-ink shrink-0" />
                                )}
                              </button>

                              {/* Status sem fundo colorido */}
                              {!c.ativo ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-transparent text-brand-muted">
                                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                                  Inativo
                                </span>
                              ) : expirado ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-transparent text-red-600">
                                  <span className="w-2 h-2 rounded-full bg-red-500" />
                                  Expirado
                                </span>
                              ) : esgotado ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-transparent text-amber-700">
                                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                                  Esgotado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-transparent text-emerald-700">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  Ativo
                                </span>
                              )}
                            </div>

                            {/* Destaque Principal do Desconto */}
                            <div className="pt-1">
                              <span className="text-2xl font-black text-brand-ink tracking-tight tabular-nums">
                                {c.tipo === "percentual"
                                  ? `${c.desconto}% OFF`
                                  : `${formatCurrency(c.desconto)} OFF`}
                              </span>
                            </div>

                            {/* Métricas de Uso e Validade */}
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-brand-border/60 text-xs">
                              <div>
                                <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                                  Utilizações
                                </span>
                                <span className="font-extrabold text-brand-ink tabular-nums">
                                  {c.usos}
                                </span>
                                <span className="text-brand-muted">
                                  {c.limite_usos
                                    ? ` de ${c.limite_usos}`
                                    : " (ilimitado)"}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                                  Validade
                                </span>
                                <span className="font-bold text-brand-ink">
                                  {c.validade
                                    ? formatDateBR(c.validade)
                                    : "Sem prazo"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Rodapé de Ações alinhadas */}
                          <div className="pt-3 border-t border-brand-border/70 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setCupomForm({
                                  id: c.id,
                                  codigo: c.codigo,
                                  tipo: c.tipo,
                                  desconto: c.desconto,
                                  validade: c.validade || "",
                                  limite_usos: c.limite_usos
                                    ? String(c.limite_usos)
                                    : "",
                                  ativo: c.ativo,
                                })
                              }
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border hover:border-brand-ink text-xs font-bold text-brand-ink bg-white cursor-pointer transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-brand-cyan" />
                              <span>Editar</span>
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                const novoAtivo = !c.ativo;
                                setCupons((prev) =>
                                  prev.map((item) =>
                                    item.id === c.id
                                      ? { ...item, ativo: novoAtivo }
                                      : item
                                  )
                                );
                                await salvarCupomAction({
                                  id: c.id,
                                  codigo: c.codigo,
                                  tipo: c.tipo,
                                  desconto: c.desconto,
                                  validade: c.validade,
                                  limite_usos: c.limite_usos,
                                  ativo: novoAtivo,
                                });
                              }}
                              className={`flex-1 inline-flex items-center justify-center px-3 py-2 rounded-xl border text-xs font-bold bg-white cursor-pointer transition-colors ${
                                c.ativo
                                  ? "border-brand-border text-brand-muted hover:text-red-600 hover:border-red-300"
                                  : "border-brand-border text-emerald-700 hover:border-emerald-500"
                              }`}
                            >
                              {c.ativo ? "Desativar" : "Ativar"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                SEÇÃO 5: CONFIGURAÇÕES DA LOJA, TAXAS E MENSAGEM DE PRONTO
            =============================================================== */}
            {section === "config" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSalvandoConfig(true);
                  try {
                    const res = await salvarConfigAction({
                      nome_loja: config.nome_loja,
                      whatsapp_loja: config.whatsapp_loja,
                      prazo_dias: config.prazo_dias,
                      endereco_retirada: config.endereco_retirada,
                      horario_retirada: config.horario_retirada,
                      taxas_parcelamento: config.taxas_parcelamento,
                      mensagem_pronto: config.mensagem_pronto,
                    });
                    if (!res.ok) {
                      exibirAviso(
                        "erro",
                        res.erro || "Erro ao salvar configurações."
                      );
                      return;
                    }
                    if (res.config) setConfig(res.config);
                    exibirAviso("ok", "Configurações salvas com sucesso!");
                  } finally {
                    setSalvandoConfig(false);
                  }
                }}
                className="bg-white border border-brand-border/80 rounded-2xl p-6 space-y-6 shadow-xs max-w-4xl"
              >
                <div className="border-b border-brand-border pb-3">
                  <h2 className="text-base font-extrabold text-brand-ink">
                    Dados da Gráfica, Retirada e Parcelamento
                  </h2>
                  <p className="text-xs text-brand-muted mt-0.5">
                    Essas informações aparecem automaticamente no formulário de
                    pedidos e nas notificações enviadas pelo WhatsApp.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-bold mb-1.5">
                      Nome da Loja
                    </label>
                    <input
                      type="text"
                      required
                      value={config.nome_loja}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, nome_loja: e.target.value }))
                      }
                      className="w-full px-3 py-2.5 border border-brand-border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1.5">
                      WhatsApp da Loja (com DDD)
                    </label>
                    <input
                      type="text"
                      required
                      value={maskWhatsApp(config.whatsapp_loja)}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          whatsapp_loja: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2.5 border border-brand-border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1.5">
                      Prazo padrão de retirada (dias corridos)
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={config.prazo_dias}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          prazo_dias: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2.5 border border-brand-border rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold mb-1.5">
                      Endereço de Retirada
                    </label>
                    <input
                      type="text"
                      required
                      value={config.endereco_retirada}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          endereco_retirada: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2.5 border border-brand-border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1.5">
                      Horário de Atendimento / Retirada
                    </label>
                    <input
                      type="text"
                      required
                      value={config.horario_retirada}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          horario_retirada: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2.5 border border-brand-border rounded-xl"
                    />
                  </div>
                </div>

                {/* Taxas de parcelamento 2x a 12x */}
                <div className="space-y-2.5">
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                    Taxas de Juros do Parcelamento (% por número de parcelas)
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 text-xs">
                    {Array.from({ length: 11 }, (_, i) => String(i + 2)).map(
                      (parcelaKey) => (
                        <div
                          key={parcelaKey}
                          className="border border-brand-border rounded-xl p-2.5 bg-gray-50/60"
                        >
                          <span className="block font-bold text-brand-muted mb-1">
                            {parcelaKey}x (%)
                          </span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={config.taxas_parcelamento[parcelaKey] ?? 0}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                taxas_parcelamento: {
                                  ...c.taxas_parcelamento,
                                  [parcelaKey]: Number(e.target.value),
                                },
                              }))
                            }
                            className="w-full px-2 py-1.5 bg-white border border-brand-border rounded-lg font-semibold"
                          />
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Modelo da mensagem de "Pronto" */}
                <div className="space-y-2 text-xs">
                  <label className="block font-bold">
                    Modelo da mensagem de WhatsApp (&ldquo;Pedido Pronto&rdquo;)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-brand-muted">
                    <span>Clique para inserir variável:</span>
                    {[
                      "{responsavel}",
                      "{serie}",
                      "{colegio}",
                      "{numero}",
                      "{endereco}",
                      "{horario}",
                    ].map((variavel) => (
                      <button
                        key={variavel}
                        type="button"
                        onClick={() =>
                          setConfig((c) => ({
                            ...c,
                            mensagem_pronto: `${c.mensagem_pronto} ${variavel}`,
                          }))
                        }
                        className="px-2 py-0.5 rounded bg-gray-100 hover:bg-brand-cyan/15 text-brand-ink font-mono"
                      >
                        {variavel}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={4}
                    value={config.mensagem_pronto}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        mensagem_pronto: e.target.value,
                      }))
                    }
                    className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    type="submit"
                    disabled={salvandoConfig}
                    className="px-6 py-3 bg-brand-magenta hover:bg-brand-magenta/90 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm"
                  >
                    {salvandoConfig ? "Salvando..." : "Salvar Configurações"}
                  </button>
                  {avisoPainel && (
                    <div
                      className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                        avisoPainel.tipo === "ok"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-red-50 border-red-200 text-red-700"
                      }`}
                    >
                      <span>{avisoPainel.texto}</span>
                    </div>
                  )}
                </div>
              </form>
            )}

            {/* ===============================================================
                SEÇÃO: CONSTRUÇÃO E ACOMPANHAMENTO DE ORÇAMENTOS (ADMIN)
            =============================================================== */}
            {section === "orcamentos" && (
              <AdminOrcamentosSection
                orcamentos={orcamentos}
                setOrcamentos={setOrcamentos}
                setPedidos={setPedidos}
                colegios={colegios}
                series={series}
                modulos={modulos}
                config={config}
                exibirAviso={exibirAviso}
              />
            )}
          </main>
        </div>

        {/* =================================================================
            SLIDE-OVER DRAWER: FICHA COMPLETA DO PEDIDO (DIREITA)
        ================================================================= */}
        {pedidoDetalhe && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end"
            onClick={() => {
              setConfirmandoCancelamento(false);
              setPedidoSelecionadoId(null);
            }}
          >
            <div
              className="bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cabeçalho Fixo da Gaveta */}
              <div className="bg-brand-ink text-white px-6 py-5 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-xl font-extrabold tracking-tight">
                      Pedido #{pedidoDetalhe.numero}
                    </span>
                    <span
                      className={`text-xs font-bold ${getStatusBadgeClasses(
                        pedidoDetalhe.status
                      )}`}
                    >
                      {STATUS_PEDIDO_LABEL[pedidoDetalhe.status]}
                    </span>
                    <span
                      className={`text-xs font-bold bg-transparent ${
                        pedidoDetalhe.pago
                          ? "text-emerald-400"
                          : "text-white/70"
                      }`}
                    >
                      {pedidoDetalhe.pago ? "✓ Pago" : "Pagamento Pendente"}
                    </span>
                  </div>
                  <p className="text-xs text-white/70">
                    Recebido em {formatDateTimeBR(pedidoDetalhe.criado_em)} ·
                    Previsão:{" "}
                    <strong className="text-brand-yellow">
                      {formatDateBR(pedidoDetalhe.previsao_retirada)}
                    </strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const colNome =
                        colegios.find((c) => c.id === pedidoDetalhe.colegio_id)
                          ?.nome || pedidoDetalhe.colegio_nome;
                      const serNome =
                        series.find((s) => s.id === pedidoDetalhe.serie_id)
                          ?.nome || pedidoDetalhe.serie_nome;
                      void baixarDocumentoPedidoPDF(
                        {
                          ...pedidoDetalhe,
                          colegio_nome: colNome,
                          serie_nome: serNome,
                        },
                        config
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer"
                    title="Baixar comprovante do pedido em PDF"
                  >
                    <Download className="w-3.5 h-3.5 text-brand-cyan" />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImprimirEtiqueta(pedidoDetalhe)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors cursor-pointer"
                    title="Imprimir etiqueta/comanda para anexar ao pacote"
                  >
                    <Printer className="w-3.5 h-3.5 text-brand-yellow" />
                    <span>Etiqueta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmandoCancelamento(false);
                      setPedidoSelecionadoId(null);
                    }}
                    className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Corpo Rolável da Gaveta */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Seletor Visual de Etapa (Status) */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                    Etapa do Pedido
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {FLUXO_STATUS.map((st) => {
                      const ativo = pedidoDetalhe.status === st.key;
                      return (
                        <button
                          key={st.key}
                          type="button"
                          onClick={() =>
                            handleMudarStatus(pedidoDetalhe, st.key)
                          }
                          className={`py-2 px-3 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                            ativo
                              ? "bg-brand-cyan text-white border-brand-cyan shadow-xs"
                              : "bg-white hover:bg-gray-50 text-brand-ink border-brand-border"
                          }`}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dados do Cliente e Pedido */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 bg-white p-4 rounded-2xl border border-brand-border text-xs">
                  <div>
                    <span className="text-brand-muted block text-[11px]">
                      Cliente
                    </span>
                    <strong className="font-extrabold text-brand-ink text-sm">
                      {pedidoDetalhe.responsavel_nome || pedidoDetalhe.aluno_nome}
                    </strong>
                  </div>
                  <div>
                    <span className="text-brand-muted block text-[11px]">
                      WhatsApp
                    </span>
                    <a
                      href={gerarLinkWhatsApp(
                        pedidoDetalhe.whatsapp,
                        `Olá, ${pedidoDetalhe.responsavel_nome || pedidoDetalhe.aluno_nome}! Tudo bem? Sobre o pedido #${pedidoDetalhe.numero} na ${config.nome_loja}:`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-brand-cyan hover:underline inline-flex items-center gap-1"
                    >
                      {maskWhatsApp(pedidoDetalhe.whatsapp)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div>
                    <span className="text-brand-muted block text-[11px]">
                      Pagamento
                    </span>
                    <strong className="font-bold text-brand-ink">
                      {FORMA_PAGAMENTO_LABEL[pedidoDetalhe.forma_pagamento]}
                      {pedidoDetalhe.parcelas
                        ? ` (${pedidoDetalhe.parcelas}x)`
                        : ""}
                    </strong>
                  </div>
                  <div>
                    <span className="text-brand-muted block text-[11px]">
                      Colégio
                    </span>
                    <strong className="font-bold text-brand-ink">
                      {colegios.find((c) => c.id === pedidoDetalhe.colegio_id)
                        ?.nome || pedidoDetalhe.colegio_nome}
                    </strong>
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <span className="text-brand-muted block text-[11px]">
                      Série
                    </span>
                    <strong className="font-bold text-brand-ink">
                      {series.find((s) => s.id === pedidoDetalhe.serie_id)
                        ?.nome || pedidoDetalhe.serie_nome}
                    </strong>
                  </div>
                </div>

                {pedidoDetalhe.observacao && (
                  <div className="bg-white border border-brand-border rounded-xl p-3.5 text-xs">
                    <strong className="font-extrabold text-brand-ink block mb-0.5">
                      Observação enviada pelo cliente:
                    </strong>
                    <span>{pedidoDetalhe.observacao}</span>
                  </div>
                )}

                {/* Lista dos Módulos com botão "Abrir arquivo" e caixa "Impresso" */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                      Checklist de Módulos para Impressão (
                      {pedidoDetalhe.itens.filter((i) => i.impresso).length}/
                      {pedidoDetalhe.itens.length})
                    </h3>
                  </div>

                  <div className="space-y-2.5">
                    {pedidoDetalhe.itens.map((item, idx) => {
                      const modAtual = modulos.find(
                        (m) => m.id === item.modulo_id
                      );
                      const link =
                        modAtual?.link_arquivo || item.link_arquivo || "";
                      const ehUrlWeb = isWebUrl(link);
                      const infoMod = extrairInfoModuloChip(item.nome_modulo, idx);

                      return (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-brand-border bg-white transition-colors"
                        >
                          <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={item.impresso}
                              onChange={() =>
                                handleToggleItemImpresso(
                                  pedidoDetalhe.id,
                                  item.id,
                                  item.impresso
                                )
                              }
                              className="w-4 h-4 mt-0.5 accent-emerald-600 rounded shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-extrabold text-brand-ink">
                                  {infoMod.nomeBase}
                                </span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                    item.impresso
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-gray-100 text-gray-600 border-gray-200"
                                  }`}
                                >
                                  {item.impresso ? "Impresso ✓" : "Pendente"}
                                </span>
                              </div>
                              {infoMod.excecao && (
                                <span className="text-[11px] text-amber-700 font-medium block mt-0.5">
                                  ⓘ {infoMod.excecao}
                                </span>
                              )}
                              <span className="text-xs text-brand-muted block mt-0.5">
                                {formatCurrency(item.valor)}
                              </span>
                            </div>
                          </label>

                          {link ? (
                            ehUrlWeb ? (
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-brand-ink border border-brand-border text-xs font-bold rounded-xl transition-colors"
                              >
                                <Download className="w-3.5 h-3.5 text-brand-cyan" />
                                PDF
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => copiarCaminhoRede(item.id, link)}
                                title={link}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-brand-ink border border-brand-border text-xs font-bold rounded-xl transition-colors cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5 text-brand-cyan" />
                                {caminhoCopiadoId === item.id
                                  ? "Copiado!"
                                  : "PDF"}
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-brand-muted italic">
                              Sem PDF
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Resumo Financeiro + Controle de Pagamento */}
                <div className="bg-white rounded-2xl p-4 border border-brand-border space-y-3 text-xs tabular-nums">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1 text-brand-muted">
                      <div>
                        Subtotal:{" "}
                        <strong className="text-brand-ink">
                          {formatCurrency(pedidoDetalhe.subtotal)}
                        </strong>
                      </div>
                      {pedidoDetalhe.desconto > 0 && (
                        <div className="text-brand-cyan font-bold">
                          Desconto
                          {pedidoDetalhe.cupom_codigo
                            ? ` (${pedidoDetalhe.cupom_codigo})`
                            : ""}
                          : −{formatCurrency(pedidoDetalhe.desconto)}
                        </div>
                      )}
                      {pedidoDetalhe.juros > 0 && (
                        <div>
                          Juros parcelamento: +
                          {formatCurrency(pedidoDetalhe.juros)}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] uppercase font-bold text-brand-muted block">
                        Valor Total
                      </span>
                      <span className="text-2xl font-extrabold text-brand-magenta">
                        {formatCurrency(pedidoDetalhe.total)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-brand-border flex items-center justify-between gap-2">
                    <span className="font-semibold text-brand-muted">
                      Pagamento:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTogglePago(pedidoDetalhe)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border border-brand-border bg-white transition-colors cursor-pointer ${
                        pedidoDetalhe.pago
                          ? "text-emerald-700 hover:border-emerald-600"
                          : "text-brand-ink hover:border-brand-ink"
                      }`}
                    >
                      {pedidoDetalhe.pago
                        ? "✓ Pago (Desmarcar)"
                        : "Marcar como Pago"}
                    </button>
                  </div>
                </div>

                {/* Histórico */}
                <div className="bg-white rounded-2xl p-4 border border-brand-border space-y-2.5 text-xs">
                  <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-brand-ink">
                    Histórico
                  </h4>
                  <div className="space-y-2 text-[11px] text-brand-muted">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-brand-ink">
                        <span className="w-2 h-2 rounded-full bg-sky-500" />
                        Pedido recebido
                      </span>
                      <span className="tabular-nums">
                        {formatDateTimeBR(pedidoDetalhe.criado_em)}
                      </span>
                    </div>
                    {pedidoDetalhe.pago && pedidoDetalhe.pago_em && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Pagamento registrado
                        </span>
                        <span className="tabular-nums">
                          {formatDateTimeBR(pedidoDetalhe.pago_em)}
                        </span>
                      </div>
                    )}
                    {(pedidoDetalhe.status === "em_producao" ||
                      pedidoDetalhe.status === "pronto" ||
                      pedidoDetalhe.status === "entregue") && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-ink">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Em produção
                        </span>
                        <span className="tabular-nums">
                          {pedidoDetalhe.status === "em_producao"
                            ? "Etapa atual"
                            : "Concluído"}
                        </span>
                      </div>
                    )}
                    {pedidoDetalhe.pronto_em && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Pronto p/ retirada
                        </span>
                        <span className="tabular-nums">
                          {formatDateTimeBR(pedidoDetalhe.pronto_em)}
                        </span>
                      </div>
                    )}
                    {pedidoDetalhe.entregue_em && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                          <span className="w-2 h-2 rounded-full bg-emerald-600" />
                          Entregue
                        </span>
                        <span className="tabular-nums">
                          {formatDateTimeBR(pedidoDetalhe.entregue_em)}
                        </span>
                      </div>
                    )}
                    {pedidoDetalhe.status === "cancelado" && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-red-600">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Pedido cancelado
                        </span>
                        <span className="tabular-nums">Cancelado</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Rodapé Fixo de Ações na Gaveta */}
              <div className="bg-white border-t border-brand-border px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  {confirmandoCancelamento ? (
                    <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl text-xs">
                      <span className="text-red-700 font-bold">
                        Confirmar cancelamento?
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await handleMudarStatus(pedidoDetalhe, "cancelado");
                          setConfirmandoCancelamento(false);
                        }}
                        className="px-2.5 py-1 bg-red-600 text-white font-bold rounded-lg"
                      >
                        Sim
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoCancelamento(false)}
                        className="px-2.5 py-1 border border-brand-border bg-white text-brand-ink rounded-lg"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmandoCancelamento(true)}
                      className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      Cancelar pedido
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {pedidoDetalhe.status === "pronto" ? (
                    <button
                      type="button"
                      onClick={() => abrirWhatsAppPronto(pedidoDetalhe)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand-yellow text-brand-ink font-extrabold text-xs rounded-xl shadow-xs cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Reenviar aviso no WhatsApp
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleProntoAvisarCliente(pedidoDetalhe)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand-magenta hover:bg-brand-magenta/90 text-white font-bold text-xs rounded-xl shadow-md shadow-brand-magenta/20 transition-all cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Pronto — avisar cliente
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Duplicar Série */}
        {duplicarModalSerie && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white border border-brand-border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
              <h3 className="text-base font-extrabold text-brand-ink">
                Duplicar Série ({duplicarModalSerie.nome})
              </h3>
              <p className="text-xs text-brand-muted">
                Copia todos os módulos desta série para uma nova série no
                colégio escolhido.
              </p>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold mb-1">
                    Colégio de destino
                  </label>
                  <select
                    value={duplicarColegioDestino}
                    onChange={(e) => setDuplicarColegioDestino(e.target.value)}
                    className="w-full px-3 py-2.5 border border-brand-border rounded-xl"
                  >
                    {colegios.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">
                    Nome da nova série
                  </label>
                  <input
                    type="text"
                    value={duplicarNovoNome}
                    onChange={(e) => setDuplicarNovoNome(e.target.value)}
                    className="w-full px-3 py-2.5 border border-brand-border rounded-xl"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDuplicarModalSerie(null)}
                  className="px-3.5 py-2 text-xs font-semibold border border-brand-border rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!duplicarNovoNome.trim()) return;
                    const res = await duplicarSerieAction({
                      serieOrigemId: duplicarModalSerie.id,
                      colegioDestinoId: duplicarColegioDestino,
                      novoNomeSerie: duplicarNovoNome,
                    });
                    if (!res.ok || !res.novaSerie) {
                      exibirAviso(
                        "erro",
                        res.erro || "Erro ao duplicar série."
                      );
                      return;
                    }
                    setSeries((prev) => [...prev, res.novaSerie!]);
                    if (res.novosModulos && res.novosModulos.length > 0) {
                      setModulos((prev) => [...prev, ...res.novosModulos!]);
                    }
                    setColegioAtivoCadastro(res.novaSerie.colegio_id);
                    setSerieAtivaCadastro(res.novaSerie.id);
                    setDuplicarModalSerie(null);
                    exibirAviso(
                      "ok",
                      `Série "${res.novaSerie.nome}" duplicada com ${res.novosModulos?.length || 0} módulos!`
                    );
                  }}
                  className="px-4 py-2 text-xs font-bold bg-brand-magenta text-white rounded-xl"
                >
                  Duplicar agora
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
