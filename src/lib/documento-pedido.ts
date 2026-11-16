import { FormaPagamento, LojaConfig, PedidoStatus } from "@/types/database";
import {
  FORMA_PAGAMENTO_LABEL,
  formatCurrency,
  formatDateBR,
  formatDateTimeBR,
  maskWhatsApp,
  STATUS_PEDIDO_LABEL,
} from "@/lib/format";

export interface DocumentoPedidoDados {
  numero: string;
  criado_em: string;
  responsavel_nome: string;
  aluno_nome: string;
  whatsapp?: string;
  colegio_nome?: string;
  serie_nome?: string;
  forma_pagamento?: FormaPagamento;
  parcelas?: number | null;
  subtotal?: number;
  desconto?: number;
  juros?: number;
  total: number;
  cupom_codigo?: string | null;
  observacao?: string | null;
  status: PedidoStatus;
  previsao_retirada: string;
  itens: { nome_modulo: string; valor: number }[];
}

export interface DocumentoOrcamentoDados {
  codigo: string;
  criado_em: string;
  validade_dias: number;
  cliente_nome: string;
  whatsapp?: string;
  email?: string;
  colegio_nome: string;
  serie_nome: string;
  forma_pagamento: FormaPagamento;
  parcelas?: number | null;
  subtotal: number;
  desconto: number;
  juros: number;
  total: number;
  cupom_codigo?: string | null;
  observacao?: string | null;
  itens: { nome_modulo: string; valor: number }[];
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatarFormaPagamento(pedido: DocumentoPedidoDados): string {
  if (!pedido.forma_pagamento) return "Pix / A combinar";
  if (
    pedido.forma_pagamento === "credito_parcelado" &&
    pedido.parcelas &&
    pedido.parcelas >= 2
  ) {
    const valorParcela = Number((pedido.total / pedido.parcelas).toFixed(2));
    return `Crédito parcelado em ${pedido.parcelas}x de ${formatCurrency(valorParcela)}`;
  }
  return FORMA_PAGAMENTO_LABEL[pedido.forma_pagamento] || "Pix";
}

function wrapTextCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = String(text || "").split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ["—"];
}

function fitTextCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const raw = String(text || "—");
  if (ctx.measureText(raw).width <= maxWidth) return raw;
  let trimmed = raw;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1).trimEnd();
  }
  return `${trimmed}…`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Empacota um JPEG (Uint8Array) em um arquivo PDF 1.4 A4 nativo (application/pdf)
 */
