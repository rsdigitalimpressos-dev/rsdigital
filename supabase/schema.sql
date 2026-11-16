-- =============================================================================
-- RS DIGITAL — SISTEMA DE PEDIDOS DE LIVROS ESCOLARES
-- Schema completo do Banco de Dados (Supabase / PostgreSQL) + RLS + Funções RPC
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABELAS
-- -----------------------------------------------------------------------------

-- 1.1. Colégios
CREATE TABLE IF NOT EXISTS public.colegios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.2. Séries
CREATE TABLE IF NOT EXISTS public.series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colegio_id UUID NOT NULL REFERENCES public.colegios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_series_colegio_id ON public.series(colegio_id);

-- 1.3. Módulos
CREATE TABLE IF NOT EXISTS public.modulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_id UUID NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  valor NUMERIC(10, 2) NOT NULL DEFAULT 300.00,
  link_arquivo TEXT NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT true,
  disciplinas JSONB NOT NULL DEFAULT '[]'::jsonb,
  livros JSONB NOT NULL DEFAULT '[]'::jsonb,
  capa_url TEXT NULL
);

ALTER TABLE public.modulos ADD COLUMN IF NOT EXISTS disciplinas JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.modulos ADD COLUMN IF NOT EXISTS livros JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.modulos ADD COLUMN IF NOT EXISTS capa_url TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_modulos_serie_id ON public.modulos(serie_id);

-- 1.3b. Catálogo de Livros & Capas por Série
CREATE TABLE IF NOT EXISTS public.livros (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('didatico', 'paradidatico')),
  valor NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  ativo BOOLEAN NOT NULL DEFAULT true,
  serie_nome TEXT NULL,
  capa_url TEXT NULL,
  capas_por_serie JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 1.4. Cupons
CREATE TABLE IF NOT EXISTS public.cupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('percentual', 'valor')),
  desconto NUMERIC(10, 2) NOT NULL CHECK (desconto > 0),
  validade DATE NULL,
  limite_usos INTEGER NULL CHECK (limite_usos IS NULL OR limite_usos > 0),
  usos INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT cupons_codigo_maiusculo CHECK (codigo = UPPER(codigo))
);

-- 1.5. Configurações da Loja (linha única id = 1)
CREATE TABLE IF NOT EXISTS public.config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome_loja TEXT NOT NULL DEFAULT 'RS Digital',
  whatsapp_loja TEXT NOT NULL DEFAULT '11999999999',
  prazo_dias INTEGER NOT NULL DEFAULT 7,
  endereco_retirada TEXT NOT NULL DEFAULT 'Rua das Impressões, 120 — Centro',
  horario_retirada TEXT NOT NULL DEFAULT 'Seg a Sex das 08h às 18h | Sáb das 08h às 12h',
  taxas_parcelamento JSONB NOT NULL DEFAULT '{
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
    "12": 15.0
  }'::jsonb,
  mensagem_pronto TEXT NOT NULL DEFAULT E'Olá, {responsavel}! 😊 Seu pedido nº {numero} ({serie} – {colegio}) está pronto para retirada.\n📍 {endereco}\n🕒 {horario}\nObrigado pela preferência!'
);

INSERT INTO public.config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Sequência para número sequencial legível do pedido (0001, 0002, ...)
CREATE SEQUENCE IF NOT EXISTS public.pedidos_numero_seq START 1;

-- 1.6. Pedidos
CREATE TABLE IF NOT EXISTS public.pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE DEFAULT LPAD(nextval('public.pedidos_numero_seq')::TEXT, 4, '0'),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  responsavel_nome TEXT NOT NULL,
  aluno_nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  colegio_id UUID NOT NULL REFERENCES public.colegios(id),
  serie_id UUID NOT NULL REFERENCES public.series(id),
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('pix', 'dinheiro', 'debito', 'credito_avista', 'credito_parcelado')),
  parcelas INTEGER NULL CHECK (parcelas IS NULL OR (parcelas >= 2 AND parcelas <= 12)),
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  desconto NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  juros NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  cupom_id UUID NULL REFERENCES public.cupons(id),
  observacao TEXT NULL,
  status TEXT NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido', 'em_producao', 'pronto', 'entregue', 'cancelado')),
  pago BOOLEAN NOT NULL DEFAULT false,
  pago_em TIMESTAMPTZ NULL,
  previsao_retirada DATE NOT NULL,
  pronto_em TIMESTAMPTZ NULL,
  entregue_em TIMESTAMPTZ NULL
);

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_criado_em ON public.pedidos(criado_em ASC);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos(status);

