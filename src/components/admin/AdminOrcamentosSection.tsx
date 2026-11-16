"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  MessageCircle,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ModuloCapaPreview } from "@/components/brand/ModuloCapaPreview";
import {
  baixarDocumentoOrcamentoPDF,
  DocumentoOrcamentoDados,
  imprimirDocumentoOrcamento,
} from "@/lib/documento-pedido";
import {
  Colegio,
  FormaPagamento,
  LojaConfig,
  Modulo,
  ModuloLivroItem,
  OrcamentoRegistrado,
  OrcamentoStatus,
  Pedido,
  Serie,
} from "@/types/database";
import {
  calcularTotaisPedido,
  FORMA_PAGAMENTO_LABEL,
  formatCurrency,
  formatDateTimeBR,
  gerarLinkWhatsApp,
  maskWhatsApp,
  onlyDigits,
} from "@/lib/format";
import {
  atualizarStatusOrcamentoAction,
  enviarPedidoAction,
  excluirOrcamentoAction,
  salvarOrcamentoAction,
} from "@/app/actions";

interface AdminOrcamentosSectionProps {
  orcamentos: OrcamentoRegistrado[];
  setOrcamentos: React.Dispatch<React.SetStateAction<OrcamentoRegistrado[]>>;
  setPedidos: React.Dispatch<React.SetStateAction<Pedido[]>>;
  colegios: Colegio[];
  series: Serie[];
  modulos: Modulo[];
  config: LojaConfig;
  exibirAviso: (tipo: "ok" | "erro", texto: string) => void;
}

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito_avista", label: "Crédito à vista" },
  { value: "credito_parcelado", label: "Parcelado" },
];

function gerarCodigoOrcamento() {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, "0");
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const sufixo = String(Math.floor(100 + Math.random() * 900));
  return `ORC-${dia}${mes}-${sufixo}`;
}

