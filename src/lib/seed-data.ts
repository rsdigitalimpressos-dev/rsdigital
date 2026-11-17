import {
  Colegio,
  Cupom,
  LancamentoFinanceiro,
  Livro,
  LojaConfig,
  Modulo,
  ModuloLivroItem,
  OrcamentoRegistrado,
  Pedido,
  Serie,
} from "@/types/database";

export interface LocalDatabaseState {
  colegios: Colegio[];
  series: Serie[];
  modulos: Modulo[];
  livros: Livro[];
  cupons: Cupom[];
  config: LojaConfig;
  pedidos: Pedido[];
  orcamentos?: OrcamentoRegistrado[];
  lancamentos: LancamentoFinanceiro[];
  ultimoNumeroSeq: number;
  adminCredenciais?: {
    email: string;
    password: string;
  };
}

export const SERIES_PADRAO_ESCOLARES: {
  slug: string;
  nome: string;
  ordem: number;
  nivel: "fundamental" | "medio";
}[] = [
  { slug: "1ano-fund", nome: "1º ano — Ensino Fundamental", ordem: 1, nivel: "fundamental" },
  { slug: "2ano-fund", nome: "2º ano — Ensino Fundamental", ordem: 2, nivel: "fundamental" },
  { slug: "3ano-fund", nome: "3º ano — Ensino Fundamental", ordem: 3, nivel: "fundamental" },
  { slug: "4ano-fund", nome: "4º ano — Ensino Fundamental", ordem: 4, nivel: "fundamental" },
  { slug: "5ano-fund", nome: "5º ano — Ensino Fundamental", ordem: 5, nivel: "fundamental" },
  { slug: "6ano-fund", nome: "6º ano — Ensino Fundamental", ordem: 6, nivel: "fundamental" },
  { slug: "7ano-fund", nome: "7º ano — Ensino Fundamental", ordem: 7, nivel: "fundamental" },
  { slug: "8ano-fund", nome: "8º ano — Ensino Fundamental", ordem: 8, nivel: "fundamental" },
  { slug: "9ano-fund", nome: "9º ano — Ensino Fundamental", ordem: 9, nivel: "fundamental" },
  { slug: "1serie-medio", nome: "1ª série — Ensino Médio", ordem: 10, nivel: "medio" },
  { slug: "2serie-medio", nome: "2ª série — Ensino Médio", ordem: 11, nivel: "medio" },
  { slug: "3serie-medio", nome: "3ª série — Ensino Médio", ordem: 12, nivel: "medio" },
];

export const DISCIPLINAS_PADRAO_FUNDAMENTAL = [
  "Português",
  "Matemática",
  "História",
  "Geografia",
  "Ciências",
  "Inglês",
];

export const DISCIPLINAS_PADRAO_MEDIO = [
  "Português",
  "Matemática",
  "Física",
  "Química",
  "Biologia",
  "História",
  "Geografia",
  "Inglês",
  "Redação",
];

export const TODAS_DISCIPLINAS_SUGESTOES = [
  "Português",
  "Matemática",
  "História",
  "Geografia",
  "Ciências",
  "Física",
  "Química",
  "Biologia",
  "Inglês",
  "Espanhol",
  "Redação",
  "Filosofia",
  "Sociologia",
  "Artes",
];

export function getDisciplinasPadraoPorSerie(nomeSerie?: string): string[] {
  if (nomeSerie && /m[eé]d/i.test(nomeSerie)) {
    return [...DISCIPLINAS_PADRAO_MEDIO];
  }
  return [...DISCIPLINAS_PADRAO_FUNDAMENTAL];
}

export function getCapaPadraoPorOrdem(ordem = 1): string {
  const presets = [
    "preset:cmyk-cyan",
    "preset:cmyk-magenta",
    "preset:cmyk-amber",
    "preset:cmyk-emerald",
    "preset:cmyk-indigo",
  ];
  return presets[Math.max(0, (ordem - 1) % presets.length)];
}

