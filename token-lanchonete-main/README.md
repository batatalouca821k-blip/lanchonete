# Lanchonete Boca Cheia - contas, pagamentos e painel administrativo

React 19 + Vite (frontend) - Express 5 (backend) - **PostgreSQL + Drizzle ORM** - npm workspaces.

## Recursos
- Clientes consultam o cardápio, adicionam itens à própria conta, fazem pagamentos parciais e veem histórico.
- Administradores gerenciam usuários, contas, pagamentos, produtos, formas de pagamento e auditoria.
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

No painel do projeto, abra **Connect** e copie a URI do pooler recomendada para o backend. Em redes IPv4, use o **Session pooler** (porta 5432); a conexão direta do Supabase exige IPv6. Configure a URI como `DATABASE_URL` no `backend/.env` e use `DB_SSL=true`. Para validar o certificado TLS, baixe o certificado CA em **Database → Settings → SSL Configuration**, salve-o em `backend/certs/prod-ca-2021.crt` e configure `DB_SSL_CA_FILE=certs/prod-ca-2021.crt`. Mantenha a URI somente no backend; nunca a coloque em variáveis `VITE_*`. Se usar variáveis separadas, informe o host, a porta, o usuário, a senha e o nome do banco exatamente como mostrados pelo Supabase.

As tabelas da aplicação são criadas no schema `lanchonete_app`, com RLS habilitado e sem políticas públicas: o acesso é feito pela API Express no backend, não diretamente pelo navegador/Data API. O schema `public` permanece intacto para tabelas legadas que já existiam no projeto.

Antes de executar `npm run db:setup --workspace backend`, confira se o destino é o projeto e banco corretos e revise a migração gerada. O comando aplica migrações e prepara os dados iniciais.

- Frontend: http://localhost:5173 - API: http://localhost:3000
- `start-windows.bat` instala dependências, prepara o banco e inicia a aplicação.
- Na primeira inicialização, o administrador é criado com `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Se a senha estiver vazia, uma senha aleatória aparece uma vez no terminal.
- A conexão do banco fica somente no backend.

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
