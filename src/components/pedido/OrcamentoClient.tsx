"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  AlertCircle,
  Copy,
  Printer,
  Check,
  ChevronDown,
  QrCode,
  Banknote,
  CreditCard,
  Wallet,
  Lock,
  Download,
  Mail,
  ShoppingBag,
  Calculator,
  RotateCcw,
  CheckCircle2,
  Send,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
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
  ModuloLivroItem,
  ModuloPublico,
  Serie,
} from "@/types/database";
import {
  calcularTotaisPedido,
  FORMA_PAGAMENTO_LABEL,
  formatCurrency,
  gerarLinkWhatsApp,
  maskWhatsApp,
  onlyDigits,
} from "@/lib/format";
import {
  salvarOrcamentoAction,
  validarCupomAction,
  validarSenhaOrcamentoAction,
} from "@/app/actions";

interface OrcamentoClientProps {
  colegios: Colegio[];
  series: Serie[];
  modulos: ModuloPublico[];
  config: LojaConfig;
}

const STORAGE_ORCAMENTO_AUTH = "rs_digital_orcamento_auth_v1";

const FORMAS_PAGAMENTO: {
  value: FormaPagamento;
  label: string;
  detalhe: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "pix", label: "Pix", detalhe: "Aprovação rápida", icon: QrCode },
  { value: "dinheiro", label: "Dinheiro", detalhe: "Na loja", icon: Banknote },
  { value: "debito", label: "Débito", detalhe: "Cartão", icon: Wallet },
  {
    value: "credito_avista",
    label: "Crédito à vista",
    detalhe: "1x sem juros",
    icon: CreditCard,
  },
  {
    value: "credito_parcelado",
    label: "Parcelado",
    detalhe: "Em até 12x",
    icon: CreditCard,
  },
];

function gerarCodigoOrcamento() {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, "0");
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const sufixo = String(Math.floor(100 + Math.random() * 900));
  return `ORC-${dia}${mes}-${sufixo}`;
}

