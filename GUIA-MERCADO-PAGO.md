# Guia Passo a Passo — Integração Mercado Pago no Fórum EsEFEx

Este guia ensina como configurar o sistema de inscrições com pagamento via Mercado Pago para o XIII Fórum Científico da EsEFEx.

---

## PASSO 1 — Criar conta no Mercado Pago Developers

### 1.1. Acessar o painel de desenvolvedores

1. Abra o navegador e acesse: **https://www.mercadopago.com.br/developers**
2. Clique em **"Entrar"** no canto superior direito
3. Faça login com sua conta Mercado Pago (a mesma que você usa para receber pagamentos)
   - Se não tiver conta, clique em "Criar conta" e siga o cadastro com CPF/CNPJ, email e dados bancários

### 1.2. Criar uma aplicação

1. Após fazer login, você estará no painel de desenvolvedores
2. No menu lateral esquerdo, clique em **"Suas integrações"**
3. Clique no botão **"Criar aplicação"**
4. Preencha:
   - **Nome da aplicação**: `Forum EsEFEx 2026`
   - **Selecione um produto para integrar**: escolha **"Checkout Pro"** ou **"Pagamentos online"**
   - **Modelo de integração**: selecione **"Checkout API"**
5. Aceite os termos e clique em **"Criar aplicação"**

### 1.3. Obter as credenciais

1. Após criar, você será redirecionado para a tela da aplicação
2. No menu lateral, clique em **"Credenciais de produção"** (ou "Credenciais de teste" para testar primeiro)
3. Você verá duas chaves importantes:

   | Chave | Onde usar | Exemplo |
   |---|---|---|
   | **Public Key** | No arquivo `inscricao.html` (frontend) | `APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
   | **Access Token** | No arquivo `backend.gs` (Google Apps Script) | `APP_USR-xxxxxxxxxxxx-xxxxxx-xxxxxxxxxxxx-xxxxxxxxx` |

4. **IMPORTANTE**: Copie e guarde essas duas chaves em local seguro. O Access Token é secreto — nunca compartilhe publicamente.

### 1.4. Credenciais de TESTE (recomendado começar por aqui)

1. No mesmo painel, clique em **"Credenciais de teste"**
2. Copie a **Public Key de teste** e o **Access Token de teste**
3. Essas credenciais permitem simular pagamentos sem cobrar de verdade
4. O Mercado Pago fornece cartões de teste para simular:
   - **Cartão aprovado**: `5031 4332 1540 6351` (Mastercard)
   - **CVV**: `123`
   - **Validade**: qualquer data futura
   - **Nome**: `APRO` (para aprovar) ou `OTHE` (para recusar)
   - **CPF**: qualquer CPF válido (ex: `12345678909`)

---

## PASSO 2 — Criar a planilha Google Sheets

### 2.1. Criar a planilha

1. Acesse **https://sheets.google.com**
2. Faça login com sua conta Google
3. Clique em **"+"** (Planilha em branco) para criar uma nova planilha
4. Renomeie a planilha clicando no título "Planilha sem título" e digite: **`Inscrições Fórum EsEFEx 2026`**

### 2.2. Copiar o ID da planilha

1. Olhe a URL no navegador. Ela terá este formato:
   ```
   https://docs.google.com/spreadsheets/d/1Dhj1LvwNzykNN7PSN34m9EQhNl3vXy_aDLqZDIa8elY/edit?gid=0#gid=0
2. O **ID da planilha** é o texto longo entre `/d/` e `/edit`
3. Por exemplo, se a URL for:
   ```
   https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789/edit
   ```
   O ID é: **`1Dhj1LvwNzykNN7PSN34m9EQhNl3vXy_aDLqZDIa8elY`**
4. Copie esse ID — você vai usar no passo seguinte

### 2.3. (Opcional) Preparar a planilha

Não precisa criar cabeçalhos manualmente — o backend cria automaticamente na primeira inscrição. Mas se quiser, pode renomear a primeira aba para **"Inscrições"** (clique com botão direito na aba "Plan1" → "Renomear").

---

## PASSO 3 — Criar o Backend no Google Apps Script

### 3.1. Criar o projeto