-- 1.7. Itens do Pedido
CREATE TABLE IF NOT EXISTS public.pedido_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  modulo_id UUID NOT NULL REFERENCES public.modulos(id),
  nome_modulo TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL,
  impresso BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_pedido_itens_pedido_id ON public.pedido_itens(pedido_id);

-- 1.8. Lançamentos Financeiros (Custos, Investimentos e Perdas)
CREATE TABLE IF NOT EXISTS public.lancamentos_financeiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::DATE),
  tipo TEXT NOT NULL CHECK (tipo IN ('custo', 'investimento', 'perda')),
  categoria TEXT NOT NULL CHECK (categoria IN ('papel', 'tinta', 'impressora', 'materiais', 'equipamentos', 'perda_impressao', 'outros')),
  descricao TEXT NOT NULL,
  quantidade NUMERIC(10, 2) NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  valor_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  observacao TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_financeiros_data ON public.lancamentos_financeiros(data DESC);

-- -----------------------------------------------------------------------------
-- 2. VIEW PÚBLICA DE MÓDULOS (SEM EXPOR link_arquivo)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.modulos_publicos AS
SELECT
  id,
  serie_id,
  nome,
  ordem,
  valor,
  ativo,
  disciplinas,
  livros,
  capa_url
FROM public.modulos
WHERE ativo = true;

GRANT SELECT ON public.modulos_publicos TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.colegios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_itens ENABLE ROW LEVEL SECURITY;

-- Colégios: público lê apenas ativos; admin (authenticated) tem acesso total
DROP POLICY IF EXISTS "Publico le colegios ativos" ON public.colegios;
CREATE POLICY "Publico le colegios ativos"
  ON public.colegios FOR SELECT
  TO anon
  USING (ativo = true);

DROP POLICY IF EXISTS "Admin gerencia colegios" ON public.colegios;
CREATE POLICY "Admin gerencia colegios"
  ON public.colegios FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Séries: público lê apenas ativas; admin tem acesso total
DROP POLICY IF EXISTS "Publico le series ativas" ON public.series;
CREATE POLICY "Publico le series ativas"
  ON public.series FOR SELECT
  TO anon
  USING (ativo = true);

DROP POLICY IF EXISTS "Admin gerencia series" ON public.series;
CREATE POLICY "Admin gerencia series"
  ON public.series FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Módulos: tabela bruta (com link_arquivo) APENAS para authenticated (admin)
-- O público acessa via view modulos_publicos ou via Server Component seguro
DROP POLICY IF EXISTS "Admin gerencia modulos" ON public.modulos;
CREATE POLICY "Admin gerencia modulos"
  ON public.modulos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Publico le livros ativos" ON public.livros;
CREATE POLICY "Publico le livros ativos"
  ON public.livros FOR SELECT
  TO anon
  USING (ativo = true);

DROP POLICY IF EXISTS "Admin gerencia livros" ON public.livros;
CREATE POLICY "Admin gerencia livros"
  ON public.livros FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Cupons: apenas admin gerencia diretamente; público valida via função RPC validar_cupom
DROP POLICY IF EXISTS "Admin gerencia cupons" ON public.cupons;
CREATE POLICY "Admin gerencia cupons"
  ON public.cupons FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Config: público pode ler configurações públicas (taxas, prazo, endereço); admin edita
DROP POLICY IF EXISTS "Publico le config" ON public.config;
CREATE POLICY "Publico le config"
  ON public.config FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin edita config" ON public.config;
