# Lanchonete Boca Cheia - contas, pagamentos e painel administrativo

React 19 + Vite (frontend) - Express 5 (backend) - **PostgreSQL + Drizzle ORM** - npm workspaces.

## Recursos
- Clientes consultam o cardápio, adicionam itens à própria conta, fazem pagamentos parciais e veem histórico.
- Administradores cadastram usuários como clientes ou administradores, arquivam e restauram usuários e gerenciam contas, pagamentos, produtos, formas de pagamento e auditoria. Arquivar encerra as sessões e bloqueia o acesso, preservando o histórico financeiro. Um usuário arquivado também pode ser excluído permanentemente: as contas e os itens são apagados, os pagamentos não pendentes permanecem sem vínculo pessoal e a operação é bloqueada enquanto houver pagamentos pendentes.
- Contas e pagamentos mantêm histórico; operações financeiras usam transações e chave de idempotência.

## Requisitos
- Node.js 22 ou superior
- PostgreSQL 15+ (Supabase PostgreSQL também é suportado)

## Configurar PostgreSQL localmente

**Com Docker**
```powershell
docker compose up -d
```
O compose cria o banco `lanchonete` e um usuário local de desenvolvimento.

Configure o backend:
```powershell
if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
notepad backend\.env
npm install
npm run db:setup --workspace backend
npm run dev
```
Para PostgreSQL local, use `DB_HOST=127.0.0.1`, `DB_PORT=5432`, `DB_USER=lanchonete`, `DB_PASSWORD=lanchonete_dev`, `DB_NAME=lanchonete` e `DB_SSL=false`.

## Configurar Supabase

No painel do projeto, abra **Connect** e copie a URI do pooler recomendada para o backend. Em redes IPv4, use o **Session pooler** (porta 5432); a conexão direta do Supabase exige IPv6. Configure a URI como `DATABASE_URL` no `backend/.env` e use `DB_SSL=true`. Para validar o certificado TLS, baixe o certificado CA em **Database → Settings → SSL Configuration** e salve-o em `backend/certs/prod-ca-2021.crt`. No Render, configure `DB_SSL_CA_FILE=certs/prod-ca-2021.crt`; inclua o certificado público no repositório para que o serviço tenha o arquivo no deploy. Mantenha a URI somente no backend; nunca a coloque em variáveis `VITE_*`. Se usar variáveis separadas, informe o host, a porta, o usuário, a senha e o nome do banco exatamente como mostrados pelo Supabase.

As tabelas da aplicação são criadas no schema `lanchonete_app`, com RLS habilitado e sem políticas públicas: o acesso é feito pela API Express no backend, não diretamente pelo navegador/Data API. O schema `public` permanece intacto para tabelas legadas que já existiam no projeto.

Antes de executar `npm run db:setup --workspace backend`, confira se o destino é o projeto e banco corretos e revise a migração gerada. O comando aplica migrações e prepara os dados iniciais.

