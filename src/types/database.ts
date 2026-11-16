export type FormaPagamento =
  | "pix"
  | "dinheiro"
  | "debito"
  | "credito_avista"
  | "credito_parcelado";

export type PedidoStatus =
  | "recebido"
  | "em_producao"
  | "pronto"
  | "entregue"
  | "cancelado";

export type CupomTipo = "percentual" | "valor";

export type LancamentoTipo = "custo" | "investimento" | "perda";

export type LancamentoCategoria =
  | "papel"
  | "tinta"
  | "impressora"
  | "materiais"
  | "equipamentos"
  | "perda_impressao"
  | "outros";

export interface LancamentoFinanceiro {
  id: string;
  data: string; // YYYY-MM-DD
  tipo: LancamentoTipo;
  categoria: LancamentoCategoria;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  observacao: string | null;
  criado_em: string;
}

export interface Colegio {
  id: string;
  nome: string;
  ativo: boolean;
  criado_em: string;
}

export interface Serie {
  id: string;
  colegio_id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

export interface Livro {
  id: string;
  nome: string;
  categoria: "didatico" | "paradidatico";
  valor: number;
  ativo: boolean;
  serie_nome?: string | null;
  capa_url?: string | null;
  capas_por_serie?: Record<string, string>;
}

export interface ModuloLivroItem {
  id: string;
  nome: string;
  valor: number;
  serie_nome?: string | null;
  capa_url?: string | null;
}

/** Módulo público sem link_arquivo (usado na Tela 1 - Formulário público) */
export interface ModuloPublico {
  id: string;
  serie_id: string;
  nome: string;
  ordem: number;
  valor: number;
  ativo: boolean;
  disciplinas?: string[];
  livros?: ModuloLivroItem[];
  capa_url?: string | null;
}

/** Módulo completo com link_arquivo (exclusivo para o Painel Admin) */
export interface Modulo extends ModuloPublico {
  link_arquivo: string;
}

export interface Cupom {
  id: string;
  codigo: string;
  tipo: CupomTipo;
  desconto: number;
  validade: string | null;
  limite_usos: number | null;
  usos: number;
  ativo: boolean;
}

export type TaxasParcelamento = Record<string, number>;

export interface LojaConfig {
  id: number;
  nome_loja: string;
  whatsapp_loja: string;
  prazo_dias: number;
  endereco_retirada: string;
  horario_retirada: string;
  taxas_parcelamento: TaxasParcelamento;
  mensagem_pronto: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  modulo_id: string;
  nome_modulo: string;
  valor: number;
  impresso: boolean;
  link_arquivo?: string;
}

export interface Pedido {
  id: string;
  numero: string;
  criado_em: string;
  responsavel_nome: string;
  aluno_nome: string;
  whatsapp: string;
  colegio_id: string;
  serie_id: string;
  colegio_nome?: string;
  serie_nome?: string;
  forma_pagamento: FormaPagamento;
  parcelas: number | null;
  subtotal: number;
  desconto: number;
  juros: number;
  total: number;
  cupom_id: string | null;
  cupom_codigo?: string | null;
  observacao: string | null;
  status: PedidoStatus;
  pago: boolean;
  pago_em?: string | null;
  previsao_retirada: string; // YYYY-MM-DD
  pronto_em: string | null;
  entregue_em: string | null;
  itens: PedidoItem[];
}

export type OrcamentoStatus = "enviado" | "aprovado" | "cancelado";

export interface OrcamentoItem {
  modulo_id: string;
  nome_modulo: string;
  valor: number;
}

export interface OrcamentoRegistrado {
  id: string;
  codigo: string;
  criado_em: string;
  validade_dias: number;
  cliente_nome: string;
  whatsapp: string;
  email: string;
  colegio_id: string;
  colegio_nome: string;
  serie_id: string;
  serie_nome: string;
  forma_pagamento: FormaPagamento;
  parcelas: number | null;
  subtotal: number;
  desconto: number;
  juros: number;
  total: number;
  cupom_codigo: string | null;
  observacao: string | null;
  status: OrcamentoStatus;
  itens: OrcamentoItem[];
}


