# RS Digital — Sistema de Pedidos de Livros e Apostilas Escolares

Sistema web para recebimento e gestão de pedidos de livros/apostilas escolares impressos da gráfica **RS Digital**, construído com **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase**.

---

## Principais Funcionalidades

1. **Identidade Visual RS Digital (Proposta 03 · Gráfica CMYK):**
   - Componente `<LogoIcon />` com os três círculos sobrepostos (`mix-blend-mode: multiply`), `<BrandLogo />` e tipografia **Sora** (`300`, `400`, `600`, `800`).
   - **Splash Screen animada:** giro suave de 360° (~1,2s) com mistura dos círculos CMYK, revelação de **"RS DIGITAL"** (~0,8s), controle por `sessionStorage` e suporte a `prefers-reduced-motion`.
2. **Formulário Público de Pedido (`/pedido`) — Mobile-First:**
   - Seleção encadeada de **Colégio → Série → Módulos** (com botão *Selecionar todos*).
   - Formas de pagamento (Pix, Dinheiro, Débito, Crédito à vista, Crédito parcelado de 2x a 12x com simulação de parcelas e juros).
   - Validação de cupom de desconto em tempo real (`BEMVINDO10`).
   - Rodapé fixo com subtotal, desconto, juros e total, aceite obrigatório da LGPD e trava contra clique duplo.
   - **Recálculo seguro no servidor:** total, desconto e juros são recalculados no servidor/banco ao gravar o pedido; `link_arquivo` nunca é exposto ao navegador público.
   - **Tela de confirmação:** exibe nº do pedido, resumo, data prevista de retirada (+7 dias corridos), endereço/horário e botão **Enviar comprovante pelo WhatsApp**.
3. **Painel do Administrador (`/admin`):**
   - Lista de pedidos em **ordem de chegada** com contadores no topo (*A fazer*, *Atrasados*, *Prontos*), filtros por status/colégio/série e busca.
   - **Alerta de prazo:** linha amarela quando faltam 2 dias ou menos; linha vermelha quando o prazo venceu sem estar pronto.
   - **Detalhe do pedido:** botão de 1 clique **Abrir arquivo** em cada módulo, marcação individual de **Impresso** e botão **Pronto — avisar cliente** (muda status para `pronto`, grava `pronto_em` e abre o WhatsApp do cliente com a mensagem interpolada).
   - **Visão "Imprimir por série":** agrupa todos os pedidos pendentes por `Colégio → Série → Módulo` somando a quantidade de cópias para impressão em lote, com filtro por colégio e botão de 1 clique para marcar o lote inteiro como impresso.
   - **Cadastros e Configurações:** gestão completa de Colégios, Séries (criar, editar, reordenar com setas e **Duplicar série**), Módulos (com suporte a links Google Drive/OneDrive e caminhos de rede), Cupons (criar, editar, ativar/desativar), taxas de parcelamento, mensagem padrão de WhatsApp e **Exportação para Excel/CSV** por período.

---

## 1. Como rodar localmente

```bash
# 1. Instale as dependências
npm install

# 2. Inicie o servidor de desenvolvimento
npm run dev
```

Acesse:
- **Formulário público do cliente:** `http://localhost:3000/pedido`
- **Painel da administradora:** `http://localhost:3000/admin`

> **Nota sobre o Modo Demonstração Local:** Se você ainda não tiver configurado o arquivo `.env.local` com as chaves do Supabase, o sistema funciona automaticamente com um banco local pré-populado com os dados de exemplo (seed). Nesse modo, acesse `/admin` com:
> - **E-mail:** `admin@rsdigital.com.br`
> - **Senha:** `rsdigital123`

---

## 2. Como criar e configurar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com/) e crie um novo projeto gratuito.
2. No menu lateral do Supabase, abra **SQL Editor** → **New Query**.
3. Copie todo o conteúdo do arquivo [`supabase/schema.sql`](./supabase/schema.sql), cole no editor e clique em **Run** (isso criará todas as tabelas, índices, a view pública `modulos_publicos`, políticas de RLS e funções RPC seguras).
4. Em seguida, abra uma nova query no **SQL Editor**, copie o conteúdo de [`supabase/seed.sql`](./supabase/seed.sql) e clique em **Run** para popular os 2 colégios de exemplo, 3 séries cada, 4 módulos por série a R$ 300,00, o cupom `BEMVINDO10` e as taxas de parcelamento.

---

## 3. Como criar o usuário Administrador no Supabase

1. No painel do Supabase, acesse **Authentication** → **Users**.
2. Clique em **Add user** → **Create new user**.
3. Informe o **E-mail** e a **Senha** da administradora, marque a opção **Auto Confirm User** e clique em **Create user**.

---

## 4. Como configurar as variáveis de ambiente

Copie o arquivo `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

No painel do Supabase, vá em **Project Settings** → **API** e preencha no `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLIC
SUPABASE_SERVICE_ROLE_KEY=SUA_CHAVE_SERVICE_ROLE_SECRET
```

---

## 5. Como publicar na Vercel (Plano Gratuito)

1. Suba este repositório para o seu GitHub / GitLab / Bitbucket.
2. Acesse [vercel.com](https://vercel.com/), clique em **Add New...** → **Project** e importe o repositório.
3. Na seção **Environment Variables**, adicione as três variáveis (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`).
4. Clique em **Deploy**. O sistema estará no ar pronto para uso!

