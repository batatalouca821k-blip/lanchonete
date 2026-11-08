Este projeto é um sistema completo para gestão de lanchonete, voltado para controlar pedidos, pagamentos, contas e administração de produtos e usuários. Ele combina um frontend em React com Vite, um backend em Express e um banco PostgreSQL com Drizzle ORM, permitindo que o cliente veja o cardápio, adicione itens à conta e acompanhe pagamentos, enquanto o administrador consegue gerenciar produtos, usuários, formas de pagamento, auditoria e histórico financeiro.

O projeto está estruturado em workspaces, com a parte do frontend e do backend separadas, mas rodando juntas em uma única aplicação. A configuração principal está em package.json, e a documentação oficial do projeto está em README.md.

Resumo do que ele faz:

Cliente:
consulta cardápio
adiciona itens na conta
realiza pagamentos parciais ou totais
acompanha histórico
Administrador:
gerencia usuários e contas
controla produtos e formas de pagamento
analisa movimentação financeira e auditoria
Como rodar o projeto

Abra o terminal na pasta do projeto:
cd C:\Users\muril\Downloads\lanchonete-da-tuca\token-lanchonete-main

Instale as dependências:
npm install

Configure o banco PostgreSQL:
Se quiser rodar localmente com Docker:
docker compose up -d

Crie o arquivo de ambiente do backend:
if (!(Test-Path backend.env)) { Copy-Item backend.env.example backend.env }

Depois edite o arquivo backend.env com as credenciais do banco. Exemplo:
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=lanchonete
DB_PASSWORD=lanchonete_dev
DB_NAME=lanchonete
DB_SSL=false

Prepare o banco:
npm run db:setup --workspace backend

Inicie a aplicação:
npm run dev

Pronto: o sistema deve subir com:

Frontend: http://localhost:5173
Backend/API: http://localhost:3000
Se quiser uma forma mais automática no Windows, o projeto também inclui o arquivo start-windows.bat, que ajuda a instalar dependências, preparar o banco e iniciar a aplicação.