function criarPdfA4DeJpeg(
  jpegBytes: Uint8Array,
  imgWidth: number,
  imgHeight: number
): Blob {
  const pageWidthPt = 595.28;
  const pageHeightPt = 841.89;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let byteLength = 0;

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    byteLength += bytes.byteLength;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteLength += bytes.byteLength;
  };

  // Cabeçalho PDF 1.4
  pushStr("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  // 1: Catalog
  offsets[1] = byteLength;
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // 2: Pages
  offsets[2] = byteLength;
  pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  // 3: Page A4
  offsets[3] = byteLength;
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt.toFixed(2)} ${pageHeightPt.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  // 4: Image XObject (JPEG)
  offsets[4] = byteLength;
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr("\nendstream\nendobj\n");

  // 5: Content Stream
  const contentStream = `q\n${pageWidthPt.toFixed(2)} 0 0 ${pageHeightPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(contentStream);
  offsets[5] = byteLength;
  pushStr(
    `5 0 obj\n<< /Length ${contentBytes.byteLength} >>\nstream\n${contentStream}endstream\nendobj\n`
  );

  // Tabela XREF
  const xrefOffset = byteLength;
  pushStr("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) {
    const offStr = String(offsets[i]).padStart(10, "0");
    pushStr(`${offStr} 00000 n \n`);
  }

  // Trailer
  pushStr(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

/**
 * Gera e faz o download imediato do Documento de Pedido em PDF (A4) com a logomarca RS Digital
 * e todas as informações do pedido para o cliente.
 */
export async function baixarDocumentoPedidoPDF(
  pedido: DocumentoPedidoDados,
  config: LojaConfig
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    if ("fonts" in document && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    // continua mesmo se fonts API não estiver disponível
  }

  const W = 1240;
  const H = 1754;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const fontFamily = "'Inter', 'Segoe UI', Arial, sans-serif";
  const padX = 76;
  const contentW = W - padX * 2;

  // Fundo branco A4
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // 1. Barra superior CMYK
  const barH = 14;
  const cmykColors = ["#00A0DC", "#E5007D", "#FFD200", "#161616"];
  cmykColors.forEach((color, idx) => {
    ctx.fillStyle = color;
    ctx.fillRect((W / 4) * idx, 0, W / 4 + 1, barH);
  });

  // 2. Cabeçalho com Logomarca Oficial RS Digital
  const headerTop = 58;
  const logoBoxSize = 96;
  const logoX = padX;
  const logoY = headerTop;

  // Caixa da logo
  ctx.save();
  drawRoundedRect(ctx, logoX, logoY, logoBoxSize, logoBoxSize, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#E5E7EB";
  ctx.stroke();

  // Três círculos sobrepostos CMYK com mix-blend-mode: multiply
  const scale = logoBoxSize / 120;
  ctx.globalCompositeOperation = "multiply";

  // Ciano
  ctx.beginPath();
  ctx.arc(logoX + 48 * scale, logoY + 48 * scale, 26 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "#00A0DC";
  ctx.fill();

  // Magenta
  ctx.beginPath();
  ctx.arc(logoX + 72 * scale, logoY + 48 * scale, 26 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "#E5007D";
  ctx.fill();

  // Amarelo
  ctx.beginPath();
  ctx.arc(logoX + 60 * scale, logoY + 70 * scale, 26 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "#FFD200";
  ctx.fill();

  ctx.restore();

  // Texto "RS Digital" ao lado da logo
  const brandTextX = logoX + logoBoxSize + 22;
  ctx.fillStyle = "#161616";
  ctx.font = `800 42px ${fontFamily}`;
  ctx.fillText("RS", brandTextX, logoY + 46);
  const rsWidth = ctx.measureText("RS").width;

  ctx.font = `300 42px ${fontFamily}`;
  ctx.fillText("Digital", brandTextX + rsWidth + 10, logoY + 46);

  ctx.fillStyle = "#6B7280";
  ctx.font = `600 16px ${fontFamily}`;
  ctx.fillText(
    "DOCUMENTO OFICIAL DE PEDIDO · MÓDULOS ESCOLARES",
    brandTextX,
    logoY + 76
  );

  // Bloco Nº do Pedido à direita do cabeçalho
  const badgeW = 290;
  const badgeH = 96;
  const badgeX = W - padX - badgeW;
  const badgeY = headerTop;

  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 16);
  ctx.fillStyle = "#FAFAFB";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#161616";
  ctx.stroke();

  ctx.fillStyle = "#6B7280";
  ctx.font = `700 14px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.fillText("NÚMERO DO PEDIDO", badgeX + badgeW / 2, badgeY + 30);

  ctx.fillStyle = "#161616";
  ctx.font = `800 36px ${fontFamily}`;
  ctx.fillText(`#${pedido.numero}`, badgeX + badgeW / 2, badgeY + 74);
  ctx.textAlign = "left";

  // Linha divisória do cabeçalho
  let curY = headerTop + logoBoxSize + 32;
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(W - padX, curY);
  ctx.stroke();

  // 3. Faixa de Status, Emissão e Previsão de Retirada
  curY += 28;
  const infoBarH = 104;
  drawRoundedRect(ctx, padX, curY, contentW, infoBarH, 16);
  ctx.fillStyle = "#F8FAFC";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#E5E7EB";
  ctx.stroke();

  const col3W = contentW / 3;

  // Coluna 1: Data do Pedido
  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("DATA DO PEDIDO", padX + 28, curY + 36);
  ctx.fillStyle = "#161616";
  ctx.font = `800 22px ${fontFamily}`;
  ctx.fillText(formatDateTimeBR(pedido.criado_em), padX + 28, curY + 72);

  // Coluna 2: Status Atual
  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("STATUS DO PEDIDO", padX + col3W + 20, curY + 36);
  ctx.fillStyle = "#00A0DC";
  ctx.font = `800 22px ${fontFamily}`;
  ctx.fillText(
    STATUS_PEDIDO_LABEL[pedido.status] || "Recebido",
    padX + col3W + 20,
    curY + 72
  );

  // Coluna 3: Previsão de Retirada
  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("PREVISÃO DE RETIRADA", padX + col3W * 2 + 20, curY + 36);
  ctx.fillStyle = "#E5007D";
  ctx.font = `800 24px ${fontFamily}`;
  ctx.fillText(
    formatDateBR(pedido.previsao_retirada),
    padX + col3W * 2 + 20,
    curY + 72
  );

  // 4. Dados do Cliente e Responsável
  curY += infoBarH + 34;
  ctx.fillStyle = "#161616";
  ctx.font = `800 18px ${fontFamily}`;
  ctx.fillText("DADOS DO RESPONSÁVEL E MATERIAL", padX, curY);

  curY += 16;
  const clienteBoxH = 188;
  drawRoundedRect(ctx, padX, curY, contentW, clienteBoxH, 16);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#E5E7EB";
  ctx.stroke();

  const halfW = contentW / 2;

  // Linha 1: Responsável e WhatsApp
  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("RESPONSÁVEL", padX + 28, curY + 38);
  ctx.fillText("WHATSAPP", padX + halfW + 20, curY + 38);

  ctx.fillStyle = "#161616";
  ctx.font = `800 21px ${fontFamily}`;
  ctx.fillText(
    fitTextCanvas(ctx, pedido.responsavel_nome || pedido.aluno_nome || "—", halfW - 48),
    padX + 28,
    curY + 70
  );
  ctx.font = `700 20px ${fontFamily}`;
  ctx.fillText(
    fitTextCanvas(
      ctx,
      pedido.whatsapp ? maskWhatsApp(pedido.whatsapp) : "—",
      halfW - 48
    ),
    padX + halfW + 20,
    curY + 70
  );

  // Linha divisória interna
  ctx.strokeStyle = "#F1F5F9";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX + 24, curY + 94);
  ctx.lineTo(W - padX - 24, curY + 94);
  ctx.stroke();

  // Linha 2: Colégio e Série (2 colunas amplas sem sobreposição)
  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("COLÉGIO / INSTITUIÇÃO", padX + 28, curY + 126);
  ctx.fillText("SÉRIE / ANO", padX + halfW + 20, curY + 126);

  ctx.fillStyle = "#161616";
  ctx.font = `700 19px ${fontFamily}`;
  ctx.fillText(
    fitTextCanvas(ctx, pedido.colegio_nome || "—", halfW - 48),
    padX + 28,
    curY + 158
  );
  ctx.fillText(
    fitTextCanvas(ctx, pedido.serie_nome || "—", halfW - 48),
    padX + halfW + 20,
    curY + 158
  );

  // 5. Tabela de Módulos Solicitados
  curY += clienteBoxH + 38;
  ctx.fillStyle = "#161616";
  ctx.font = `800 18px ${fontFamily}`;
  ctx.fillText(
    `MÓDULOS / APOSTILAS SOLICITADAS (${pedido.itens.length})`,
    padX,
    curY
  );

  curY += 16;
  const tableHeaderH = 52;
  drawRoundedRect(ctx, padX, curY, contentW, tableHeaderH, 12);
  ctx.fillStyle = "#161616";
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 14px ${fontFamily}`;
  ctx.fillText("ITEM", padX + 24, curY + 31);
  ctx.fillText("DESCRIÇÃO DO MÓDULO / APOSTILA", padX + 110, curY + 31);
  ctx.textAlign = "right";
  ctx.fillText("VALOR", W - padX - 28, curY + 31);
  ctx.textAlign = "left";

  curY += tableHeaderH;
  const maxDescW = contentW - 290;
  pedido.itens.forEach((item, index) => {
    ctx.font = `700 18px ${fontFamily}`;
    const descLines = wrapTextCanvas(ctx, item.nome_modulo, maxDescW).slice(0, 2);
    const rowH = descLines.length > 1 ? 74 : 56;
    const rowY = curY;

    ctx.fillStyle = index % 2 === 0 ? "#FFFFFF" : "#FAFAFB";
    ctx.fillRect(padX, rowY, contentW, rowH);

    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, rowY + rowH);
    ctx.lineTo(W - padX, rowY + rowH);
    ctx.stroke();

    ctx.fillStyle = "#6B7280";
    ctx.font = `700 16px ${fontFamily}`;
    ctx.fillText(
      String(index + 1).padStart(2, "0"),
      padX + 24,
      rowY + (descLines.length > 1 ? 32 : 35)
    );

    ctx.fillStyle = "#161616";
    ctx.font = `700 18px ${fontFamily}`;
    descLines.forEach((line, lineIdx) => {
      ctx.fillText(
        line,
        padX + 110,
        rowY + (descLines.length > 1 ? 30 + lineIdx * 24 : 35)
      );
    });

    ctx.textAlign = "right";
    ctx.font = `800 18px ${fontFamily}`;
    ctx.fillText(
      formatCurrency(item.valor),
      W - padX - 28,
      rowY + (descLines.length > 1 ? 32 : 35)
    );
    ctx.textAlign = "left";

    curY += rowH;
  });

  curY += 28;

  // 6. Observação (se houver) + Resumo Financeiro
  const resumoW = 460;
  const resumoX = W - padX - resumoW;
  const leftColW = contentW - resumoW - 32;

  // Bloco esquerdo: Forma de pagamento + Observação
  let leftY = curY;
  drawRoundedRect(ctx, padX, leftY, leftColW, 110, 14);
  ctx.fillStyle = "#FAFAFB";
  ctx.fill();
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("FORMA DE PAGAMENTO ESCOLHIDA", padX + 24, leftY + 36);

  ctx.fillStyle = "#161616";
  ctx.font = `800 20px ${fontFamily}`;
  ctx.fillText(formatarFormaPagamento(pedido), padX + 24, leftY + 74);

  if (pedido.observacao && pedido.observacao.trim() !== "") {
    leftY += 126;
    ctx.font = `600 16px ${fontFamily}`;
    const obsLines = wrapTextCanvas(
      ctx,
      pedido.observacao.trim(),
      leftColW - 48
    ).slice(0, 3);
    const obsBoxH = 56 + obsLines.length * 24;

    drawRoundedRect(ctx, padX, leftY, leftColW, obsBoxH, 14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#6B7280";
    ctx.font = `700 13px ${fontFamily}`;
    ctx.fillText("OBSERVAÇÃO DO PEDIDO", padX + 24, leftY + 32);

    ctx.fillStyle = "#161616";
    ctx.font = `600 16px ${fontFamily}`;
    obsLines.forEach((line, idx) => {
      ctx.fillText(line, padX + 24, leftY + 62 + idx * 24);
    });
  }

  // Bloco direito: Totais do Pedido
  const subtotalCalc =
    typeof pedido.subtotal === "number"
      ? pedido.subtotal
      : pedido.itens.reduce((acc, i) => acc + Number(i.valor || 0), 0);
  const descontoCalc = Number(pedido.desconto || 0);
  const jurosCalc = Number(pedido.juros || 0);

  let finBoxH = 150;
  if (descontoCalc > 0) finBoxH += 36;
  if (jurosCalc > 0) finBoxH += 36;

  drawRoundedRect(ctx, resumoX, curY, resumoW, finBoxH, 16);
  ctx.fillStyle = "#FAFAFB";
  ctx.fill();
  ctx.strokeStyle = "#161616";
  ctx.lineWidth = 2;
  ctx.stroke();

  let finRowY = curY + 42;
  ctx.font = `600 17px ${fontFamily}`;
  ctx.fillStyle = "#6B7280";
  ctx.fillText("Subtotal dos módulos", resumoX + 28, finRowY);
  ctx.textAlign = "right";
  ctx.fillStyle = "#161616";
  ctx.font = `700 17px ${fontFamily}`;
  ctx.fillText(formatCurrency(subtotalCalc), resumoX + resumoW - 28, finRowY);
  ctx.textAlign = "left";

  if (descontoCalc > 0) {
    finRowY += 36;
    ctx.font = `700 17px ${fontFamily}`;
    ctx.fillStyle = "#00A0DC";
    const labelCupom = pedido.cupom_codigo
      ? `Desconto (${pedido.cupom_codigo})`
      : "Desconto";
    ctx.fillText(labelCupom, resumoX + 28, finRowY);
    ctx.textAlign = "right";
    ctx.fillText(
      `- ${formatCurrency(descontoCalc)}`,
      resumoX + resumoW - 28,
      finRowY
    );
    ctx.textAlign = "left";
  }

  if (jurosCalc > 0) {
    finRowY += 36;
    ctx.font = `600 17px ${fontFamily}`;
    ctx.fillStyle = "#6B7280";
    ctx.fillText(
      `Juros parcelamento (${pedido.parcelas || ""}x)`,
      resumoX + 28,
      finRowY
    );
    ctx.textAlign = "right";
    ctx.fillStyle = "#161616";
    ctx.fillText(
      `+ ${formatCurrency(jurosCalc)}`,
      resumoX + resumoW - 28,
      finRowY
    );
    ctx.textAlign = "left";
  }

  // Linha antes do Total
  finRowY += 24;
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(resumoX + 24, finRowY);
  ctx.lineTo(resumoX + resumoW - 24, finRowY);
  ctx.stroke();

  finRowY += 46;
  ctx.fillStyle = "#161616";
  ctx.font = `800 20px ${fontFamily}`;
  ctx.fillText("VALOR TOTAL", resumoX + 28, finRowY);

  ctx.textAlign = "right";
  ctx.fillStyle = "#E5007D";
  ctx.font = `800 30px ${fontFamily}`;
  ctx.fillText(formatCurrency(pedido.total), resumoX + resumoW - 28, finRowY);
  ctx.textAlign = "left";

  // 7. Rodapé com Local de Retirada e Protocolo do Cliente
  const footerY = H - 230;
  drawRoundedRect(ctx, padX, footerY, contentW, 155, 16);
  ctx.fillStyle = "#FAFAFB";
  ctx.fill();
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#161616";
  ctx.font = `800 16px ${fontFamily}`;
  ctx.fillText(
    `INFORMAÇÕES PARA RETIRADA · ${config.nome_loja.toUpperCase()}`,
    padX + 28,
    footerY + 38
  );

  ctx.fillStyle = "#374151";
  ctx.font = `600 16px ${fontFamily}`;
  ctx.fillText(
    `Endereço: ${config.endereco_retirada}`,
    padX + 28,
    footerY + 72
  );
  ctx.fillText(
    `Horário de atendimento: ${config.horario_retirada}   |   WhatsApp: ${maskWhatsApp(config.whatsapp_loja)}`,
    padX + 28,
    footerY + 102
  );

  ctx.fillStyle = "#6B7280";
  ctx.font = `600 14px ${fontFamily}`;
  ctx.fillText(
    "Apresente este documento (em PDF no celular ou impresso) ou informe o nº do pedido no momento da retirada.",
    padX + 28,
    footerY + 134
  );

  // Barra inferior CMYK
  cmykColors.forEach((color, idx) => {
    ctx.fillStyle = color;
    ctx.fillRect((W / 4) * idx, H - 12, W / 4 + 1, 12);
  });

  // Converte o canvas A4 em JPEG de alta qualidade e empacota em PDF nativo
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const base64 = dataUrl.split(",")[1];
  const binaryStr = window.atob(base64);
  const jpegBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    jpegBytes[i] = binaryStr.charCodeAt(i);
  }

  const pdfBlob = criarPdfA4DeJpeg(jpegBytes, W, H);
  const blobUrl = URL.createObjectURL(pdfBlob);

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `Pedido-${pedido.numero}-RS-Digital.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

