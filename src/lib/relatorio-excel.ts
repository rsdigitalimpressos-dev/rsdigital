import {
  LancamentoCategoria,
  LancamentoFinanceiro,
  LancamentoTipo,
  LojaConfig,
  Pedido,
} from "@/types/database";
import {
  FORMA_PAGAMENTO_LABEL,
  formatDateBR,
  formatDateTimeBR,
  maskWhatsApp,
  STATUS_PEDIDO_LABEL,
  toLocalDateISO,
} from "@/lib/format";

// ============================================================================
// GERADOR EXCEL (.XLSX) PADRÃO MICROSOFT EXCEL (COM sharedStrings.xml)
// ============================================================================
// - Compatível 100% com Microsoft Excel, Google Planilhas, LibreOffice e WPS
// - Usa tabela oficial sharedStrings.xml (t="s") para que todos os textos apareçam
// - Simples, objetivo e nas cores da marca RS Digital (#00A0DC, #E5007D, #FFD200, #161616)
// ============================================================================

export type ExcelStyleId =
  | 0 // Padrão
  | 1 // Título Principal Preto (#161616) texto Branco 13pt Bold
  | 2 // Subtítulo Cinza Claro (#F8FAFC) texto Cinza Escuro 10pt Bold
  | 3 // Faixa Ciano da Marca (#00A0DC)
  | 4 // Faixa Magenta da Marca (#E5007D)
  | 5 // Faixa Amarela da Marca (#FFD200)
  | 6 // Faixa Preta da Marca (#161616)
  | 7 // Cabeçalho da Tabela Preto (#161616) texto Branco Bold Centralizado
  | 8 // Cabeçalho da Tabela Ciano (#00A0DC) texto Branco Bold Centralizado
  | 9 // Cabeçalho da Tabela Magenta (#E5007D) texto Branco Bold Centralizado
  | 10 // Linha Branca — Texto Esquerda
  | 11 // Linha Zebra (#F8FAFC) — Texto Esquerda
  | 12 // Linha Branca — Texto Centralizado
  | 13 // Linha Zebra (#F8FAFC) — Texto Centralizado
  | 14 // Linha Branca — Moeda (R$ #,##0.00)
  | 15 // Linha Zebra (#F8FAFC) — Moeda (R$ #,##0.00)
  | 16 // Valor Entrada / Pago — Verde (#047857, fundo #ECFDF5, Bold)
  | 17 // Valor Saída / Gasto — Magenta (#E5007D, fundo #FDF2F8, Bold)
  | 18 // Etiqueta Azul Ciano Suave (Em produção / Recebido)
  | 19 // Etiqueta Amarela da Marca (Pronto p/ Retirada / Falta Pagar)
  | 20 // Etiqueta Verde Suave (Entregue / Pago / Entrada)
  | 21 // Etiqueta Rosa/Magenta Suave (Saída / Cancelado)
  | 22 // Rodapé de Total Preto (#161616) — Texto Branco Bold
  | 23 // Rodapé de Total Preto (#161616) — Moeda Amarela (#FFD200) 11pt Bold
  | 24 // Card Resumo — Título Superior (#F1F5F9, texto #161616 9pt Bold)
  | 25 // Card Resumo — Texto/Número Ciano (#00A0DC 12pt Bold)
  | 26 // Card Resumo — Valor Moeda Verde (#047857 12pt Bold)
  | 27 // Card Resumo — Valor Moeda Magenta (#E5007D 12pt Bold)
  | 28; // Card Resumo — Valor Moeda Amarelo/Preto (#161616 12pt Bold)

export interface ExcelCell {
  v: string | number;
  t?: "s" | "n";
  s?: ExcelStyleId;
}

export interface ExcelMerge {
  sR: number; // 0-based row
  sC: number; // 0-based col
  eR: number;
  eC: number;
}

