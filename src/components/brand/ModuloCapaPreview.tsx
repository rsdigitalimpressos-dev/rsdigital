import React from "react";

export interface CapaExemploPreset {
  id: string;
  nome: string;
  corPrincipal: string;
  corSecundaria: string;
  corFundo: string;
  corTexto: string;
  seloCor: string;
}

export const CAPA_EXEMPLOS: CapaExemploPreset[] = [
  {
    id: "preset:cmyk-cyan",
    nome: "Capa Ciano (1º Trimestre)",
    corPrincipal: "#009FE3",
    corSecundaria: "#0284C7",
    corFundo: "#F0F9FF",
    corTexto: "#0F172A",
    seloCor: "#009FE3",
  },
  {
    id: "preset:cmyk-magenta",
    nome: "Capa Magenta (2º Trimestre)",
    corPrincipal: "#E6007E",
    corSecundaria: "#BE185D",
    corFundo: "#FDF2F8",
    corTexto: "#1E1B4B",
    seloCor: "#E6007E",
  },
  {
    id: "preset:cmyk-amber",
    nome: "Capa Âmbar (3º Trimestre)",
    corPrincipal: "#D97706",
    corSecundaria: "#B45309",
    corFundo: "#FFFBEB",
    corTexto: "#1C1917",
    seloCor: "#D97706",
  },
  {
    id: "preset:cmyk-emerald",
    nome: "Capa Esmeralda (4º Trimestre)",
    corPrincipal: "#059669",
    corSecundaria: "#047857",
    corFundo: "#ECFDF5",
    corTexto: "#064E3B",
    seloCor: "#059669",
  },
  {
    id: "preset:cmyk-dark",
    nome: "Capa Grafite (Volume Único)",
    corPrincipal: "#161616",
    corSecundaria: "#009FE3",
    corFundo: "#18181B",
    corTexto: "#FFFFFF",
    seloCor: "#FFED00",
  },
  {
    id: "preset:cmyk-indigo",
    nome: "Capa Índigo (Ensino Médio)",
    corPrincipal: "#4F46E5",
    corSecundaria: "#3730A3",
    corFundo: "#EEF2FF",
    corTexto: "#1E1B4B",
    seloCor: "#4F46E5",
  },
];

export function resolverPresetCapa(
  capaUrl?: string | null,
  ordem = 1,
  nomeModulo = ""
): { tipo: "imagem"; url: string } | { tipo: "preset"; preset: CapaExemploPreset } {
  const limpo = (capaUrl || "").trim();
  if (limpo && !limpo.startsWith("preset:")) {
    return { tipo: "imagem", url: limpo };
  }

  if (limpo.startsWith("preset:")) {
    const encontrado = CAPA_EXEMPLOS.find((p) => p.id === limpo);
    if (encontrado) {
      return { tipo: "preset", preset: encontrado };
    }
  }

  if (/volume|\b[uú]nico/i.test(nomeModulo)) {
    return { tipo: "preset", preset: CAPA_EXEMPLOS[4] };
  }
  const idx = Math.max(0, (ordem - 1) % 4);
  return { tipo: "preset", preset: CAPA_EXEMPLOS[idx] };
}

