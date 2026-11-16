"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  AlertCircle,
  Check,
  ChevronDown,
  QrCode,
  Banknote,
  CreditCard,
  Wallet,
  CheckCircle2,
  Send,
  ShoppingBag,
  RotateCcw,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ModuloCapaPreview } from "@/components/brand/ModuloCapaPreview";
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
  gerarLinkWhatsApp,
  maskWhatsApp,
  onlyDigits,
} from "@/lib/format";
import { salvarOrcamentoAction } from "@/app/actions";

interface OrcamentoClientProps {
  colegios: Colegio[];
  series: Serie[];
  modulos: ModuloPublico[];
  config: LojaConfig;
}

const FORMAS_PAGAMENTO: {
  value: FormaPagamento;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: "pix", label: "Pix", icon: QrCode },
  { value: "dinheiro", label: "Dinheiro", icon: Banknote },
  { value: "debito", label: "Débito", icon: Wallet },
  { value: "credito_avista", label: "Crédito à vista", icon: CreditCard },
  { value: "credito_parcelado", label: "Parcelado", icon: CreditCard },
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
  const [codigoOrcamento, setCodigoOrcamento] = useState<string>(() =>
    gerarCodigoOrcamento()
  );
  const [clienteNome, setClienteNome] = useState("");
  const [whatsappCliente, setWhatsappCliente] = useState("");
  const [emailCliente, setEmailCliente] = useState("");

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
  const [observacao, setObservacao] = useState("");

  const [avisoErro, setAvisoErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [solicitacaoEnviada, setSolicitacaoEnviada] = useState(false);

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
        cupom: null,
        formaPagamento,
        parcelas: formaPagamento === "credito_parcelado" ? parcelas : null,
        taxasParcelamento: config.taxas_parcelamento,
      }),
    [valoresEscolhidos, formaPagamento, parcelas, config.taxas_parcelamento]
  );

  const handleSubmitSolicitacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome.trim()) {
      setAvisoErro("Informe o seu nome para receber o orçamento.");
      return;
    }
    const foneLimpo = onlyDigits(whatsappCliente);
    if (foneLimpo.length < 10) {
      setAvisoErro("Informe um número de WhatsApp válido com DDD.");
      return;
    }
    if (!colegioId) {
      setAvisoErro("Selecione o colégio.");
      return;
    }
    if (!serieId) {
      setAvisoErro("Selecione a série.");
      return;
    }
    if (modulosEscolhidosObjs.length === 0) {
      setAvisoErro("Selecione pelo menos 1 módulo para orçar.");
      return;
    }

    setAvisoErro(null);
    setEnviando(true);
    try {
      const res = await salvarOrcamentoAction({
        id: codigoOrcamento,
        codigo: codigoOrcamento,
        status: "solicitado",
        validade_dias: 7,
        cliente_nome: clienteNome.trim(),
        whatsapp: foneLimpo,
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

      if (!res.ok) {
        setAvisoErro(
          res.erro || "Não foi possível enviar sua solicitação. Tente novamente."
        );
        return;
      }

      setSolicitacaoEnviada(true);
    } finally {
      setEnviando(false);
    }
  };

  const linkAvisarLojaWhatsApp = useMemo(() => {
    const msg = [
      `Olá! 😊 Acabei de preencher a solicitação de orçamento *${codigoOrcamento}* no site da *${config.nome_loja}*.`,
      ``,
      `👤 *Nome:* ${clienteNome.trim()}`,
      `🏫 *Colégio:* ${colegioSelecionadoObj?.nome || "—"}`,
      `🎓 *Série:* ${serieSelecionadaObj?.nome || "—"}`,
      `📚 *Módulos:* ${modulosEscolhidosObjs.map((m) => obterResumoModulo(m).nomeComLivros).join(", ")}`,
      `💳 *Forma de pagamento:* ${formaPagamento === "credito_parcelado" ? `Parcelado em ${parcelas}x` : FORMA_PAGAMENTO_LABEL[formaPagamento]}`,
    ].join("\n");
    return gerarLinkWhatsApp(config.whatsapp_loja, msg);
  }, [
    codigoOrcamento,
    config.nome_loja,
    config.whatsapp_loja,
    clienteNome,
    colegioSelecionadoObj,
    serieSelecionadaObj,
    modulosEscolhidosObjs,
    obterResumoModulo,
    formaPagamento,
    parcelas,
  ]);

  if (solicitacaoEnviada) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] text-brand-ink pb-16">
        <header className="relative h-10 w-full border-b border-brand-border/60 overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="flex-1 bg-brand-cyan" />
            <div className="flex-1 bg-brand-magenta" />
            <div className="flex-1 bg-brand-yellow" />
            <div className="flex-1 bg-brand-ink" />
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 sm:px-6 pt-10">
          <div className="bg-white border border-brand-border rounded-2xl shadow-xs p-6 sm:p-8 space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <span className="inline-block px-3 py-1 rounded-full bg-brand-ink text-white text-xs font-extrabold">
                Protocolo {codigoOrcamento}
              </span>
              <h1 className="text-xl font-extrabold text-brand-ink pt-1">
                Solicitação de Orçamento Recebida!
              </h1>
              <p className="text-xs text-brand-muted leading-relaxed">
                Nossa equipe da <strong>{config.nome_loja}</strong> já recebeu a
                sua solicitação no painel e enviará o orçamento completo para o
                seu WhatsApp{" "}
                <strong>{maskWhatsApp(whatsappCliente)}</strong>
                {emailCliente.trim() ? ` e e-mail (${emailCliente.trim()})` : ""}{" "}
                em instantes.
              </p>
            </div>

            <div className="text-left bg-[#FAFAFB] border border-brand-border rounded-xl p-4 space-y-2 text-xs">
              <div>
                <span className="text-brand-muted block">Colégio e Série</span>
                <strong className="text-brand-ink font-bold">
                  {colegioSelecionadoObj?.nome} · {serieSelecionadaObj?.nome}
                </strong>
              </div>
              <div>
                <span className="text-brand-muted block">
                  Módulos solicitados ({modulosEscolhidosObjs.length})
                </span>
                <ul className="list-disc list-inside text-brand-ink font-semibold space-y-0.5 pt-0.5">
                  {modulosEscolhidosObjs.map((m) => (
                    <li key={m.id}>{obterResumoModulo(m).nomeComLivros}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <a
                href={linkAvisarLojaWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Agilizar atendimento no WhatsApp da Loja</span>
              </a>

              <button
                type="button"
                onClick={() => {
                  setSolicitacaoEnviada(false);
                  setCodigoOrcamento(gerarCodigoOrcamento());
                  setModulosSelecionados([]);
                  setDisciplinasPorModulo({});
                  setObservacao("");
                }}
                className="w-full py-2.5 px-4 text-xs font-bold text-brand-muted hover:text-brand-ink inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Solicitar outro orçamento</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-brand-ink pb-16">
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
            <span className="leading-none">Fazer Pedido Direto</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
        <form
          onSubmit={handleSubmitSolicitacao}
          noValidate
          className="bg-white border border-brand-border rounded-2xl shadow-xs p-5 sm:p-8 space-y-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-border pb-4">
            <div className="flex items-center gap-3.5">
              <BrandLogo size="sm" />
              <div className="h-6 w-px bg-brand-border hidden sm:block" />
              <h1 className="text-lg sm:text-xl font-extrabold text-brand-ink tracking-tight">
                Solicitar Orçamento
              </h1>
            </div>
            <span className="text-xs font-bold text-brand-muted">
              {codigoOrcamento}
            </span>
          </div>

          {/* 1. Dados do Cliente */}
          <div className="space-y-3.5">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-cyan" />
              1. Seus Dados para Receber o Orçamento
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label
                  htmlFor="orc_cliente_nome"
                  className="block text-xs font-bold text-brand-ink mb-1"
                >
                  Seu nome <span className="text-brand-magenta">*</span>
                </label>
                <input
                  id="orc_cliente_nome"
                  type="text"
                  required
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
                  Seu WhatsApp (com DDD){" "}
                  <span className="text-brand-magenta">*</span>
                </label>
                <input
                  id="orc_whatsapp"
                  type="tel"
                  inputMode="numeric"
                  required
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
                  Seu E-mail (opcional)
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
            </div>
          </div>

          {/* 2. Colégio, Série e Módulos */}
          <div className="space-y-3.5 pt-5 border-t border-brand-border">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-magenta" />
              2. Escola, Série e Módulos Desejados
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
                    {seriesFiltradas.map((ser) => (
                      <option key={ser.id} value={ser.id}>
                        {ser.nome}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-brand-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-brand-ink">
                  Módulos que deseja orçar{" "}
                  <span className="text-brand-magenta">*</span>
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
                  Selecione o colégio e a série para escolher os módulos.
                </div>
              ) : modulosDaSerie.length === 0 ? (
                <div className="text-xs text-brand-muted bg-white border border-brand-border rounded-xl py-4 px-4 text-center">
                  Nenhum módulo cadastrado para esta série.
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

                          <button
                            type="button"
                            onClick={() =>
                              toggleExpandirMateriasModulo(mod.id)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-border hover:border-brand-ink text-[11px] font-bold text-brand-muted hover:text-brand-ink bg-[#FAFAFB] cursor-pointer transition-colors whitespace-nowrap shrink-0"
                          >
                            <span>
                              {materiasExpandidas
                                ? "Ocultar matérias"
                                : "Escolher matérias"}
                            </span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                materiasExpandidas ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </div>

                        {materiasExpandidas && (
                          <div className="px-4 pb-3.5 pt-2.5 border-t border-brand-border/80 bg-[#FAFAFB]/50 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-brand-muted">
                                {selecionado
                                  ? "Desmarque as matérias que você não precisa:"
                                  : "Selecione o módulo para personalizar as matérias:"}
                              </span>
                              {selecionado && !resumo.todosSelecionados && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    selecionarTodosLivrosModulo(mod)
                                  }
                                  className="text-[11px] font-bold text-brand-cyan hover:text-brand-ink cursor-pointer"
                                >
                                  Marcar todas ({resumo.disponiveis.length})
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
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all bg-white cursor-pointer text-left ${
                                      ativo
                                        ? "border-brand-border text-brand-ink font-semibold hover:border-brand-ink/50"
                                        : "border-brand-border text-brand-muted line-through opacity-65 hover:opacity-100"
                                    }`}
                                  >
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

          {/* 3. Preferência de Pagamento e Observação */}
          <div className="space-y-3.5 pt-5 border-t border-brand-border">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-yellow" />
              3. Forma de Pagamento Preferida
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
                  Quantidade de parcelas desejada
                </label>
                <div className="relative">
                  <select
                    id="orc_parcelas"
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                    className="w-full appearance-none pl-3.5 pr-9 py-2.5 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
                  >
                    {Array.from({ length: 11 }, (_, i) => i + 2).map((p) => (
                      <option key={p} value={p}>
                        Parcelado em {p}x no cartão
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-brand-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="orc_observacao"
                className="block text-xs font-bold text-brand-ink mb-1"
              >
                Observação (opcional)
              </label>
              <input
                id="orc_observacao"
                type="text"
                placeholder="Alguma dúvida ou detalhe específico?"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-brand-border rounded-xl focus:outline-none focus:border-brand-cyan"
              />
            </div>
          </div>

          {avisoErro && (
            <div className="flex items-center gap-2 border border-red-200 text-red-600 p-3 rounded-xl text-xs font-semibold bg-red-50/50">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{avisoErro}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="w-full py-3.5 px-6 bg-brand-magenta hover:bg-brand-magenta/90 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>
              {enviando
                ? "Enviando solicitação..."
                : "Solicitar Orçamento"}
            </span>
          </button>
        </form>
      </main>
    </div>
  );
}