export interface ExcelWorksheetData {
  name: string;
  tabColorHex?: string;
  freezeRow?: number;
  colWidths: number[];
  rows: {
    height?: number;
    cells: (ExcelCell | null)[];
  }[];
  merges?: ExcelMerge[];
}

function escapeXml(str: string): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colIndexToLetter(colIdx: number): string {
  let n = colIdx + 1;
  let str = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    str = String.fromCharCode(65 + rem) + str;
    n = Math.floor((n - 1) / 26);
  }
  return str;
}

function cellRef(rowIdx: number, colIdx: number): string {
  return `${colIndexToLetter(colIdx)}${rowIdx + 1}`;
}

function buildStylesXml(): string {
  // Tipografia padronizada (Calibri 10pt em toda a planilha; 11pt apenas no título)
  // Visual limpo e sóbrio, sem excesso de cores nas células de dados
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="&quot;R$ &quot;#,##0.00;&quot;-R$ &quot;#,##0.00;&quot;R$ &quot;0.00"/>
  </numFmts>
  <fonts count="13">
    <font><sz val="10"/><color rgb="FF161616"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="10"/><color rgb="FF4B5563"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF161616"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF161616"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF161616"/><name val="Calibri"/><family val="2"/></font>
    <font><sz val="10"/><color rgb="FF161616"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF161616"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF4B5563"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF161616"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF161616"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF161616"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="14">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF161616"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF00A0DC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE5007D"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFD200"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF9FAFB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="4">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE5E7EB"/></left>
      <right style="thin"><color rgb="FFE5E7EB"/></right>
      <top style="thin"><color rgb="FFE5E7EB"/></top>
      <bottom style="thin"><color rgb="FFE5E7EB"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="medium"><color rgb="FF161616"/></top>
      <bottom style="medium"><color rgb="FF161616"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFD1D5DB"/></left>
      <right style="thin"><color rgb="FFD1D5DB"/></right>
      <top style="thin"><color rgb="FFD1D5DB"/></top>
      <bottom style="thin"><color rgb="FFD1D5DB"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="29">
    <!-- 0: Padrão -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: Título Principal (#161616) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 2: Subtítulo Cinza Sutil (#F9FAFB) -->
    <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 3: Detalhe Ciano (#00A0DC) -->
    <xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 4: Detalhe Magenta (#E5007D) -->
    <xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 5: Detalhe Amarelo (#FFD200) -->
    <xf numFmtId="0" fontId="4" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 6: Detalhe Preto (#161616) -->
    <xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 7: Cabeçalho Tabela Escuro (#161616) -->
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 8: Cabeçalho Tabela Escuro Unificado (#161616) -->
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 9: Cabeçalho Tabela Escuro Unificado (#161616) -->
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 10: Linha Branca Esquerda -->
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 11: Linha Zebra Sutil Esquerda -->
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 12: Linha Branca Centro -->
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 13: Linha Zebra Sutil Centro -->
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 14: Moeda Branca -->
    <xf numFmtId="164" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 15: Moeda Zebra Sutil -->
    <xf numFmtId="164" fontId="4" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 16: Moeda Limpa (Sem fundo colorido) -->
    <xf numFmtId="164" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 17: Moeda Limpa (Sem fundo colorido) -->
    <xf numFmtId="164" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 18..21: Células de Status Limpas (Fundo branco, texto padronizado 10pt) -->
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 22: Rodapé Total Cinza Claro (#F3F4F6) — Texto Preto Bold 10pt -->
    <xf numFmtId="0" fontId="4" fillId="12" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 23: Rodapé Total Cinza Claro (#F3F4F6) — Moeda Preta Bold 10pt -->
    <xf numFmtId="164" fontId="4" fillId="12" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 24: Card Resumo Título Superior (#F3F4F6, texto 10pt Bold) -->
    <xf numFmtId="0" fontId="9" fillId="12" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 25..28: Card Resumo Valores (Fundo Branco Limpo, texto Preto Bold 10pt) -->
    <xf numFmtId="0" fontId="4" fillId="6" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="4" fillId="6" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="4" fillId="6" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="4" fillId="6" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

class SharedStringsTable {
  private map = new Map<string, number>();
  private list: string[] = [];
  public totalRefs = 0;

  public add(text: string): number {
    this.totalRefs += 1;
    const str = String(text ?? "");
    const existing = this.map.get(str);
    if (existing !== undefined) {
      return existing;
    }
    const idx = this.list.length;
    this.list.push(str);
    this.map.set(str, idx);
    return idx;
  }

  public toXml(): string {
    const items = this.list
      .map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`)
      .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.totalRefs}" uniqueCount="${this.list.length}">${items}</sst>`;
  }
}

function buildWorksheetXml(
  sheet: ExcelWorksheetData,
  sst: SharedStringsTable
): string {
  const colsXml = sheet.colWidths
    .map(
      (w, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`
    )
    .join("");

  let maxColIdx = Math.max(0, sheet.colWidths.length - 1);
  const maxRowIdx = Math.max(0, sheet.rows.length - 1);

  const rowsXml = sheet.rows
    .map((row, rIdx) => {
      const htAttr = row.height
        ? ` ht="${row.height}" customHeight="1"`
        : ` ht="22" customHeight="1"`;
      const cellsXml = row.cells
        .map((cell, cIdx) => {
          if (!cell) return "";
          if (cIdx > maxColIdx) maxColIdx = cIdx;
          const ref = cellRef(rIdx, cIdx);
          const sAttr = cell.s !== undefined ? ` s="${cell.s}"` : "";
          const isNum =
            cell.t === "n" ||
            (typeof cell.v === "number" && Number.isFinite(cell.v));
          if (isNum) {
            return `<c r="${ref}"${sAttr}><v>${Number(cell.v)}</v></c>`;
          }
          const strVal = String(cell.v ?? "");
          const sstIdx = sst.add(strVal);
          return `<c r="${ref}" t="s"${sAttr}><v>${sstIdx}</v></c>`;
        })
        .join("");
      return `<row r="${rIdx + 1}"${htAttr}>${cellsXml}</row>`;
    })
    .join("");

  const mergesXml =
    sheet.merges && sheet.merges.length > 0
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
          .map(
            (m) =>
              `<mergeCell ref="${cellRef(m.sR, m.sC)}:${cellRef(m.eR, m.eC)}"/>`
          )
          .join("")}</mergeCells>`
      : "";

  const dimRef = `A1:${cellRef(maxRowIdx, maxColIdx)}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimRef}"/>
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0" showGridLines="1"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="22"/>
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
  ${mergesXml}
</worksheet>`;
}

// ============================================================================
// EMPACOTADOR ZIP PARA ARQUIVO .XLSX NATIVO (COM COMPRESSÃO DEFLATE)
// ============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRawBytes(
  input: Uint8Array
): Promise<{ compressed: Uint8Array; method: number }> {
  try {
    if (typeof CompressionStream !== "undefined") {
      const cs = new CompressionStream("deflate-raw");
      const writer = cs.writable.getWriter();
      writer.write(input as unknown as BufferSource);
      writer.close();
      const response = new Response(cs.readable);
      const buffer = await response.arrayBuffer();
      return { compressed: new Uint8Array(buffer), method: 8 };
    }
  } catch {
    // Fallback para STORE caso CompressionStream não esteja disponível
  }
  return { compressed: input, method: 0 };
}

async function createZipBlob(
  files: { path: string; content: string }[],
  mimeType: string
): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const rawBytes = encoder.encode(file.content);
    const crc = crc32(rawBytes);
    const uncompressedSize = rawBytes.byteLength;
    const { compressed, method } = await deflateRawBytes(rawBytes);
    const compressedSize = compressed.byteLength;

    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressedSize, true);
    lv.setUint32(22, uncompressedSize, true);
    lv.setUint16(26, nameBytes.byteLength, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, compressed);

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressedSize, true);
    cv.setUint32(24, uncompressedSize, true);
    cv.setUint16(28, nameBytes.byteLength, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.byteLength + compressedSize;
  }

  const centralSize = centralParts.reduce((acc, p) => acc + p.byteLength, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob(
    [...localParts, ...centralParts, eocd] as BlobPart[],
    { type: mimeType }
  );
}

async function downloadXlsxWorkbook(
  sheets: ExcelWorksheetData[],
  fileName: string
): Promise<void> {
  if (typeof window === "undefined") return;

  const sst = new SharedStringsTable();
  const sheetXmls = sheets.map((s) => buildWorksheetXml(s, sst));

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("\n  ")}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/>
  </bookViews>
  <sheets>
    ${sheets
      .map(
        (s, i) =>
          `<sheet name="${escapeXml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
      )
      .join("\n    ")}
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join("\n  ")}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const files: { path: string; content: string }[] = [
    { path: "[Content_Types].xml", content: contentTypesXml },
    { path: "_rels/.rels", content: rootRelsXml },
    { path: "xl/workbook.xml", content: workbookXml },
    { path: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
    { path: "xl/styles.xml", content: buildStylesXml() },
    { path: "xl/sharedStrings.xml", content: sst.toXml() },
  ];

  sheetXmls.forEach((xml, idx) => {
    files.push({
      path: `xl/worksheets/sheet${idx + 1}.xml`,
      content: xml,
    });
  });

  const blob = await createZipBlob(
    files,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ============================================================================
// 1. RELATÓRIO DE PEDIDOS — SIMPLES, DIRETO E PRÁTICO (8 COLUNAS CLARAS)
// ============================================================================

export function exportarRelatorioPedidosExcel(params: {
  pedidos: Pedido[];
  config: LojaConfig;
  dataInicio?: string;
  dataFim?: string;
  filtroStatusLabel?: string;
}): void {
  const { pedidos, config, dataInicio, dataFim } = params;
  const numCols = 8;

  const periodoTexto =
    dataInicio || dataFim
      ? `${dataInicio ? formatDateBR(dataInicio) : "Início"} até ${
          dataFim ? formatDateBR(dataFim) : "Hoje"
        }`
      : "Todos os pedidos";

  const pedidosAtivos = pedidos.filter((p) => p.status !== "cancelado");
  const qtdFaltaEntregar = pedidosAtivos.filter(
    (p) => p.status !== "entregue"
  ).length;
  const totalPagoReal = pedidosAtivos
    .filter((p) => p.pago)
    .reduce((acc, p) => acc + Math.max(0, p.total - (p.juros || 0)), 0);
  const totalFaltaReceber = pedidosAtivos
    .filter((p) => !p.pago)
    .reduce((acc, p) => acc + Math.max(0, p.total - (p.juros || 0)), 0);
  const totalGeralReal = pedidosAtivos.reduce(
    (acc, p) => acc + Math.max(0, p.total - (p.juros || 0)),
    0
  );

  // Linha 1: Faixa fina com as 4 cores da marca RS Digital
  const cmykRow: ExcelCell[] = [
    { v: " ", s: 3 },
    { v: " ", s: 3 },
    { v: " ", s: 4 },
    { v: " ", s: 4 },
    { v: " ", s: 5 },
    { v: " ", s: 5 },
    { v: " ", s: 6 },
    { v: " ", s: 6 },
  ];

  // Linha 2: Título Simples e Direto
  const bannerRow: ExcelCell[] = Array.from({ length: numCols }, (_, i) => ({
    v:
      i === 0
        ? `  ${config.nome_loja.toUpperCase()} — CONTROLE DE PEDIDOS`
        : "",
    s: 1,
  }));

  // Linha 3: Data e Período
  const metaRow: ExcelCell[] = Array.from({ length: numCols }, (_, i) => ({
    v:
      i === 0
        ? `  Período: ${periodoTexto}   |   Gerado em: ${formatDateTimeBR(
            new Date().toISOString()
          )}`
        : "",
    s: 2,
  }));

  // Linhas 5 e 6: 4 Blocos de Resumo Fácil no Topo (2 colunas cada)
  const kpiCards = [
    {
      startCol: 0,
      endCol: 1,
      label: "TOTAL DE PEDIDOS",
      val: `${pedidosAtivos.length} ${
        pedidosAtivos.length === 1 ? "pedido" : "pedidos"
      }`,
      isNum: false,
      style: 25 as ExcelStyleId,
    },
    {
      startCol: 2,
      endCol: 3,
      label: "FALTA ENTREGAR",
      val: `${qtdFaltaEntregar} ${
        qtdFaltaEntregar === 1 ? "pedido" : "pedidos"
      }`,
      isNum: false,
      style: 25 as ExcelStyleId,
    },
    {
      startCol: 4,
      endCol: 5,
      label: "JÁ PAGO (SEM JUROS)",
      val: Number(totalPagoReal.toFixed(2)),
      isNum: true,
      style: 26 as ExcelStyleId,
    },
    {
      startCol: 6,
      endCol: 7,
      label: "FALTA RECEBER",
      val: Number(totalFaltaReceber.toFixed(2)),
      isNum: true,
      style: 28 as ExcelStyleId,
    },
  ];

  const kpiHeaderRow: ExcelCell[] = Array.from({ length: numCols }, () => ({
    v: "",
    s: 24,
  }));
  const kpiValueRow: ExcelCell[] = Array.from({ length: numCols }, () => ({
    v: "",
    s: 25,
  }));

  for (const card of kpiCards) {
    for (let c = card.startCol; c <= card.endCol; c++) {
      kpiHeaderRow[c] = { v: c === card.startCol ? card.label : "", s: 24 };
      kpiValueRow[c] =
        c === card.startCol
          ? {
              v: card.val,
              t: card.isNum ? "n" : "s",
              s: card.style,
            }
          : { v: "", t: "s", s: 24 };
    }
  }

  // Linha 8: Cabeçalho da Tabela (8 Colunas Diretas)
  const headers = [
    "Nº Pedido",
    "Data",
    "Responsável",
    "WhatsApp",
    "Colégio e Série",
    "Módulos / Livros Pedidos",
    "Situação e Pagamento",
    "Valor Real (R$)",
  ];

  const tableHeaderRow: ExcelCell[] = headers.map((h, idx) => ({
    v: h,
    s: idx === 7 ? 8 : 7,
  }));

  // Linhas de Pedidos
  const dataRows: { height?: number; cells: ExcelCell[] }[] =
    pedidos.length > 0
      ? pedidos.map((p, idx) => {
          const isZebra = idx % 2 === 1;
          const textLeft: ExcelStyleId = isZebra ? 11 : 10;
          const textCenter: ExcelStyleId = isZebra ? 13 : 12;
          const valorReal = Number(
            Math.max(0, p.total - (p.juros || 0)).toFixed(2)
          );

          const situacaoTexto = `${STATUS_PEDIDO_LABEL[p.status]} · ${
            p.pago ? "PAGO" : "FALTA PAGAR"
          } (${FORMA_PAGAMENTO_LABEL[p.forma_pagamento]})`;

          const statusStyle: ExcelStyleId =
            p.status === "cancelado"
              ? 21
              : !p.pago
                ? 19 // Amarelo se falta pagar
                : p.status === "entregue"
                  ? 20 // Verde se entregue e pago
                  : 18; // Ciano se pago e em produção/pronto

          return {
            height: 26,
            cells: [
              { v: `#${p.numero}`, s: textCenter },
              { v: formatDateBR(toLocalDateISO(p.criado_em)), s: textCenter },
              {
                v: p.responsavel_nome || p.aluno_nome || "—",
                s: textLeft,
              },
              { v: maskWhatsApp(p.whatsapp), s: textCenter },
              {
                v: `${p.colegio_nome || "—"} · ${p.serie_nome || "—"}`,
                s: textLeft,
              },
              {
                v: p.itens.map((i) => i.nome_modulo).join(" + "),
                s: textLeft,
              },
              { v: situacaoTexto, s: statusStyle },
              {
                v: valorReal,
                t: "n",
                s: p.pago ? 16 : isZebra ? 15 : 14,
              },
            ],
          };
        })
      : [
          {
            height: 26,
            cells: [
              { v: "—", s: 12 },
              { v: "—", s: 12 },
              {
                v: "Nenhum pedido encontrado no período selecionado",
                s: 10,
              },
              { v: "—", s: 12 },
              { v: "—", s: 12 },
              { v: "—", s: 12 },
              { v: "—", s: 12 },
              { v: 0, t: "n", s: 14 },
            ],
          },
        ];

  // Linha Final de Soma
  const totalRow: ExcelCell[] = [
    {
      v: `  SOMA TOTAL DOS PEDIDOS ATIVOS (${pedidosAtivos.length} pedidos)`,
      s: 22,
    },
    { v: "", s: 22 },
    { v: "", s: 22 },
    { v: "", s: 22 },
    { v: "", s: 22 },
    { v: "", s: 22 },
    { v: "VALOR TOTAL (S/ JUROS):", s: 22 },
    { v: Number(totalGeralReal.toFixed(2)), t: "n", s: 23 },
  ];

  const emptySpacerRow: ExcelCell[] = Array.from({ length: numCols }, () => ({
    v: "",
    s: 0,
  }));

  const totalRowIdx = 8 + dataRows.length;

  const sheet: ExcelWorksheetData = {
    name: "Controle de Pedidos",
    tabColorHex: "FF00A0DC",
    freezeRow: 8,
    colWidths: [13, 14, 34, 18, 34, 44, 30, 18],
    rows: [
      { height: 10, cells: cmykRow },
      { height: 30, cells: bannerRow },
      { height: 22, cells: metaRow },
      { height: 10, cells: emptySpacerRow },
      { height: 20, cells: kpiHeaderRow },
      { height: 28, cells: kpiValueRow },
      { height: 10, cells: emptySpacerRow },
      { height: 28, cells: tableHeaderRow },
      ...dataRows,
      { height: 28, cells: totalRow },
    ],
    merges: [
      { sR: 1, sC: 0, eR: 1, eC: 7 },
      { sR: 2, sC: 0, eR: 2, eC: 7 },
      ...kpiCards.map((c) => ({
        sR: 4,
        sC: c.startCol,
        eR: 4,
        eC: c.endCol,
      })),
      ...kpiCards.map((c) => ({
        sR: 5,
        sC: c.startCol,
        eR: 5,
        eC: c.endCol,
      })),
      { sR: totalRowIdx, sC: 0, eR: totalRowIdx, eC: 5 },
    ],
  };

  downloadXlsxWorkbook(
    [sheet],
    `Pedidos-RS-Digital-${toLocalDateISO()}.xlsx`
  );
}

// ============================================================================
// 2. RELATÓRIO DO EXTRATO BANCÁRIO / CAIXA — SIMPLES E DIRETO (6 COLUNAS)
// ============================================================================

export interface ItemExtratoRelatorio {
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
}

export function exportarRelatorioExtratoExcel(params: {
  extrato: ItemExtratoRelatorio[];
  resumo: {
    faturamentoCobradoComJuros: number;
    totalJurosCartao: number;
    faturamentoBruto: number;
    faturamentoPago: number;
    faturamentoPendente: number;
    totalCustos: number;
    totalPerdas: number;
    totalInvestimentos: number;
    totalSaidas: number;
    lucroOperacional: number;
    margemOperacional: number;
    saldoLiquidoFinal: number;
    margemLiquida: number;
    somaEntradasExtrato: number;
    somaSaidasExtrato: number;
    porFormaPagamento: Record<
      string,
      {
        qtd: number;
        cobrado: number;
        juros: number;
        total: number;
        pago: number;
      }
    >;
    porCategoria: Record<LancamentoCategoria, number>;
  };
  config: LojaConfig;
  dataInicio?: string;
  dataFim?: string;
}): void {
  const { extrato, resumo, config, dataInicio, dataFim } = params;
  const numCols = 6;

  const periodoTexto =
    dataInicio || dataFim
      ? `${dataInicio ? formatDateBR(dataInicio) : "Início"} até ${
          dataFim ? formatDateBR(dataFim) : "Hoje"
        }`
      : "Todo o período";

  const totalEntrou = Number(resumo.somaEntradasExtrato.toFixed(2));
  const totalSaiu = Number(resumo.somaSaidasExtrato.toFixed(2));
  const saldoSobrou = Number((totalEntrou - totalSaiu).toFixed(2));

  // Linha 1: Faixa com as cores da marca RS Digital
  const cmykRow: ExcelCell[] = [
    { v: " ", s: 3 },
    { v: " ", s: 3 },
    { v: " ", s: 4 },
    { v: " ", s: 5 },
    { v: " ", s: 6 },
    { v: " ", s: 6 },
  ];

  // Linha 2: Título Direto
  const bannerRow: ExcelCell[] = Array.from({ length: numCols }, (_, i) => ({
    v:
      i === 0
        ? `  ${config.nome_loja.toUpperCase()} — EXTRATO DE CAIXA (ENTRADAS E SAÍDAS)`
        : "",
    s: 1,
  }));

  // Linha 3: Subtítulo explicativo
  const metaRow: ExcelCell[] = Array.from({ length: numCols }, (_, i) => ({
    v:
      i === 0
        ? `  Período: ${periodoTexto}   |   Valores reais (sem juros da maquininha)   |   Gerado em: ${formatDateTimeBR(
            new Date().toISOString()
          )}`
        : "",
    s: 2,
  }));

  // Linhas 5 e 6: 3 Cartões Grandes e Claros (Entrou / Saiu / Sobrou no Caixa)
  const kpiCards = [
    {
      startCol: 0,
      endCol: 1,
      label: "1. TOTAL QUE ENTROU (VENDAS)",
      val: totalEntrou,
      style: 26 as ExcelStyleId,
    },
    {
      startCol: 2,
      endCol: 3,
      label: "2. TOTAL QUE SAIU (GASTOS)",
      val: totalSaiu,
      style: 27 as ExcelStyleId,
    },
    {
      startCol: 4,
      endCol: 5,
      label: "3. SALDO QUE SOBROU NO CAIXA",
      val: saldoSobrou,
      style: (saldoSobrou >= 0 ? 28 : 27) as ExcelStyleId,
    },
  ];

  const kpiHeaderRow: ExcelCell[] = Array.from({ length: numCols }, () => ({
    v: "",
    s: 24,
  }));
  const kpiValueRow: ExcelCell[] = Array.from({ length: numCols }, () => ({
    v: "",
    s: 26,
  }));

  for (const card of kpiCards) {
    for (let c = card.startCol; c <= card.endCol; c++) {
      kpiHeaderRow[c] = { v: c === card.startCol ? card.label : "", s: 24 };
      kpiValueRow[c] =
        c === card.startCol
          ? {
              v: card.val,
              t: "n",
              s: card.style,
            }
          : { v: "", t: "s", s: 24 };
    }
  }

  // Linha 8: Cabeçalho da Tabela (6 Colunas Simples e Diretas)
  const headers = [
    "Data",
    "Tipo",
    "Descrição (O que foi)",
    "Detalhes / Cliente ou Fornecedor",
    "Categoria / Forma de Pagto.",
    "Valor Real (R$)",
  ];

  const tableHeaderRow: ExcelCell[] = headers.map((h, idx) => ({
    v: h,
    s: idx === 5 ? 8 : 7,
  }));

  // Linhas do Extrato
  const extratoRows: { height?: number; cells: ExcelCell[] }[] =
    extrato.length > 0
      ? extrato.map((item, idx) => {
          const isZebra = idx % 2 === 1;
          const textLeft: ExcelStyleId = isZebra ? 11 : 10;
          const textCenter: ExcelStyleId = isZebra ? 13 : 12;
          const isEntrada = item.natureza === "entrada";

          const valorComSinal = isEntrada
            ? Number(item.valorReal.toFixed(2))
            : Number((-item.valorReal).toFixed(2));

          const tipoSimples = isEntrada
            ? item.pago
              ? "ENTRADA (Pago)"
              : "ENTRADA (A receber)"
            : `SAÍDA (${item.tipoLabel})`;

          const badgeStyle: ExcelStyleId = isEntrada
            ? item.pago
              ? 20 // Verde
              : 19 // Amarelo
            : 21; // Rosa/Magenta

          return {
            height: 25,
            cells: [
              { v: formatDateBR(item.data), s: textCenter },
              { v: tipoSimples, s: badgeStyle },
              { v: item.descricao, s: textLeft },
              { v: item.subtitulo, s: textLeft },
              { v: item.categoriaLabel, s: textCenter },
              {
                v: valorComSinal,
                t: "n",
                s: isEntrada ? 16 : 17,
              },
            ],
          };
        })
      : [
          {
            height: 25,
            cells: [
              { v: "—", s: 12 },
              { v: "—", s: 12 },
              {
                v: "Nenhuma movimentação encontrada no período selecionado",
                s: 10,
              },
              { v: "—", s: 12 },
              { v: "—", s: 12 },
              { v: 0, t: "n", s: 14 },
            ],
          },
        ];

  // Linha Final de Fechamento do Caixa
  const totalRow: ExcelCell[] = [
    {
      v: `  FECHAMENTO DO CAIXA (${extrato.length} lançamentos)`,
      s: 22,
    },
    { v: "", s: 22 },
    { v: "", s: 22 },
    { v: "", s: 22 },
    { v: "SALDO FINAL DO PERÍODO:", s: 22 },
    { v: saldoSobrou, t: "n", s: 23 },
  ];

  const emptySpacerRow: ExcelCell[] = Array.from({ length: numCols }, () => ({
    v: "",
    s: 0,
  }));

  const totalRowIdx = 8 + extratoRows.length;

  const sheet: ExcelWorksheetData = {
    name: "Controle de Caixa",
    tabColorHex: "FFE5007D",
    freezeRow: 8,
    colWidths: [14, 24, 38, 36, 26, 20],
    rows: [
      { height: 10, cells: cmykRow },
      { height: 30, cells: bannerRow },
      { height: 22, cells: metaRow },
      { height: 10, cells: emptySpacerRow },
      { height: 20, cells: kpiHeaderRow },
      { height: 28, cells: kpiValueRow },
      { height: 10, cells: emptySpacerRow },
      { height: 28, cells: tableHeaderRow },
      ...extratoRows,
      { height: 28, cells: totalRow },
    ],
    merges: [
      { sR: 1, sC: 0, eR: 1, eC: 5 },
      { sR: 2, sC: 0, eR: 2, eC: 5 },
      ...kpiCards.map((c) => ({
        sR: 4,
        sC: c.startCol,
        eR: 4,
        eC: c.endCol,
      })),
      ...kpiCards.map((c) => ({
        sR: 5,
        sC: c.startCol,
        eR: 5,
        eC: c.endCol,
      })),
      { sR: totalRowIdx, sC: 0, eR: totalRowIdx, eC: 3 },
    ],
  };

  downloadXlsxWorkbook(
    [sheet],
    `Extrato-Caixa-RS-Digital-${toLocalDateISO()}.xlsx`
  );
}

export type { LancamentoTipo, LancamentoCategoria };
