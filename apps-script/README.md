# Acesso seguro do Painel — Backend (Google Apps Script)

Este backend deixa a planilha **privada** e faz o painel exigir **login por
código enviado ao e-mail** (OTP). Funciona com qualquer provedor de e-mail
(Gmail, Outlook, Yahoo…), porque o login é o nosso código — não o login do
Google.

**Como funciona (resumo):**

```
Painel  →  "solicitarCodigo(email)"  →  Apps Script envia código por e-mail
Painel  →  "validarCodigo(email, código)"  →  Apps Script devolve um TOKEN
Painel  →  "obterDados(token)"  →  Apps Script devolve os dados (só com token válido)
```

Os dados nunca ficam públicos: só saem da planilha para quem passou pelo código.

---

## Passo a passo (uma vez, ~10 minutos)

### 1. Tornar a planilha privada
Na planilha `Estaca_Paulista_Sistema`:
- **Compartilhar** → em "Acesso geral", troque de "Qualquer pessoa com o link"
  para **"Restrito"**.
- Mantenha só você (e quem realmente edita) com acesso.

> A partir daqui o painel **não lê mais a planilha diretamente** — quem lê é
> este script, rodando na sua conta.

### 2. Criar a lista de autorizados (aba `Acessos`)
Crie uma aba chamada **`Acessos`** com estas 3 colunas na linha 1:

| Email | Nome | Ativo |
|---|---|---|
| fulano@gmail.com | Fulano de Tal | Sim |
| beltrano@outlook.com | Beltrano | Sim |
| ... | ... | ... |

- Coloque os ~20 e-mails dos líderes que podem acessar.
- `Ativo` = `Sim` libera; qualquer outra coisa (ou `Não`) bloqueia sem apagar
  a linha.

### 3. Abrir o editor de script
Na planilha: menu **Extensões → Apps Script**.
- Apague qualquer conteúdo do arquivo que abrir.
- Cole **todo** o conteúdo de [`Codigo.gs`](./Codigo.gs).
- Confira que a constante `SHEET_ID` no topo é o ID desta planilha
  (o trecho entre `/d/` e `/edit` no link da planilha).
- Salve (💾).

### 4. Publicar como App da Web
No editor: **Implantar → Nova implantação**.
- Engrenagem ⚙️ → tipo **App da Web**.
- **Executar como:** `Eu` (seu e-mail).
- **Quem tem acesso:** `Qualquer pessoa`.
  - ⚠️ É "Qualquer pessoa" mesmo (não "qualquer pessoa com conta Google") —
    assim quem usa Outlook/Yahoo consegue chamar. Quem protege os dados é o
    nosso código (OTP), não o login do Google.
- **Implantar**.
- Vai pedir autorização: escolha sua conta → em "app não verificado" clique
  **Avançado → Ir para (nome) (não seguro)** → **Permitir**. (É seu próprio
  script pedindo para enviar e-mail e ler a planilha.)
- **Copie a URL do app da Web** (termina em `/exec`). Guarde — é ela que o
  painel vai usar.

### 5. Testar rápido (opcional)
Abra no navegador: `SUA_URL_DO_EXEC?action=ping`
Deve responder algo como:
```json
{"ok":true,"msg":"Painel Estaca Paulista — backend ativo"}
```

### 6. Me mandar a URL
Passe a URL do `/exec` para o painel ser conectado a ela.

---

## Manutenção

- **Adicionar/remover pessoas:** edite a aba `Acessos` (não precisa republicar).
- **Trocar quem enviou o código:** os e-mails saem do endereço da conta que
  publicou o script.
- **Sessões:** cada login vale **30 dias** no aparelho; depois pede o código de
  novo. Para forçar todo mundo a entrar de novo, faça uma **nova implantação**
  (ou apague as `Script Properties`).
- **Limite anti-spam:** cada e-mail pode pedir no máximo **5 códigos por hora**.
- **Cota de e-mail:** contas Gmail comuns enviam até ~100 e-mails/dia — de sobra
  para ~20 pessoas.

## Segurança — o que este desenho garante (e o que não garante)

- ✅ A planilha fica **privada**; os dados só saem para e-mails autorizados.
- ✅ Cada pessoa prova que é dona do e-mail (recebe o código lá).
- ✅ Dá para **revogar** alguém (Ativo = Não) sem apagar dados.
- ⚠️ O token de sessão fica no navegador da pessoa (localStorage). Em aparelho
  compartilhado, convém sair/limpar. Podemos adicionar um botão "Sair".
- ⚠️ Não é criptografia de nível bancário — é proteção proporcional a um painel
  interno de ~20 líderes. Se um dia precisar de mais, dá para evoluir.
