-- =============================================================================
-- RS DIGITAL — LIMPEZA TOTAL E INICIALIZAÇÃO DA BASE DE DADOS (PRODUÇÃO)
-- Remove todos os dados de demonstração (pedidos, lançamentos, colégios, séries,
-- módulos, livros e cupons), reinicia a sequência de pedidos para #0001 e
-- mantém apenas a configuração inicial da loja.
-- =============================================================================

TRUNCATE TABLE
  public.pedido_itens,
  public.pedidos,
  public.lancamentos_financeiros,
  public.modulos,
  public.series,
  public.colegios,
  public.livros,
  public.cupons
RESTART IDENTITY CASCADE;

ALTER SEQUENCE IF EXISTS public.pedidos_numero_seq RESTART WITH 1;

INSERT INTO public.config (
  id,
  nome_loja,
  whatsapp_loja,
  prazo_dias,
  endereco_retirada,
  horario_retirada,
  taxas_parcelamento,
  mensagem_pronto
) VALUES (
  1,
  'RS Digital',
  '11999999999',
  7,
  'Rua das Impressões, 120 — Centro',
  'Seg a Sex das 08h às 18h | Sáb das 08h às 12h',
  '{
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
  E'Olá, {responsavel}! 😊 Seu pedido nº {numero} ({serie} – {colegio}) está pronto para retirada.\n📍 {endereco}\n🕒 {horario}\nObrigado pela preferência!'
)
ON CONFLICT (id) DO UPDATE SET
  nome_loja = EXCLUDED.nome_loja,
  taxas_parcelamento = EXCLUDED.taxas_parcelamento,
  mensagem_pronto = EXCLUDED.mensagem_pronto;