1. Acesse **https://script.google.com**
2. Faça login com a **mesma conta Google** da planilha
3. Clique em **"Novo projeto"**
4. No topo, clique em "Projeto sem título" e renomeie para: **`Backend Forum EsEFEx`** OK

### 3.2. Colar o código

1. No editor, você verá um arquivo chamado `Código.gs` com uma função vazia
2. **Apague todo o conteúdo** que estiver lá
3. Abra o arquivo **`backend.gs`** que está na pasta do projeto (no VS Code ou Bloco de Notas)
4. **Copie todo o conteúdo** do arquivo `backend.gs`
5. **Cole** no editor do Google Apps Script (substituindo tudo)OK

### 3.3. Inserir suas credenciais

No topo do código, localize estas duas linhas:

```javascript
const ACCESS_TOKEN = 'TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';Falta
const SHEET_ID     = 'COLE_O_ID_DA_SUA_PLANILHA_AQUI';OK
```

Substitua:
- `TEST-xxxx...` pelo seu **Access Token** do Mercado Pago (copiado no Passo 1.3) falta
- `COLE_O_ID_DA_SUA_PLANILHA_AQUI` pelo **ID da planilha** (copiado no Passo 2.2)

Exemplo de como deve ficar:
```javascript
const ACCESS_TOKEN = 'APP_USR-1234567890123456-010101-abcdefghijklmnop-123456789';
const SHEET_ID     = '1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
```

### 3.4. Salvar o projeto

1. Pressione **Ctrl + S** para salvar
2. Ou clique no ícone de disquete na barra de ferramentas

### 3.5. Implantar como Web App

1. No menu superior, clique em **"Implantar"** → **"Nova implantação"**
2. No campo "Selecione o tipo", clique no ícone de engrenagem ⚙️ e selecione **"App da Web"**
3. Preencha:
   - **Descrição**: `Backend inscrições Fórum EsEFEx`
   - **Executar como**: **Eu** (seu email)
   - **Quem tem acesso**: **Qualquer pessoa**
4. Clique em **"Implantar"**
5. O Google vai pedir autorização. Clique em **"Autorizar acesso"**
   - Se aparecer "Este app não foi verificado", clique em **"Avançado"** → **"Acessar Backend Forum EsEFEx (não seguro)"**
   - Isso é normal para scripts próprios — clique em **"Permitir"**
6. Após autorizar, você verá a **URL da implantação**. Ela tem este formato: codigod e implantacao AKfycbzNIT25UOMFs9thixVWD5pnFu4Z4Yla5hMPi6yNPEo4IDdlPSi_QCUa8XP0sCR8W4mo
   ```
   https://script.google.com/macros/s/AKfycbxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec
   ```
7. **Copie essa URL**https://script.google.com/macros/s/AKfycbxJNT7l1Za1LfQUOZfvXpXbBC0F_lLg7jHZPt_GZ43E8ZxnbyK2V32hn-G80vpYYvU/exec — você vai usar no próximo passo

### IMPORTANTE: Atualizando o backend

Sempre que alterar o código do `backend.gs`, você precisa criar uma **nova implantação**:
1. Clique em **"Implantar"** → **"Gerenciar implantações"**
2. Clique no ícone de lápis ✏️ na implantação existente
3. Em **"Versão"**, selecione **"Nova versão"**
4. Clique em **"Implantar"**
5. A URL permanece a mesma

---

## PASSO 4 — Conectar as credenciais no site

### 4.1. Editar o inscricao.html

1. Abra o arquivo **`inscricao.html`** no VS Code
2. Procure (Ctrl + F) por `CONFIG` — está perto da linha 340
3. Você encontrará:

```javascript
const CONFIG = {
  MP_PUBLIC_KEY: 'TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  BACKEND_URL: 'https://script.google.com/macros/s/SEU_SCRIPT_ID/exec',
};
```

4. Substitua:
   - `TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` pela sua **Public Key** do Mercado Pago (copiada no Passo 1.3)
   - `https://script.google.com/macros/s/SEU_SCRIPT_ID/exec` pela **URL do Apps Script** (copiada no Passo 3.5)

5. Exemplo de como deve ficar:
```javascript
const CONFIG = {
  MP_PUBLIC_KEY: 'APP_USR-abcd1234-efgh-5678-ijkl-9012mnopqrst',
  BACKEND_URL: 'https://script.google.com/macros/s/AKfycbxXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec',
};
```