- Frontend: http://localhost:5173 - API: http://localhost:3000
- `start-windows.bat` instala dependências, prepara o banco e inicia a aplicação.
- Na primeira inicialização, o administrador é criado com `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Se a senha estiver vazia, uma senha aleatória aparece uma vez no terminal.
- A conexão do banco fica somente no backend.

## Publicar o site no Firebase e a API no Render

O Firebase Hosting publica apenas os arquivos estáticos do frontend; ele não inicia o servidor Express. A API precisa estar publicada separadamente. Este repositório inclui um Blueprint em `../render.yaml` para hospedar a API no Render e usar o PostgreSQL do Supabase.

1. Envie o repositório para o GitHub e, no Render, crie um Blueprint apontando para ele e selecione `render.yaml`.
2. No Render, informe `DATABASE_URL` com a URI do **Session pooler** do Supabase (porta 5432), defina uma senha forte em `ADMIN_PASSWORD` e configure o SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM`. Para Gmail, use `smtp.gmail.com`, porta `587`, o endereço Gmail em `SMTP_USER` e `MAIL_FROM`, e uma senha de app Google em `SMTP_PASS` (requer verificação em duas etapas). Nunca use a senha normal da conta. Não coloque essas credenciais em arquivos `VITE_*` nem no repositório.
3. No Supabase, baixe o certificado CA em **Database → Settings → SSL Configuration**. Salve a cópia como `token-lanchonete-main/backend/certs/prod-ca-2021.crt`, envie esse arquivo público ao GitHub e aguarde o novo deploy do Render. O Blueprint define `DB_SSL_CA_FILE=certs/prod-ca-2021.crt`.
4. Aguarde o deploy e confirme que `https://lanchonete-boca-cheia-api.onrender.com/api/health` responde com `{"ok":true,...}`. O primeiro início aplica as migrações e prepara os dados iniciais.
5. Copie `frontend/.env.production.example` para `frontend/.env.production` e confirme que `VITE_API_URL` aponta para a URL real da API, terminando em `/api`.
6. Na raiz do repositório, gere os arquivos que o Firebase publica e faça o deploy:

   ```powershell
   npm --prefix token-lanchonete-main run build --workspace frontend
   firebase deploy --only hosting
   ```

O build do Vite grava os arquivos em `public/`, pasta configurada no Firebase Hosting. Se o nome/endereço do serviço Render for diferente, atualize `VITE_API_URL` em `frontend/.env.production` antes de gerar o build. A alteração dessa variável exige novo build e novo deploy do Hosting.

Se o banco já tiver usuários, alterar `ADMIN_PASSWORD` no Render não troca a senha de uma conta existente. Altere a senha administrativa após recuperar o acesso; não reutilize uma senha que tenha sido compartilhada.

## Evoluir o schema
Edite os modelos em `backend/src/db/schema.js` e gere/revise a migração antes de aplicá-la:
```powershell
npm run db:generate --workspace backend
npm run db:setup --workspace backend
```

## Importar dados antigos do SQLite/JSON
Se houver dados legados em `backend/data/`, importe-os antes de usar a aplicação:
```powershell
npm run db:migrate-legacy --workspace backend -- --dry-run
npm run db:migrate-legacy --workspace backend
```
O processo lê SQLite/JSON, valida contagens e totais e não altera os arquivos antigos. Essa rotina não migra automaticamente dados que estejam em outra instalação PostgreSQL; exporte e valide esses dados separadamente antes de mudar de banco.

## Pagamentos e e-mail
- Pix pode ser confirmado manualmente ou via Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`).
- Para enviar confirmações pelo Gmail, configure `SMTP_USER` e `MAIL_FROM` com seu endereço Gmail e `SMTP_PASS` com uma senha de app Google (requer verificação em duas etapas). O `.env` já usa `SMTP_HOST=smtp.gmail.com` e `SMTP_PORT=587`; nunca use a senha normal da conta nem compartilhe esses dados. Reinicie o servidor depois de salvar.
- Em produção no Render, configure essas variáveis na página **Environment** do serviço e faça um novo deploy. O `render.yaml` declara as variáveis SMTP como valores secretos/não sincronizados; elas precisam ser preenchidas no painel. Se o cadastro mostrar que o e-mail não foi enviado, revise os logs do serviço e as credenciais SMTP.

## Testes
Use `TEST_DATABASE_URL` com um banco PostgreSQL local e separado. A suíte limpa as tabelas desse banco; nunca use a URL de produção:
```powershell
npm test --workspace backend
```
Os testes cobrem cadastro/login, itens, pagamentos parciais/totais, concorrência, permissões, idempotência, provedor (mock) e importação legada.

## Estrutura
```
backend/src   config, database, db/schema, services, controllers, routes, providers, scripts
backend/tests testes automatizados
frontend/src  App, components, admin, lib, services
```
