"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  MapPin,
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
  Search,
  X,
  Lock,
  PackageCheck,
  FileText,
  ArrowRight,
  ExternalLink,
  Download,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ModuloCapaPreview } from "@/components/brand/ModuloCapaPreview";
import { SplashScreen } from "@/components/brand/SplashScreen";
import {
  baixarDocumentoPedidoPDF,
  imprimirDocumentoPedido,
} from "@/lib/documento-pedido";
import {
  Colegio,
  FormaPagamento,
  LojaConfig,
  ModuloLivroItem,
  ModuloPublico,
  Pedido,
  PedidoStatus,
  Serie,
} from "@/types/database";
import {
  calcularTotaisPedido,
  FORMA_PAGAMENTO_LABEL,
  formatCurrency,
  formatDateBR,
  gerarLinkWhatsApp,
  maskWhatsApp,
  onlyDigits,
  STATUS_PEDIDO_LABEL,
} from "@/lib/format";
import {
  consultarPedidoPublicoAction,
  enviarPedidoAction,
  validarCupomAction,
} from "@/app/actions";

interface PedidoClientProps {
  colegios: Colegio[];
  series: Serie[];
  modulos: ModuloPublico[];
  config: LojaConfig;
}

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

const ETAPAS_STATUS: { key: PedidoStatus; label: string }[] = [
  { key: "recebido", label: "Pedido recebido" },
  { key: "em_producao", label: "Em impressão" },
  { key: "pronto", label: "Pronto p/ retirada" },
  { key: "entregue", label: "Entregue" },
];

const STORAGE_PEDIDOS_KEY = "rs_digital_meus_pedidos_v2";

interface PedidoSalvoLocal {
  numero: string;
  whatsapp: string;
  aluno_nome: string;
  colegio_nome: string;
  serie_nome: string;
  criado_em: string;
}

interface PedidoConsultadoItem {
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

export function PedidoClient({
  colegios,
  series,
  modulos,
  config,
}: PedidoClientProps) {
  // Campos do formulário
  const [responsavelNome, setResponsavelNome] = useState("");
  const [alunoNome, setAlunoNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [colegioId, setColegioId] = useState<string>("");
  const [serieId, setSerieId] = useState<string>("");
  const [modulosSelecionados, setModulosSelecionados] = useState<string[]>([]);
  const [disciplinasPorModulo, setDisciplinasPorModulo] = useState<
    Record<string, string[]>
  >({});
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
  const [aceiteLgpd, setAceiteLgpd] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [pedidoConfirmado, setPedidoConfirmado] = useState<Pedido | null>(null);
  const [resumoCopiado, setResumoCopiado] = useState(false);

  // Pedidos salvos no navegador do cliente (localStorage)
  const [meusPedidosSalvos, setMeusPedidosSalvos] = useState<PedidoSalvoLocal[]>(
    []
  );

  // Modal "Acompanhar Pedido"
  const [modalAcompanhar, setModalAcompanhar] = useState(false);
  const [consultaNumero, setConsultaNumero] = useState("");
  const [consultaWhatsapp, setConsultaWhatsapp] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [consultaErro, setConsultaErro] = useState<string | null>(null);
  const [pedidosConsultados, setPedidosConsultados] = useState<
    PedidoConsultadoItem[]
  >([]);
  const [pedidosExpandidos, setPedidosExpandidos] = useState<string[]>([]);
  const [modulosMateriasExpandidas, setModulosMateriasExpandidas] = useState<
    string[]
  >([]);

  const toggleExpandirMateriasModulo = (moduloId: string) => {
    setModulosMateriasExpandidas((prev) =>
      prev.includes(moduloId)
        ? prev.filter((id) => id !== moduloId)
        : [...prev, moduloId]
    );
  };

  const toggleExpandirPedido = (numero: string) => {
    setPedidosExpandidos((prev) =>
      prev.includes(numero)
        ? prev.filter((n) => n !== numero)
        : [...prev, numero]
    );
  };

  const salvarPedidoNoDispositivo = useCallback((novo: PedidoSalvoLocal) => {
    try {
      const foneLimpo = onlyDigits(novo.whatsapp);
      if (!novo.numero || foneLimpo.length < 10) return;
      setMeusPedidosSalvos((prev) => {
        const semDuplicado = prev.filter((p) => p.numero !== novo.numero);
        const atualizados = [
          { ...novo, whatsapp: foneLimpo },
          ...semDuplicado,
        ].slice(0, 10);
        try {
          window.localStorage.setItem(
            STORAGE_PEDIDOS_KEY,
            JSON.stringify(atualizados)
          );
        } catch {
          // ignora se storage indisponível
        }
        return atualizados;
      });
    } catch {
      // ignora
    }
  }, []);

  const executarConsultaStatus = useCallback(
    async (numeroParam: string, whatsappParam: string) => {
      setConsultaErro(null);
      setPedidosConsultados([]);
      setPedidosExpandidos([]);
      setConsultando(true);
      try {
        const res = await consultarPedidoPublicoAction(
          numeroParam,
          whatsappParam
        );
        const lista =
          res.pedidos && res.pedidos.length > 0
            ? res.pedidos
            : res.pedido
              ? [res.pedido]
              : [];

        if (!res.encontrado || lista.length === 0) {
          setConsultaErro(res.erro || "Pedido não encontrado.");
        } else {
          setPedidosConsultados(lista);
          const foneDigits = onlyDigits(whatsappParam);
          lista.forEach((p) => {
            salvarPedidoNoDispositivo({
              numero: p.numero,
              whatsapp: foneDigits,
              aluno_nome: p.responsavel_nome || p.aluno_nome,
              colegio_nome: p.colegio_nome,
              serie_nome: p.serie_nome,
              criado_em: p.criado_em,
            });
          });
        }
      } finally {
        setConsultando(false);
      }
    },
    [salvarPedidoNoDispositivo]
  );

  // Carrega pedidos salvos no dispositivo e verifica se há link direto (?acompanhar=0001&wpp=...)
  useEffect(() => {
    let salvosLocais: PedidoSalvoLocal[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_PEDIDOS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          salvosLocais = parsed;
          setMeusPedidosSalvos(parsed);
        }
      }
    } catch {
      // ignora erro de leitura
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const paramAcompanhar = (
        params.get("acompanhar") ||
        params.get("pedido") ||
        ""
      ).trim();
      const paramWpp = onlyDigits(
        params.get("wpp") || params.get("whatsapp") || ""
      );

      if (paramAcompanhar || paramWpp) {
        setModalAcompanhar(true);
        if (paramAcompanhar) {
          setConsultaNumero(paramAcompanhar);
        }
        // Se o link veio sem wpp mas o pedido está salvo no aparelho, recupera o WhatsApp salvo
        const wppFinal =
          paramWpp ||
          salvosLocais.find(
            (p) =>
              p.numero === paramAcompanhar ||
              onlyDigits(p.numero) === onlyDigits(paramAcompanhar)
          )?.whatsapp ||
          salvosLocais[0]?.whatsapp ||
          "";

        if (wppFinal) {
          setConsultaWhatsapp(maskWhatsApp(wppFinal));
          void executarConsultaStatus(paramAcompanhar, wppFinal);
        }
      } else if (salvosLocais.length > 0 && salvosLocais[0].whatsapp) {
        // Já deixa o WhatsApp preenchido no modal para facilitar
        setConsultaWhatsapp(maskWhatsApp(salvosLocais[0].whatsapp));
      }
    } catch {
      // ignora
    }
  }, [executarConsultaStatus]);

