import fs from "fs";
import os from "os";
import path from "path";
import {
  createDefaultLancamentos,
  createDefaultLivros,
  createInitialSeedState,
  getCapaPadraoPorOrdem,
  getDisciplinasPadraoPorSerie,
  getLivrosPadraoPorModulo,
  LocalDatabaseState,
  SERIES_PADRAO_ESCOLARES,
} from "./seed-data";

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "local-db.json");
const TMP_DATA_DIR = path.join(os.tmpdir(), "rs-digital-data");
const TMP_DB_FILE = path.join(TMP_DATA_DIR, "local-db.json");

let memoryDbFallback: LocalDatabaseState | null = null;

function resolveReadableDbFile(): string | null {
  if (fs.existsSync(TMP_DB_FILE)) return TMP_DB_FILE;
  if (fs.existsSync(DB_FILE)) return DB_FILE;
  return null;
}

export function readLocalDb(): LocalDatabaseState {
  try {
    const activeFile = resolveReadableDbFile();
    if (activeFile) {
      const raw = fs.readFileSync(activeFile, "utf-8");
      const parsed = JSON.parse(raw) as LocalDatabaseState;
      let alterado = false;

      if (!Array.isArray(parsed.lancamentos)) {
        parsed.lancamentos = createDefaultLancamentos();
        alterado = true;
      }

      if (!Array.isArray(parsed.livros) || parsed.livros.length === 0) {
        parsed.livros = createDefaultLivros();
        alterado = true;
      }

      // Atualiza automaticamente colégios que só tinham "1º ano, 2º ano, 3º ano" para todas as séries do Ensino Fundamental e Ensino Médio
      for (const col of parsed.colegios || []) {
        const seriesDoCol = (parsed.series || []).filter(
          (s) => s.colegio_id === col.id
        );
        const prefix =
          col.id === "11111111-1111-4111-8111-111111111111"
            ? "a"
            : col.id === "22222222-2222-4222-8222-222222222222"
              ? "b"
              : col.id.slice(0, 6);

        // Renomeia "1º ano", "2º ano", "3º ano" legados para especificar "Ensino Fundamental"
        for (const s of seriesDoCol) {
          if (s.nome === "1º ano") {
            s.nome = "1º ano — Ensino Fundamental";
            alterado = true;
          } else if (s.nome === "2º ano") {
            s.nome = "2º ano — Ensino Fundamental";
            alterado = true;
          } else if (s.nome === "3º ano") {
            s.nome = "3º ano — Ensino Fundamental";
            alterado = true;
          }
        }

        // Se o colégio tinha apenas <= 3 séries iniciais, popula o restante do Ensino Fundamental (4º ao 9º) e Ensino Médio (1ª à 3ª)
        if (seriesDoCol.length <= 3) {
          for (const padrao of SERIES_PADRAO_ESCOLARES) {
            const jaExiste = parsed.series.some(
              (s) =>
                s.colegio_id === col.id &&
                (s.nome === padrao.nome || s.ordem === padrao.ordem)
            );
            if (!jaExiste) {
              const serieId = `serie-${prefix}-${padrao.slug}`;
              parsed.series.push({
                id: serieId,
                colegio_id: col.id,
                nome: padrao.nome,
                ordem: padrao.ordem,
                ativo: true,
              });
              for (let m = 1; m <= 4; m++) {
                parsed.modulos.push({
                  id: `mod-${prefix}-${padrao.slug}-t${m}`,
                  serie_id: serieId,
                  nome: `${m}º Trimestre`,
                  ordem: m,
                  valor: 300.0,
                  link_arquivo: `https://drive.google.com/drive/folders/exemplo-${prefix}-${padrao.slug}-trimestre-${m}`,
                  ativo: true,
                  disciplinas: getDisciplinasPadraoPorSerie(padrao.nome),
                });
              }
              alterado = true;
            }
          }
        }
      }

      // Garante que cada série tenha o módulo de "Paradidáticos" e que todos os módulos tenham livros e capa_url configurados
      const serieMapNome = new Map(
        (parsed.series || []).map((s) => [s.id, s.nome])
      );

      for (const s of parsed.series || []) {
        const temParadidaticos = (parsed.modulos || []).some(
          (m) => m.serie_id === s.id && /paradid/i.test(m.nome)
        );
        if (!temParadidaticos) {
          const livrosPara = getLivrosPadraoPorModulo(
            "Paradidáticos",
            s.nome,
            parsed.livros
          );
          const valorPara = livrosPara.reduce((acc, l) => acc + l.valor, 0);
          parsed.modulos.push({
            id: `mod-${s.id}-paradidaticos`,
            serie_id: s.id,
            nome: "Paradidáticos",
            ordem: 5,
            valor: valorPara || 185.0,
            link_arquivo: `https://drive.google.com/drive/folders/exemplo-${s.id}-paradidaticos`,
            ativo: true,
            disciplinas: livrosPara.map((l) => l.nome),
            livros: livrosPara,
            capa_url: "preset:cmyk-indigo",
          });
          alterado = true;
        }
      }

      for (const mod of parsed.modulos || []) {
        const sNome = serieMapNome.get(mod.serie_id);
        if (!Array.isArray(mod.livros) || mod.livros.length === 0) {
          mod.livros = getLivrosPadraoPorModulo(
            mod.nome,
            sNome,
            parsed.livros
          );
          alterado = true;
        }
        if (!Array.isArray(mod.disciplinas) || mod.disciplinas.length === 0) {
          mod.disciplinas = mod.livros.map((l) => l.nome);
          alterado = true;
        }
        if (!mod.capa_url) {
          mod.capa_url = /paradid/i.test(mod.nome)
            ? "preset:cmyk-indigo"
            : getCapaPadraoPorOrdem(mod.ordem || 1);
          alterado = true;
        }
      }

      // Unifica aluno_nome com responsavel_nome nos pedidos existentes (campo de aluno foi removido do sistema)
      for (const ped of parsed.pedidos || []) {
        if (ped.responsavel_nome && ped.aluno_nome !== ped.responsavel_nome) {
          ped.aluno_nome = ped.responsavel_nome;
          alterado = true;
        }
      }

      // Atualiza mensagem padrão de WhatsApp caso ainda contenha a variável legada {aluno}
      if (
        parsed.config?.mensagem_pronto &&
        parsed.config.mensagem_pronto.includes("{aluno}")
      ) {
        parsed.config.mensagem_pronto =
          "Olá, {responsavel}! 😊 Seu pedido nº {numero} ({serie} – {colegio}) está pronto para retirada.\n📍 {endereco}\n🕒 {horario}\nObrigado pela preferência!";
        alterado = true;
      }

      if (alterado) {
        writeLocalDb(parsed);
      }
      memoryDbFallback = parsed;
      return parsed;
    }
  } catch (err) {
    console.warn("Aviso ao ler banco local de fallback, recriando seed:", err);
  }
  if (memoryDbFallback) {
    return memoryDbFallback;
  }
  const initial = createInitialSeedState();
  writeLocalDb(initial);
  return initial;
}

export function writeLocalDb(state: LocalDatabaseState): void {
  memoryDbFallback = state;
  const serialized = JSON.stringify(state, null, 2);
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, serialized, "utf-8");
    return;
  } catch {
    // Em ambientes serverless read-only (ex: Vercel /var/task), faz fallback para /tmp
  }
  try {
    if (!fs.existsSync(TMP_DATA_DIR)) {
      fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(TMP_DB_FILE, serialized, "utf-8");
  } catch (err) {
    console.warn("Não foi possível persistir arquivo local-db.json:", err);
  }
}