interface ModuloCapaPreviewProps {
  nomeModulo: string;
  nomeSerie?: string;
  nomeColegio?: string;
  ordem?: number;
  capaUrl?: string | null;
  qtdDisciplinas?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Representação visual de uma apostila/módulo encadernado em espiral (ou foto de capa enviada).
 */
export function ModuloCapaPreview({
  nomeModulo,
  nomeSerie = "",
  nomeColegio = "",
  ordem = 1,
  capaUrl,
  qtdDisciplinas,
  size = "md",
  className = "",
}: ModuloCapaPreviewProps) {
  const resolvido = resolverPresetCapa(capaUrl, ordem, nomeModulo);

  const dims =
    size === "sm"
      ? "w-14 h-[74px]"
      : size === "lg"
        ? "w-32 h-44"
        : "w-24 h-32";

  const argolasCount = size === "sm" ? 5 : size === "lg" ? 8 : 6;
  const serieCurta = nomeSerie
    ? nomeSerie.split("—")[0].trim()
    : "Apostila Escolar";
  const colegioCurto = nomeColegio || "RS Digital";

  // Caso o administrador tenha enviado uma foto/URL de capa personalizada
  if (resolvido.tipo === "imagem") {
    return (
      <div
        className={`relative ${dims} shrink-0 rounded-r-lg rounded-l-[3px] overflow-hidden border border-brand-border shadow-[2px_3px_10px_rgba(22,22,22,0.10)] bg-white select-none ${className}`}
      >
        {/* Argolas de espiral na lateral esquerda */}
        <div className="absolute left-0 top-0 bottom-0 w-2 z-10 flex flex-col justify-evenly items-center bg-black/20 backdrop-blur-[1px]">
          {Array.from({ length: argolasCount }).map((_, i) => (
            <span
              key={i}
              className="w-2 h-[3px] rounded-full bg-brand-ink/80 shadow-2xs"
            />
          ))}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolvido.url}
          alt={`Capa ${nomeModulo}`}
          className="w-full h-full object-cover"
        />

        {/* Faixa inferior sutil com identificação do módulo */}
        {size !== "sm" && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-2 pl-3 text-white">
            <p className="text-[10px] font-extrabold leading-tight truncate">
              {nomeModulo}
            </p>
            {serieCurta && (
              <p className="text-[8px] text-white/80 truncate">{serieCurta}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Capa ilustrada (Exemplo Editorial RS Digital)
  const { preset } = resolvido;
  const isDark = preset.id === "preset:cmyk-dark";

  return (
    <div
      style={{ backgroundColor: preset.corFundo }}
      className={`relative ${dims} shrink-0 rounded-r-lg rounded-l-[3px] overflow-hidden border border-brand-border/90 shadow-[2px_4px_12px_rgba(22,22,22,0.09)] flex flex-col justify-between select-none ${className}`}
    >
      {/* Faixa superior de cor do trimestre */}
      <div
        style={{ backgroundColor: preset.corPrincipal }}
        className={size === "sm" ? "h-1.5 w-full" : "h-2 w-full"}
      />

      {/* Espiral de encadernação à esquerda */}
      <div className="absolute left-0 top-0 bottom-0 w-2.5 z-10 flex flex-col justify-evenly items-center py-1 border-r border-black/10 bg-black/[0.04]">
        {Array.from({ length: argolasCount }).map((_, i) => (
          <span
            key={i}
            className="w-2 h-[3px] rounded-full bg-brand-ink/75"
          />
        ))}
      </div>

      {/* Grafismo geométrico decorativo de capa no fundo */}
      <div
        style={{ backgroundColor: preset.corPrincipal }}
        className="absolute -right-5 -bottom-5 w-16 h-16 rounded-full opacity-15 pointer-events-none"
      />
      <div
        style={{ borderColor: preset.corPrincipal }}
        className="absolute -right-2 -bottom-2 w-11 h-11 rounded-full border-2 opacity-25 pointer-events-none"
      />

      {/* Conteúdo editorial da capa */}
      <div
        className={`relative z-1 flex-1 flex flex-col justify-between ${
          size === "sm"
            ? "pl-3.5 pr-1.5 py-1.5"
            : "pl-4 pr-2.5 py-2"
        }`}
      >
        {/* Topo: Colégio / Série */}
        <div>
          {size !== "sm" && (
            <p
              style={{ color: isDark ? "#A1A1AA" : "#64748B" }}
              className="text-[7px] font-bold uppercase tracking-wider truncate leading-tight"
            >
              {colegioCurto}
            </p>
          )}
          <span
            style={{
              backgroundColor: preset.corPrincipal,
              color: "#FFFFFF",
            }}
            className={`inline-block font-extrabold uppercase tracking-wider rounded-[3px] truncate max-w-full ${
              size === "sm"
                ? "text-[6.5px] px-1 py-0.5"
                : "text-[8px] px-1.5 py-0.5 mt-0.5"
            }`}
          >
            {serieCurta}
          </span>
        </div>

        {/* Centro: Nome do Módulo em destaque */}
        <div className="my-auto py-0.5">
          <p
            style={{ color: preset.corTexto }}
            className={`font-extrabold leading-tight tracking-tight line-clamp-2 ${
              size === "sm"
                ? "text-[9px]"
                : size === "lg"
                  ? "text-xs"
                  : "text-[11px]"
            }`}
          >
            {nomeModulo}
          </p>
          {size !== "sm" && qtdDisciplinas && (
            <p
              style={{ color: isDark ? "#D4D4D8" : "#64748B" }}
              className="text-[8px] font-semibold mt-0.5"
            >
              {qtdDisciplinas} {qtdDisciplinas === 1 ? "livro" : "livros"}
            </p>
          )}
        </div>

        {/* Rodapé da capa: Selo RS Digital CMYK */}
        <div className="flex items-center justify-between pt-1 border-t border-black/10">
          <div className="flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#009FE3]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#E6007E]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#FFED00]" />
          </div>
          <span
            style={{ color: isDark ? "#E4E4E7" : "#475569" }}
            className="text-[6.5px] font-brand uppercase tracking-wider inline-flex items-baseline gap-0.5"
          >
            <strong style={{ fontWeight: 800 }}>RS</strong>
            <span style={{ fontWeight: 400 }} className="tracking-[0.14em]">
              DIGITAL
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export interface TemaDisciplinaLivro {
  corPrincipal: string;
  corSecundaria: string;
  corFundo: string;
  corTexto: string;
  sigla: string;
}

export function obterTemaLivroPorDisciplina(nomeLivro: string): TemaDisciplinaLivro {
  const n = (nomeLivro || "").toLowerCase();
  if (n.includes("portugu") || n.includes("gram") || n.includes("lingu")) {
    return {
      corPrincipal: "#009FE3",
      corSecundaria: "#0369A1",
      corFundo: "#F0F9FF",
      corTexto: "#0C4A6E",
      sigla: "PORT",
    };
  }
  if (n.includes("matem") || n.includes("geometr") || n.includes("álgeb")) {
    return {
      corPrincipal: "#E6007E",
      corSecundaria: "#9D174D",
      corFundo: "#FDF2F8",
      corTexto: "#500724",
      sigla: "MAT",
    };
  }
  if (n.includes("hist")) {
    return {
      corPrincipal: "#D97706",
      corSecundaria: "#92400E",
      corFundo: "#FFFBEB",
      corTexto: "#451A03",
      sigla: "HIST",
    };
  }
  if (n.includes("geogr")) {
    return {
      corPrincipal: "#059669",
      corSecundaria: "#065F46",
      corFundo: "#ECFDF5",
      corTexto: "#064E3B",
      sigla: "GEO",
    };
  }
  if (n.includes("ciênc") || n.includes("cienc") || n.includes("biolog")) {
    return {
      corPrincipal: "#16A34A",
      corSecundaria: "#166534",
      corFundo: "#F0FDF4",
      corTexto: "#14532D",
      sigla: n.includes("biolog") ? "BIO" : "CIÊN",
    };
  }
  if (n.includes("ingl") || n.includes("espanh")) {
    return {
      corPrincipal: "#4F46E5",
      corSecundaria: "#3730A3",
      corFundo: "#EEF2FF",
      corTexto: "#1E1B4B",
      sigla: n.includes("espanh") ? "ESP" : "ING",
    };
  }
  if (n.includes("físic") || n.includes("fisic")) {
    return {
      corPrincipal: "#0284C7",
      corSecundaria: "#075985",
      corFundo: "#E0F2FE",
      corTexto: "#0C4A6E",
      sigla: "FÍS",
    };
  }
  if (n.includes("quím") || n.includes("quim")) {
    return {
      corPrincipal: "#7C3AED",
      corSecundaria: "#5B21B6",
      corFundo: "#F5F3FF",
      corTexto: "#2E1065",
      sigla: "QUÍM",
    };
  }
  if (n.includes("reda") || n.includes("literat")) {
    return {
      corPrincipal: "#DB2777",
      corSecundaria: "#9D174D",
      corFundo: "#FDF2F8",
      corTexto: "#500724",
      sigla: "RED",
    };
  }
  if (n.includes("filosof") || n.includes("sociol") || n.includes("art")) {
    return {
      corPrincipal: "#EA580C",
      corSecundaria: "#9A3412",
      corFundo: "#FFF7ED",
      corTexto: "#431407",
      sigla: n.includes("art") ? "ART" : n.includes("fil") ? "FIL" : "SOC",
    };
  }
  // Paradidáticos / outros livros
  return {
    corPrincipal: "#161616",
    corSecundaria: "#009FE3",
    corFundo: "#F8FAFC",
    corTexto: "#0F172A",
    sigla: "LIVRO",
  };
}

export function abreviarSerieParaCapa(nomeSerie?: string | null): {
  curto: string;
  nivel: string;
} {
  if (!nomeSerie || !nomeSerie.trim()) {
    return { curto: "Série Escolar", nivel: "RS Digital" };
  }
  const limpo = nomeSerie.trim();
  const partes = limpo.split("—").map((p) => p.trim());
  const curto = partes[0] || limpo;
  const isMedio = /m[eé]d/i.test(limpo);
  const isFund = /fund/i.test(limpo);
  const nivel = isMedio ? "Ens. Médio" : isFund ? "Fundamental" : partes[1] || "Escolar";
  return { curto, nivel };
}

interface LivroCapaPreviewProps {
  nomeLivro: string;
  nomeSerie?: string | null;
  nomeModulo?: string;
  capaUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

/**
 * Capa individual de um Livro (Didático ou Paradidático), vinculada visualmente à sua Série.
 */
export function LivroCapaPreview({
  nomeLivro,
  nomeSerie,
  nomeModulo,
  capaUrl,
  size = "sm",
  className = "",
}: LivroCapaPreviewProps) {
  const tema = obterTemaLivroPorDisciplina(nomeLivro);
  const { curto: serieCurta, nivel: nivelCurto } = abreviarSerieParaCapa(nomeSerie);

  const dims =
    size === "xs"
      ? "w-9 h-12"
      : size === "sm"
        ? "w-12 h-16"
        : size === "lg"
          ? "w-28 h-38"
          : "w-20 h-28";

  const urlLimpa = (capaUrl || "").trim();
  const temImagemCustom =
    urlLimpa !== "" && !urlLimpa.startsWith("preset:");

  if (temImagemCustom) {
    return (
      <div
        className={`relative ${dims} shrink-0 rounded-r-md rounded-l-[2px] overflow-hidden border border-brand-border shadow-[1px_2px_6px_rgba(22,22,22,0.12)] bg-white select-none ${className}`}
      >
        {/* Lombada do livro */}
        <div
          style={{ backgroundColor: tema.corPrincipal }}
          className="absolute left-0 top-0 bottom-0 w-1.5 z-10 opacity-90"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urlLimpa}
          alt={`Capa ${nomeLivro} - ${serieCurta}`}
          className="w-full h-full object-cover"
        />
        {/* Selo da Série na parte superior da capa */}
        <div className="absolute top-1 left-2 right-1 z-10 flex justify-end">
          <span
            style={{ backgroundColor: tema.corPrincipal }}
            className="px-1 py-0.2 rounded-[2px] text-[6px] font-extrabold uppercase tracking-wider text-white shadow-2xs truncate max-w-full"
          >
            {serieCurta}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ backgroundColor: tema.corFundo }}
      className={`relative ${dims} shrink-0 rounded-r-md rounded-l-[2px] overflow-hidden border border-brand-border shadow-[1px_2px_7px_rgba(22,22,22,0.08)] flex flex-col justify-between select-none ${className}`}
    >
      {/* Lombada lateral colorida do livro */}
      <div
        style={{ backgroundColor: tema.corPrincipal }}
        className="absolute left-0 top-0 bottom-0 w-1.5 z-10"
      />

      {/* Faixa superior da disciplina */}
      <div
        style={{ backgroundColor: tema.corPrincipal }}
        className="h-1 w-full"
      />

      {/* Elemento geométrico sutil no canto inferior */}
      <div
        style={{ backgroundColor: tema.corPrincipal }}
        className="absolute -right-3 -bottom-3 w-9 h-9 rounded-full opacity-12 pointer-events-none"
      />

      <div
        className={`relative z-1 flex-1 flex flex-col justify-between ${
          size === "xs"
            ? "pl-2 pr-1 py-1"
            : size === "sm"
              ? "pl-2.5 pr-1.5 py-1"
              : "pl-3 pr-2 py-2"
        }`}
      >
        {/* Topo: Série em destaque (cada livro tem sua série) */}
        <div className="space-y-0.5">
          <span
            style={{ backgroundColor: tema.corPrincipal, color: "#FFFFFF" }}
            className={`inline-block font-extrabold uppercase tracking-tight rounded-[2px] truncate max-w-full leading-none ${
              size === "xs"
                ? "text-[5.5px] px-1 py-0.5"
                : size === "sm"
                  ? "text-[6.5px] px-1 py-0.5"
                  : "text-[8px] px-1.5 py-0.5"
            }`}
          >
            {serieCurta}
          </span>
          {size !== "xs" && (
            <p
              style={{ color: tema.corSecundaria }}
              className="text-[5.5px] font-bold uppercase tracking-wider truncate leading-none"
            >
              {nivelCurto}
            </p>
          )}
        </div>

        {/* Centro: Nome do Livro / Disciplina */}
        <div className="my-auto">
          <p
            style={{ color: tema.corTexto }}
            className={`font-extrabold leading-tight tracking-tight line-clamp-2 ${
              size === "xs"
                ? "text-[6.5px]"
                : size === "sm"
                  ? "text-[8px]"
                  : size === "lg"
                    ? "text-[11px]"
                    : "text-[9.5px]"
            }`}
          >
            {nomeLivro}
          </p>
        </div>

        {/* Rodapé: Sigla da Disciplina + CMYK */}
        <div className="flex items-center justify-between pt-0.5 border-t border-black/10">
          <div className="flex items-center gap-0.5">
            <span className="w-1 h-1 rounded-full bg-[#009FE3]" />
            <span className="w-1 h-1 rounded-full bg-[#E6007E]" />
            <span className="w-1 h-1 rounded-full bg-[#FFED00]" />
          </div>
          <span
            style={{ color: tema.corSecundaria }}
            className="text-[5.5px] font-extrabold uppercase tracking-wider truncate"
          >
            {nomeModulo ? nomeModulo.split(" ")[0] : tema.sigla}
          </span>
        </div>
      </div>
    </div>
  );
}