6. Salve o arquivo (Ctrl + S)

### 4.2. Testar localmente

1. Abra o arquivo `inscricao.html` no navegador (duplo clique ou arraste para o navegador)
2. Verifique se:
   - Os 3 cards de ingresso aparecem corretamente
   - Os seletores de quantidade funcionam ([-] e [+])
   - O resumo do pedido aparece quando seleciona ingressos
   - O formulário aparece após selecionar um ingresso
   - O formulário de pagamento do Mercado Pago carrega após preencher os dados

### 4.3. Fazer um pagamento de teste

1. Use as **credenciais de teste** (Passo 1.4)
2. Selecione um ingresso e preencha o formulário com dados fictícios
3. No formulário de pagamento, use o cartão de teste:
   - Número: `5031 4332 1540 6351`
   - CVV: `123`
   - Validade: qualquer data futura (ex: `11/30`)
   - Titular: `APRO`
   - CPF: qualquer CPF válido
4. Confirme o pagamento
5. Se tudo funcionar, você será redirecionado para a página de confirmação
6. Verifique a planilha Google Sheets — deve ter uma nova linha com os dados
7. Verifique o email informado — deve ter recebido o email de confirmação

---

## PASSO 5 — Ir para produção

Após testar e confirmar que tudo funciona:

### 5.1. Trocar para credenciais de produção

1. No painel do Mercado Pago Developers, vá em **"Credenciais de produção"**
2. Copie a **Public Key de produção**
3. Copie o **Access Token de produção**
4. Substitua nos arquivos:
   - **`inscricao.html`**: troque a Public Key no `CONFIG.MP_PUBLIC_KEY`
   - **`backend.gs`** (no Google Apps Script): troque o Access Token na variável `ACCESS_TOKEN`
5. No Google Apps Script, crie uma **nova versão** da implantação (Passo 3, seção "Atualizando o backend")

### 5.2. Fazer um teste real com R$ 1,00

Antes de abrir as inscrições, altere temporariamente o preço de um ingresso para R$ 1,00 e faça uma compra real com seu próprio cartão ou Pix. Confirme que:
- O pagamento aparece no painel do Mercado Pago
- A planilha registrou a inscrição
- O email de confirmação chegou

Depois, volte os preços ao normal (R$ 50, R$ 80, R$ 180).

### 5.3. Trocar o link do Sympla no site

Quando tudo estiver funcionando, me avise e eu troco os botões "Inscreva-se" do site para apontar para `inscricao.html` em vez do Sympla.

---

## Resumo das credenciais e onde cada uma vai

| Credencial | Arquivo | Variável |
|---|---|---|
| Public Key (Mercado Pago) | `inscricao.html` | `CONFIG.MP_PUBLIC_KEY` |
| Access Token (Mercado Pago) | `backend.gs` (Google Apps Script) | `ACCESS_TOKEN` |
| ID da Planilha (Google Sheets) | `backend.gs` (Google Apps Script) | `SHEET_ID` |
| URL do Apps Script | `inscricao.html` | `CONFIG.BACKEND_URL` |

---

## Dúvidas frequentes

**P: Quanto tempo leva para configurar?**
R: Cerca de 20 a 30 minutos seguindo este guia.

**P: Preciso pagar algo para usar o Mercado Pago?**
R: Não. A criação de conta e a integração são gratuitas. Você só paga a taxa sobre cada pagamento recebido (0% Pix, ~4% cartão).

**P: E se eu alterar o código do backend depois?**
R: Precisa criar uma nova versão da implantação no Google Apps Script (veja seção "Atualizando o backend" no Passo 3).

**P: Os dados dos inscritos ficam seguros?**
R: Sim. Os dados ficam na sua planilha Google Sheets (acessível apenas com sua conta Google). O pagamento é processado diretamente pelo Mercado Pago, que é certificado PCI DSS.

**P: Posso usar o Pix?**
R: Sim. O Mercado Pago Bricks já inclui Pix automaticamente. O QR Code aparece direto no site.

**P: E se o inscrito não receber o email?**
R: Verifique a pasta de spam. O email é enviado pela conta Google que criou o Apps Script. Se necessário, os dados completos da inscrição estarão sempre na planilha.