/**
 * Abre a janela de visualização/impressão A4 com a logomarca vetorial RS Digital
 */
export function imprimirDocumentoPedido(
  pedido: DocumentoPedidoDados,
  config: LojaConfig
): void {
  if (typeof window === "undefined") return;

  const win = window.open("", "_blank", "width=860,height=980");
  if (!win) {
    void baixarDocumentoPedidoPDF(pedido, config);
    return;
  }

  const subtotalCalc =
    typeof pedido.subtotal === "number"
      ? pedido.subtotal
      : pedido.itens.reduce((acc, i) => acc + Number(i.valor || 0), 0);
  const descontoCalc = Number(pedido.desconto || 0);
  const jurosCalc = Number(pedido.juros || 0);
  const pagamentoFormatado = formatarFormaPagamento(pedido);

  const itensHtml = pedido.itens
    .map(
      (item, idx) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-weight:700;color:#6B7280;width:54px;">${String(idx + 1).padStart(2, "0")}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-weight:700;color:#161616;">${escapeHtml(item.nome_modulo)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-weight:800;color:#161616;text-align:right;white-space:nowrap;">${escapeHtml(formatCurrency(item.valor))}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Pedido #${escapeHtml(pedido.numero)} — ${escapeHtml(config.nome_loja)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #161616; background: #FFFFFF; padding: 28px; }
    .page { max-width: 760px; margin: 0 auto; border: 1.5px solid #E5E7EB; border-radius: 16px; overflow: hidden; }
    .cmyk-bar { display: grid; grid-template-columns: repeat(4, 1fr); height: 8px; }
    .content { padding: 28px 32px; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1.5px solid #E5E7EB; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .logo-svg { width: 58px; height: 58px; border: 1px solid #E5E7EB; border-radius: 14px; flex-shrink: 0; }
    .brand-title { font-size: 26px; line-height: 1; color: #161616; letter-spacing: -0.02em; }
    .brand-title strong { font-weight: 800; }
    .brand-title span { font-weight: 300; margin-left: 3px; }
    .brand-sub { font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 5px; }
    .order-box { text-align: center; border: 1.5px solid #161616; border-radius: 12px; padding: 10px 20px; background: #FAFAFB; }
    .order-box span { display: block; font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.08em; }
    .order-box strong { display: block; font-size: 22px; font-weight: 800; color: #161616; margin-top: 2px; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background: #F8FAFC; border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 18px; margin-top: 18px; }
    .meta-item span { display: block; font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.06em; }
    .meta-item strong { display: block; font-size: 14px; font-weight: 800; margin-top: 4px; }
    .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #161616; margin: 22px 0 10px; }
    .info-card { border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
    .info-row-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .info-row-3 { display: grid; grid-template-columns: 1.2fr 1.3fr 0.9fr; gap: 14px; padding-top: 12px; border-top: 1px solid #F1F5F9; }
    .info-field span { display: block; font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; }
    .info-field strong { display: block; font-size: 14px; font-weight: 700; color: #161616; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; font-size: 13px; }
    thead th { background: #161616; color: #FFFFFF; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left; }
    .summary-row { display: grid; grid-template-columns: 1fr 280px; gap: 18px; margin-top: 18px; align-items: start; }
    .pay-box { border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 16px; background: #FAFAFB; font-size: 12px; }
    .totals-box { border: 1.5px solid #161616; border-radius: 12px; padding: 14px 16px; background: #FAFAFB; font-size: 12px; }
    .totals-line { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals-final { display: flex; justify-content: space-between; align-items: baseline; padding-top: 10px; margin-top: 8px; border-top: 1px solid #E5E7EB; font-weight: 800; font-size: 15px; }
    .footer { margin-top: 22px; background: #FAFAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 18px; font-size: 11px; color: #4B5563; line-height: 1.5; }
    @media print {
      body { padding: 0; }
      .page { border: none; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="cmyk-bar">
      <div style="background:#00A0DC"></div>
      <div style="background:#E5007D"></div>
      <div style="background:#FFD200"></div>
      <div style="background:#161616"></div>
    </div>
    <div class="content">
      <div class="header">
        <div class="brand">
          <svg class="logo-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <rect width="120" height="120" rx="24" fill="#FFFFFF"/>
            <circle cx="48" cy="48" r="26" fill="#00A0DC" style="mix-blend-mode:multiply"/>
            <circle cx="72" cy="48" r="26" fill="#E5007D" style="mix-blend-mode:multiply"/>
            <circle cx="60" cy="70" r="26" fill="#FFD200" style="mix-blend-mode:multiply"/>
          </svg>
          <div>
            <div class="brand-title"><strong>RS</strong><span>Digital</span></div>
            <div class="brand-sub">Documento Oficial de Pedido · Módulos Escolares</div>
          </div>
        </div>
        <div class="order-box">
          <span>Pedido Nº</span>
          <strong>#${escapeHtml(pedido.numero)}</strong>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <span>Data da Solicitação</span>
          <strong>${escapeHtml(formatDateTimeBR(pedido.criado_em))}</strong>
        </div>
        <div class="meta-item">
          <span>Status</span>
          <strong style="color:#00A0DC">${escapeHtml(STATUS_PEDIDO_LABEL[pedido.status] || "Recebido")}</strong>
        </div>
        <div class="meta-item">
          <span>Previsão de Retirada</span>
          <strong style="color:#E5007D">${escapeHtml(formatDateBR(pedido.previsao_retirada))}</strong>
        </div>
      </div>

      <div class="section-title">Dados do Responsável e Material</div>
      <div class="info-card">
        <div class="info-row-2">
          <div class="info-field">
            <span>Responsável</span>
            <strong>${escapeHtml(pedido.responsavel_nome || pedido.aluno_nome)}</strong>
          </div>
          <div class="info-field">
            <span>WhatsApp</span>
            <strong>${pedido.whatsapp ? escapeHtml(maskWhatsApp(pedido.whatsapp)) : "—"}</strong>
          </div>
        </div>
        <div class="info-row-2" style="padding-top:12px;border-top:1px solid #F1F5F9;">
          <div class="info-field">
            <span>Colégio / Instituição</span>
            <strong>${escapeHtml(pedido.colegio_nome || "—")}</strong>
          </div>
          <div class="info-field">
            <span>Série / Ano</span>
            <strong>${escapeHtml(pedido.serie_nome || "—")}</strong>
          </div>
        </div>
      </div>

      <div class="section-title">Módulos Solicitados (${pedido.itens.length})</div>
      <table>
        <thead>
          <tr>
            <th style="width:54px">Item</th>
            <th>Módulo / Apostila</th>
            <th style="text-align:right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${itensHtml}
        </tbody>
      </table>

      <div class="summary-row">
        <div class="pay-box">
          <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;">Forma de Pagamento</div>
          <div style="font-size:14px;font-weight:800;color:#161616;margin-top:4px;">${escapeHtml(pagamentoFormatado)}</div>
          ${
            pedido.observacao
              ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #E5E7EB;">
                  <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;">Observação do Pedido</div>
                  <div style="font-size:12px;font-weight:600;color:#161616;margin-top:3px;">${escapeHtml(pedido.observacao)}</div>
                </div>`
              : ""
          }
        </div>

        <div class="totals-box">
          <div class="totals-line">
            <span style="color:#6B7280">Subtotal</span>
            <strong>${escapeHtml(formatCurrency(subtotalCalc))}</strong>
          </div>
          ${
            descontoCalc > 0
              ? `<div class="totals-line" style="color:#00A0DC;font-weight:700;">
                  <span>Desconto${pedido.cupom_codigo ? ` (${escapeHtml(pedido.cupom_codigo)})` : ""}</span>
                  <span>- ${escapeHtml(formatCurrency(descontoCalc))}</span>
                </div>`
              : ""
          }
          ${
            jurosCalc > 0
              ? `<div class="totals-line">
                  <span style="color:#6B7280">Juros (${pedido.parcelas || ""}x)</span>
                  <strong>+ ${escapeHtml(formatCurrency(jurosCalc))}</strong>
                </div>`
              : ""
          }
          <div class="totals-final">
            <span>Total do Pedido</span>
            <span style="font-size:19px;color:#E5007D">${escapeHtml(formatCurrency(pedido.total))}</span>
          </div>
        </div>
      </div>

      <div class="footer">
        <strong style="color:#161616;display:block;margin-bottom:3px;">Local de Retirada — ${escapeHtml(config.nome_loja)}</strong>
        <div>${escapeHtml(config.endereco_retirada)} · ${escapeHtml(config.horario_retirada)}</div>
        <div>WhatsApp de atendimento: <strong>${escapeHtml(maskWhatsApp(config.whatsapp_loja))}</strong></div>
      </div>
    </div>
    <div class="cmyk-bar">
      <div style="background:#00A0DC"></div>
      <div style="background:#E5007D"></div>
      <div style="background:#FFD200"></div>
      <div style="background:#161616"></div>
    </div>
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 250);
    };
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

function formatarFormaPagamentoOrcamento(orc: DocumentoOrcamentoDados): string {
  if (
    orc.forma_pagamento === "credito_parcelado" &&
    orc.parcelas &&
    orc.parcelas >= 2
  ) {
    const valorParcela = Number((orc.total / orc.parcelas).toFixed(2));
    return `Crédito parcelado em ${orc.parcelas}x de ${formatCurrency(valorParcela)}`;
  }
  return FORMA_PAGAMENTO_LABEL[orc.forma_pagamento] || "Pix";
}

/**
 * Gera e faz o download imediato do Documento de Orçamento em PDF (A4) com a logomarca RS Digital
 */
export async function baixarDocumentoOrcamentoPDF(
  orcamento: DocumentoOrcamentoDados,
  config: LojaConfig
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    if ("fonts" in document && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    // continua mesmo se fonts API não estiver disponível
  }

  const W = 1240;
  const H = 1754;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const fontFamily = "'Inter', 'Segoe UI', Arial, sans-serif";
  const padX = 76;
  const contentW = W - padX * 2;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // 1. Barra superior CMYK
  const barH = 14;
  const cmykColors = ["#00A0DC", "#E5007D", "#FFD200", "#161616"];
  cmykColors.forEach((color, idx) => {
    ctx.fillStyle = color;
    ctx.fillRect((W / 4) * idx, 0, W / 4 + 1, barH);
  });

  // 2. Cabeçalho com Logomarca Oficial RS Digital
  const headerTop = 58;
  const logoBoxSize = 96;
  const logoX = padX;
  const logoY = headerTop;

  ctx.save();
  drawRoundedRect(ctx, logoX, logoY, logoBoxSize, logoBoxSize, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#E5E7EB";
  ctx.stroke();

  const scale = logoBoxSize / 120;
  ctx.globalCompositeOperation = "multiply";

  ctx.beginPath();
  ctx.arc(logoX + 48 * scale, logoY + 48 * scale, 26 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "#00A0DC";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(logoX + 72 * scale, logoY + 48 * scale, 26 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "#E5007D";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(logoX + 60 * scale, logoY + 70 * scale, 26 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "#FFD200";
  ctx.fill();

  ctx.restore();

  const brandTextX = logoX + logoBoxSize + 22;
  ctx.fillStyle = "#161616";
  ctx.font = `800 42px ${fontFamily}`;
  ctx.fillText("RS", brandTextX, logoY + 46);
  const rsWidth = ctx.measureText("RS").width;

  ctx.font = `300 42px ${fontFamily}`;
  ctx.fillText("Digital", brandTextX + rsWidth + 10, logoY + 46);

  ctx.fillStyle = "#00A0DC";
  ctx.font = `800 16px ${fontFamily}`;
  ctx.fillText(
    "ORÇAMENTO DE MATERIAL ESCOLAR · PROPOSTA COMERCIAL",
    brandTextX,
    logoY + 76
  );

  // Bloco Código do Orçamento à direita do cabeçalho
  const badgeW = 290;
  const badgeH = 96;
  const badgeX = W - padX - badgeW;
  const badgeY = headerTop;

  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 16);
  ctx.fillStyle = "#FAFAFB";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#00A0DC";
  ctx.stroke();

  ctx.fillStyle = "#6B7280";
  ctx.font = `700 14px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.fillText("ORÇAMENTO Nº", badgeX + badgeW / 2, badgeY + 30);

  ctx.fillStyle = "#161616";
  ctx.font = `800 32px ${fontFamily}`;
  ctx.fillText(orcamento.codigo, badgeX + badgeW / 2, badgeY + 72);
  ctx.textAlign = "left";

  let curY = headerTop + logoBoxSize + 32;
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(W - padX, curY);
  ctx.stroke();

  // 3. Faixa de Emissão, Validade e Prazo de Produção
  curY += 28;
  const infoBarH = 104;
  drawRoundedRect(ctx, padX, curY, contentW, infoBarH, 16);
  ctx.fillStyle = "#F8FAFC";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#E5E7EB";
  ctx.stroke();

  const col3W = contentW / 3;

  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("DATA DE EMISSÃO", padX + 28, curY + 36);
  ctx.fillStyle = "#161616";
  ctx.font = `800 22px ${fontFamily}`;
  ctx.fillText(formatDateTimeBR(orcamento.criado_em), padX + 28, curY + 72);

  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("VALIDADE DA PROPOSTA", padX + col3W + 20, curY + 36);
  ctx.fillStyle = "#00A0DC";
  ctx.font = `800 22px ${fontFamily}`;
  ctx.fillText(
    `${orcamento.validade_dias} dias corridos`,
    padX + col3W + 20,
    curY + 72
  );

  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("PRAZO DE PRODUÇÃO", padX + col3W * 2 + 20, curY + 36);
  ctx.fillStyle = "#E5007D";
  ctx.font = `800 22px ${fontFamily}`;
  ctx.fillText(
    `${config.prazo_dias} dias após confirmação`,
    padX + col3W * 2 + 20,
    curY + 72
  );

  // 4. Dados do Cliente e Material
  curY += infoBarH + 34;
  ctx.fillStyle = "#161616";
  ctx.font = `800 18px ${fontFamily}`;
  ctx.fillText("DADOS DO CLIENTE E MATERIAL ESCOLAR", padX, curY);

  curY += 16;
  const clienteBoxH = 188;
  drawRoundedRect(ctx, padX, curY, contentW, clienteBoxH, 16);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#E5E7EB";
  ctx.stroke();

  const halfW = contentW / 2;

  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("CLIENTE / RESPONSÁVEL", padX + 28, curY + 38);
  ctx.fillText("CONTATO (WHATSAPP / E-MAIL)", padX + halfW + 20, curY + 38);

  ctx.fillStyle = "#161616";
  ctx.font = `800 21px ${fontFamily}`;
  ctx.fillText(
    fitTextCanvas(ctx, orcamento.cliente_nome || "Cliente RS Digital", halfW - 48),
    padX + 28,
    curY + 70
  );

  const contatoTexto = [
    orcamento.whatsapp ? maskWhatsApp(orcamento.whatsapp) : "",
    orcamento.email ? orcamento.email.trim() : "",
  ]
    .filter(Boolean)
    .join(" · ") || "—";

  ctx.font = `700 18px ${fontFamily}`;
  ctx.fillText(
    fitTextCanvas(ctx, contatoTexto, halfW - 48),
    padX + halfW + 20,
    curY + 70
  );

  ctx.strokeStyle = "#F1F5F9";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX + 24, curY + 94);
  ctx.lineTo(W - padX - 24, curY + 94);
  ctx.stroke();

  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("COLÉGIO / INSTITUIÇÃO", padX + 28, curY + 126);
  ctx.fillText("SÉRIE / ANO", padX + halfW + 20, curY + 126);

  ctx.fillStyle = "#161616";
  ctx.font = `700 19px ${fontFamily}`;
  ctx.fillText(
    fitTextCanvas(ctx, orcamento.colegio_nome || "—", halfW - 48),
    padX + 28,
    curY + 158
  );
  ctx.fillText(
    fitTextCanvas(ctx, orcamento.serie_nome || "—", halfW - 48),
    padX + halfW + 20,
    curY + 158
  );

  // 5. Tabela de Módulos Orçados
  curY += clienteBoxH + 38;
  ctx.fillStyle = "#161616";
  ctx.font = `800 18px ${fontFamily}`;
  ctx.fillText(
    `MÓDULOS / APOSTILAS ORÇADAS (${orcamento.itens.length})`,
    padX,
    curY
  );

  curY += 16;
  const tableHeaderH = 52;
  drawRoundedRect(ctx, padX, curY, contentW, tableHeaderH, 12);
  ctx.fillStyle = "#161616";
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 14px ${fontFamily}`;
  ctx.fillText("ITEM", padX + 24, curY + 31);
  ctx.fillText("DESCRIÇÃO DO MÓDULO / APOSTILA", padX + 110, curY + 31);
  ctx.textAlign = "right";
  ctx.fillText("VALOR", W - padX - 28, curY + 31);
  ctx.textAlign = "left";

  curY += tableHeaderH;
  const maxDescW = contentW - 290;
  orcamento.itens.forEach((item, index) => {
    ctx.font = `700 18px ${fontFamily}`;
    const descLines = wrapTextCanvas(ctx, item.nome_modulo, maxDescW).slice(0, 2);
    const rowH = descLines.length > 1 ? 74 : 56;
    const rowY = curY;

    ctx.fillStyle = index % 2 === 0 ? "#FFFFFF" : "#FAFAFB";
    ctx.fillRect(padX, rowY, contentW, rowH);

    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, rowY + rowH);
    ctx.lineTo(W - padX, rowY + rowH);
    ctx.stroke();

    ctx.fillStyle = "#6B7280";
    ctx.font = `700 16px ${fontFamily}`;
    ctx.fillText(
      String(index + 1).padStart(2, "0"),
      padX + 24,
      rowY + (descLines.length > 1 ? 32 : 35)
    );

    ctx.fillStyle = "#161616";
    ctx.font = `700 18px ${fontFamily}`;
    descLines.forEach((line, lineIdx) => {
      ctx.fillText(
        line,
        padX + 110,
        rowY + (descLines.length > 1 ? 30 + lineIdx * 24 : 35)
      );
    });

    ctx.textAlign = "right";
    ctx.font = `800 18px ${fontFamily}`;
    ctx.fillText(
      formatCurrency(item.valor),
      W - padX - 28,
      rowY + (descLines.length > 1 ? 32 : 35)
    );
    ctx.textAlign = "left";

    curY += rowH;
  });

  curY += 28;

  // 6. Forma de pagamento + Observação + Resumo Financeiro
  const resumoW = 460;
  const resumoX = W - padX - resumoW;
  const leftColW = contentW - resumoW - 32;

  let leftY = curY;
  drawRoundedRect(ctx, padX, leftY, leftColW, 110, 14);
  ctx.fillStyle = "#FAFAFB";
  ctx.fill();
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#6B7280";
  ctx.font = `700 13px ${fontFamily}`;
  ctx.fillText("CONDIÇÃO DE PAGAMENTO SIMULADA", padX + 24, leftY + 36);

  ctx.fillStyle = "#161616";
  ctx.font = `800 20px ${fontFamily}`;
  ctx.fillText(formatarFormaPagamentoOrcamento(orcamento), padX + 24, leftY + 74);

  if (orcamento.observacao && orcamento.observacao.trim() !== "") {
    leftY += 126;
    ctx.font = `600 16px ${fontFamily}`;
    const obsLines = wrapTextCanvas(
      ctx,
      orcamento.observacao.trim(),
      leftColW - 48
    ).slice(0, 3);
    const obsBoxH = 56 + obsLines.length * 24;

    drawRoundedRect(ctx, padX, leftY, leftColW, obsBoxH, 14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#6B7280";
    ctx.font = `700 13px ${fontFamily}`;
    ctx.fillText("OBSERVAÇÕES DO ORÇAMENTO", padX + 24, leftY + 32);

    ctx.fillStyle = "#161616";
    ctx.font = `600 16px ${fontFamily}`;
    obsLines.forEach((line, idx) => {
      ctx.fillText(line, padX + 24, leftY + 62 + idx * 24);
    });
  }

  const subtotalCalc = Number(orcamento.subtotal || 0);
  const descontoCalc = Number(orcamento.desconto || 0);
  const jurosCalc = Number(orcamento.juros || 0);

  let finBoxH = 150;
  if (descontoCalc > 0) finBoxH += 36;
  if (jurosCalc > 0) finBoxH += 36;

  drawRoundedRect(ctx, resumoX, curY, resumoW, finBoxH, 16);
  ctx.fillStyle = "#FAFAFB";
  ctx.fill();
  ctx.strokeStyle = "#161616";
  ctx.lineWidth = 2;
  ctx.stroke();

  let finRowY = curY + 42;
  ctx.font = `600 17px ${fontFamily}`;
  ctx.fillStyle = "#6B7280";
  ctx.fillText("Subtotal dos módulos", resumoX + 28, finRowY);
  ctx.textAlign = "right";
  ctx.fillStyle = "#161616";
  ctx.font = `700 17px ${fontFamily}`;
  ctx.fillText(formatCurrency(subtotalCalc), resumoX + resumoW - 28, finRowY);
  ctx.textAlign = "left";

  if (descontoCalc > 0) {
    finRowY += 36;
    ctx.font = `700 17px ${fontFamily}`;
    ctx.fillStyle = "#00A0DC";
    const labelCupom = orcamento.cupom_codigo
      ? `Desconto (${orcamento.cupom_codigo})`
      : "Desconto";
    ctx.fillText(labelCupom, resumoX + 28, finRowY);
    ctx.textAlign = "right";
    ctx.fillText(
      `- ${formatCurrency(descontoCalc)}`,
      resumoX + resumoW - 28,
      finRowY
    );
    ctx.textAlign = "left";
  }

  if (jurosCalc > 0) {
    finRowY += 36;
    ctx.font = `600 17px ${fontFamily}`;
    ctx.fillStyle = "#6B7280";
    ctx.fillText(
      `Juros parcelamento (${orcamento.parcelas || ""}x)`,
      resumoX + 28,
      finRowY
    );
    ctx.textAlign = "right";
    ctx.fillStyle = "#161616";
    ctx.fillText(
      `+ ${formatCurrency(jurosCalc)}`,
      resumoX + resumoW - 28,
      finRowY
    );
    ctx.textAlign = "left";
  }

  finRowY += 24;
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(resumoX + 24, finRowY);
  ctx.lineTo(resumoX + resumoW - 24, finRowY);
  ctx.stroke();

  finRowY += 46;
  ctx.fillStyle = "#161616";
  ctx.font = `800 20px ${fontFamily}`;
  ctx.fillText("TOTAL DO ORÇAMENTO", resumoX + 28, finRowY);

  ctx.textAlign = "right";
  ctx.fillStyle = "#E5007D";
  ctx.font = `800 30px ${fontFamily}`;
  ctx.fillText(formatCurrency(orcamento.total), resumoX + resumoW - 28, finRowY);
  ctx.textAlign = "left";

  // 7. Rodapé com Contato e Local da Loja
  const footerY = H - 230;
  drawRoundedRect(ctx, padX, footerY, contentW, 155, 16);
  ctx.fillStyle = "#FAFAFB";
  ctx.fill();
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#161616";
  ctx.font = `800 16px ${fontFamily}`;
  ctx.fillText(
    `ATENDIMENTO E RETIRADA · ${config.nome_loja.toUpperCase()}`,
    padX + 28,
    footerY + 38
  );

  ctx.fillStyle = "#374151";
  ctx.font = `600 16px ${fontFamily}`;
  ctx.fillText(
    `Endereço: ${config.endereco_retirada}`,
    padX + 28,
    footerY + 72
  );
  ctx.fillText(
    `Horário de atendimento: ${config.horario_retirada}   |   WhatsApp: ${maskWhatsApp(config.whatsapp_loja)}`,
    padX + 28,
    footerY + 102
  );

  ctx.fillStyle = "#6B7280";
  ctx.font = `600 14px ${fontFamily}`;
  ctx.fillText(
    "Para aprovar este orçamento e iniciar a produção, confirme pelo nosso WhatsApp ou acesse a página de pedidos.",
    padX + 28,
    footerY + 134
  );

  cmykColors.forEach((color, idx) => {
    ctx.fillStyle = color;
    ctx.fillRect((W / 4) * idx, H - 12, W / 4 + 1, 12);
  });

  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const base64 = dataUrl.split(",")[1];
  const binaryStr = window.atob(base64);
  const jpegBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    jpegBytes[i] = binaryStr.charCodeAt(i);
  }

  const pdfBlob = criarPdfA4DeJpeg(jpegBytes, W, H);
  const blobUrl = URL.createObjectURL(pdfBlob);

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `Orcamento-${orcamento.codigo}-RS-Digital.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

/**
 * Abre a janela de visualização/impressão A4 do Orçamento com a logomarca vetorial RS Digital
 */
export function imprimirDocumentoOrcamento(
  orcamento: DocumentoOrcamentoDados,
  config: LojaConfig
): void {
  if (typeof window === "undefined") return;

  const win = window.open("", "_blank", "width=860,height=980");
  if (!win) {
    void baixarDocumentoOrcamentoPDF(orcamento, config);
    return;
  }

  const subtotalCalc = Number(orcamento.subtotal || 0);
  const descontoCalc = Number(orcamento.desconto || 0);
  const jurosCalc = Number(orcamento.juros || 0);
  const pagamentoFormatado = formatarFormaPagamentoOrcamento(orcamento);

  const itensHtml = orcamento.itens
    .map(
      (item, idx) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-weight:700;color:#6B7280;width:54px;">${String(idx + 1).padStart(2, "0")}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-weight:700;color:#161616;">${escapeHtml(item.nome_modulo)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-weight:800;color:#161616;text-align:right;white-space:nowrap;">${escapeHtml(formatCurrency(item.valor))}</td>
      </tr>`
    )
    .join("");

  const contatoStr = [
    orcamento.whatsapp ? maskWhatsApp(orcamento.whatsapp) : "",
    orcamento.email || "",
  ]
    .filter(Boolean)
    .join(" · ") || "—";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Orçamento ${escapeHtml(orcamento.codigo)} — ${escapeHtml(config.nome_loja)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #161616; background: #FFFFFF; padding: 28px; }
    .page { max-width: 760px; margin: 0 auto; border: 1.5px solid #E5E7EB; border-radius: 16px; overflow: hidden; }
    .cmyk-bar { display: grid; grid-template-columns: repeat(4, 1fr); height: 8px; }
    .content { padding: 28px 32px; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1.5px solid #E5E7EB; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .logo-svg { width: 58px; height: 58px; border: 1px solid #E5E7EB; border-radius: 14px; flex-shrink: 0; }
    .brand-title { font-size: 26px; line-height: 1; color: #161616; letter-spacing: -0.02em; }
    .brand-title strong { font-weight: 800; }
    .brand-title span { font-weight: 300; margin-left: 3px; }
    .brand-sub { font-size: 10px; font-weight: 800; color: #00A0DC; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 5px; }
    .order-box { text-align: center; border: 1.5px solid #00A0DC; border-radius: 12px; padding: 10px 20px; background: #FAFAFB; }
    .order-box span { display: block; font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.08em; }
    .order-box strong { display: block; font-size: 20px; font-weight: 800; color: #161616; margin-top: 2px; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background: #F8FAFC; border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 18px; margin-top: 18px; }
    .meta-item span { display: block; font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.06em; }
    .meta-item strong { display: block; font-size: 14px; font-weight: 800; margin-top: 4px; }
    .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #161616; margin: 22px 0 10px; }
    .info-card { border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
    .info-row-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .info-field span { display: block; font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; }
    .info-field strong { display: block; font-size: 14px; font-weight: 700; color: #161616; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; font-size: 13px; }
    thead th { background: #161616; color: #FFFFFF; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left; }
    .summary-row { display: grid; grid-template-columns: 1fr 280px; gap: 18px; margin-top: 18px; align-items: start; }
    .pay-box { border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 16px; background: #FAFAFB; font-size: 12px; }
    .totals-box { border: 1.5px solid #161616; border-radius: 12px; padding: 14px 16px; background: #FAFAFB; font-size: 12px; }
    .totals-line { display: flex; justify-content: space-between; padding: 4px 0; }
    .totals-final { display: flex; justify-content: space-between; align-items: baseline; padding-top: 10px; margin-top: 8px; border-top: 1px solid #E5E7EB; font-weight: 800; font-size: 15px; }
    .footer { margin-top: 22px; background: #FAFAFB; border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 18px; font-size: 11px; color: #4B5563; line-height: 1.5; }
    @media print {
      body { padding: 0; }
      .page { border: none; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="cmyk-bar">
      <div style="background:#00A0DC"></div>
      <div style="background:#E5007D"></div>
      <div style="background:#FFD200"></div>
      <div style="background:#161616"></div>
    </div>
    <div class="content">
      <div class="header">
        <div class="brand">
          <svg class="logo-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <rect width="120" height="120" rx="24" fill="#FFFFFF"/>
            <circle cx="48" cy="48" r="26" fill="#00A0DC" style="mix-blend-mode:multiply"/>
            <circle cx="72" cy="48" r="26" fill="#E5007D" style="mix-blend-mode:multiply"/>
            <circle cx="60" cy="70" r="26" fill="#FFD200" style="mix-blend-mode:multiply"/>
          </svg>
          <div>
            <div class="brand-title"><strong>RS</strong><span>Digital</span></div>
            <div class="brand-sub">Orçamento de Material Escolar · Proposta Comercial</div>
          </div>
        </div>
        <div class="order-box">
          <span>Orçamento Nº</span>
          <strong>${escapeHtml(orcamento.codigo)}</strong>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <span>Data de Emissão</span>
          <strong>${escapeHtml(formatDateTimeBR(orcamento.criado_em))}</strong>
        </div>
        <div class="meta-item">
          <span>Validade</span>
          <strong style="color:#00A0DC">${escapeHtml(String(orcamento.validade_dias))} dias corridos</strong>
        </div>
        <div class="meta-item">
          <span>Prazo de Produção</span>
          <strong style="color:#E5007D">${escapeHtml(String(config.prazo_dias))} dias após confirmação</strong>
        </div>
      </div>

      <div class="section-title">Dados do Cliente e Material Escolar</div>
      <div class="info-card">
        <div class="info-row-2">
          <div class="info-field">
            <span>Cliente / Responsável</span>
            <strong>${escapeHtml(orcamento.cliente_nome || "Cliente RS Digital")}</strong>
          </div>
          <div class="info-field">
            <span>Contato (WhatsApp / E-mail)</span>
            <strong>${escapeHtml(contatoStr)}</strong>
          </div>
        </div>
        <div class="info-row-2" style="padding-top:12px;border-top:1px solid #F1F5F9;">
          <div class="info-field">
            <span>Colégio / Instituição</span>
            <strong>${escapeHtml(orcamento.colegio_nome || "—")}</strong>
          </div>
          <div class="info-field">
            <span>Série / Ano</span>
            <strong>${escapeHtml(orcamento.serie_nome || "—")}</strong>
          </div>
        </div>
      </div>

      <div class="section-title">Módulos Orçados (${orcamento.itens.length})</div>
      <table>
        <thead>
          <tr>
            <th style="width:54px">Item</th>
            <th>Módulo / Apostila</th>
            <th style="text-align:right">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${itensHtml}
        </tbody>
      </table>

      <div class="summary-row">
        <div class="pay-box">
          <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;">Condição de Pagamento Simulada</div>
          <div style="font-size:14px;font-weight:800;color:#161616;margin-top:4px;">${escapeHtml(pagamentoFormatado)}</div>
          ${
            orcamento.observacao
              ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #E5E7EB;">
                  <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;">Observações do Orçamento</div>
                  <div style="font-size:12px;font-weight:600;color:#161616;margin-top:3px;">${escapeHtml(orcamento.observacao)}</div>
                </div>`
              : ""
          }
        </div>

        <div class="totals-box">
          <div class="totals-line">
            <span style="color:#6B7280">Subtotal</span>
            <strong>${escapeHtml(formatCurrency(subtotalCalc))}</strong>
          </div>
          ${
            descontoCalc > 0
              ? `<div class="totals-line" style="color:#00A0DC;font-weight:700;">
                  <span>Desconto${orcamento.cupom_codigo ? ` (${escapeHtml(orcamento.cupom_codigo)})` : ""}</span>
                  <span>- ${escapeHtml(formatCurrency(descontoCalc))}</span>
                </div>`
              : ""
          }
          ${
            jurosCalc > 0
              ? `<div class="totals-line">
                  <span style="color:#6B7280">Juros (${orcamento.parcelas || ""}x)</span>
                  <strong>+ ${escapeHtml(formatCurrency(jurosCalc))}</strong>
                </div>`
              : ""
          }
          <div class="totals-final">
            <span>Total do Orçamento</span>
            <span style="font-size:19px;color:#E5007D">${escapeHtml(formatCurrency(orcamento.total))}</span>
          </div>
        </div>
      </div>

      <div class="footer">
        <strong style="color:#161616;display:block;margin-bottom:3px;">Atendimento e Retirada — ${escapeHtml(config.nome_loja)}</strong>
        <div>${escapeHtml(config.endereco_retirada)} · ${escapeHtml(config.horario_retirada)}</div>
        <div>WhatsApp de atendimento: <strong>${escapeHtml(maskWhatsApp(config.whatsapp_loja))}</strong></div>
      </div>
    </div>
    <div class="cmyk-bar">
      <div style="background:#00A0DC"></div>
      <div style="background:#E5007D"></div>
      <div style="background:#FFD200"></div>
      <div style="background:#161616"></div>
    </div>
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 250);
    };
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