  // Séries filtradas pelo colégio escolhido
  const seriesFiltradas = useMemo(
    () =>
      series
        .filter((s) => s.colegio_id === colegioId && s.ativo)
        .sort((a, b) => a.ordem - b.ordem),
    [series, colegioId]
  );

  // Módulos filtrados pela série escolhida
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
  };

  const handleTrocarSerie = (novaSerieId: string) => {
    setSerieId(novaSerieId);
    setModulosSelecionados([]);
    setDisciplinasPorModulo({});
    setModulosMateriasExpandidas([]);
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
      const todosSelecionados = excluidos.length === 0;
      const somaTotalLivros = Number(
        disponiveis
          .reduce((acc, l) => acc + Number(l.valor), 0)
          .toFixed(2)
      );
      const valorBase = somaTotalLivros > 0 ? somaTotalLivros : Number(mod.valor);
      const valorEfetivo = todosSelecionados
        ? valorBase
        : Number(
          garantidos
            .reduce((acc, l) => acc + Number(l.valor), 0)
            .toFixed(2)
        );

      const textoResumoLivros = todosSelecionados
        ? "Todos os livros"
        : `Todos os livros, exceto ${excluidos.map((l) => l.nome).join(", ")}`;

      return {
        disponiveis,
        selecionados: garantidos,
        excluidos,
        todosSelecionados,
        valorBase,
        valorEfetivo,
        textoResumoLivros,
        nomeComLivros: todosSelecionados
          ? mod.nome
          : `${mod.nome} — ${textoResumoLivros}`,
      };
    },
    [disciplinasPorModulo, getLivrosDisponiveis]
  );

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
      // Mantém ao menos 1 livro marcado quando o módulo está selecionado
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
    const lista: {
      parcelas: number;
      taxa: number;
      valorParcela: number;
      totalComJuros: number;
    }[] = [];

    for (let p = 2; p <= 12; p++) {
      const calc = calcularTotaisPedido({
        valoresModulos: valoresEscolhidos,
        cupom: cupomAplicado,
        formaPagamento: "credito_parcelado",
        parcelas: p,
        taxasParcelamento: config.taxas_parcelamento,
      });
      lista.push({
        parcelas: p,
        taxa: calc.taxaPercentual,
        valorParcela: calc.valorParcela,
        totalComJuros: calc.total,
      });
    }
    return lista;
  }, [valoresEscolhidos, cupomAplicado, config.taxas_parcelamento]);

  const handleAplicarCupom = async () => {
    setCupomMensagemErro(null);
    if (!cupomInput.trim()) {
      setCupomAplicado(null);
      setCupomMensagemErro("Digite um código de cupom.");
      return;
    }
    setValidandoCupom(true);
    try {
      const res = await validarCupomAction(cupomInput);
      if (!res.valido || !res.cupom) {
        setCupomAplicado(null);
        setCupomMensagemErro(res.erro || "Cupom inválido/expirado");
      } else {
        setCupomAplicado(res.cupom);
        setCupomInput(res.cupom.codigo);
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

  const handleConsultarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    await executarConsultaStatus(consultaNumero, consultaWhatsapp);
  };

  const abrirAcompanhamentoRapido = (
    numero: string,
    fone: string
  ) => {
    setConsultaNumero(numero);
    setConsultaWhatsapp(maskWhatsApp(fone));
    setModalAcompanhar(true);
    void executarConsultaStatus(numero, fone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setErroEnvio(null);

    if (!responsavelNome.trim()) {
      setErroEnvio("Por favor, preencha o nome do responsável.");
      return;
    }
    const foneDigits = onlyDigits(whatsapp);
    if (foneDigits.length < 10 || foneDigits.length > 11) {
      setErroEnvio("Informe um número de WhatsApp válido com DDD.");
      return;
    }
    if (!colegioId) {
      setErroEnvio("Selecione o colégio.");
      return;
    }
    if (!serieId) {
      setErroEnvio("Selecione a série do aluno.");
      return;
    }
    if (modulosSelecionados.length === 0) {
      setErroEnvio("Selecione pelo menos 1 módulo para continuar.");
      return;
    }
    if (!aceiteLgpd) {
      setErroEnvio(
        "É necessário autorizar o uso dos dados (LGPD) para enviar o pedido."
      );
      return;
    }

    setEnviando(true);
    try {
      let codigoCupomFinal = cupomAplicado ? cupomAplicado.codigo : null;

      if (!codigoCupomFinal && cupomInput.trim() !== "") {
        const resCupom = await validarCupomAction(cupomInput);
        if (!resCupom.valido || !resCupom.cupom) {
          setCupomMensagemErro(resCupom.erro || "Cupom inválido/expirado");
          setErroEnvio(
            `O cupom "${cupomInput.trim()}" é inválido ou expirou. Corrija ou limpe o campo de cupom antes de enviar.`
          );
          setEnviando(false);
          return;
        }
        setCupomAplicado(resCupom.cupom);
        codigoCupomFinal = resCupom.cupom.codigo;
      }

      const resultado = await enviarPedidoAction({
        responsavel_nome: responsavelNome,
        aluno_nome: responsavelNome,
        whatsapp: foneDigits,
        colegio_id: colegioId,
        serie_id: serieId,
        modulo_ids: modulosSelecionados,
        livros_por_modulo: disciplinasPorModulo,
        disciplinas_por_modulo: disciplinasPorModulo,
        forma_pagamento: formaPagamento,
        parcelas: formaPagamento === "credito_parcelado" ? parcelas : null,
        cupom_codigo: codigoCupomFinal,
        observacao,
      });

      if (!resultado.ok || !resultado.pedido) {
        setErroEnvio(
          resultado.erro ||
          "Não foi possível enviar o pedido. Tente novamente."
        );
        setEnviando(false);
        return;
      }

      // Salva o pedido no celular do cliente para consulta com 1 clique
      salvarPedidoNoDispositivo({
        numero: resultado.pedido.numero,
        whatsapp: foneDigits,
        aluno_nome: resultado.pedido.responsavel_nome || resultado.pedido.aluno_nome,
        colegio_nome: resultado.pedido.colegio_nome || "",
        serie_nome: resultado.pedido.serie_nome || "",
        criado_em: resultado.pedido.criado_em,
      });

      setPedidoConfirmado(resultado.pedido);
      window.scrollTo({ top: 0, behavior: "smooth" });
      void baixarDocumentoPedidoPDF(resultado.pedido, config);
    } catch {
      setErroEnvio("Erro inesperado ao enviar seu pedido. Tente novamente.");
      setEnviando(false);
    }
  };

  // ===========================================================================
  // TELA DE CONFIRMAÇÃO DO PEDIDO
  // ===========================================================================
  if (pedidoConfirmado) {
    const listaModulosTexto = pedidoConfirmado.itens
      .map((i) => i.nome_modulo)
      .join(", ");
    const valorParcelaConfirmada =
      pedidoConfirmado.parcelas && pedidoConfirmado.parcelas >= 2
        ? Number((pedidoConfirmado.total / pedidoConfirmado.parcelas).toFixed(2))
        : pedidoConfirmado.total;
    const pagamentoTexto =
      pedidoConfirmado.forma_pagamento === "credito_parcelado" &&
        pedidoConfirmado.parcelas
        ? `Crédito parcelado em ${pedidoConfirmado.parcelas}x de ${formatCurrency(valorParcelaConfirmada)}`
        : FORMA_PAGAMENTO_LABEL[pedidoConfirmado.forma_pagamento];

    const originUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    const foneConfirmadoDigits = onlyDigits(pedidoConfirmado.whatsapp);
    const linkDiretoAcompanhar = `${originUrl}/pedido?acompanhar=${pedidoConfirmado.numero}&wpp=${foneConfirmadoDigits}`;

    const mensagemComprovante = [
      `Olá! Acabei de realizar o *Pedido nº ${pedidoConfirmado.numero}* na *${config.nome_loja}*.`,
      ``,
      `👤 *Responsável:* ${pedidoConfirmado.responsavel_nome}`,
      `🏫 *Colégio/Série:* ${pedidoConfirmado.colegio_nome} – ${pedidoConfirmado.serie_nome}`,
      `📚 *Módulos:* ${listaModulosTexto}`,
      `💳 *Forma de pagamento:* ${pagamentoTexto}`,
      `💰 *Total:* ${formatCurrency(pedidoConfirmado.total)}`,
      `📅 *Previsão de retirada:* ${formatDateBR(pedidoConfirmado.previsao_retirada)}`,
      `🔎 *Link p/ acompanhar:* ${linkDiretoAcompanhar}`,
      ``,
      `Segue o comprovante de pagamento do pedido:`,
    ].join("\n");

    const linkWhatsAppLoja = gerarLinkWhatsApp(
      config.whatsapp_loja,
      mensagemComprovante
    );

    return (
      <div className="min-h-screen bg-[#FAFAFB] text-brand-ink py-8 px-4">
        <div className="max-w-xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <BrandLogo size="sm" />
          </div>

          <div className="bg-brand-paper border border-brand-border/90 rounded-[20px] p-6 sm:p-7 shadow-[0_12px_40px_rgba(22,22,22,0.06)] space-y-5">
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-ink tracking-tight">
                Pedido nº {pedidoConfirmado.numero}
              </h1>
              <p className="text-xs sm:text-sm text-brand-muted">
                Seu pedido já ficou salvo neste aparelho para você acompanhar com 1 clique.
              </p>
            </div>

            {/* Previsão e Local de Retirada */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-brand-cyan/5 border border-brand-cyan/25 rounded-[14px] p-4 space-y-1">
                <div className="flex items-center gap-2 text-brand-cyan">
                  <Clock className="w-4 h-4" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">
                    Previsão de retirada
                  </span>
                </div>
                <p className="text-xl font-extrabold text-brand-ink pt-0.5">
                  {formatDateBR(pedidoConfirmado.previsao_retirada)}
                </p>
                <p className="text-xs text-brand-muted">
                  Avisaremos no WhatsApp assim que ficar pronto!
                </p>
              </div>

              <div className="bg-[#FAFAFB] border border-brand-border rounded-[14px] p-4 space-y-1">
                <div className="flex items-center gap-2 text-brand-magenta">
                  <MapPin className="w-4 h-4" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">
                    Local de retirada
                  </span>
                </div>
                <p className="text-xs font-bold text-brand-ink pt-0.5">
                  {config.endereco_retirada}
                </p>
                <p className="text-xs text-brand-muted">
                  {config.horario_retirada}
                </p>
              </div>
            </div>

            {/* Resumo do Pedido */}
            <div className="space-y-4 text-sm border-t border-brand-border pt-5">
              <div className="grid grid-cols-2 gap-3 text-xs bg-[#FAFAFB] p-4 rounded-[12px] border border-brand-border">
                <div className="col-span-2">
                  <span className="text-brand-muted block">Responsável</span>
                  <strong className="font-bold text-brand-ink text-sm">
                    {pedidoConfirmado.responsavel_nome}
                  </strong>
                </div>
                <div>
                  <span className="text-brand-muted block">Colégio</span>
                  <strong className="font-semibold text-brand-ink">
                    {pedidoConfirmado.colegio_nome}
                  </strong>
                </div>
                <div>
                  <span className="text-brand-muted block">Série</span>
                  <strong className="font-semibold text-brand-ink">
                    {pedidoConfirmado.serie_nome}
                  </strong>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-extrabold text-brand-muted uppercase tracking-wider">
                  Módulos solicitados ({pedidoConfirmado.itens.length})
                </p>
                <div className="divide-y divide-brand-border border border-brand-border rounded-[12px] px-3.5 bg-white">
                  {pedidoConfirmado.itens.map((item) => (
                    <div
                      key={item.id}
                      className="py-2 text-xs font-medium text-brand-ink leading-relaxed"
                    >
                      {item.nome_modulo}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-2 text-sm tabular-nums">
                <div className="flex justify-between text-brand-muted text-xs">
                  <span>Subtotal</span>
                  <span>{formatCurrency(pedidoConfirmado.subtotal)}</span>
                </div>
                {pedidoConfirmado.desconto > 0 && (
                  <div className="flex justify-between text-brand-cyan font-semibold text-xs">
                    <span>Desconto</span>
                    <span>− {formatCurrency(pedidoConfirmado.desconto)}</span>
                  </div>
                )}
                {pedidoConfirmado.juros > 0 && (
                  <div className="flex justify-between text-brand-muted text-xs">
                    <span>
                      Juros parcelamento ({pedidoConfirmado.parcelas}x)
                    </span>
                    <span>+ {formatCurrency(pedidoConfirmado.juros)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline text-base font-extrabold text-brand-ink pt-3 border-t border-brand-border">
                  <span>Total do pedido</span>
                  <span className="text-2xl text-brand-magenta">
                    {formatCurrency(pedidoConfirmado.total)}
                  </span>
                </div>
                <p className="text-xs text-brand-muted text-right">
                  {pagamentoTexto}
                </p>
              </div>
            </div>

            {/* Ações da Confirmação (Compactas e Discretas) */}
            <div className="space-y-2 pt-2 print:hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void baixarDocumentoPedidoPDF(pedidoConfirmado, config)
                  }
                  className="py-2.5 px-3 text-xs font-semibold text-brand-ink bg-white hover:bg-gray-50 border border-brand-border rounded-[8px] transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-brand-cyan" />
                  Baixar PDF do pedido
                </button>

                <a
                  href={linkWhatsAppLoja}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 text-xs font-semibold text-brand-ink bg-white hover:bg-gray-50 border border-brand-border rounded-[8px] transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-brand-magenta" />
                  Enviar comprovante
                </a>
              </div>

              <button
                type="button"
                onClick={() => {
                  const num = pedidoConfirmado.numero;
                  const fone = pedidoConfirmado.whatsapp;
                  setPedidoConfirmado(null);
                  setEnviando(false);
                  abrirAcompanhamentoRapido(num, fone);
                }}
                className="w-full py-3 px-4 text-xs font-extrabold text-brand-ink bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 rounded-[10px] transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <PackageCheck className="w-4 h-4 text-brand-cyan" />
                Acompanhar status do pedido em tempo real
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(mensagemComprovante);
                      setResumoCopiado(true);
                      setTimeout(() => setResumoCopiado(false), 2500);
                    } catch {
                      // ignora
                    }
                  }}
                  className="py-2.5 px-3 text-xs font-semibold text-brand-ink hover:bg-gray-50 border border-brand-border rounded-[8px] transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-brand-cyan" />
                  {resumoCopiado ? "Resumo copiado!" : "Copiar resumo"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    imprimirDocumentoPedido(pedidoConfirmado, config)
                  }
                  className="py-2.5 px-3 text-xs font-semibold text-brand-ink hover:bg-gray-50 border border-brand-border rounded-[8px] transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-brand-cyan" />
                  Imprimir documento
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPedidoConfirmado(null);
                  setEnviando(false);
                  setAlunoNome("");
                  setModulosSelecionados([]);
                  setDisciplinasPorModulo({});
                  setObservacao("");
                  setResumoCopiado(false);
                }}
                className="w-full py-2.5 px-4 text-xs font-semibold text-brand-muted hover:text-brand-ink transition-colors"
              >
                Fazer outro pedido
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // TELA PRINCIPAL DE PEDIDO — DESIGN LIMPO, DIRETO E MODERNO
  // ===========================================================================
  return (
    <>
      <SplashScreen />

      <div className="min-h-screen bg-[#F6F7F9] text-brand-ink pb-16">
        {/* Faixa superior preenchida com as cores CMYK até a borda + botões no canto superior direito */}
        <header className="relative h-10 w-full border-b border-brand-border/60 overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="flex-1 bg-brand-cyan" />
            <div className="flex-1 bg-brand-magenta" />
            <div className="flex-1 bg-brand-yellow" />
            <div className="flex-1 bg-brand-ink" />
          </div>

          <div className="relative z-10 w-full h-full px-4 sm:px-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setModalAcompanhar(true);
                setConsultaErro(null);
                if (
                  meusPedidosSalvos.length > 0 &&
                  pedidosConsultados.length === 0
                ) {
                  const ultimo = meusPedidosSalvos[0];
                  setConsultaWhatsapp(maskWhatsApp(ultimo.whatsapp));
                  void executarConsultaStatus("", ultimo.whatsapp);
                }
              }}
              className="group inline-flex items-center justify-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold leading-none text-white hover:text-brand-cyan bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 hover:border-brand-cyan/60 rounded-[6px] transition-all duration-150 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
              <span className="leading-none">
                Acompanhar pedido
                {meusPedidosSalvos.length > 0
                  ? ` (${meusPedidosSalvos.length})`
                  : ""}
              </span>
            </button>

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

        {/* Grid 2 Colunas: Coluna Material + Marca (Esquerda) | Formulário (Direita) */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* COLUNA ESQUERDA: Marca + Pedidos Recentes + Resumo do Material */}
            <aside className="lg:col-span-4 lg:sticky lg:top-8 space-y-4">
              {/* Bloco da Marca */}
              <div className="bg-white border border-brand-border rounded-2xl p-4 sm:p-6 space-y-2.5 sm:space-y-3 shadow-xs">
                <BrandLogo size="lg" />
                <div className="pt-1 flex items-center justify-between border-t border-brand-border text-xs">
                  <span className="font-extrabold uppercase tracking-wider text-brand-ink">
                    Material Escolar
                  </span>
                  <span className="text-brand-muted font-semibold">
                    Prazo: {config.prazo_dias} dias
                  </span>
                </div>
              </div>

              {/* Atalho 1-clique: Pedidos salvos neste celular/navegador */}
              {meusPedidosSalvos.length > 0 && (
                <div className="bg-white border border-brand-cyan/35 rounded-2xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="w-4 h-4 text-brand-cyan" />
                      <span className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                        Meus Pedidos
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        abrirAcompanhamentoRapido(
                          "",
                          meusPedidosSalvos[0].whatsapp
                        )
                      }
                      className="text-[11px] font-bold text-brand-cyan hover:text-brand-ink cursor-pointer"
                    >
                      Ver todos ({meusPedidosSalvos.length})
                    </button>
                  </div>

                  <div className="space-y-2">
                    {meusPedidosSalvos.slice(0, 2).map((item) => (
                      <button
                        key={item.numero}
                        type="button"
                        onClick={() =>
                          abrirAcompanhamentoRapido(item.numero, item.whatsapp)
                        }
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-transparent border border-brand-border hover:border-brand-ink transition-all text-left cursor-pointer group"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="text-[11px] font-extrabold text-brand-cyan block">
                            Pedido #{item.numero}
                          </span>
                          <span className="text-xs font-bold text-brand-ink truncate block">
                            {item.aluno_nome}
                          </span>
                        </div>
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-brand-ink group-hover:text-brand-cyan">
                          Ver status
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Card Coluna Material Selecionado (No mobile só aparece quando já há material escolhido, evitando card vazio antes do formulário) */}
              <div
                className={`${
                  modulosEscolhidosObjs.length === 0 ? "hidden lg:block" : "block"
                } bg-white border border-brand-border rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs tabular-nums`}
              >
                <div className="flex items-center justify-between border-b border-brand-border pb-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-brand-ink">
                    Material Selecionado
                  </span>
                  <span className="text-xs font-bold text-brand-cyan">
                    {modulosEscolhidosObjs.length}{" "}
                    {modulosEscolhidosObjs.length === 1 ? "módulo" : "módulos"}
                  </span>
                </div>

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
                    Nenhum material selecionado.
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
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-brand-ink">Total</span>
                    <span className="text-2xl font-extrabold text-brand-ink">
                      {formatCurrency(totais.total)}
                    </span>
                  </div>
                  {formaPagamento === "credito_parcelado" &&
                    totais.total > 0 && (
                      <p className="text-[11px] text-brand-magenta font-semibold text-right">
                        {parcelas}x de {formatCurrency(totais.valorParcela)}
                      </p>
                    )}
                </div>
              </div>
            </aside>

            {/* COLUNA DIREITA: Formulário de Pedido */}
            <div className="lg:col-span-8">
              <form
                onSubmit={handleSubmit}
                noValidate
                className="bg-white border border-brand-border rounded-2xl shadow-xs p-5 sm:p-8 space-y-6"
              >
                <div className="border-b border-brand-border pb-4">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-brand-ink tracking-tight">
                    Faça seu pedido
                  </h1>
                  <p className="text-xs text-brand-muted mt-1">
                    Avisaremos no WhatsApp quando estiver pronto.
                  </p>
                </div>

                {/* 1. Identificação */}
                <div className="space-y-3.5">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-cyan" />
                    1. Identificação
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label
                        htmlFor="responsavel_nome"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Nome do responsável{" "}
                        <span className="text-brand-magenta">*</span>
                      </label>
                      <input
                        id="responsavel_nome"
                        type="text"
                        required
                        placeholder="Ex.: Maria Silva"
                        value={responsavelNome}
                        onChange={(e) => setResponsavelNome(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="whatsapp"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        WhatsApp (com DDD){" "}
                        <span className="text-brand-magenta">*</span>
                      </label>
                      <input
                        id="whatsapp"
                        type="tel"
                        inputMode="numeric"
                        required
                        placeholder="(00) 00000-0000"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(maskWhatsApp(e.target.value))}
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Material Escolar */}
                <div className="space-y-3.5 pt-5 border-t border-brand-border">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-magenta" />
                    2. Material Escolar
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label
                        htmlFor="colegio"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Colégio <span className="text-brand-magenta">*</span>
                      </label>
                      <div className="relative">
                        <select
                          id="colegio"
                          value={colegioId}
                          onChange={(e) => handleTrocarColegio(e.target.value)}
                          required
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
                        htmlFor="serie"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Série <span className="text-brand-magenta">*</span>
                      </label>
                      <div className="relative">
                        <select
                          id="serie"
                          value={serieId}
                          onChange={(e) => handleTrocarSerie(e.target.value)}
                          disabled={!colegioId}
                          required
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
                          className="text-xs font-bold text-brand-cyan hover:text-brand-ink"
                        >
                          {todosSelecionados
                            ? "Desmarcar todos"
                            : "Selecionar todos"}
                        </button>
                      )}
                    </div>

                    {!serieId ? (
                      <div className="text-xs text-brand-muted bg-white border border-dashed border-brand-border rounded-xl py-4 px-4 text-center">
                        Selecione o colégio e a série para ver os módulos.
                      </div>
                    ) : modulosDaSerie.length === 0 ? (
                      <div className="text-xs text-brand-muted bg-white border border-brand-border rounded-xl py-4 px-4 text-center">
                        Nenhum módulo disponível para esta série.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {modulosDaSerie.map((mod) => {
                          const selecionado = modulosSelecionados.includes(mod.id);
                          const resumo = obterResumoModulo(mod);
                          const materiasExpandidas =
                            modulosMateriasExpandidas.includes(mod.id);
                          return (
                            <div
                              key={mod.id}
                              className={`border rounded-xl transition-all bg-white ${selecionado
                                  ? "border-brand-ink ring-1 ring-brand-ink"
                                  : "border-brand-border hover:border-brand-ink/40"
                                }`}
                            >
                              {/* Linha Principal: Apenas o Módulo Central + Botão de Expandir Matérias */}
                              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between px-3.5 sm:px-4 py-3 gap-2.5 sm:gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleModulo(mod.id)}
                                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                                >
                                  <span
                                    className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border ${selecionado
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
                                    <span className="text-sm font-bold text-brand-ink block truncate">
                                      {mod.nome}
                                    </span>
                                    <span className="text-[11px] text-brand-muted block truncate">
                                      {selecionado
                                        ? resumo.textoResumoLivros
                                        : `${resumo.disponiveis.length} matérias incluídas`}
                                    </span>
                                  </div>
                                </button>

                                <div className="flex items-center justify-end gap-2.5 sm:gap-3 shrink-0 ml-auto">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleExpandirMateriasModulo(mod.id)
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-border hover:border-brand-ink text-[11px] font-bold text-brand-muted hover:text-brand-ink bg-[#FAFAFB] cursor-pointer transition-colors whitespace-nowrap"
                                  >
                                    <span className="sm:hidden">
                                      {materiasExpandidas ? "Ocultar" : "Matérias"}
                                    </span>
                                    <span className="hidden sm:inline">
                                      {materiasExpandidas
                                        ? "Ocultar matérias"
                                        : "Ver matérias"}
                                    </span>
                                    <ChevronDown
                                      className={`w-3.5 h-3.5 transition-transform duration-200 ${materiasExpandidas ? "rotate-180" : ""
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

                              {/* Área Expansível Sob Demanda: Matérias Individuais */}
                              {materiasExpandidas && (
                                <div className="px-4 pb-3.5 pt-2.5 border-t border-brand-border/80 bg-[#FAFAFB]/50 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold text-brand-muted">
                                      Matérias individuais deste módulo
                                      {selecionado
                                        ? " (desmarque as que não quiser):"
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
                                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-all bg-white cursor-pointer text-left ${ativo
                                              ? "border-brand-border text-brand-ink font-semibold hover:border-brand-ink/50"
                                              : "border-brand-border text-brand-muted line-through opacity-65 hover:opacity-100"
                                            }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span
                                              className={`w-3.5 h-3.5 rounded-xs shrink-0 flex items-center justify-center border ${selecionado && ativo
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

                {/* 3. Pagamento */}
                <div className="space-y-3.5 pt-5 border-t border-brand-border">
                  <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-yellow" />
                    3. Pagamento
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {FORMAS_PAGAMENTO.map((fp) => {
                      const ativo = formaPagamento === fp.value;
                      return (
                        <button
                          key={fp.value}
                          type="button"
                          onClick={() => setFormaPagamento(fp.value)}
                          className={`py-2.5 px-3 rounded-xl border text-center transition-all bg-white ${ativo
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
                        htmlFor="parcelas"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Parcelamento
                      </label>
                      <div className="relative">
                        <select
                          id="parcelas"
                          value={parcelas}
                          onChange={(e) => setParcelas(Number(e.target.value))}
                          className="w-full appearance-none pl-3.5 pr-9 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                        >
                          {opcoesParcelamento.map((op) => (
                            <option key={op.parcelas} value={op.parcelas}>
                              {op.parcelas}x de {formatCurrency(op.valorParcela)} —
                              Total: {formatCurrency(op.totalComJuros)}
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
                        htmlFor="cupom"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Cupom de desconto (opcional)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="cupom"
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
                              handleAplicarCupom();
                            }
                          }}
                          className="flex-1 px-3 py-2 text-xs uppercase font-semibold bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                        />
                        {cupomAplicado ? (
                          <button
                            type="button"
                            onClick={handleRemoverCupom}
                            className="px-3 py-2 text-xs font-bold border border-brand-border rounded-xl text-brand-muted hover:text-brand-ink bg-white"
                          >
                            Remover
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleAplicarCupom}
                            disabled={validandoCupom}
                            className="px-3.5 py-2 text-xs font-bold bg-brand-ink text-white rounded-xl hover:bg-brand-ink/90 disabled:opacity-50"
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
                        htmlFor="observacao"
                        className="block text-xs font-bold text-brand-ink mb-1"
                      >
                        Observação (opcional)
                      </label>
                      <input
                        id="observacao"
                        type="text"
                        placeholder="Ex.: Espiral preta..."
                        value={observacao}
                        onChange={(e) => setObservacao(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                      />
                    </div>
                  </div>
                </div>

                {/* Resumo Direto + Envio */}
                <div className="pt-5 border-t border-brand-border space-y-4">
                  <div className="flex items-center justify-between py-3 px-4 border border-brand-border rounded-xl bg-white tabular-nums">
                    <div className="text-xs space-y-0.5">
                      <span className="text-brand-muted block">
                        Total ({modulosEscolhidosObjs.length}{" "}
                        {modulosEscolhidosObjs.length === 1 ? "módulo" : "módulos"})
                      </span>
                      {formaPagamento === "credito_parcelado" &&
                        totais.total > 0 && (
                          <span className="font-semibold text-brand-ink block">
                            {parcelas}x de {formatCurrency(totais.valorParcela)}
                          </span>
                        )}
                    </div>
                    <span className="text-2xl font-extrabold text-brand-ink">
                      {formatCurrency(totais.total)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAceiteLgpd((v) => !v)}
                    className="w-full flex items-center gap-2.5 text-left cursor-pointer"
                  >
                    <span
                      className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border ${aceiteLgpd
                        ? "bg-brand-ink border-brand-ink text-white"
                        : "border-brand-border bg-white"
                        }`}
                    >
                      {aceiteLgpd && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span className="text-xs text-brand-muted">
                      Concordo com o uso dos dados para processar o pedido e avisar
                      no WhatsApp. <span className="text-brand-magenta">*</span>
                    </span>
                  </button>

                  {erroEnvio && (
                    <div className="flex items-center gap-2 border border-red-200 text-red-600 p-3 rounded-xl text-xs font-semibold bg-white">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{erroEnvio}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={enviando}
                    className="w-full py-3.5 px-6 bg-brand-magenta hover:bg-brand-magenta/90 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <span>
                      {enviando ? "Enviando pedido..." : "Finalizar Pedido"}
                    </span>
                    {!enviando && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>

        {/* =====================================================================
            MODAL: ACOMPANHAR PEDIDO PELO WHATSAPP (+ Nº DO PEDIDO OPCIONAL)
        ===================================================================== */}
        {modalAcompanhar && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-brand-paper border border-brand-border rounded-[20px] w-full max-w-lg max-h-[90vh] flex flex-col p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-brand-border pb-3.5 shrink-0">
                <div className="flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-brand-cyan" />
                  <div>
                    <h3 className="text-base font-extrabold text-brand-ink leading-tight">
                      Acompanhar Pedido
                    </h3>
                    <p className="text-[11px] text-brand-muted">
                      Consulte apenas pelo seu WhatsApp ou pelo nº do pedido
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalAcompanhar(false)}
                  className="p-1 text-brand-muted hover:text-brand-ink rounded-[6px] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleConsultarPedido}
                className="space-y-3 shrink-0"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-7">
                    <label className="block text-xs font-bold text-brand-ink mb-1">
                      WhatsApp usado no pedido{" "}
                      <span className="text-brand-magenta">*</span>
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      placeholder="(11) 99999-9999"
                      value={consultaWhatsapp}
                      onChange={(e) =>
                        setConsultaWhatsapp(maskWhatsApp(e.target.value))
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-brand-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-bold text-brand-ink mb-1">
                      Nº do pedido{" "}
                      <span className="text-brand-muted font-normal">
                        (opcional)
                      </span>
                    </label>
                    <input
                      type="text"
                      placeholder="Todos ou ex: 0001"
                      value={consultaNumero}
                      onChange={(e) => setConsultaNumero(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-brand-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                    />
                  </div>
                </div>

                {meusPedidosSalvos.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[11px] text-brand-muted font-semibold">
                      Salvos neste aparelho:
                    </span>
                    {meusPedidosSalvos.slice(0, 3).map((salvo) => (
                      <button
                        key={salvo.numero}
                        type="button"
                        onClick={() =>
                          abrirAcompanhamentoRapido(
                            salvo.numero,
                            salvo.whatsapp
                          )
                        }
                        className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-transparent text-brand-ink border border-brand-border hover:border-brand-ink transition-colors cursor-pointer"
                      >
                        #{salvo.numero} · {salvo.aluno_nome.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={consultando}
                  className="w-full py-2.5 bg-brand-ink hover:bg-brand-ink/90 text-white text-xs font-bold rounded-[8px] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  {consultando ? "Consultando..." : "Consultar meus pedidos"}
                </button>
              </form>

              {consultaErro && (
                <div className="bg-brand-magenta/10 border border-brand-magenta/30 text-brand-magenta p-3 rounded-[8px] text-xs font-semibold shrink-0">
                  {consultaErro}
                </div>
              )}

              {pedidosConsultados.length > 0 && (
                <div className="space-y-3 overflow-y-auto pr-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                    <span>
                      {pedidosConsultados.length === 1
                        ? "1 pedido encontrado"
                        : `${pedidosConsultados.length} pedidos encontrados`}
                    </span>
                    {consultaNumero && (
                      <button
                        type="button"
                        onClick={() => {
                          setConsultaNumero("");
                          void executarConsultaStatus("", consultaWhatsapp);
                        }}
                        className="text-brand-cyan hover:underline font-bold cursor-pointer normal-case"
                      >
                        Ver todos deste WhatsApp
                      </button>
                    )}
                  </div>

                  {pedidosConsultados.map((ped) => {
                    const statusBadgeClass =
                      ped.status === "pronto"
                        ? "bg-brand-yellow text-brand-ink"
                        : ped.status === "entregue"
                          ? "bg-gray-200 text-brand-ink"
                          : ped.status === "cancelado"
                            ? "bg-red-100 text-red-700"
                            : "bg-brand-cyan text-white";
                    const expandido = pedidosExpandidos.includes(ped.numero);

                    return (
                      <div
                        key={ped.numero}
                        className="bg-white border border-brand-border rounded-[14px] p-4 space-y-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-extrabold text-brand-cyan block">
                              Pedido #{ped.numero}
                            </span>
                            <strong className="text-sm font-extrabold text-brand-ink block mt-0.5">
                              {ped.responsavel_nome || ped.aluno_nome}
                            </strong>
                            <span className="text-xs text-brand-muted block">
                              {ped.colegio_nome} · {ped.serie_nome}
                            </span>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-[6px] text-xs font-extrabold shrink-0 ${statusBadgeClass}`}
                          >
                            {STATUS_PEDIDO_LABEL[ped.status]}
                          </span>
                        </div>

                        {ped.status !== "cancelado" && (
                          <div className="grid grid-cols-4 gap-1.5 pt-1">
                            {ETAPAS_STATUS.map((etapa, idx) => {
                              const ordemAtual = ETAPAS_STATUS.findIndex(
                                (e) => e.key === ped.status
                              );
                              const concluida = idx <= ordemAtual;
                              return (
                                <div key={etapa.key} className="space-y-1">
                                  <div
                                    className={`h-1.5 rounded-full ${concluida
                                      ? ped.status === "pronto"
                                        ? "bg-brand-yellow"
                                        : "bg-brand-cyan"
                                      : "bg-gray-200"
                                      }`}
                                  />
                                  <p
                                    className={`text-[10px] leading-tight ${concluida
                                      ? "font-bold text-brand-ink"
                                      : "text-brand-muted"
                                      }`}
                                  >
                                    {etapa.label}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs pt-2 border-t border-brand-border">
                          <span className="text-brand-muted flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-brand-cyan" />
                            Previsão: {formatDateBR(ped.previsao_retirada)}
                          </span>

                          <button
                            type="button"
                            onClick={() => toggleExpandirPedido(ped.numero)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-brand-ink hover:text-brand-cyan transition-colors cursor-pointer"
                          >
                            <span>
                              {expandido
                                ? "Ocultar detalhes"
                                : "Ver detalhes do pedido"}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${expandido ? "rotate-180 text-brand-cyan" : ""
                                }`}
                            />
                          </button>
                        </div>

                        {expandido && (
                          <div className="text-xs text-brand-muted border border-brand-border rounded-[10px] px-3 py-2.5 space-y-1.5 animate-in fade-in duration-150">
                            {ped.itens &&
                              ped.itens.map((it, idx) => (
                                <div
                                  key={`${ped.numero}-it-${idx}`}
                                  className="flex items-center justify-between"
                                >
                                  <span className="font-semibold text-brand-ink">
                                    {it.nome_modulo}
                                  </span>
                                  <span className="tabular-nums font-bold text-brand-muted">
                                    {formatCurrency(it.valor)}
                                  </span>
                                </div>
                              ))}
                            <div className="flex items-center justify-between pt-2 border-t border-brand-border text-brand-ink">
                              <span className="font-bold">Total do pedido</span>
                              <strong className="font-extrabold tabular-nums">
                                {formatCurrency(ped.total)}
                              </strong>
                            </div>
                            <div className="pt-2 border-t border-brand-border flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void baixarDocumentoPedidoPDF(ped, config)
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-brand-border text-brand-ink hover:border-brand-cyan hover:text-brand-cyan font-bold text-xs transition-colors cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-brand-cyan" />
                                Baixar PDF do pedido
                              </button>
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
        )}
      </div>
    </>
  );
}