export function createDefaultLivros(): Livro[] {
  return [
    { id: "liv-port", nome: "Português", categoria: "didatico", valor: 50.0, ativo: true },
    { id: "liv-mat", nome: "Matemática", categoria: "didatico", valor: 50.0, ativo: true },
    { id: "liv-hist", nome: "História", categoria: "didatico", valor: 50.0, ativo: true },
    { id: "liv-geo", nome: "Geografia", categoria: "didatico", valor: 50.0, ativo: true },
    { id: "liv-cien", nome: "Ciências", categoria: "didatico", valor: 50.0, ativo: true },
    { id: "liv-ing", nome: "Inglês", categoria: "didatico", valor: 50.0, ativo: true },
    { id: "liv-fis", nome: "Física", categoria: "didatico", valor: 45.0, ativo: true },
    { id: "liv-quim", nome: "Química", categoria: "didatico", valor: 45.0, ativo: true },
    { id: "liv-bio", nome: "Biologia", categoria: "didatico", valor: 45.0, ativo: true },
    { id: "liv-red", nome: "Redação", categoria: "didatico", valor: 45.0, ativo: true },
    { id: "liv-art", nome: "Artes", categoria: "didatico", valor: 40.0, ativo: true },
    { id: "liv-fil", nome: "Filosofia", categoria: "didatico", valor: 40.0, ativo: true },
    { id: "liv-soc", nome: "Sociologia", categoria: "didatico", valor: 40.0, ativo: true },
    {
      id: "liv-para-1",
      nome: "O Pequeno Príncipe",
      categoria: "paradidatico",
      valor: 45.0,
      ativo: true,
    },
    {
      id: "liv-para-2",
      nome: "Meu Pé de Laranja Lima",
      categoria: "paradidatico",
      valor: 45.0,
      ativo: true,
    },
    {
      id: "liv-para-3",
      nome: "A Bolsa Amarela",
      categoria: "paradidatico",
      valor: 45.0,
      ativo: true,
    },
    {
      id: "liv-para-4",
      nome: "Dom Casmurro",
      categoria: "paradidatico",
      valor: 50.0,
      ativo: true,
    },
  ];
}

export function resolverCapaLivroParaSerie(
  livro?: Livro | null,
  nomeSerie?: string | null
): string | null {
  if (!livro) return null;
  if (nomeSerie && livro.capas_por_serie) {
    const porSerieExata = livro.capas_por_serie[nomeSerie];
    if (porSerieExata) return porSerieExata;
    const chaveCurta = nomeSerie.split("—")[0]?.trim() || "";
    const matchKey = Object.keys(livro.capas_por_serie).find(
      (k) =>
        k.toLowerCase() === nomeSerie.toLowerCase() ||
        (chaveCurta && k.toLowerCase().startsWith(chaveCurta.toLowerCase()))
    );
    if (matchKey && livro.capas_por_serie[matchKey]) {
      return livro.capas_por_serie[matchKey];
    }
  }
  return livro.capa_url || null;
}

export function getLivrosPadraoPorModulo(
  nomeModulo: string,
  nomeSerie?: string,
  catalogoLivros?: Livro[]
): ModuloLivroItem[] {
  const todos =
    Array.isArray(catalogoLivros) && catalogoLivros.length > 0
      ? catalogoLivros
      : createDefaultLivros();

  if (/paradid/i.test(nomeModulo)) {
    const paradidaticos = todos.filter(
      (l) => l.categoria === "paradidatico" && l.ativo
    );
    if (paradidaticos.length > 0) {
      return paradidaticos.map((l) => ({
        id: l.id,
        nome: l.nome,
        valor: Number(l.valor),
        serie_nome: nomeSerie || l.serie_nome || null,
        capa_url: resolverCapaLivroParaSerie(l, nomeSerie),
      }));
    }
  }

  const nomesPadrao = getDisciplinasPadraoPorSerie(nomeSerie);
  return nomesPadrao.map((nomeDisc, idx) => {
    const encontrado = todos.find(
      (l) => l.nome.toLowerCase() === nomeDisc.toLowerCase()
    );
    return {
      id: encontrado ? encontrado.id : `liv-auto-${idx + 1}`,
      nome: encontrado ? encontrado.nome : nomeDisc,
      valor: encontrado ? Number(encontrado.valor) : 50.0,
      serie_nome: nomeSerie || encontrado?.serie_nome || null,
      capa_url: resolverCapaLivroParaSerie(encontrado, nomeSerie),
    };
  });
}

export function createDefaultLancamentos(): LancamentoFinanceiro[] {
  return [];
}

export function createInitialSeedState(): LocalDatabaseState {
  const config: LojaConfig = {
    id: 1,
    nome_loja: "RS Digital",
    whatsapp_loja: "11999999999",
    prazo_dias: 7,
    endereco_retirada: "Rua das Impressões, 120 — Centro",
    horario_retirada: "Seg a Sex das 08h às 18h | Sáb das 08h às 12h",
    taxas_parcelamento: {
      "2": 4.5,
      "3": 5.8,
      "4": 7.0,
      "5": 8.2,
      "6": 9.5,
      "7": 10.6,
      "8": 11.8,
      "9": 12.6,
      "10": 13.5,
      "11": 14.2,
      "12": 15.0,
    },
    mensagem_pronto:
      "Olá, {responsavel}! 😊 Seu pedido nº {numero} ({serie} – {colegio}) está pronto para retirada.\n📍 {endereco}\n🕒 {horario}\nObrigado pela preferência!",
  };

  return {
    colegios: [],
    series: [],
    modulos: [],
    livros: [],
    cupons: [],
    config,
    pedidos: [],
    lancamentos: [],
    ultimoNumeroSeq: 0,
  };
}