/** Copia texto com fallback garantido mesmo quando navigator.clipboard falha */
async function copiarParaTransferencia(texto: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // continua para fallback
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = texto;
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function formatarSerieCurtaOrcamento(serieNome?: string): string {
  const sNome = (serieNome || "").trim();
  if (!sNome) return "";
  return sNome
    .replace(/ensino\s+fundamental/gi, "EF")
    .replace(/ensino\s+m[eé]dio/gi, "EM")
    .replace(/educa[cç][aã]o\s+infantil/gi, "EI")
    .replace(/[—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function AdminOrcamentosSection({
  orcamentos,
  setOrcamentos,
  setPedidos,
  colegios,
  series,
  modulos,
  config,
  exibirAviso,
}: AdminOrcamentosSectionProps) {
  const [filtroStatus, setFiltroStatus] = useState<"todos" | OrcamentoStatus>(
    "todos"
  );
  const [busca, setBusca] = useState("");
  const [convertendoId, setConvertendoId] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [msgListaCopiada, setMsgListaCopiada] = useState(false);

  // Controle de qual orçamento está com o "Ver mais" expandido
  const [orcamentoExpandidoId, setOrcamentoExpandidoId] = useState<
    string | null
  >(null);

  // Estado do Construtor / Editor de Orçamento dentro do Admin
  const [construtorAberto, setConstrutorAberto] = useState(false);
  const [codigoOrcamento, setCodigoOrcamento] = useState<string>(() =>
    gerarCodigoOrcamento()
  );
  const [clienteNome, setClienteNome] = useState("");
  const [whatsappCliente, setWhatsappCliente] = useState("");
  const [emailCliente, setEmailCliente] = useState("");
  const [validadeDias, setValidadeDias] = useState<number>(7);
  const [colegioId, setColegioId] = useState<string>("");
  const [serieId, setSerieId] = useState<string>("");
  const [modulosSelecionados, setModulosSelecionados] = useState<string[]>([]);
  const [disciplinasPorModulo, setDisciplinasPorModulo] = useState<
    Record<string, string[]>
  >({});
  const [modulosMateriasExpandidas, setModulosMateriasExpandidas] = useState<
    string[]
  >([]);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("pix");
  const [parcelas, setParcelas] = useState<number>(2);
  const [descontoManualStr, setDescontoManualStr] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [resumoCopiado, setResumoCopiado] = useState(false);

  const seriesFiltradas = useMemo(
    () =>
      series
        .filter((s) => s.colegio_id === colegioId && s.ativo)
        .sort((a, b) => a.ordem - b.ordem),
    [series, colegioId]
  );

  const modulosDaSerie = useMemo(
    () =>
      modulos
        .filter((m) => m.serie_id === serieId && m.ativo)
        .sort((a, b) => a.ordem - b.ordem),
    [modulos, serieId]
  );

  const colegioSelecionadoObj = useMemo(
    () => colegios.find((c) => c.id === colegioId) || null,
    [colegios, colegioId]
  );

  const serieSelecionadaObj = useMemo(
    () => series.find((s) => s.id === serieId) || null,
    [series, serieId]
  );

  const modulosEscolhidosObjs = useMemo(
    () => modulosDaSerie.filter((m) => modulosSelecionados.includes(m.id)),
    [modulosDaSerie, modulosSelecionados]
  );

  const todosSelecionados =
    modulosDaSerie.length > 0 &&
    modulosDaSerie.every((m) => modulosSelecionados.includes(m.id));

  const getLivrosDisponiveis = useCallback(
    (mod: Modulo): ModuloLivroItem[] => {
      if (Array.isArray(mod.livros) && mod.livros.length > 0) {
        return mod.livros;
      }
      const discs =
        Array.isArray(mod.disciplinas) && mod.disciplinas.length > 0
          ? mod.disciplinas
          : [
              "Português",
              "Matemática",
              "História",
              "Geografia",
              "Ciências",
              "Inglês",
            ];
      const valorUnit = Number(
        (Number(mod.valor) / Math.max(1, discs.length)).toFixed(2)
      );
      return discs.map((d, idx) => ({
        id: `liv-fallback-${mod.id}-${idx + 1}`,
        nome: d,
        valor: valorUnit,
      }));
    },
    []
  );

  const obterResumoModulo = useCallback(
    (mod: Modulo) => {
      const disponiveis = getLivrosDisponiveis(mod);
      const rawSelecionados = disciplinasPorModulo[mod.id];
      const selecionados =
        Array.isArray(rawSelecionados) && rawSelecionados.length > 0
          ? disponiveis.filter(
              (l) =>
                rawSelecionados.includes(l.id) ||
                rawSelecionados.includes(l.nome)
            )
          : disponiveis;
      const garantidos =
        selecionados.length > 0 ? selecionados : disponiveis;
      const excluidos = disponiveis.filter(
        (l) => !garantidos.some((g) => g.id === l.id)
      );
      const todosMarcados = excluidos.length === 0;
      const somaTotalLivros = Number(
        disponiveis
          .reduce((acc, l) => acc + Number(l.valor), 0)
          .toFixed(2)
      );
      const valorBase = somaTotalLivros > 0 ? somaTotalLivros : Number(mod.valor);
      const valorEfetivo = todosMarcados
        ? valorBase
        : Number(
            garantidos
              .reduce((acc, l) => acc + Number(l.valor), 0)
              .toFixed(2)
          );

      const textoResumoLivros = todosMarcados
        ? "Todos os livros"
        : `Todos os livros, exceto ${excluidos.map((l) => l.nome).join(", ")}`;

      return {
        disponiveis,
        selecionados: garantidos,
        excluidos,
        todosSelecionados: todosMarcados,
        valorBase,
        valorEfetivo,
        textoResumoLivros,
        nomeComLivros: todosMarcados
          ? mod.nome
          : `${mod.nome} — ${textoResumoLivros}`,
      };
    },
    [disciplinasPorModulo, getLivrosDisponiveis]
  );

  const valoresEscolhidos = useMemo(
    () => modulosEscolhidosObjs.map((m) => obterResumoModulo(m).valorEfetivo),
    [modulosEscolhidosObjs, obterResumoModulo]
  );

  const descontoManualValor = useMemo(() => {
    const num = Number(descontoManualStr.replace(",", "."));
    return Number.isFinite(num) && num > 0 ? Number(num.toFixed(2)) : 0;
  }, [descontoManualStr]);

  const totais = useMemo(
    () =>
      calcularTotaisPedido({
        valoresModulos: valoresEscolhidos,
        cupom:
          descontoManualValor > 0
            ? { tipo: "valor", desconto: descontoManualValor }
            : null,
        formaPagamento,
        parcelas: formaPagamento === "credito_parcelado" ? parcelas : null,
        taxasParcelamento: config.taxas_parcelamento,
      }),
    [
      valoresEscolhidos,
      descontoManualValor,
      formaPagamento,
      parcelas,
      config.taxas_parcelamento,
    ]
  );

  const opcoesParcelamento = useMemo(() => {
    const baseLiquida = Math.max(0, totais.subtotal - totais.desconto);
    const lista: {
      parcelas: number;
      taxa: number;
      totalComJuros: number;
      valorParcela: number;
    }[] = [];

    for (let p = 2; p <= 12; p++) {
      const taxa = Number(config.taxas_parcelamento?.[String(p)] ?? 0);
      const juros = Number(((baseLiquida * taxa) / 100).toFixed(2));
      const totalComJuros = Number((baseLiquida + juros).toFixed(2));
      const valorParcela = Number((totalComJuros / p).toFixed(2));
      lista.push({ parcelas: p, taxa, totalComJuros, valorParcela });
    }
    return lista;
  }, [totais.subtotal, totais.desconto, config.taxas_parcelamento]);

  const pagamentoFormatadoTexto = useMemo(() => {
    if (formaPagamento === "credito_parcelado") {
      return `Crédito parcelado em ${parcelas}x de ${formatCurrency(totais.valorParcela)}`;
    }
    return FORMA_PAGAMENTO_LABEL[formaPagamento] || "Pix";
  }, [formaPagamento, parcelas, totais.valorParcela]);

  const abrirNovoOrcamentoAdmin = () => {
    setCodigoOrcamento(gerarCodigoOrcamento());
    setClienteNome("");
    setWhatsappCliente("");
    setEmailCliente("");
    setValidadeDias(7);
    setColegioId("");
    setSerieId("");
    setModulosSelecionados([]);
    setDisciplinasPorModulo({});
    setModulosMateriasExpandidas([]);
    setFormaPagamento("pix");
    setParcelas(2);
    setDescontoManualStr("");
    setObservacao("");
    setConstrutorAberto(true);
  };

  const abrirParaRevisar = (orc: OrcamentoRegistrado) => {
    setCodigoOrcamento(orc.codigo);
    setClienteNome(orc.cliente_nome);
    setWhatsappCliente(orc.whatsapp ? maskWhatsApp(orc.whatsapp) : "");
    setEmailCliente(orc.email || "");
    setValidadeDias(orc.validade_dias || 7);
    setColegioId(orc.colegio_id);
    setSerieId(orc.serie_id);
    setModulosSelecionados(orc.itens.map((i) => i.modulo_id));
    setDisciplinasPorModulo({});
    setModulosMateriasExpandidas([]);
    setFormaPagamento(orc.forma_pagamento || "pix");
    setParcelas(orc.parcelas || 2);
    setDescontoManualStr(orc.desconto > 0 ? String(orc.desconto) : "");
    setObservacao(orc.observacao || "");
    setConstrutorAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleModulo = (id: string) => {
    const mod = modulosDaSerie.find((m) => m.id === id);
    setModulosSelecionados((prev) => {
      const jaSelecionado = prev.includes(id);
      if (jaSelecionado) {
        return prev.filter((item) => item !== id);
      }
      if (mod) {
        const disp = getLivrosDisponiveis(mod);
        setDisciplinasPorModulo((ant) => ({
          ...ant,
          [id]:
            ant[id] && ant[id].length > 0
              ? ant[id]
              : disp.map((l) => l.id),
        }));
      }
      return [...prev, id];
    });
  };

  const toggleLivroModulo = (mod: Modulo, livroId: string) => {
    const disp = getLivrosDisponiveis(mod);
    setDisciplinasPorModulo((prev) => {
      const atuaisIds =
        Array.isArray(prev[mod.id]) && prev[mod.id].length > 0
          ? disp
              .filter(
                (l) =>
                  prev[mod.id].includes(l.id) ||
                  prev[mod.id].includes(l.nome)
              )
              .map((l) => l.id)
          : disp.map((l) => l.id);

      const jaTem = atuaisIds.includes(livroId);
      if (jaTem && atuaisIds.length <= 1) {
        return prev;
      }
      const novos = jaTem
        ? atuaisIds.filter((item) => item !== livroId)
        : disp
            .filter((l) => atuaisIds.includes(l.id) || l.id === livroId)
            .map((l) => l.id);
      return {
        ...prev,
        [mod.id]: novos,
      };
    });
  };

  const montarTextoWhatsApp = useCallback(
    (orc: {
      codigo: string;
      cliente_nome: string;
      colegio_nome: string;
      serie_nome: string;
      itens: { nome_modulo: string; valor: number }[];
      subtotal: number;
      desconto: number;
      juros: number;
      total: number;
      forma_pagamento: FormaPagamento;
      parcelas?: number | null;
      validade_dias: number;
      observacao?: string | null;
    }) => {
      const nomeLimpo = orc.cliente_nome.trim();
      const saudacao = nomeLimpo
        ? `Olá, *${nomeLimpo}*! Tudo bem? 😊`
        : `Olá! Tudo bem? 😊`;

      const listaItens = orc.itens
        .map((it) => `• *${it.nome_modulo}* — ${formatCurrency(it.valor)}`)
        .join("\n");

      const pagLabel =
        orc.forma_pagamento === "credito_parcelado" &&
        orc.parcelas &&
        orc.parcelas >= 2
          ? `Crédito parcelado em ${orc.parcelas}x de ${formatCurrency(Number((orc.total / orc.parcelas).toFixed(2)))}`
          : FORMA_PAGAMENTO_LABEL[orc.forma_pagamento] || "Pix";

      const blocoValores: string[] = [];
      if (orc.desconto > 0) {
        blocoValores.push(`Subtotal: ${formatCurrency(orc.subtotal)}`);
        blocoValores.push(`Desconto: -${formatCurrency(orc.desconto)}`);
      }
      if (orc.juros > 0) {
        blocoValores.push(
          `Juros parcelamento (${orc.parcelas || ""}x): +${formatCurrency(orc.juros)}`
        );
      }
      blocoValores.push(`💰 *Valor Total:* *${formatCurrency(orc.total)}*`);
      blocoValores.push(`💳 *Forma de pagamento:* ${pagLabel}`);

      const urlBase =
        typeof window !== "undefined" ? window.location.origin : "";
      const linkPedido = urlBase ? `${urlBase}/pedido` : "";

      const secoes: string[] = [
        saudacao,
        `Conforme solicitado, preparamos o seu orçamento de material escolar na *${config.nome_loja}*:`,
        [
          `📋 *Orçamento:* ${orc.codigo}`,
          `🏫 *Colégio:* ${orc.colegio_nome || "—"}`,
          `🎓 *Série:* ${orc.serie_nome || "—"}`,
        ].join("\n"),
        [
          `📚 *Módulos selecionados (${orc.itens.length}):*`,
          listaItens || "• (Nenhum módulo selecionado)",
        ].join("\n"),
        blocoValores.join("\n"),
      ];

      if (orc.observacao?.trim()) {
        secoes.push(`📝 *Observação:* ${orc.observacao.trim()}`);
      }

      secoes.push(
        [
          `⏱️ *Prazo de produção:* ${config.prazo_dias} dias após a confirmação`,
          `📅 *Validade do orçamento:* ${orc.validade_dias} dias`,
          `📍 *Retirada na loja:* ${config.endereco_retirada}`,
          `🕒 *Horário:* ${config.horario_retirada}`,
        ].join("\n")
      );

      if (linkPedido) {
        secoes.push(
          `Ficou com alguma dúvida ou deseja confirmar o seu pedido? Pode nos responder por aqui mesmo ou finalizar direto pelo nosso link:\n👉 ${linkPedido}`
        );
      } else {
        secoes.push(
          `Ficou com alguma dúvida ou deseja confirmar o seu pedido? É só nos responder por aqui mesmo!`
        );
      }

      secoes.push(
        `Agradecemos a preferência! 💙💗💛\n*Equipe ${config.nome_loja}*`
      );

      return secoes.join("\n\n");
    },
    [config]
  );

  const montarTextoEmail = useCallback(
    (orc: {
      codigo: string;
      cliente_nome: string;
      colegio_nome: string;
      serie_nome: string;
      itens: { nome_modulo: string; valor: number }[];
      subtotal: number;
      desconto: number;
      juros: number;
      total: number;
      forma_pagamento: FormaPagamento;
      parcelas?: number | null;
      validade_dias: number;
      observacao?: string | null;
    }) => {
      const nomeLimpo = orc.cliente_nome.trim();
      const saudacao = nomeLimpo
        ? `Olá, ${nomeLimpo}! Tudo bem?`
        : `Olá! Tudo bem?`;

      const listaItens = orc.itens
        .map(
          (it, idx) =>
            `  ${idx + 1}. ${it.nome_modulo} — ${formatCurrency(it.valor)}`
        )
        .join("\n");

      const pagLabel =
        orc.forma_pagamento === "credito_parcelado" &&
        orc.parcelas &&
        orc.parcelas >= 2
          ? `Crédito parcelado em ${orc.parcelas}x de ${formatCurrency(Number((orc.total / orc.parcelas).toFixed(2)))}`
          : FORMA_PAGAMENTO_LABEL[orc.forma_pagamento] || "Pix";

      const linhasValores: string[] = [];
      if (orc.desconto > 0) {
        linhasValores.push(`Subtotal: ${formatCurrency(orc.subtotal)}`);
        linhasValores.push(`Desconto: -${formatCurrency(orc.desconto)}`);
      }
      if (orc.juros > 0) {
        linhasValores.push(
          `Juros parcelamento (${orc.parcelas || ""}x): +${formatCurrency(orc.juros)}`
        );
      }
      linhasValores.push(`VALOR TOTAL: ${formatCurrency(orc.total)}`);
      linhasValores.push(`Forma de pagamento: ${pagLabel}`);

      const urlBase =
        typeof window !== "undefined" ? window.location.origin : "";
      const linkPedido = urlBase ? `${urlBase}/pedido` : "";

      const secoes: string[] = [
        saudacao,
        `Agradecemos o seu contato com a ${config.nome_loja}. Conforme solicitado, segue abaixo a proposta detalhada para o seu material escolar:`,
        [
          `--------------------------------------------------`,
          `RESUMO DO ORÇAMENTO — Nº ${orc.codigo}`,
          `--------------------------------------------------`,
          `• Colégio: ${orc.colegio_nome || "—"}`,
          `• Série: ${orc.serie_nome || "—"}`,
        ].join("\n"),
        [
          `MÓDULOS SELECIONADOS (${orc.itens.length}):`,
          listaItens || "  (Nenhum módulo selecionado)",
        ].join("\n"),
        [
          `--------------------------------------------------`,
          ...linhasValores,
          `--------------------------------------------------`,
        ].join("\n"),
      ];

      if (orc.observacao?.trim()) {
        secoes.push(`OBSERVAÇÕES:\n${orc.observacao.trim()}`);
      }

      secoes.push(
        [
          `INFORMAÇÕES IMPORTANTES:`,
          `• Prazo de produção: ${config.prazo_dias} dias após a confirmação do pedido`,
          `• Validade desta proposta: ${orc.validade_dias} dias`,
          `• Local de retirada: ${config.endereco_retirada}`,
          `• Horário de atendimento: ${config.horario_retirada}`,
        ].join("\n")
      );

      if (linkPedido) {
        secoes.push(
          `COMO CONFIRMAR O SEU PEDIDO:\nVocê pode aprovar este orçamento respondendo a este e-mail, pelo nosso WhatsApp ${maskWhatsApp(config.whatsapp_loja)} ou realizando o pedido diretamente pelo link:\n${linkPedido}`
        );
      }

      secoes.push(
        `Atenciosamente,\nEquipe ${config.nome_loja}\nWhatsApp: ${maskWhatsApp(config.whatsapp_loja)}`
      );

      return secoes.join("\n\n");
    },
    [config]
  );

  const dadosOrcamentoAtual = useMemo<DocumentoOrcamentoDados>(() => {
    return {
      codigo: codigoOrcamento,
      criado_em: new Date().toISOString(),
      validade_dias: Math.max(1, Number(validadeDias) || 7),
      cliente_nome: clienteNome.trim() || "Cliente RS Digital",
      whatsapp: onlyDigits(whatsappCliente),
      email: emailCliente.trim(),
      colegio_nome: colegioSelecionadoObj?.nome || "—",
      serie_nome: serieSelecionadaObj?.nome || "—",
      forma_pagamento: formaPagamento,
      parcelas: formaPagamento === "credito_parcelado" ? parcelas : null,
      subtotal: totais.subtotal,
      desconto: totais.desconto,
      juros: totais.juros,
      total: totais.total,
      cupom_codigo: null,
      observacao: observacao.trim() || null,
      itens: modulosEscolhidosObjs.map((m) => {
        const r = obterResumoModulo(m);
        return {
          nome_modulo: r.nomeComLivros,
          valor: r.valorEfetivo,
        };
      }),
    };
  }, [
    codigoOrcamento,
    validadeDias,
    clienteNome,
    whatsappCliente,
    emailCliente,
    colegioSelecionadoObj,
    serieSelecionadaObj,
    formaPagamento,
    parcelas,
    totais,
    observacao,
    modulosEscolhidosObjs,
    obterResumoModulo,
  ]);

  const salvarOrcamentoAtual = async (
    novoStatus: OrcamentoStatus = "enviado"
  ): Promise<OrcamentoRegistrado | null> => {
    if (!colegioId || !serieId || modulosEscolhidosObjs.length === 0) {
      exibirAviso(
        "erro",
        "Selecione o colégio, a série e pelo menos 1 módulo."
      );
      return null;
    }

    setSalvando(true);
    try {
      const res = await salvarOrcamentoAction({
        id: codigoOrcamento,
        codigo: codigoOrcamento,
        status: novoStatus,
        validade_dias: Math.max(1, Number(validadeDias) || 7),
        cliente_nome: clienteNome.trim() || "Cliente RS Digital",
        whatsapp: onlyDigits(whatsappCliente),
        email: emailCliente.trim(),
        colegio_id: colegioId,
        colegio_nome: colegioSelecionadoObj?.nome || "—",
        serie_id: serieId,
        serie_nome: serieSelecionadaObj?.nome || "—",
        forma_pagamento: formaPagamento,
        parcelas: formaPagamento === "credito_parcelado" ? parcelas : null,
        subtotal: totais.subtotal,
        desconto: totais.desconto,
        juros: totais.juros,
        total: totais.total,
        cupom_codigo: null,
        observacao: observacao.trim() || null,
        itens: modulosEscolhidosObjs.map((m) => {
          const r = obterResumoModulo(m);
          return {
            modulo_id: m.id,
            nome_modulo: r.nomeComLivros,
            valor: r.valorEfetivo,
          };
        }),
      });

      if (!res.ok || !res.orcamento) {
        exibirAviso("erro", res.erro || "Erro ao salvar orçamento.");
        return null;
      }

      const salvo = res.orcamento;
      setOrcamentos((prev) => {
        const existe = prev.some(
          (o) => o.id === salvo.id || o.codigo === salvo.codigo
        );
        if (existe) {
          return prev.map((o) =>
            o.id === salvo.id || o.codigo === salvo.codigo ? salvo : o
          );
        }
        return [salvo, ...prev];
      });
      exibirAviso("ok", `Orçamento ${salvo.codigo} salvo com sucesso!`);
      return salvo;
    } finally {
      setSalvando(false);
    }
  };

  const qtdSolicitados = orcamentos.filter(
    (o) => o.status === "solicitado"
  ).length;
  const qtdEnviados = orcamentos.filter((o) => o.status === "enviado").length;
  const qtdAprovados = orcamentos.filter((o) => o.status === "aprovado").length;

  const urlSolicitacao =
    typeof window !== "undefined"
      ? `${window.location.origin}/orcamento`
      : "https://rsdigital.vercel.app/orcamento";

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Barra de Atalhos Rápidos (sem exibir a URL crua na tela) */}
      <div className="bg-white border border-brand-border/80 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const url = `${window.location.origin}/orcamento`;
              const ok = await copiarParaTransferencia(url);
              if (ok) {
                setLinkCopiado(true);
                exibirAviso("ok", "Link de solicitação copiado!");
                setTimeout(() => setLinkCopiado(false), 2500);
              } else {
                exibirAviso("erro", `Copie manualmente: ${url}`);
              }
            }}
            className="h-9 px-3.5 rounded-xl border border-brand-border hover:border-brand-ink bg-white text-brand-ink text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
            <span>
              {linkCopiado ? "Link Copiado!" : "Copiar Link de Solicitação"}
            </span>
          </button>

          <button
            type="button"
            onClick={async () => {
              const msg = [
                `Olá! 😊 Tudo bem? Seja bem-vindo(a) à *${config.nome_loja}*!`,
                `Para passarmos o seu orçamento de material escolar, preencha neste link rápido:`,
                `👉 ${window.location.origin}/orcamento`,
                ``,
                `Ou, se preferir, responda por aqui:`,
                `1️⃣ *Seu Nome:*`,
                `2️⃣ *Colégio:*`,
                `3️⃣ *Série / Ano:*`,
                `4️⃣ *Módulos desejados:*`,
                `5️⃣ *Forma de pagamento preferida:*`,
              ].join("\n");
              const ok = await copiarParaTransferencia(msg);
              if (ok) {
                setMsgListaCopiada(true);
                exibirAviso("ok", "Mensagem de atendimento copiada!");
                setTimeout(() => setMsgListaCopiada(false), 2500);
              }
            }}
            className="h-9 px-3.5 rounded-xl border border-brand-border hover:border-brand-ink bg-white text-brand-ink text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-brand-magenta shrink-0" />
            <span>
              {msgListaCopiada
                ? "Mensagem Copiada!"
                : "Copiar Mensagem p/ WhatsApp"}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={abrirNovoOrcamentoAdmin}
          className="h-9 px-4 rounded-xl bg-brand-magenta hover:bg-brand-magenta/90 text-white text-xs font-bold shadow-2xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Montar Orçamento no Admin</span>
        </button>
      </div>

      {/* Construtor / Revisor de Orçamento Expansível dentro do Admin */}
      {construtorAberto && (
        <div className="bg-white border-2 border-brand-ink rounded-2xl shadow-md p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border pb-3.5">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-brand-ink text-white text-xs font-extrabold">
                {codigoOrcamento}
              </span>
              <h2 className="text-base font-extrabold text-brand-ink">
                Construção e Revisão de Orçamento
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={abrirNovoOrcamentoAdmin}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-border text-xs font-bold text-brand-muted hover:text-brand-ink cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
              <button
                type="button"
                onClick={() => setConstrutorAberto(false)}
                className="p-1.5 rounded-lg border border-brand-border text-brand-muted hover:text-brand-ink cursor-pointer"
                title="Fechar construtor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Coluna Esquerda do Construtor: Campos */}
            <div className="lg:col-span-8 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-brand-ink mb-1">
                    Nome do Cliente
                  </label>
                  <input
                    type="text"
                    placeholder="Ex.: Maria Silva"
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-ink mb-1">
                    WhatsApp (com DDD)
                  </label>
                  <input
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={whatsappCliente}
                    onChange={(e) =>
                      setWhatsappCliente(maskWhatsApp(e.target.value))
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-ink mb-1">
                    E-mail do Cliente
                  </label>
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={emailCliente}
                    onChange={(e) => setEmailCliente(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-brand-border">
                <div>
                  <label className="block text-xs font-bold text-brand-ink mb-1">
                    Colégio *
                  </label>
                  <select
                    value={colegioId}
                    onChange={(e) => {
                      setColegioId(e.target.value);
                      setSerieId("");
                      setModulosSelecionados([]);
                      setDisciplinasPorModulo({});
                    }}
                    className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                  >
                    <option value="">Selecione o colégio...</option>
                    {colegios.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-ink mb-1">
                    Série *
                  </label>
                  <select
                    value={serieId}
                    disabled={!colegioId}
                    onChange={(e) => {
                      setSerieId(e.target.value);
                      setModulosSelecionados([]);
                      setDisciplinasPorModulo({});
                    }}
                    className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl disabled:opacity-60 focus:outline-none focus:border-brand-cyan"
                  >
                    <option value="">
                      {colegioId
                        ? "Selecione a série..."
                        : "Escolha primeiro o colégio"}
                    </option>
                    {seriesFiltradas.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {serieId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand-ink">
                      Módulos da Série *
                    </span>
                    {modulosDaSerie.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (todosSelecionados) {
                            setModulosSelecionados([]);
                          } else {
                            setModulosSelecionados(
                              modulosDaSerie.map((m) => m.id)
                            );
                          }
                        }}
                        className="text-xs font-bold text-brand-cyan hover:text-brand-ink cursor-pointer"
                      >
                        {todosSelecionados
                          ? "Desmarcar todos"
                          : "Selecionar todos"}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {modulosDaSerie.map((mod) => {
                      const selecionado = modulosSelecionados.includes(mod.id);
                      const resumo = obterResumoModulo(mod);
                      const expandido = modulosMateriasExpandidas.includes(
                        mod.id
                      );
                      return (
                        <div
                          key={mod.id}
                          className={`border rounded-xl bg-white ${
                            selecionado
                              ? "border-brand-ink ring-1 ring-brand-ink"
                              : "border-brand-border"
                          }`}
                        >
                          <div className="flex items-center justify-between px-3.5 py-2.5 gap-3">
                            <button
                              type="button"
                              onClick={() => toggleModulo(mod.id)}
                              className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <span
                                className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border ${
                                  selecionado
                                    ? "bg-brand-ink border-brand-ink text-white"
                                    : "border-brand-border bg-white"
                                }`}
                              >
                                {selecionado && (
                                  <Check className="w-3 h-3 stroke-[3]" />
                                )}
                              </span>
                              <ModuloCapaPreview
                                nomeModulo={mod.nome}
                                nomeSerie={serieSelecionadaObj?.nome}
                                nomeColegio={colegioSelecionadoObj?.nome}
                                ordem={mod.ordem}
                                capaUrl={mod.capa_url}
                                qtdDisciplinas={resumo.disponiveis.length}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-brand-ink block">
                                  {mod.nome}
                                </span>
                                <span className="text-[11px] text-brand-muted block truncate">
                                  {selecionado
                                    ? resumo.textoResumoLivros
                                    : `${resumo.disponiveis.length} matérias`}
                                </span>
                              </div>
                            </button>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setModulosMateriasExpandidas((prev) =>
                                    prev.includes(mod.id)
                                      ? prev.filter((id) => id !== mod.id)
                                      : [...prev, mod.id]
                                  )
                                }
                                className="px-2 py-1 rounded-lg border border-brand-border text-[11px] font-bold text-brand-muted hover:text-brand-ink cursor-pointer"
                              >
                                {expandido ? "Ocultar" : "Matérias"}
                              </button>
                              <span className="text-xs font-extrabold text-brand-ink tabular-nums">
                                {formatCurrency(
                                  selecionado
                                    ? resumo.valorEfetivo
                                    : resumo.valorBase
                                )}
                              </span>
                            </div>
                          </div>

                          {expandido && (
                            <div className="px-3.5 pb-3 pt-2 border-t border-brand-border/80 bg-[#FAFAFB] grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {resumo.disponiveis.map((liv) => {
                                const ativo = selecionado
                                  ? resumo.selecionados.some(
                                      (s) => s.id === liv.id
                                    )
                                  : true;
                                return (
                                  <button
                                    key={liv.id}
                                    type="button"
                                    onClick={() => {
                                      if (!selecionado) {
                                        toggleModulo(mod.id);
                                        return;
                                      }
                                      toggleLivroModulo(mod, liv.id);
                                    }}
                                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs bg-white cursor-pointer ${
                                      ativo
                                        ? "border-brand-border text-brand-ink font-semibold"
                                        : "border-brand-border text-brand-muted line-through opacity-60"
                                    }`}
                                  >
                                    <span className="truncate">{liv.nome}</span>
                                    <span className="font-bold tabular-nums">
                                      {formatCurrency(liv.valor)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-brand-border">
                <div>
                  <label className="block text-xs font-bold text-brand-ink mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={formaPagamento}
                    onChange={(e) =>
                      setFormaPagamento(e.target.value as FormaPagamento)
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl"
                  >
                    {FORMAS_PAGAMENTO.map((fp) => (
                      <option key={fp.value} value={fp.value}>
                        {fp.label}
                      </option>
                    ))}
                  </select>
                </div>

                {formaPagamento === "credito_parcelado" && (
                  <div>
                    <label className="block text-xs font-bold text-brand-ink mb-1">
                      Parcelas
                    </label>
                    <select
                      value={parcelas}
                      onChange={(e) => setParcelas(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl"
                    >
                      {opcoesParcelamento.map((op) => (
                        <option key={op.parcelas} value={op.parcelas}>
                          {op.parcelas}x de {formatCurrency(op.valorParcela)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-brand-ink mb-1">
                    Desconto (R$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0,00"
                    value={descontoManualStr}
                    onChange={(e) => setDescontoManualStr(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-brand-ink mb-1">
                    Observação no orçamento
                  </label>
                  <input
                    type="text"
                    placeholder="Ex.: Condição especial, espiral inclusa..."
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Coluna Direita do Construtor: Resumo de Valores + Botões de Envio */}
            <div className="lg:col-span-4 bg-[#FAFAFB] border border-brand-border rounded-2xl p-4 space-y-4 tabular-nums">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-brand-muted">
                  <span>Subtotal ({modulosEscolhidosObjs.length} mód.)</span>
                  <span className="font-bold text-brand-ink">
                    {formatCurrency(totais.subtotal)}
                  </span>
                </div>
                {totais.desconto > 0 && (
                  <div className="flex justify-between text-brand-cyan font-bold">
                    <span>Desconto</span>
                    <span>− {formatCurrency(totais.desconto)}</span>
                  </div>
                )}
                {totais.juros > 0 && (
                  <div className="flex justify-between text-brand-muted">
                    <span>Juros ({parcelas}x)</span>
                    <span>+ {formatCurrency(totais.juros)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-brand-border">
                  <span className="font-extrabold text-brand-ink">
                    Valor Final
                  </span>
                  <span className="text-2xl font-extrabold text-brand-magenta">
                    {formatCurrency(totais.total)}
                  </span>
                </div>
                <p className="text-[11px] text-brand-muted text-right font-semibold">
                  {pagamentoFormatadoTexto}
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-brand-border">
                <button
                  type="button"
                  disabled={salvando}
                  onClick={async () => {
                    const salvo = await salvarOrcamentoAtual("enviado");
                    if (!salvo) return;
                    const msg = montarTextoWhatsApp(salvo);
                    const fone = onlyDigits(salvo.whatsapp);
                    const url =
                      fone.length >= 10
                        ? gerarLinkWhatsApp(fone, msg)
                        : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Salvar e Enviar no WhatsApp</span>
                </button>

                <button
                  type="button"
                  disabled={salvando}
                  onClick={async () => {
                    const salvo = await salvarOrcamentoAtual("enviado");
                    if (!salvo) return;
                    await baixarDocumentoOrcamentoPDF(
                      dadosOrcamentoAtual,
                      config
                    );
                  }}
                  className="w-full py-2.5 px-4 bg-brand-magenta hover:bg-brand-magenta/90 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Salvar e Gerar PDF</span>
                </button>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={async () => {
                      const salvo = await salvarOrcamentoAtual("enviado");
                      if (!salvo) return;
                      const colNome = salvo.colegio_nome
                        ? ` — ${salvo.colegio_nome}`
                        : "";
                      const assunto = `Orçamento de Material Escolar (${salvo.codigo})${colNome} | ${config.nome_loja}`;
                      const corpo = montarTextoEmail(salvo);
                      window.location.href = `mailto:${encodeURIComponent(salvo.email || "")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
                    }}
                    className="py-2 px-2 bg-white hover:bg-gray-50 border border-brand-border rounded-xl text-[11px] font-bold text-brand-ink flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-brand-cyan" />
                    <span>E-mail</span>
                  </button>

                  <button
                    type="button"
                    disabled={salvando}
                    onClick={async () => {
                      const salvo = await salvarOrcamentoAtual("enviado");
                      if (!salvo) return;
                      imprimirDocumentoOrcamento(dadosOrcamentoAtual, config);
                    }}
                    className="py-2 px-2 bg-white hover:bg-gray-50 border border-brand-border rounded-xl text-[11px] font-bold text-brand-ink flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-brand-cyan" />
                    <span>Imprimir</span>
                  </button>

                  <button
                    type="button"
                    disabled={salvando}
                    onClick={async () => {
                      const salvo = await salvarOrcamentoAtual("enviado");
                      if (!salvo) return;
                      const ok = await copiarParaTransferencia(
                        montarTextoWhatsApp(salvo)
                      );
                      if (ok) {
                        setResumoCopiado(true);
                        setTimeout(() => setResumoCopiado(false), 2500);
                      }
                    }}
                    className="py-2 px-2 bg-white hover:bg-gray-50 border border-brand-border rounded-xl text-[11px] font-bold text-brand-ink flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-brand-cyan" />
                    <span>{resumoCopiado ? "Copiado!" : "Copiar"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPIs de Orçamentos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-brand-border/80 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 block">
            Novas Solicitações (Site)
          </span>
          <strong className="text-2xl font-extrabold text-amber-700 mt-1 block tabular-nums">
            {qtdSolicitados}
          </strong>
        </div>
        <div className="bg-white border border-brand-border/80 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-cyan block">
            Enviados / Aguardando
          </span>
          <strong className="text-2xl font-extrabold text-brand-cyan mt-1 block tabular-nums">
            {qtdEnviados}
          </strong>
        </div>
        <div className="bg-white border border-brand-border/80 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
            Aprovados / Pedidos
          </span>
          <strong className="text-2xl font-extrabold text-emerald-700 mt-1 block tabular-nums">
            {qtdAprovados}
          </strong>
        </div>
        <div className="bg-white border border-brand-border/80 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-magenta block">
            Valor em Aberto
          </span>
          <strong className="text-2xl font-extrabold text-brand-magenta mt-1 block tabular-nums">
            {formatCurrency(
              orcamentos
                .filter(
                  (o) => o.status === "solicitado" || o.status === "enviado"
                )
                .reduce((acc, o) => acc + Number(o.total || 0), 0)
            )}
          </strong>
        </div>
      </div>

      {/* Lista Compacta e Organizada de Orçamentos */}
      <div className="bg-white border border-brand-border/80 rounded-2xl shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: "todos", label: "Todos", count: orcamentos.length },
                {
                  id: "solicitado",
                  label: "Novas Solicitações",
                  count: qtdSolicitados,
                },
                {
                  id: "enviado",
                  label: "Enviados",
                  count: qtdEnviados,
                },
                {
                  id: "aprovado",
                  label: "Aprovados",
                  count: qtdAprovados,
                },
                {
                  id: "cancelado",
                  label: "Cancelados",
                  count: orcamentos.filter((o) => o.status === "cancelado")
                    .length,
                },
              ] as const
            ).map((tab) => {
              const ativo = filtroStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFiltroStatus(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    ativo
                      ? "bg-brand-ink text-white"
                      : "text-brand-muted hover:text-brand-ink hover:bg-gray-50"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold tabular-nums ${
                      ativo
                        ? "bg-white/20 text-white"
                        : tab.id === "solicitado" && tab.count > 0
                          ? "bg-brand-yellow text-brand-ink"
                          : "bg-gray-100 text-brand-muted"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-auto">
            <Search className="w-3.5 h-3.5 text-brand-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente, WhatsApp, código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan w-full sm:w-64"
            />
          </div>
        </div>

        {(() => {
          const termo = busca.trim().toLowerCase();
          const filtrados = orcamentos.filter((orc) => {
            if (filtroStatus !== "todos" && orc.status !== filtroStatus) {
              return false;
            }
            if (!termo) return true;
            return (
              orc.codigo.toLowerCase().includes(termo) ||
              orc.cliente_nome.toLowerCase().includes(termo) ||
              orc.whatsapp.includes(termo) ||
              (orc.email || "").toLowerCase().includes(termo) ||
              orc.colegio_nome.toLowerCase().includes(termo) ||
              orc.serie_nome.toLowerCase().includes(termo)
            );
          });

          if (filtrados.length === 0) {
            return (
              <div className="p-12 text-center space-y-3">
                <FileText className="w-8 h-8 text-brand-muted mx-auto opacity-50" />
                <p className="text-sm font-bold text-brand-ink">
                  Nenhum orçamento nesta visualização
                </p>
                <p className="text-xs text-brand-muted max-w-md mx-auto">
                  Clique em <strong>Montar Orçamento no Admin</strong> ou envie o <strong>Link de Solicitação</strong> para o cliente preencher.
                </p>
              </div>
            );
          }

          return (
            <div>
              {/* Cabeçalho das Colunas (Desktop) — sem o título "Ações" */}
              <div className="hidden lg:grid lg:grid-cols-[150px_minmax(220px,1fr)_170px_145px_140px] gap-6 px-6 py-2.5 bg-[#F8FAFC] border-b border-brand-border/70 text-[11px] font-bold uppercase tracking-wider text-brand-muted items-center">
                <div>Orçamento</div>
                <div>Cliente & Material</div>
                <div>Valor / Pagamento</div>
                <div>Status</div>
                <div />
              </div>

              <div className="divide-y divide-brand-border/70">
                {filtrados.map((orc) => {
                  const pagamentoLabel =
                    orc.forma_pagamento === "credito_parcelado" && orc.parcelas
                      ? `Crédito ${orc.parcelas}x`
                      : FORMA_PAGAMENTO_LABEL[orc.forma_pagamento] || "Pix";
                  const expandido = orcamentoExpandidoId === orc.id;
                  const serieCurta = formatarSerieCurtaOrcamento(
                    orc.serie_nome
                  );
                  const dotClass =
                    orc.status === "solicitado"
                      ? "bg-amber-500"
                      : orc.status === "enviado"
                        ? "bg-brand-cyan"
                        : orc.status === "aprovado"
                          ? "bg-emerald-600"
                          : "bg-gray-400";

                  return (
                    <div
                      key={orc.id}
                      className="bg-white hover:bg-gray-50/50 transition-colors"
                    >
                      {/* LINHA PRINCIPAL (5 colunas idênticas ao cabeçalho no Desktop) */}
                      <div className="px-4 sm:px-6 py-3.5 grid grid-cols-1 lg:grid-cols-[150px_minmax(220px,1fr)_170px_145px_140px] gap-3 lg:gap-6 items-center">
                        {/* Coluna 1: Orçamento (sem fundo e sem borda) */}
                        <div className="flex items-center justify-between lg:justify-start">
                          <span className="text-xs font-semibold text-brand-muted tabular-nums">
                            {orc.codigo}
                          </span>

                          {/* Valor visível no topo apenas no celular */}
                          <div className="text-right tabular-nums lg:hidden">
                            <strong className="text-[13px] font-bold text-brand-magenta block leading-tight">
                              {formatCurrency(orc.total)}
                            </strong>
                            <span className="text-[11px] text-brand-muted font-medium block">
                              {pagamentoLabel}
                            </span>
                          </div>
                        </div>

                        {/* Coluna 2: Cliente & Material */}
                        <div className="min-w-0">
                          <strong className="text-sm font-extrabold text-brand-ink block truncate">
                            {orc.cliente_nome}
                          </strong>
                          <div className="text-xs text-brand-muted truncate mt-0.5">
                            <span className="font-semibold text-brand-ink/80">
                              {orc.colegio_nome}
                            </span>
                            {serieCurta ? ` · ${serieCurta}` : ""} ·{" "}
                            <span>
                              {orc.itens.length}{" "}
                              {orc.itens.length === 1 ? "módulo" : "módulos"}
                            </span>
                          </div>
                        </div>

                        {/* Coluna 3: Valor / Pagamento (tamanho de texto reduzido) */}
                        <div className="hidden lg:block tabular-nums">
                          <strong className="text-[13px] font-bold text-brand-magenta block leading-tight">
                            {formatCurrency(orc.total)}
                          </strong>
                          <span className="text-xs text-brand-muted font-medium block mt-0.5">
                            {pagamentoLabel}
                          </span>
                        </div>

                        {/* Coluna 4: Status discreto (sem caixa pesada) */}
                        <div className="hidden lg:flex items-center">
                          <div className="relative inline-flex items-center">
                            <span
                              className={`w-1.5 h-1.5 rounded-full absolute left-2.5 pointer-events-none ${dotClass}`}
                            />
                            <select
                              value={orc.status}
                              onChange={async (e) => {
                                const novoStatus = e.target
                                  .value as OrcamentoStatus;
                                setOrcamentos((prev) =>
                                  prev.map((item) =>
                                    item.id === orc.id
                                      ? { ...item, status: novoStatus }
                                      : item
                                  )
                                );
                                const res =
                                  await atualizarStatusOrcamentoAction(
                                    orc.id,
                                    novoStatus
                                  );
                                if (!res.ok) {
                                  exibirAviso(
                                    "erro",
                                    res.erro || "Erro ao atualizar status."
                                  );
                                } else {
                                  exibirAviso(
                                    "ok",
                                    `Status do orçamento ${orc.codigo} atualizado!`
                                  );
                                }
                              }}
                              className="appearance-none bg-transparent hover:bg-gray-100/80 border border-transparent hover:border-brand-border/70 rounded-lg pl-6 pr-6 py-1.5 text-xs font-medium text-brand-ink transition-colors cursor-pointer focus:outline-none"
                            >
                              <option value="solicitado">Solicitado</option>
                              <option value="enviado">Enviado</option>
                              <option value="aprovado">Aprovado</option>
                              <option value="cancelado">Cancelado</option>
                            </select>
                            <ChevronDown className="w-3 h-3 text-brand-muted absolute right-2 pointer-events-none" />
                          </div>
                        </div>

                        {/* Coluna 5: "Ver mais" discreto + botão do WhatsApp no final */}
                        <div className="flex items-center justify-between lg:justify-end gap-2 pt-1 lg:pt-0">
                          {/* Select de Status discreto visível apenas no celular */}
                          <div className="relative inline-flex items-center lg:hidden">
                            <span
                              className={`w-1.5 h-1.5 rounded-full absolute left-2.5 pointer-events-none ${dotClass}`}
                            />
                            <select
                              value={orc.status}
                              onChange={async (e) => {
                                const novoStatus = e.target
                                  .value as OrcamentoStatus;
                                setOrcamentos((prev) =>
                                  prev.map((item) =>
                                    item.id === orc.id
                                      ? { ...item, status: novoStatus }
                                      : item
                                  )
                                );
                                const res =
                                  await atualizarStatusOrcamentoAction(
                                    orc.id,
                                    novoStatus
                                  );
                                if (!res.ok) {
                                  exibirAviso(
                                    "erro",
                                    res.erro || "Erro ao atualizar status."
                                  );
                                } else {
                                  exibirAviso(
                                    "ok",
                                    `Status do orçamento ${orc.codigo} atualizado!`
                                  );
                                }
                              }}
                              className="appearance-none bg-gray-50 border border-brand-border/60 rounded-lg pl-6 pr-6 py-1.5 text-xs font-medium text-brand-ink cursor-pointer"
                            >
                              <option value="solicitado">Solicitado</option>
                              <option value="enviado">Enviado</option>
                              <option value="aprovado">Aprovado</option>
                              <option value="cancelado">Cancelado</option>
                            </select>
                            <ChevronDown className="w-3 h-3 text-brand-muted absolute right-2 pointer-events-none" />
                          </div>

                          <div className="flex items-center gap-2 ml-auto">
                            <button
                              type="button"
                              onClick={() =>
                                setOrcamentoExpandidoId(
                                  expandido ? null : orc.id
                                )
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                                expandido
                                  ? "text-brand-ink bg-gray-100 font-semibold"
                                  : "text-brand-muted hover:text-brand-ink hover:bg-gray-100/80"
                              }`}
                            >
                              <span>{expandido ? "Ocultar" : "Ver mais"}</span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  expandido ? "rotate-180" : ""
                                }`}
                              />
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                if (orc.status === "solicitado") {
                                  setOrcamentos((prev) =>
                                    prev.map((item) =>
                                      item.id === orc.id
                                        ? { ...item, status: "enviado" }
                                        : item
                                    )
                                  );
                                  void atualizarStatusOrcamentoAction(
                                    orc.id,
                                    "enviado"
                                  );
                                }
                                const msg = montarTextoWhatsApp(orc);
                                const fone = onlyDigits(orc.whatsapp);
                                const url =
                                  fone.length >= 10
                                    ? gerarLinkWhatsApp(fone, msg)
                                    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                                window.open(
                                  url,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              }}
                              title="Enviar orçamento no WhatsApp do cliente"
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shrink-0 transition-colors"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                    {/* ÁREA EXPANSÍVEL ("VER MAIS"): Todos os detalhes e botões de ação */}
                    {expandido && (
                      <div className="px-4 pb-4 pt-3 border-t border-brand-border/70 bg-[#FAFAFB] space-y-3.5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="bg-white border border-brand-border rounded-xl p-3 space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
                              Contato do Cliente
                            </span>
                            <p className="font-bold text-brand-ink">
                              {orc.cliente_nome}
                            </p>
                            <p className="text-brand-muted">
                              WhatsApp:{" "}
                              <strong className="text-brand-ink">
                                {orc.whatsapp
                                  ? maskWhatsApp(orc.whatsapp)
                                  : "Não informado"}
                              </strong>
                            </p>
                            {orc.email && (
                              <p className="text-brand-muted truncate">
                                E-mail:{" "}
                                <strong className="text-brand-ink">
                                  {orc.email}
                                </strong>
                              </p>
                            )}
                          </div>

                          <div className="bg-white border border-brand-border rounded-xl p-3 space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
                              Escola e Série Completa
                            </span>
                            <p className="font-bold text-brand-ink">
                              {orc.colegio_nome}
                            </p>
                            <p className="text-brand-muted font-semibold">
                              {orc.serie_nome}
                            </p>
                            <p className="text-[11px] text-brand-muted">
                              Emitido em {formatDateTimeBR(orc.criado_em)} ·
                              Validade: {orc.validade_dias} dias
                            </p>
                          </div>

                          <div className="bg-white border border-brand-border rounded-xl p-3 space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted block">
                              Módulos Incluídos ({orc.itens.length})
                            </span>
                            <div className="space-y-1 max-h-24 overflow-y-auto">
                              {orc.itens.map((it, idx) => (
                                <div
                                  key={`${orc.id}-det-${idx}`}
                                  className="flex items-center justify-between gap-2 text-xs"
                                >
                                  <span className="text-brand-ink font-medium truncate">
                                    {it.nome_modulo}
                                  </span>
                                  <strong className="text-brand-ink shrink-0 tabular-nums">
                                    {formatCurrency(it.valor)}
                                  </strong>
                                </div>
                              ))}
                            </div>
                            {orc.observacao && (
                              <p className="text-[11px] text-brand-muted italic pt-1 border-t border-brand-border">
                                Obs.: {orc.observacao}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Barra de Ações Completa dentro do "Ver mais" */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => abrirParaRevisar(orc)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-cyan/15 hover:bg-brand-cyan/25 text-brand-ink text-xs font-bold cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-brand-cyan" />
                              <span>Revisar / Editar Valor</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void baixarDocumentoOrcamentoPDF(orc, config)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border hover:border-brand-ink bg-white text-brand-ink text-xs font-bold cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5 text-brand-cyan" />
                              <span>Baixar PDF</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                imprimirDocumentoOrcamento(orc, config)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border hover:border-brand-ink bg-white text-brand-ink text-xs font-bold cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5 text-brand-ink" />
                              <span>Imprimir</span>
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                if (orc.status === "solicitado") {
                                  setOrcamentos((prev) =>
                                    prev.map((item) =>
                                      item.id === orc.id
                                        ? { ...item, status: "enviado" }
                                        : item
                                    )
                                  );
                                  void atualizarStatusOrcamentoAction(
                                    orc.id,
                                    "enviado"
                                  );
                                }
                                const colNome = orc.colegio_nome
                                  ? ` — ${orc.colegio_nome}`
                                  : "";
                                const assunto = `Orçamento de Material Escolar (${orc.codigo})${colNome} | ${config.nome_loja}`;
                                const corpo = montarTextoEmail(orc);
                                window.location.href = `mailto:${encodeURIComponent(orc.email || "")}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border hover:border-brand-ink bg-white text-brand-ink text-xs font-bold cursor-pointer"
                            >
                              <Mail className="w-3.5 h-3.5 text-brand-cyan" />
                              <span>Enviar por E-mail</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            {orc.status !== "aprovado" &&
                              orc.colegio_id &&
                              orc.serie_id &&
                              orc.itens.length > 0 && (
                                <button
                                  type="button"
                                  disabled={convertendoId === orc.id}
                                  onClick={async () => {
                                    setConvertendoId(orc.id);
                                    try {
                                      const resPed = await enviarPedidoAction({
                                        responsavel_nome: orc.cliente_nome,
                                        aluno_nome: orc.cliente_nome,
                                        whatsapp: orc.whatsapp || "11999999999",
                                        colegio_id: orc.colegio_id,
                                        serie_id: orc.serie_id,
                                        modulo_ids: orc.itens.map(
                                          (i) => i.modulo_id
                                        ),
                                        forma_pagamento: orc.forma_pagamento,
                                        parcelas: orc.parcelas,
                                        cupom_codigo: orc.cupom_codigo,
                                        observacao:
                                          orc.observacao ||
                                          `Gerado a partir do orçamento ${orc.codigo}`,
                                      });
                                      if (!resPed.ok || !resPed.pedido) {
                                        exibirAviso(
                                          "erro",
                                          resPed.erro ||
                                            "Não foi possível converter em pedido."
                                        );
                                        return;
                                      }
                                      await atualizarStatusOrcamentoAction(
                                        orc.id,
                                        "aprovado"
                                      );
                                      setOrcamentos((prev) =>
                                        prev.map((item) =>
                                          item.id === orc.id
                                            ? { ...item, status: "aprovado" }
                                            : item
                                        )
                                      );
                                      setPedidos((prev) => [
                                        ...prev,
                                        resPed.pedido!,
                                      ]);
                                      exibirAviso(
                                        "ok",
                                        `Orçamento ${orc.codigo} convertido no Pedido #${resPed.pedido.numero}!`
                                      );
                                    } finally {
                                      setConvertendoId(null);
                                    }
                                  }}
                                  className="px-3.5 py-2 rounded-xl bg-brand-ink hover:bg-brand-ink/90 text-white text-xs font-bold cursor-pointer"
                                >
                                  {convertendoId === orc.id
                                    ? "Gerando Pedido..."
                                    : "Gerar Pedido"}
                                </button>
                              )}

                            <button
                              type="button"
                              onClick={async () => {
                                setOrcamentos((prev) =>
                                  prev.filter((item) => item.id !== orc.id)
                                );
                                await excluirOrcamentoAction(orc.id);
                                exibirAviso(
                                  "ok",
                                  `Orçamento ${orc.codigo} removido.`
                                );
                              }}
                              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-brand-border hover:border-red-300 text-brand-muted hover:text-red-600 bg-white text-xs font-bold cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Excluir</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
