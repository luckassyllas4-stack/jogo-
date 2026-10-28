# MEGA RASPADINHA — aplicação web

Aplicação inicial em HTML, CSS, JavaScript, Node.js, Express e SQLite. Inclui página pública responsiva, cadastro de usuário, painel administrativo, upload de imagens, configurações, preço/dificuldade, pedidos, QR Code ilustrativo e endpoint preparado para webhook.

## Requisitos
- Node.js 18 ou superior
- npm

## Instalação no Windows
1. Extraia a pasta ZIP.
2. Abra a pasta no terminal/PowerShell.
3. Execute `npm install`.
4. Copie `.env.example` para `.env`.
5. Edite `.env` e defina uma senha forte em `ADMIN_PASSWORD` e uma chave aleatória em `SESSION_SECRET`.
6. Execute `npm start`.
7. Acesse `http://localhost:3000`.
8. Painel administrativo: `http://localhost:3000/admin.html`.

## O que já funciona
- Cadastro de usuário por nome e telefone (SQLite).
- Painel protegido por senha de administrador.
- Configuração do nome, logo, suporte, texto inicial e link de pagamento.
- Upload de imagens de logo e raspadinhas.
- Criação/desativação de raspadinhas, preço e nível visual de dificuldade.
- Registro de pedidos e QR Code que aponta para o link de pagamento configurado.
- Bloqueio da raspadinha até que o pedido tenha status `paid`.
- Endpoint `POST /api/webhooks/payment` reservado para integração real.

## Pagamentos: etapa obrigatória antes de publicar
A integração de pagamento real NÃO está pronta neste projeto. O endpoint de webhook retorna HTTP 501 intencionalmente até que a integração específica seja implementada. Não use o botão “Marcar pago (DEMO)” em produção.

Para integrar Mercado Pago, AbacatePay ou outro provedor:
1. Crie a cobrança pela API oficial no backend (não exponha tokens no frontend).
2. Salve o identificador da transação e associe-o ao pedido interno.
3. Configure o webhook no painel do provedor apontando para `https://SEU-DOMINIO/api/webhooks/payment`.
4. Valide assinatura/autenticidade conforme a documentação oficial.
5. Consulte a API oficial do provedor para confirmar status, valor, moeda e referência.
6. Atualize o pedido como `paid` somente após confirmação verificada.
7. Faça processamento idempotente e teste em ambiente de homologação.

O QR Code atual é gerado a partir do link configurado e NÃO prova que houve pagamento. O backend não marca um pedido como pago por redirecionamento do navegador.

## Banco de dados
SQLite é criado automaticamente no arquivo `data.sqlite`. Faça backups regulares. Para uso de produção com várias instâncias, migre para PostgreSQL ou outro banco gerenciado.

## Segurança antes de produção
- Use HTTPS.
- Use um `SESSION_SECRET` longo e aleatório.
- Defina `NODE_ENV=production`.
- Configure cookies seguros, rate limiting, proteção CSRF e política de privacidade.
- Restrinja upload e tamanho/tipo de arquivos.
- Não armazene dados de cartão.
- Use logs sem segredos.
- Adicione recuperação de senha e controles de acesso se necessário.
- Configure o provedor de sessão para armazenamento persistente; o armazenamento padrão de sessão do Express é apenas para desenvolvimento.

## Importante sobre raspadinhas e prêmios
Este repositório é um protótipo técnico. Não contém sorteio auditado nem sistema real de premiação. Antes de cobrar por participação ou oferecer prêmios em dinheiro, verifique a legislação aplicável no Brasil, as autorizações necessárias e as regras do provedor de pagamento. Não anuncie prêmios reais nem use o protótipo como uma operação de jogo/aposta sem a revisão legal e técnica apropriada.