CREATE POLICY "Admin edita config"
  ON public.config FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Pedidos e Itens: público cria via RPC criar_pedido_seguro (que recalcula valores no servidor);
-- Admin tem controle total sobre pedidos e pedido_itens
DROP POLICY IF EXISTS "Admin gerencia pedidos" ON public.pedidos;
CREATE POLICY "Admin gerencia pedidos"
  ON public.pedidos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin gerencia pedido_itens" ON public.pedido_itens;
CREATE POLICY "Admin gerencia pedido_itens"
  ON public.pedido_itens FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin gerencia lancamentos_financeiros" ON public.lancamentos_financeiros;
CREATE POLICY "Admin gerencia lancamentos_financeiros"
  ON public.lancamentos_financeiros FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. FUNÇÕES RPC SEGURAS (VALIDAÇÃO DE CUPOM E CRIAÇÃO DE PEDIDO NO SERVIDOR)
-- -----------------------------------------------------------------------------

-- 4.1. Validar cupom (público pode chamar sem listar todos os cupons)
CREATE OR REPLACE FUNCTION public.validar_cupom(p_codigo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cupom public.cupons%ROWTYPE;
BEGIN
  SELECT * INTO v_cupom
  FROM public.cupons
  WHERE codigo = UPPER(TRIM(p_codigo))
    AND ativo = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valido', false, 'erro', 'Cupom inválido ou não encontrado.');
  END IF;

  IF v_cupom.validade IS NOT NULL AND v_cupom.validade < (now() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RETURN jsonb_build_object('valido', false, 'erro', 'Este cupom já expirou.');
  END IF;

  IF v_cupom.limite_usos IS NOT NULL AND v_cupom.usos >= v_cupom.limite_usos THEN
    RETURN jsonb_build_object('valido', false, 'erro', 'Este cupom atingiu o limite máximo de usos.');
  END IF;

  RETURN jsonb_build_object(
    'valido', true,
    'id', v_cupom.id,
    'codigo', v_cupom.codigo,
    'tipo', v_cupom.tipo,
    'desconto', v_cupom.desconto
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validar_cupom(TEXT) TO anon, authenticated;

-- 4.2. Criar pedido recalculando subtotal, desconto, juros e previsão no servidor
DROP FUNCTION IF EXISTS public.criar_pedido_seguro(
  TEXT, TEXT, TEXT, UUID, UUID, UUID[], TEXT, INTEGER, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.criar_pedido_seguro(
  p_responsavel_nome TEXT,
  p_aluno_nome TEXT,
  p_whatsapp TEXT,
  p_colegio_id UUID,
  p_serie_id UUID,
  p_modulo_ids UUID[],
  p_forma_pagamento TEXT,
  p_parcelas INTEGER DEFAULT NULL,
  p_cupom_codigo TEXT DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_livros_por_modulo JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.config%ROWTYPE;
  v_cupom public.cupons%ROWTYPE;
  v_mod public.modulos%ROWTYPE;
  v_colegio_nome TEXT;
  v_serie_nome TEXT;
  v_hoje_br DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_subtotal NUMERIC(10, 2) := 0.00;
  v_desconto NUMERIC(10, 2) := 0.00;
  v_base_apos_desconto NUMERIC(10, 2) := 0.00;
  v_taxa_juros NUMERIC(10, 2) := 0.00;
  v_juros NUMERIC(10, 2) := 0.00;
  v_total NUMERIC(10, 2) := 0.00;
  v_previsao DATE;
  v_pedido public.pedidos%ROWTYPE;
  v_cupom_id UUID := NULL;
  v_cupom_codigo TEXT := NULL;
  v_count_modulos INTEGER := 0;
  v_itens JSONB := '[]'::jsonb;
  v_itens_temp JSONB := '[]'::jsonb;
  v_escolhidos_json JSONB;
  v_soma_todos NUMERIC(10, 2) := 0.00;
  v_soma_escolhidos NUMERIC(10, 2) := 0.00;
  v_qtd_escolhidos INTEGER := 0;
  v_nomes_excluidos TEXT;
  v_valor_efetivo NUMERIC(10, 2) := 0.00;
  v_nome_formatado TEXT;
BEGIN
  IF array_length(p_modulo_ids, 1) IS NULL OR array_length(p_modulo_ids, 1) < 1 THEN
    RAISE EXCEPTION 'Selecione pelo menos um módulo.';
  END IF;

  -- Valida colégio e série ativos
  SELECT nome INTO v_colegio_nome
  FROM public.colegios
  WHERE id = p_colegio_id AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colégio selecionado inválido ou inativo.';
  END IF;

  SELECT nome INTO v_serie_nome
  FROM public.series
  WHERE id = p_serie_id AND colegio_id = p_colegio_id AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Série selecionada inválida para este colégio.';
  END IF;

  -- Busca configurações
  SELECT * INTO v_config FROM public.config WHERE id = 1;

  -- Calcula subtotal e itens respeitando seleção parcial de livros por módulo
  FOR v_mod IN
    SELECT *
    FROM public.modulos
    WHERE id = ANY(p_modulo_ids)
      AND serie_id = p_serie_id
      AND ativo = true
    ORDER BY ordem ASC
  LOOP
    v_count_modulos := v_count_modulos + 1;
    v_valor_efetivo := v_mod.valor;
    v_nome_formatado := v_mod.nome;

    IF jsonb_typeof(v_mod.livros) = 'array' AND jsonb_array_length(v_mod.livros) > 0 THEN
      SELECT COALESCE(SUM(GREATEST(0.00, COALESCE((elem ->> 'valor')::NUMERIC, 0.00))), 0.00)
      INTO v_soma_todos
      FROM jsonb_array_elements(v_mod.livros) AS elem;

      v_escolhidos_json := CASE
        WHEN p_livros_por_modulo IS NOT NULL AND jsonb_typeof(p_livros_por_modulo) = 'object'
        THEN p_livros_por_modulo -> (v_mod.id::TEXT)
        ELSE NULL
      END;

      IF v_escolhidos_json IS NOT NULL
         AND jsonb_typeof(v_escolhidos_json) = 'array'
         AND jsonb_array_length(v_escolhidos_json) > 0 THEN
        SELECT
          COUNT(*),
          COALESCE(SUM(GREATEST(0.00, COALESCE((elem ->> 'valor')::NUMERIC, 0.00))), 0.00)
        INTO v_qtd_escolhidos, v_soma_escolhidos
        FROM jsonb_array_elements(v_mod.livros) AS elem
        WHERE (elem ->> 'id') IN (SELECT jsonb_array_elements_text(v_escolhidos_json))
           OR (elem ->> 'nome') IN (SELECT jsonb_array_elements_text(v_escolhidos_json));

        IF v_qtd_escolhidos < 1 THEN
          RAISE EXCEPTION 'Selecione pelo menos 1 livro válido para o módulo %.', v_mod.nome;
        END IF;

        SELECT STRING_AGG(t.elem ->> 'nome', ', ' ORDER BY t.ord)
        INTO v_nomes_excluidos
        FROM jsonb_array_elements(v_mod.livros) WITH ORDINALITY AS t(elem, ord)
        WHERE NOT (
          (t.elem ->> 'id') IN (SELECT jsonb_array_elements_text(v_escolhidos_json))
          OR (t.elem ->> 'nome') IN (SELECT jsonb_array_elements_text(v_escolhidos_json))
        );

        IF v_nomes_excluidos IS NULL OR TRIM(v_nomes_excluidos) = '' THEN
          v_valor_efetivo := ROUND(CASE WHEN v_soma_todos > 0 THEN v_soma_todos ELSE v_mod.valor END, 2);
          v_nome_formatado := v_mod.nome;
        ELSE
          v_valor_efetivo := ROUND(v_soma_escolhidos, 2);
          v_nome_formatado := v_mod.nome || ' — Todos os livros, exceto ' || v_nomes_excluidos;
        END IF;
      ELSE
        v_valor_efetivo := ROUND(CASE WHEN v_soma_todos > 0 THEN v_soma_todos ELSE v_mod.valor END, 2);
      END IF;
    END IF;

    v_subtotal := ROUND(v_subtotal + v_valor_efetivo, 2);
    v_itens_temp := v_itens_temp || jsonb_build_array(
      jsonb_build_object(
        'modulo_id', v_mod.id,
        'nome_modulo', v_nome_formatado,
        'valor', v_valor_efetivo
      )
    );
  END LOOP;

  IF v_count_modulos <> array_length(p_modulo_ids, 1) THEN
    RAISE EXCEPTION 'Um ou mais módulos selecionados são inválidos para esta série.';
  END IF;

  -- Valida e aplica cupom, se informado
  IF p_cupom_codigo IS NOT NULL AND TRIM(p_cupom_codigo) <> '' THEN
    SELECT * INTO v_cupom
    FROM public.cupons
    WHERE codigo = UPPER(TRIM(p_cupom_codigo))
      AND ativo = true
      AND (validade IS NULL OR validade >= v_hoje_br)
      AND (limite_usos IS NULL OR usos < limite_usos)
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cupom inválido ou expirado.';
    END IF;

    v_cupom_id := v_cupom.id;
    v_cupom_codigo := v_cupom.codigo;
    IF v_cupom.tipo = 'percentual' THEN
      v_desconto := ROUND(v_subtotal * (v_cupom.desconto / 100.0), 2);
    ELSE
      v_desconto := LEAST(v_subtotal, v_cupom.desconto);
    END IF;

    UPDATE public.cupons SET usos = usos + 1 WHERE id = v_cupom.id;
  END IF;

  v_base_apos_desconto := GREATEST(0.00, v_subtotal - v_desconto);

  -- Aplica juros se for crédito parcelado
  IF p_forma_pagamento = 'credito_parcelado' THEN
    IF p_parcelas IS NULL OR p_parcelas < 2 OR p_parcelas > 12 THEN
      RAISE EXCEPTION 'Número de parcelas inválido (escolha entre 2x e 12x).';
    END IF;
    v_taxa_juros := COALESCE((v_config.taxas_parcelamento ->> p_parcelas::TEXT)::NUMERIC, 0.00);
    v_juros := ROUND(v_base_apos_desconto * (v_taxa_juros / 100.0), 2);
  ELSE
    p_parcelas := NULL;
  END IF;

  v_total := ROUND(v_base_apos_desconto + v_juros, 2);
  v_previsao := v_hoje_br + COALESCE(v_config.prazo_dias, 7);

  -- Grava o pedido
  INSERT INTO public.pedidos (
    responsavel_nome,
    aluno_nome,
    whatsapp,
    colegio_id,
    serie_id,
    forma_pagamento,
    parcelas,
    subtotal,
    desconto,
    juros,
    total,
    cupom_id,
    observacao,
    status,
    pago,
    previsao_retirada
  ) VALUES (
    TRIM(p_responsavel_nome),
    TRIM(p_aluno_nome),
    REGEXP_REPLACE(p_whatsapp, '\D', '', 'g'),
    p_colegio_id,
    p_serie_id,
    p_forma_pagamento,
    p_parcelas,
    v_subtotal,
    v_desconto,
    v_juros,
    v_total,
    v_cupom_id,
    NULLIF(TRIM(COALESCE(p_observacao, '')), ''),
    'recebido',
    false,
    v_previsao
  )
  RETURNING * INTO v_pedido;

  -- Grava itens do pedido com nome_modulo e valor recalculados
  INSERT INTO public.pedido_itens (pedido_id, modulo_id, nome_modulo, valor, impresso)
  SELECT
    v_pedido.id,
    (it ->> 'modulo_id')::UUID,
    it ->> 'nome_modulo',
    ROUND((it ->> 'valor')::NUMERIC, 2),
    false
  FROM jsonb_array_elements(v_itens_temp) AS it;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', pi.id,
        'pedido_id', pi.pedido_id,
        'modulo_id', pi.modulo_id,
        'nome_modulo', pi.nome_modulo,
        'valor', pi.valor,
        'impresso', pi.impresso
      )
    ),
    '[]'::jsonb
  )
  INTO v_itens
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = v_pedido.id;

  RETURN jsonb_build_object(
    'id', v_pedido.id,
    'numero', v_pedido.numero,
    'colegio_nome', v_colegio_nome,
    'serie_nome', v_serie_nome,
    'cupom_id', v_cupom_id,
    'cupom_codigo', v_cupom_codigo,
    'subtotal', v_pedido.subtotal,
    'desconto', v_pedido.desconto,
    'juros', v_pedido.juros,
    'total', v_pedido.total,
    'previsao_retirada', v_pedido.previsao_retirada,
    'criado_em', v_pedido.criado_em,
    'itens', v_itens
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_pedido_seguro(
  TEXT, TEXT, TEXT, UUID, UUID, UUID[], TEXT, INTEGER, TEXT, TEXT, JSONB
) TO anon, authenticated;

-- 4.3. Consulta pública segura de pedido (permite buscar apenas pelo WhatsApp ou Nº + WhatsApp; sem link_arquivo)
CREATE OR REPLACE FUNCTION public.consultar_pedido_publico(
  p_numero TEXT,
  p_whatsapp TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num_digits TEXT := REGEXP_REPLACE(TRIM(COALESCE(p_numero, '')), '\D', '', 'g');
  v_num_limpo TEXT := CASE WHEN v_num_digits <> '' THEN LPAD(v_num_digits, 4, '0') ELSE '' END;
  v_fone_limpo TEXT := REGEXP_REPLACE(COALESCE(p_whatsapp, ''), '\D', '', 'g');
  v_pedidos JSONB := '[]'::jsonb;
BEGIN
  IF LENGTH(v_fone_limpo) < 10 THEN
    RETURN jsonb_build_object(
      'encontrado', false,
      'erro', 'Informe o WhatsApp usado no pedido com DDD.'
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'numero', p.numero,
        'aluno_nome', p.aluno_nome,
        'responsavel_nome', p.responsavel_nome,
        'whatsapp', p.whatsapp,
        'colegio_nome', COALESCE(c.nome, ''),
        'serie_nome', COALESCE(s.nome, ''),
        'forma_pagamento', p.forma_pagamento,
        'parcelas', p.parcelas,
        'subtotal', p.subtotal,
        'desconto', p.desconto,
        'juros', p.juros,
        'observacao', p.observacao,
        'status', p.status,
        'pago', p.pago,
        'total', p.total,
        'previsao_retirada', p.previsao_retirada,
        'criado_em', p.criado_em,
        'itens', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'nome_modulo', pi.nome_modulo,
                'valor', pi.valor
              )
            )
            FROM public.pedido_itens pi
            WHERE pi.pedido_id = p.id
          ),
          '[]'::jsonb
        )
      )
      ORDER BY p.criado_em DESC
    ),
    '[]'::jsonb
  )
  INTO v_pedidos
  FROM public.pedidos p
  LEFT JOIN public.colegios c ON c.id = p.colegio_id
  LEFT JOIN public.series s ON s.id = p.serie_id
  WHERE p.whatsapp = v_fone_limpo
    AND (
      v_num_digits = ''
      OR p.numero = TRIM(p_numero)
      OR p.numero = v_num_limpo
    );

  IF jsonb_array_length(v_pedidos) = 0 THEN
    RETURN jsonb_build_object(
      'encontrado', false,
      'erro', 'Nenhum pedido encontrado para este WhatsApp.'
    );
  END IF;

  RETURN jsonb_build_object(
    'encontrado', true,
    'pedidos', v_pedidos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consultar_pedido_publico(TEXT, TEXT) TO anon, authenticated;