export function OrcamentoClient({
  colegios,
  series,
  modulos,
  config,
}: OrcamentoClientProps) {
  // Controle de senha do Admin para acessar a construção de orçamento
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [senhaInput, setSenhaInput] = useState("");
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [validandoSenha, setValidandoSenha] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(STORAGE_ORCAMENTO_AUTH) === "1") {
        setDesbloqueado(true);
      }
    } catch {
      // ignora
    }
  }, []);

  const handleDesbloquear = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroSenha(null);
    setValidandoSenha(true);
    try {
      const res = await validarSenhaOrcamentoAction(senhaInput);
      if (!res.ok) {
        setErroSenha(res.erro || "Senha incorreta.");
      } else {
        setDesbloqueado(true);
        setSenhaInput("");
        try {
          window.sessionStorage.setItem(STORAGE_ORCAMENTO_AUTH, "1");
        } catch {
          // ignora
        }
      }
    } finally {
      setValidandoSenha(false);
    }
  };

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
  const [cupomInput, setCupomInput] = useState("");
  const [cupomAplicado, setCupomAplicado] = useState<{
    id: string;
    codigo: string;
    tipo: "percentual" | "valor";
    desconto: number;
  } | null>(null);
  const [cupomMensagemErro, setCupomMensagemErro] = useState<string | null>(
    null
  );
  const [validandoCupom, setValidandoCupom] = useState(false);
  const [observacao, setObservacao] = useState("");

  const [avisoErro, setAvisoErro] = useState<string | null>(null);
  const [avisoSucesso, setAvisoSucesso] = useState<string | null>(null);
  const [resumoCopiado, setResumoCopiado] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [salvandoNoAdmin, setSalvandoNoAdmin] = useState(false);

  const toggleExpandirMateriasModulo = (moduloId: string) => {
    setModulosMateriasExpandidas((prev) =>
      prev.includes(moduloId)
        ? prev.filter((id) => id !== moduloId)
        : [...prev, moduloId]
    );
  };

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

  const handleTrocarColegio = (novoColegioId: string) => {
    setColegioId(novoColegioId);
    setSerieId("");
    setModulosSelecionados([]);
    setDisciplinasPorModulo({});
    setModulosMateriasExpandidas([]);
    setAvisoErro(null);
  };

  const handleTrocarSerie = (novaSerieId: string) => {
    setSerieId(novaSerieId);
    setModulosSelecionados([]);
    setDisciplinasPorModulo({});
    setModulosMateriasExpandidas([]);
    setAvisoErro(null);
  };

  const getLivrosDisponiveis = useCallback(
    (mod: ModuloPublico): ModuloLivroItem[] => {
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
    (mod: ModuloPublico) => {
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

  const toggleModulo = (id: string) => {
    setAvisoErro(null);
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

  const toggleLivroModulo = (mod: ModuloPublico, livroId: string) => {
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

  const selecionarTodosLivrosModulo = (mod: ModuloPublico) => {
    const disp = getLivrosDisponiveis(mod);
    setDisciplinasPorModulo((prev) => ({
      ...prev,
      [mod.id]: disp.map((l) => l.id),
    }));
  };

  const toggleSelecionarTodos = () => {
    setAvisoErro(null);
    if (todosSelecionados) {
      setModulosSelecionados([]);
    } else {
      const novosLivs: Record<string, string[]> = { ...disciplinasPorModulo };
      for (const m of modulosDaSerie) {
        if (!novosLivs[m.id] || novosLivs[m.id].length === 0) {
          novosLivs[m.id] = getLivrosDisponiveis(m).map((l) => l.id);
        }
      }
      setDisciplinasPorModulo(novosLivs);
      setModulosSelecionados(modulosDaSerie.map((m) => m.id));
    }
  };

  const valoresEscolhidos = useMemo(
    () => modulosEscolhidosObjs.map((m) => obterResumoModulo(m).valorEfetivo),
    [modulosEscolhidosObjs, obterResumoModulo]
  );

  const totais = useMemo(
    () =>
      calcularTotaisPedido({
        valoresModulos: valoresEscolhidos,
        cupom: cupomAplicado,
        formaPagamento,
        parcelas: formaPagamento === "credito_parcelado" ? parcelas : null,
        taxasParcelamento: config.taxas_parcelamento,
      }),
    [
      valoresEscolhidos,
      cupomAplicado,
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

  const handleAplicarCupom = async () => {
    const cod = cupomInput.trim().toUpperCase();
    if (!cod) {
      setCupomMensagemErro("Digite um código de cupom.");
      return;
    }
    setValidandoCupom(true);
    setCupomMensagemErro(null);
    try {
      const res = await validarCupomAction(cod);
      if (!res.valido || !res.cupom) {
        setCupomAplicado(null);
        setCupomMensagemErro(res.erro || "Cupom inválido.");
      } else {
        setCupomAplicado(res.cupom);
        setCupomMensagemErro(null);
      }
    } finally {
      setValidandoCupom(false);
    }
  };

  const handleRemoverCupom = () => {
    setCupomAplicado(null);
    setCupomInput("");
    setCupomMensagemErro(null);
  };

  const pagamentoFormatadoTexto = useMemo(() => {
    if (formaPagamento === "credito_parcelado") {
      return `Crédito parcelado em ${parcelas}x de ${formatCurrency(totais.valorParcela)}`;
    }
    return FORMA_PAGAMENTO_LABEL[formaPagamento] || "Pix";
  }, [formaPagamento, parcelas, totais.valorParcela]);

  const dadosDocumentoOrcamento = useMemo<DocumentoOrcamentoDados>(() => {
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
      cupom_codigo: cupomAplicado?.codigo || null,
      observacao: observacao.trim() || null,
      itens: modulosEscolhidosObjs.map((m) => {
        const res = obterResumoModulo(m);
        return {
          nome_modulo: res.nomeComLivros,
          valor: res.valorEfetivo,
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
    cupomAplicado,
    observacao,
    modulosEscolhidosObjs,
    obterResumoModulo,
  ]);

  const textoWhatsAppOrcamento = useMemo(() => {
    const nomeLimpo = clienteNome.trim();
    const saudacao = nomeLimpo
      ? `Olá, *${nomeLimpo}*! Tudo bem? 😊`
      : `Olá! Tudo bem? 😊`;

    const listaItens = modulosEscolhidosObjs
      .map((m) => {
        const r = obterResumoModulo(m);
        return `• *${r.nomeComLivros}* — ${formatCurrency(r.valorEfetivo)}`;
      })
      .join("\n");

    const blocoValores: string[] = [];
    if (totais.desconto > 0) {
      blocoValores.push(`Subtotal: ${formatCurrency(totais.subtotal)}`);
      blocoValores.push(
        `Desconto${cupomAplicado ? ` (${cupomAplicado.codigo})` : ""}: -${formatCurrency(totais.desconto)}`
      );
    }
    if (totais.juros > 0) {
      blocoValores.push(
        `Juros parcelamento (${parcelas}x): +${formatCurrency(totais.juros)}`
      );
    }
    blocoValores.push(`💰 *Valor Total:* *${formatCurrency(totais.total)}*`);
    blocoValores.push(`💳 *Forma de pagamento:* ${pagamentoFormatadoTexto}`);

    const urlBase =
      typeof window !== "undefined" ? window.location.origin : "";
    const linkPedido = urlBase ? `${urlBase}/pedido` : "";
    const diasValidade = Math.max(1, Number(validadeDias) || 7);

    const secoes: string[] = [
      saudacao,
      `Conforme solicitado, preparamos o seu orçamento de material escolar na *${config.nome_loja}*:`,
      [
        `📋 *Orçamento:* ${codigoOrcamento}`,
        `🏫 *Colégio:* ${colegioSelecionadoObj?.nome || "—"}`,
        `🎓 *Série:* ${serieSelecionadaObj?.nome || "—"}`,
      ].join("\n"),
      [
        `📚 *Módulos selecionados (${modulosEscolhidosObjs.length}):*`,
        listaItens || "• (Nenhum módulo selecionado)",
      ].join("\n"),
      blocoValores.join("\n"),
    ];

    if (observacao.trim()) {
      secoes.push(`📝 *Observação:* ${observacao.trim()}`);
    }

    secoes.push(
      [
        `⏱️ *Prazo de produção:* ${config.prazo_dias} dias após a confirmação`,
        `📅 *Validade do orçamento:* ${diasValidade} dias`,
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

    secoes.push(`Agradecemos a preferência! 💙💗💛\n*Equipe ${config.nome_loja}*`);

    return secoes.join("\n\n");
  }, [
    clienteNome,
    codigoOrcamento,
    config,
    colegioSelecionadoObj,
    serieSelecionadaObj,
    modulosEscolhidosObjs,
    obterResumoModulo,
    totais,
    cupomAplicado,
    parcelas,
    pagamentoFormatadoTexto,
    observacao,
    validadeDias,
  ]);

  const textoEmailOrcamento = useMemo(() => {
    const nomeLimpo = clienteNome.trim();
    const saudacao = nomeLimpo
      ? `Olá, ${nomeLimpo}! Tudo bem?`
      : `Olá! Tudo bem?`;

    const listaItens = modulosEscolhidosObjs
      .map((m, i) => {
        const r = obterResumoModulo(m);
        return `  ${i + 1}. ${r.nomeComLivros} — ${formatCurrency(r.valorEfetivo)}`;
      })
      .join("\n");

    const linhasValores: string[] = [];
    if (totais.desconto > 0) {
      linhasValores.push(`Subtotal: ${formatCurrency(totais.subtotal)}`);
      linhasValores.push(
        `Desconto${cupomAplicado ? ` (${cupomAplicado.codigo})` : ""}: -${formatCurrency(totais.desconto)}`
      );
    }
    if (totais.juros > 0) {
      linhasValores.push(
        `Juros parcelamento (${parcelas}x): +${formatCurrency(totais.juros)}`
      );
    }
    linhasValores.push(`VALOR TOTAL: ${formatCurrency(totais.total)}`);
    linhasValores.push(`Forma de pagamento: ${pagamentoFormatadoTexto}`);

    const urlBase =
      typeof window !== "undefined" ? window.location.origin : "";
    const linkPedido = urlBase ? `${urlBase}/pedido` : "";
    const diasValidade = Math.max(1, Number(validadeDias) || 7);

    const secoes: string[] = [
      saudacao,
      `Agradecemos o seu contato com a ${config.nome_loja}. Conforme solicitado, segue abaixo a proposta detalhada para o seu material escolar:`,
      [
        `--------------------------------------------------`,
        `RESUMO DO ORÇAMENTO — Nº ${codigoOrcamento}`,
        `--------------------------------------------------`,
        `• Colégio: ${colegioSelecionadoObj?.nome || "—"}`,
        `• Série: ${serieSelecionadaObj?.nome || "—"}`,
      ].join("\n"),
      [
        `MÓDULOS SELECIONADOS (${modulosEscolhidosObjs.length}):`,
        listaItens || "  (Nenhum módulo selecionado)",
      ].join("\n"),
      [
        `--------------------------------------------------`,
        ...linhasValores,
        `--------------------------------------------------`,
      ].join("\n"),
    ];

    if (observacao.trim()) {
      secoes.push(`OBSERVAÇÕES:\n${observacao.trim()}`);
    }

    secoes.push(
      [
        `INFORMAÇÕES IMPORTANTES:`,
        `• Prazo de produção: ${config.prazo_dias} dias após a confirmação do pedido`,
        `• Validade desta proposta: ${diasValidade} dias`,
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
  }, [
    clienteNome,
    codigoOrcamento,
    config,
    colegioSelecionadoObj,
    serieSelecionadaObj,
    modulosEscolhidosObjs,
    obterResumoModulo,
    totais,
    cupomAplicado,
    parcelas,
    pagamentoFormatadoTexto,
    observacao,
    validadeDias,
  ]);

  const validarSelecaoMinima = (): boolean => {
    if (!colegioId) {
      setAvisoErro("Selecione o colégio para gerar o orçamento.");
      return false;
    }
    if (!serieId) {
      setAvisoErro("Selecione a série para gerar o orçamento.");
      return false;
    }
    if (modulosEscolhidosObjs.length === 0) {
      setAvisoErro("Selecione pelo menos 1 módulo para gerar o orçamento.");
      return false;
    }
    setAvisoErro(null);
    return true;
  };

  const registrarOrcamentoNoPainel = async () => {
    if (!colegioId || !serieId || modulosEscolhidosObjs.length === 0) return;
    setSalvandoNoAdmin(true);
    try {
      const res = await salvarOrcamentoAction({
        id: codigoOrcamento,
        codigo: codigoOrcamento,
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
        cupom_codigo: cupomAplicado?.codigo || null,
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
      if (res.ok) {
        setAvisoSucesso(
          `Orçamento ${codigoOrcamento} enviado para a tela de Orçamentos do Admin!`
        );
      }
    } finally {
      setSalvandoNoAdmin(false);
    }
  };

  const handleBaixarPdf = async () => {
    if (!validarSelecaoMinima()) return;
    setGerandoPdf(true);
    try {
      await registrarOrcamentoNoPainel();
      await baixarDocumentoOrcamentoPDF(dadosDocumentoOrcamento, config);
    } finally {
      setGerandoPdf(false);
    }
  };

  const handleImprimir = async () => {
    if (!validarSelecaoMinima()) return;
    await registrarOrcamentoNoPainel();
    imprimirDocumentoOrcamento(dadosDocumentoOrcamento, config);
  };

  const handleEnviarWhatsApp = async () => {
    if (!validarSelecaoMinima()) return;
    await registrarOrcamentoNoPainel();
    const foneCliente = onlyDigits(whatsappCliente);
    if (foneCliente.length >= 10) {
      const url = gerarLinkWhatsApp(foneCliente, textoWhatsAppOrcamento);
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(textoWhatsAppOrcamento)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleEnviarEmail = async () => {
    if (!validarSelecaoMinima()) return;
    await registrarOrcamentoNoPainel();
    const colNome = colegioSelecionadoObj?.nome
      ? ` — ${colegioSelecionadoObj.nome}`
      : "";
    const assunto = `Orçamento de Material Escolar (${codigoOrcamento})${colNome} | ${config.nome_loja}`;
    const destinatario = emailCliente.trim();
    const mailtoUrl = `mailto:${encodeURIComponent(destinatario)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(textoEmailOrcamento)}`;
    window.location.href = mailtoUrl;
  };

  const handleCopiarTexto = async () => {
    if (!validarSelecaoMinima()) return;
    await registrarOrcamentoNoPainel();
    try {
      await navigator.clipboard.writeText(textoWhatsAppOrcamento);
      setResumoCopiado(true);
      setTimeout(() => setResumoCopiado(false), 2500);
    } catch {
      // ignora
    }
  };

  const handleLimparOrcamento = () => {
    setCodigoOrcamento(gerarCodigoOrcamento());
    setClienteNome("");
    setWhatsappCliente("");
    setEmailCliente("");
    setColegioId("");
    setSerieId("");
    setModulosSelecionados([]);
    setDisciplinasPorModulo({});
    setModulosMateriasExpandidas([]);
    setFormaPagamento("pix");
    setParcelas(2);
    setCupomAplicado(null);
    setCupomInput("");
    setObservacao("");
    setAvisoErro(null);
    setAvisoSucesso(null);
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-brand-ink pb-16">
      {/* Faixa superior CMYK + Navegação rápida */}
      <header className="relative h-10 w-full border-b border-brand-border/60 overflow-hidden">
        <div className="absolute inset-0 flex">
          <div className="flex-1 bg-brand-cyan" />
          <div className="flex-1 bg-brand-magenta" />
          <div className="flex-1 bg-brand-yellow" />
          <div className="flex-1 bg-brand-ink" />
        </div>

        <div className="relative z-10 w-full h-full px-4 sm:px-6 flex items-center justify-end gap-2">
          <Link
            href="/pedido"
            className="group inline-flex items-center justify-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold leading-none text-white hover:text-brand-cyan bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 hover:border-brand-cyan/60 rounded-[6px] transition-all duration-150"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
            <span className="leading-none">Ir para Fazer Pedido</span>
          </Link>

          <Link
            href="/admin"
            className="group inline-flex items-center justify-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold leading-none text-white/90 hover:text-brand-ink bg-white/[0.08] hover:bg-brand-yellow border border-white/15 hover:border-brand-yellow rounded-[6px] transition-all duration-150"
            title="Painel Administrativo"
          >
            <Lock className="w-3.5 h-3.5 text-brand-yellow group-hover:text-brand-ink shrink-0 transition-colors" />
            <span className="leading-none">Admin</span>
          </Link>
        </div>
      </header>

      {/* Seletor Superior de Página: PEDIDO vs ORÇAMENTO */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-5">
        <div className="bg-white border border-brand-border rounded-2xl p-1.5 grid grid-cols-2 gap-1.5 shadow-2xs">
          <Link
            href="/pedido"
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-brand-muted hover:text-brand-ink hover:bg-gray-50 transition-all"
          >
            <ShoppingBag className="w-4 h-4 text-brand-magenta shrink-0" />
            <span>Fazer Pedido</span>
          </Link>
          <Link
            href="/orcamento"
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold bg-brand-ink text-white shadow-xs transition-all"
          >
            <Calculator className="w-4 h-4 text-brand-cyan shrink-0" />
            <span>Fazer Orçamento</span>
          </Link>
        </div>
      </div>

      {!desbloqueado ? (
        <main className="max-w-md mx-auto px-4 sm:px-6 pt-10">
          <form
            onSubmit={handleDesbloquear}
            className="bg-white border border-brand-border rounded-2xl shadow-xs p-6 sm:p-8 space-y-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-ink text-brand-yellow flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-brand-ink">
                  Construção de Orçamento
                </h1>
                <p className="text-xs text-brand-muted">
                  Acesso exclusivo do administrador
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="senha_orcamento"
                className="block text-xs font-bold text-brand-ink mb-1.5"
              >
                Senha do Administrador
              </label>
              <input
                id="senha_orcamento"
                type="password"
                required
                autoFocus
                placeholder="Digite a senha do admin..."
                value={senhaInput}
                onChange={(e) => setSenhaInput(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
              />
            </div>

            {erroSenha && (
              <div className="flex items-center gap-2 border border-red-200 text-red-600 p-3 rounded-xl text-xs font-semibold bg-red-50/50">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{erroSenha}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={validandoSenha}
              className="w-full py-3 px-5 bg-brand-ink hover:bg-brand-ink/90 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              {validandoSenha ? "Verificando..." : "Acessar Orçamento"}
            </button>
          </form>
        </main>
      ) : (
        <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* COLUNA ESQUERDA: Marca + Resumo do Orçamento + Ações Rápidas */}
            <aside className="lg:col-span-4 lg:sticky lg:top-8 space-y-4">
              <div className="bg-white border border-brand-border rounded-2xl p-6 space-y-3 shadow-xs">
                <BrandLogo size="lg" />
                <div className="pt-1 flex items-center justify-between border-t border-brand-border text-xs">
                  <span className="font-extrabold uppercase tracking-wider text-brand-cyan">
                    Orçamento Comercial
                  </span>
                  <span className="text-brand-muted font-bold">
                    {codigoOrcamento}
                  </span>
                </div>
              </div>

              {/* Card Resumo do Orçamento */}
              <div className="bg-white border border-brand-border rounded-2xl p-5 space-y-4 shadow-xs tabular-nums">
                <div className="flex items-center justify-between border-b border-brand-border pb-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                    Resumo do Orçamento
                  </span>
                  <span className="text-xs font-bold text-brand-cyan">
                    {modulosEscolhidosObjs.length}{" "}
                    {modulosEscolhidosObjs.length === 1 ? "módulo" : "módulos"}
                  </span>
                </div>

                {(clienteNome.trim() ||
                  whatsappCliente.trim() ||
                  emailCliente.trim()) && (
                  <div className="text-xs space-y-0.5 border-b border-brand-border pb-3">
                    {clienteNome.trim() && (
                      <p className="font-bold text-brand-ink">
                        {clienteNome.trim()}
                      </p>
                    )}
                    {whatsappCliente.trim() && (
                      <p className="text-brand-muted">
                        WhatsApp: {whatsappCliente}
                      </p>
                    )}
                    {emailCliente.trim() && (
                      <p className="text-brand-muted truncate">
                        E-mail: {emailCliente.trim()}
                      </p>
                    )}
                  </div>
                )}

                {colegioSelecionadoObj ? (
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold text-brand-ink">
                      {colegioSelecionadoObj.nome}
                    </p>
                    {serieSelecionadaObj && (
                      <p className="text-brand-muted font-semibold">
                        {serieSelecionadaObj.nome}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-brand-muted">
                    Selecione o colégio, a série e os módulos para montar o
                    orçamento.
                  </p>
                )}

                {modulosEscolhidosObjs.length > 0 && (
                  <div className="space-y-2 border-t border-brand-border pt-3">
                    {modulosEscolhidosObjs.map((m) => {
                      const resumo = obterResumoModulo(m);
                      return (
                        <div key={m.id} className="space-y-0.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-brand-ink">
                              {m.nome}
                            </span>
                            <span className="font-bold text-brand-ink shrink-0">
                              {formatCurrency(resumo.valorEfetivo)}
                            </span>
                          </div>
                          <p className="text-[11px] text-brand-muted leading-snug">
                            {resumo.textoResumoLivros}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="border-t border-brand-border pt-3 space-y-1.5 text-xs">
                  {totais.desconto > 0 && (
                    <div className="flex justify-between text-brand-cyan font-semibold">
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
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-brand-ink">
                      Total Orçado
                    </span>
                    <span className="text-2xl font-extrabold text-brand-magenta">
                      {formatCurrency(totais.total)}
                    </span>
                  </div>
                  <p className="text-[11px] text-brand-muted font-semibold text-right">
                    {pagamentoFormatadoTexto}
                  </p>
                </div>

                {modulosEscolhidosObjs.length > 0 && (
                  <div className="pt-2 border-t border-brand-border space-y-2">
                    <button
                      type="button"
                      onClick={() => void handleBaixarPdf()}
                      disabled={gerandoPdf}
                      className="w-full py-2.5 px-3 bg-brand-ink hover:bg-brand-ink/90 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <Download className="w-3.5 h-3.5 text-brand-cyan" />
                      <span>
                        {gerandoPdf
                          ? "Gerando PDF..."
                          : "Baixar PDF do Orçamento"}
                      </span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleEnviarWhatsApp()}
                        className="py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleEnviarEmail()}
                        className="py-2 px-2.5 bg-brand-cyan hover:bg-brand-cyan/90 text-white text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>E-mail</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* COLUNA DIREITA: Formulário Construtor de Orçamento */}
            <div className="lg:col-span-8">
              <div className="bg-white border border-brand-border rounded-2xl shadow-xs p-5 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border pb-4">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-brand-ink tracking-tight">
                    Construção de Orçamento
                  </h1>

                  <button
                    type="button"
                    onClick={handleLimparOrcamento}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-brand-ink text-xs font-bold text-brand-muted hover:text-brand-ink bg-white cursor-pointer transition-colors"
                    title="Limpar campos e gerar novo código de orçamento"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Novo orçamento</span>
                  </button>
                </div>

                {/* 1. Dados do Cliente */}
                <div className="space-y-3.5">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-cyan" />
                    1. Dados do Cliente
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label
                        htmlFor="orc_cliente_nome"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Nome do cliente / responsável
                      </label>
                      <input
                        id="orc_cliente_nome"
                        type="text"
                        placeholder="Ex.: Maria Silva"
                        value={clienteNome}
                        onChange={(e) => setClienteNome(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="orc_whatsapp"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Número de WhatsApp do cliente (com DDD)
                      </label>
                      <input
                        id="orc_whatsapp"
                        type="tel"
                        inputMode="numeric"
                        placeholder="(00) 00000-0000"
                        value={whatsappCliente}
                        onChange={(e) =>
                          setWhatsappCliente(maskWhatsApp(e.target.value))
                        }
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="orc_email"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        E-mail do cliente (opcional)
                      </label>
                      <input
                        id="orc_email"
                        type="email"
                        placeholder="cliente@email.com"
                        value={emailCliente}
                        onChange={(e) => setEmailCliente(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="orc_validade"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Validade do orçamento (dias)
                      </label>
                      <input
                        id="orc_validade"
                        type="number"
                        min={1}
                        max={90}
                        value={validadeDias}
                        onChange={(e) =>
                          setValidadeDias(
                            Math.max(1, Number(e.target.value) || 7)
                          )
                        }
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Material Escolar (Colégio, Série, Módulos) */}
                <div className="space-y-3.5 pt-5 border-t border-brand-border">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-magenta" />
                    2. Colégio, Série e Módulos
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label
                        htmlFor="orc_colegio"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Colégio <span className="text-brand-magenta">*</span>
                      </label>
                      <div className="relative">
                        <select
                          id="orc_colegio"
                          value={colegioId}
                          onChange={(e) => handleTrocarColegio(e.target.value)}
                          className="w-full appearance-none pl-3.5 pr-9 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                        >
                          <option value="">Selecione o colégio...</option>
                          {colegios.map((col) => (
                            <option key={col.id} value={col.id}>
                              {col.nome}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-brand-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="orc_serie"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Série <span className="text-brand-magenta">*</span>
                      </label>
                      <div className="relative">
                        <select
                          id="orc_serie"
                          value={serieId}
                          onChange={(e) => handleTrocarSerie(e.target.value)}
                          disabled={!colegioId}
                          className="w-full appearance-none pl-3.5 pr-9 py-2.5 text-sm bg-white border border-brand-border rounded-xl disabled:opacity-60 focus:outline-none focus:border-brand-cyan"
                        >
                          <option value="">
                            {colegioId
                              ? "Selecione a série..."
                              : "Escolha primeiro o colégio"}
                          </option>
                          {(() => {
                            const fund = seriesFiltradas.filter((s) =>
                              /fund/i.test(s.nome)
                            );
                            const medio = seriesFiltradas.filter((s) =>
                              /m[eé]d/i.test(s.nome)
                            );
                            const outras = seriesFiltradas.filter(
                              (s) =>
                                !/fund/i.test(s.nome) && !/m[eé]d/i.test(s.nome)
                            );

                            if (fund.length === 0 && medio.length === 0) {
                              return seriesFiltradas.map((ser) => (
                                <option key={ser.id} value={ser.id}>
                                  {ser.nome}
                                </option>
                              ));
                            }

                            return (
                              <>
                                {fund.length > 0 && (
                                  <optgroup label="Ensino Fundamental (1º ao 9º ano)">
                                    {fund.map((ser) => (
                                      <option key={ser.id} value={ser.id}>
                                        {ser.nome}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {medio.length > 0 && (
                                  <optgroup label="Ensino Médio (1ª à 3ª série)">
                                    {medio.map((ser) => (
                                      <option key={ser.id} value={ser.id}>
                                        {ser.nome}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {outras.length > 0 && (
                                  <optgroup label="Outras Séries">
                                    {outras.map((ser) => (
                                      <option key={ser.id} value={ser.id}>
                                        {ser.nome}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                              </>
                            );
                          })()}
                        </select>
                        <ChevronDown className="w-4 h-4 text-brand-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-brand-ink">
                        Módulos <span className="text-brand-magenta">*</span>
                      </label>
                      {serieId && modulosDaSerie.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleSelecionarTodos}
                          className="text-xs font-bold text-brand-cyan hover:text-brand-ink cursor-pointer"
                        >
                          {todosSelecionados
                            ? "Desmarcar todos"
                            : "Selecionar todos"}
                        </button>
                      )}
                    </div>

                    {!serieId ? (
                      <div className="text-xs text-brand-muted bg-white border border-dashed border-brand-border rounded-xl py-4 px-4 text-center">
                        Selecione o colégio e a série para ver os módulos e
                        valores.
                      </div>
                    ) : modulosDaSerie.length === 0 ? (
                      <div className="text-xs text-brand-muted bg-white border border-brand-border rounded-xl py-4 px-4 text-center">
                        Nenhum módulo disponível para esta série.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {modulosDaSerie.map((mod) => {
                          const selecionado = modulosSelecionados.includes(
                            mod.id
                          );
                          const resumo = obterResumoModulo(mod);
                          const materiasExpandidas =
                            modulosMateriasExpandidas.includes(mod.id);
                          return (
                            <div
                              key={mod.id}
                              className={`border rounded-xl transition-all bg-white ${
                                selecionado
                                  ? "border-brand-ink ring-1 ring-brand-ink"
                                  : "border-brand-border hover:border-brand-ink/40"
                              }`}
                            >
                              <div className="flex items-center justify-between px-4 py-3 gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleModulo(mod.id)}
                                  className="flex items-center gap-3.5 min-w-0 flex-1 text-left cursor-pointer"
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
                                    <span className="text-sm font-bold text-brand-ink block">
                                      {mod.nome}
                                    </span>
                                    <span className="text-[11px] text-brand-muted block truncate">
                                      {selecionado
                                        ? resumo.textoResumoLivros
                                        : `${resumo.disponiveis.length} matérias incluídas`}
                                    </span>
                                  </div>
                                </button>

                                <div className="flex items-center gap-3 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleExpandirMateriasModulo(mod.id)
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-border hover:border-brand-ink text-[11px] font-bold text-brand-muted hover:text-brand-ink bg-[#FAFAFB] cursor-pointer transition-colors whitespace-nowrap"
                                  >
                                    <span>
                                      {materiasExpandidas
                                        ? "Ocultar matérias"
                                        : "Ver matérias"}
                                    </span>
                                    <ChevronDown
                                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                        materiasExpandidas ? "rotate-180" : ""
                                      }`}
                                    />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => toggleModulo(mod.id)}
                                    className="text-right tabular-nums cursor-pointer"
                                  >
                                    <span className="text-sm font-bold text-brand-ink block">
                                      {formatCurrency(
                                        selecionado
                                          ? resumo.valorEfetivo
                                          : resumo.valorBase
                                      )}
                                    </span>
                                    {selecionado &&
                                      !resumo.todosSelecionados && (
                                        <span className="text-[10px] text-brand-muted line-through block">
                                          {formatCurrency(resumo.valorBase)}
                                        </span>
                                      )}
                                  </button>
                                </div>
                              </div>

                              {materiasExpandidas && (
                                <div className="px-4 pb-3.5 pt-2.5 border-t border-brand-border/80 bg-[#FAFAFB]/50 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold text-brand-muted">
                                      Matérias individuais deste módulo
                                      {selecionado
                                        ? " (desmarque as que o cliente não quiser):"
                                        : " (selecione o módulo para personalizar):"}
                                    </span>
                                    {selecionado &&
                                      !resumo.todosSelecionados && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            selecionarTodosLivrosModulo(mod)
                                          }
                                          className="text-[11px] font-bold text-brand-cyan hover:text-brand-ink cursor-pointer"
                                        >
                                          Marcar todas (
                                          {resumo.disponiveis.length})
                                        </button>
                                      )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {resumo.disponiveis.map((livro) => {
                                      const ativo = selecionado
                                        ? resumo.selecionados.some(
                                            (s) => s.id === livro.id
                                          )
                                        : true;
                                      return (
                                        <button
                                          key={livro.id}
                                          type="button"
                                          onClick={() => {
                                            if (!selecionado) {
                                              toggleModulo(mod.id);
                                              return;
                                            }
                                            toggleLivroModulo(mod, livro.id);
                                          }}
                                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-all bg-white cursor-pointer text-left ${
                                            ativo
                                              ? "border-brand-border text-brand-ink font-semibold hover:border-brand-ink/50"
                                              : "border-brand-border text-brand-muted line-through opacity-65 hover:opacity-100"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span
                                              className={`w-3.5 h-3.5 rounded-xs shrink-0 flex items-center justify-center border ${
                                                selecionado && ativo
                                                  ? "bg-brand-ink border-brand-ink text-white"
                                                  : "border-brand-border text-transparent"
                                              }`}
                                            >
                                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                                            </span>
                                            <span className="truncate">
                                              {livro.nome}
                                            </span>
                                          </div>
                                          <span className="tabular-nums font-bold shrink-0 text-brand-ink">
                                            {formatCurrency(livro.valor)}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Forma de Pagamento, Cupom e Observação */}
                <div className="space-y-3.5 pt-5 border-t border-brand-border">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-yellow" />
                    3. Forma de Pagamento e Condições
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {FORMAS_PAGAMENTO.map((fp) => {
                      const ativo = formaPagamento === fp.value;
                      return (
                        <button
                          key={fp.value}
                          type="button"
                          onClick={() => setFormaPagamento(fp.value)}
                          className={`py-2.5 px-3 rounded-xl border text-center transition-all bg-white cursor-pointer ${
                            ativo
                              ? "border-brand-ink ring-1 ring-brand-ink font-extrabold text-brand-ink"
                              : "border-brand-border text-brand-muted hover:text-brand-ink"
                          }`}
                        >
                          <span className="text-xs block">{fp.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {formaPagamento === "credito_parcelado" && (
                    <div>
                      <label
                        htmlFor="orc_parcelas"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Parcelamento Simulado
                      </label>
                      <div className="relative">
                        <select
                          id="orc_parcelas"
                          value={parcelas}
                          onChange={(e) => setParcelas(Number(e.target.value))}
                          className="w-full appearance-none pl-3.5 pr-9 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                        >
                          {opcoesParcelamento.map((op) => (
                            <option key={op.parcelas} value={op.parcelas}>
                              {op.parcelas}x de{" "}
                              {formatCurrency(op.valorParcela)} — Total:{" "}
                              {formatCurrency(op.totalComJuros)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-brand-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label
                        htmlFor="orc_cupom"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Cupom de desconto (opcional)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="orc_cupom"
                          type="text"
                          placeholder="Código"
                          value={cupomInput}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setCupomInput(val);
                            if (
                              cupomAplicado &&
                              val.trim() !== cupomAplicado.codigo
                            ) {
                              setCupomAplicado(null);
                            }
                            if (cupomMensagemErro) {
                              setCupomMensagemErro(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleAplicarCupom();
                            }
                          }}
                          className="flex-1 px-3 py-2 text-xs uppercase font-semibold bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                        />
                        {cupomAplicado ? (
                          <button
                            type="button"
                            onClick={handleRemoverCupom}
                            className="px-3 py-2 text-xs font-bold border border-brand-border rounded-xl text-brand-muted hover:text-brand-ink bg-white cursor-pointer"
                          >
                            Remover
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleAplicarCupom()}
                            disabled={validandoCupom}
                            className="px-3.5 py-2 text-xs font-bold bg-brand-ink text-white rounded-xl hover:bg-brand-ink/90 disabled:opacity-50 cursor-pointer"
                          >
                            {validandoCupom ? "..." : "Aplicar"}
                          </button>
                        )}
                      </div>
                      {cupomAplicado && (
                        <p className="text-xs font-bold text-brand-cyan mt-1">
                          Desconto aplicado: −{formatCurrency(totais.desconto)}
                        </p>
                      )}
                      {cupomMensagemErro && (
                        <p className="text-xs font-semibold text-red-600 mt-1">
                          {cupomMensagemErro}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="orc_observacao"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Observação no orçamento (opcional)
                      </label>
                      <input
                        id="orc_observacao"
                        type="text"
                        placeholder="Ex.: Condição especial, espiral inclusa..."
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Fechamento e Botões de Envio (PDF, WhatsApp, E-mail, Copiar) */}
                <div className="pt-5 border-t border-brand-border space-y-4">
                  <div className="flex items-center justify-between py-3.5 px-4 border border-brand-border rounded-xl bg-[#FAFAFB] tabular-nums">
                    <div className="text-xs space-y-0.5">
                      <span className="text-brand-muted block font-semibold">
                        Valor Total do Orçamento ({modulosEscolhidosObjs.length}{" "}
                        {modulosEscolhidosObjs.length === 1
                          ? "módulo"
                          : "módulos"}
                        )
                      </span>
                      <span className="font-bold text-brand-ink block">
                        {pagamentoFormatadoTexto}
                      </span>
                    </div>
                    <span className="text-2xl font-extrabold text-brand-magenta">
                      {formatCurrency(totais.total)}
                    </span>
                  </div>

                  {avisoErro && (
                    <div className="flex items-center gap-2 border border-red-200 text-red-600 p-3 rounded-xl text-xs font-semibold bg-red-50/50">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{avisoErro}</span>
                    </div>
                  )}

                  {avisoSucesso && (
                    <div className="flex items-center justify-between gap-2 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs font-semibold bg-emerald-50">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{avisoSucesso}</span>
                      </div>
                      <Link
                        href="/admin"
                        className="text-xs font-extrabold text-brand-ink underline shrink-0"
                      >
                        Ver no Admin
                      </Link>
                    </div>
                  )}

                  {/* Botão Principal: Gerar PDF e Enviar por WhatsApp */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => void handleBaixarPdf()}
                      disabled={gerandoPdf || salvandoNoAdmin}
                      className="w-full py-3.5 px-5 bg-brand-magenta hover:bg-brand-magenta/90 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {gerandoPdf
                          ? "Gerando PDF..."
                          : "Gerar PDF do Orçamento"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleEnviarWhatsApp()}
                      disabled={salvandoNoAdmin}
                      className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>
                        {onlyDigits(whatsappCliente).length >= 10
                          ? "Enviar no WhatsApp do Cliente"
                          : "Enviar por WhatsApp"}
                      </span>
                    </button>
                  </div>

                  {/* Botões Secundários: E-mail, Imprimir, Copiar e Salvar no Admin */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleEnviarEmail()}
                      className="py-2.5 px-3 bg-white hover:bg-gray-50 border border-brand-border text-brand-ink font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Mail className="w-4 h-4 text-brand-cyan shrink-0" />
                      <span>Enviar E-mail</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleImprimir()}
                      className="py-2.5 px-3 bg-white hover:bg-gray-50 border border-brand-border text-brand-ink font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-brand-cyan shrink-0" />
                      <span>Imprimir</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCopiarTexto()}
                      className="py-2.5 px-3 bg-white hover:bg-gray-50 border border-brand-border text-brand-ink font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-4 h-4 text-brand-cyan shrink-0" />
                      <span>
                        {resumoCopiado ? "Copiado!" : "Copiar Texto"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!validarSelecaoMinima()) return;
                        await registrarOrcamentoNoPainel();
                      }}
                      disabled={salvandoNoAdmin}
                      className="py-2.5 px-3 bg-brand-ink hover:bg-brand-ink/90 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 text-brand-yellow shrink-0" />
                      <span>
                        {salvandoNoAdmin ? "Salvando..." : "Salvar no Admin"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
