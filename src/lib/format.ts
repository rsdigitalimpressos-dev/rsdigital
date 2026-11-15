import { FormaPagamento, PedidoStatus, TaxasParcelamento } from "@/types/database";

const TZ_BR = "America/Sao_Paulo";

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Retorna data no fuso de Brasília no formato YYYY-MM-DD */
export function toLocalDateISO(dateInput: Date | string = new Date()): string {
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().split("T")[0];
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_BR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** Soma N dias corridos à data atual (no fuso BR) e retorna YYYY-MM-DD */
export function addDaysLocalISO(days: number, baseDate: Date = new Date()): string {
  const [y, m, d] = toLocalDateISO(baseDate).split("-").map(Number);
  const utcNoon = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  utcNoon.setUTCDate(utcNoon.getUTCDate() + (Number.isFinite(days) ? days : 7));
  return utcNoon.toISOString().split("T")[0];
}

/** Formata valor numérico para R$ 0.000,00 */
export function formatCurrency(value: number): string {
  return brlFormatter.format(Number.isFinite(value) ? value : 0);
}

/** Formata string de data YYYY-MM-DD ou ISO para dd/mm/aaaa */
export function formatDateBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("pt-BR", {
    timeZone: TZ_BR,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Formata ISO string para dd/mm/aaaa HH:mm */
export function formatDateTimeBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const datePart = d.toLocaleDateString("pt-BR", {
    timeZone: TZ_BR,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("pt-BR", {
    timeZone: TZ_BR,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}

/** Remove tudo que não for dígito */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Aplica máscara de WhatsApp (00) 00000-0000 */
export function maskWhatsApp(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/** Rótulos legíveis para forma de pagamento */
export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Cartão de Débito",
  credito_avista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
};

/** Rótulos legíveis para status do pedido */
export const STATUS_PEDIDO_LABEL: Record<PedidoStatus, string> = {
  recebido: "Recebido",
  em_producao: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

/**
 * Regra de cálculo oficial:
 * subtotal = soma dos módulos -> aplica cupom -> sobre o valor com desconto aplica os juros do parcelamento -> total.
 */
export function calcularTotaisPedido(params: {
  valoresModulos: number[];
  cupom?: { tipo: "percentual" | "valor"; desconto: number } | null;
  formaPagamento: FormaPagamento;
  parcelas: number | null;
  taxasParcelamento: TaxasParcelamento;
}) {
  const subtotal = Number(
    params.valoresModulos.reduce((acc, v) => acc + Number(v || 0), 0).toFixed(2)
  );

  let desconto = 0;
  if (params.cupom && subtotal > 0) {
    if (params.cupom.tipo === "percentual") {
      desconto = Number(((subtotal * params.cupom.desconto) / 100).toFixed(2));
    } else {
      desconto = Number(Math.min(subtotal, params.cupom.desconto).toFixed(2));
    }
  }

  const baseAposDesconto = Math.max(0, Number((subtotal - desconto).toFixed(2)));

  let juros = 0;
  let taxaPercentual = 0;
  const numParcelas =
    params.formaPagamento === "credito_parcelado" &&
    params.parcelas &&
    params.parcelas >= 2
      ? params.parcelas
      : null;

  if (numParcelas) {
    taxaPercentual = Number(params.taxasParcelamento[String(numParcelas)] ?? 0);
    juros = Number(((baseAposDesconto * taxaPercentual) / 100).toFixed(2));
  }

  const total = Number((baseAposDesconto + juros).toFixed(2));
  const valorParcela = numParcelas
    ? Number((total / numParcelas).toFixed(2))
    : total;

  return {
    subtotal,
    desconto,
    baseAposDesconto,
    taxaPercentual,
    juros,
    total,
    numParcelas,
    valorParcela,
  };
}

/** Interpola a mensagem de "pronto" da configuração com os dados do pedido */
export function montarMensagemPronto(
  template: string,
  dados: {
    responsavel: string;
    aluno: string;
    serie: string;
    colegio: string;
    numero: string;
    endereco: string;
    horario: string;
  }
): string {
  return template
    .replaceAll("{responsavel}", dados.responsavel)
    .replaceAll("{aluno}", dados.aluno)
    .replaceAll("{serie}", dados.serie)
    .replaceAll("{colegio}", dados.colegio)
    .replaceAll("{numero}", dados.numero)
    .replaceAll("{endereco}", dados.endereco)
    .replaceAll("{horario}", dados.horario);
}

/** Gera link wa.me/55DDDNUMERO?text=... */
export function gerarLinkWhatsApp(whatsapp: string, mensagem: string): string {
  const digits = onlyDigits(whatsapp);
  const numeroComDDI = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${numeroComDDI}?text=${encodeURIComponent(mensagem)}`;
}

