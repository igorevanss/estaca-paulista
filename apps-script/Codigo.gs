/**
 * Backend de acesso do Painel Estaca Paulista (Google Apps Script).
 *
 * Objetivo: manter a planilha PRIVADA. O painel deixa de ler a planilha
 * diretamente; ele passa a falar com este Web App, que só devolve os dados
 * depois que a pessoa faz login por CÓDIGO enviado ao e-mail dela (OTP).
 *
 * Fluxo:
 *   1) solicitarCodigo(email)  -> envia um código de 6 dígitos ao e-mail
 *   2) validarCodigo(email, codigo) -> devolve um "token" de sessão
 *   3) obterDados(token) -> devolve os dados das abas (se o token for válido)
 *
 * Funciona com qualquer provedor de e-mail (Gmail, Outlook, Yahoo...), pois
 * o login é o nosso código, não o login do Google.
 *
 * Antes de usar:
 *   - Confira o SHEET_ID abaixo (ID desta planilha).
 *   - Crie a aba "Acessos" com as colunas: Email | Nome | Ativo
 *     e preencha os e-mails autorizados (Ativo = Sim).
 *   - Publique como App da Web (veja o README.md desta pasta).
 */

var SHEET_ID = '1B7OIKv71nh8o-SbcMdSullAKeQRQwFYYXHm3WPfhIhc';
var ABAS_DADOS = [
  'Unidades',
  'Conversos',
  'Relatorios_Semanais',
  'Frequencia_Conversos'
];
var OTP_TTL_SEG = 10 * 60; // código vale 10 minutos
var TOKEN_TTL_DIAS = 30; // sessão vale 30 dias
var MAX_CODIGOS_HORA = 5; // máximo de códigos pedidos por e-mail/hora
var MAX_TENTATIVAS = 5; // tentativas de digitar o código

/* ────────────────────────────────────────────────────────────
   ROTEAMENTO
──────────────────────────────────────────────────────────── */
function doPost(e) {
  return handle(e);
}
function doGet(e) {
  return handle(e); // permite testar no navegador (?action=ping) e JSONP opcional
}

function handle(e) {
  var out;
  try {
    var p = {};
    if (e && e.postData && e.postData.contents) {
      p = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      p = e.parameter;
    }
    switch (p.action) {
      case 'ping':
        out = { ok: true, msg: 'Painel Estaca Paulista — backend ativo' };
        break;
      case 'solicitarCodigo':
        out = solicitarCodigo(p.email);
        break;
      case 'validarCodigo':
        out = validarCodigo(p.email, p.codigo);
        break;
      case 'obterDados':
        out = obterDados(p.token);
        break;
      default:
        out = { ok: false, erro: 'Ação inválida.' };
    }
  } catch (err) {
    out = { ok: false, erro: 'Erro interno: ' + err.message };
  }
  return responder(out, e && e.parameter ? e.parameter.callback : null);
}

function responder(obj, callback) {
  var txt = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + txt + ')').setMimeType(
      ContentService.MimeType.JAVASCRIPT
    );
  }
  return ContentService.createTextOutput(txt).setMimeType(
    ContentService.MimeType.JSON
  );
}

/* ────────────────────────────────────────────────────────────
   LISTA DE AUTORIZADOS (aba "Acessos": Email | Nome | Ativo)
──────────────────────────────────────────────────────────── */
function emailAutorizado(email) {
  if (!email) return null;
  var alvo = String(email).trim().toLowerCase();
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Acessos');
  if (!sh) return null;
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return null;
  var cab = vals[0].map(function (c) {
    return String(c).trim().toLowerCase();
  });
  var iEmail = cab.indexOf('email');
  var iNome = cab.indexOf('nome');
  var iAtivo = cab.indexOf('ativo');
  if (iEmail < 0) return null;
  for (var r = 1; r < vals.length; r++) {
    var em = String(vals[r][iEmail] || '')
      .trim()
      .toLowerCase();
    if (em && em === alvo) {
      var ativo =
        iAtivo < 0 ||
        /^(sim|s|true|1|x|yes)$/i.test(String(vals[r][iAtivo]).trim());
      if (!ativo) return null;
      return { email: alvo, nome: iNome >= 0 ? String(vals[r][iNome] || '') : '' };
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────
   PASSO 1 — SOLICITAR CÓDIGO
──────────────────────────────────────────────────────────── */
function solicitarCodigo(email) {
  var pessoa = emailAutorizado(email);
  if (!pessoa) {
    return {
      ok: false,
      erro: 'E-mail não autorizado. Fale com o responsável do painel.'
    };
  }
  var cache = CacheService.getScriptCache();
  var chaveLim = 'lim_' + pessoa.email;
  var qtd = parseInt(cache.get(chaveLim) || '0', 10);
  if (qtd >= MAX_CODIGOS_HORA) {
    return { ok: false, erro: 'Muitos códigos pedidos. Tente de novo em 1 hora.' };
  }

  var codigo = '' + Math.floor(100000 + Math.random() * 900000);
  cache.put('otp_' + pessoa.email, codigo + '|0', OTP_TTL_SEG);
  cache.put(chaveLim, String(qtd + 1), 3600);

  MailApp.sendEmail({
    to: pessoa.email,
    subject: 'Seu código de acesso — Painel Estaca Paulista',
    htmlBody:
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#222">' +
      '<p>Olá' +
      (pessoa.nome ? ' ' + escaparHtml(pessoa.nome) : '') +
      ',</p>' +
      '<p>Seu código de acesso ao <b>Painel da Estaca Paulista</b> é:</p>' +
      '<p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#0a4a80">' +
      codigo +
      '</p>' +
      '<p>Ele vale por 10 minutos. Se você não pediu este código, ignore este e-mail.</p>' +
      '</div>'
  });
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────
   PASSO 2 — VALIDAR CÓDIGO E EMITIR TOKEN
──────────────────────────────────────────────────────────── */
function validarCodigo(email, codigo) {
  var pessoa = emailAutorizado(email);
  if (!pessoa) return { ok: false, erro: 'E-mail não autorizado.' };

  var cache = CacheService.getScriptCache();
  var chave = 'otp_' + pessoa.email;
  var reg = cache.get(chave);
  if (!reg) return { ok: false, erro: 'Código expirado. Peça um novo.' };

  var partes = reg.split('|');
  var certo = partes[0];
  var tentativas = parseInt(partes[1] || '0', 10);
  if (tentativas >= MAX_TENTATIVAS) {
    cache.remove(chave);
    return { ok: false, erro: 'Muitas tentativas. Peça um novo código.' };
  }
  if (String(codigo).trim() !== certo) {
    cache.put(chave, certo + '|' + (tentativas + 1), OTP_TTL_SEG);
    return { ok: false, erro: 'Código incorreto.' };
  }

  cache.remove(chave);
  var token = gerarToken();
  salvarSessao(token, pessoa.email);
  return { ok: true, token: token, nome: pessoa.nome };
}

/* ────────────────────────────────────────────────────────────
   SESSÕES (tokens) — guardadas em Script Properties
──────────────────────────────────────────────────────────── */
function gerarToken() {
  return (
    Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '')
  );
}
function salvarSessao(token, email) {
  var expira = Date.now() + TOKEN_TTL_DIAS * 24 * 3600 * 1000;
  PropertiesService.getScriptProperties().setProperty(
    'sess_' + token,
    email + '|' + expira
  );
}
function validarSessao(token) {
  if (!token) return null;
  var props = PropertiesService.getScriptProperties();
  var v = props.getProperty('sess_' + token);
  if (!v) return null;
  var partes = v.split('|');
  if (Date.now() > parseInt(partes[1], 10)) {
    props.deleteProperty('sess_' + token);
    return null;
  }
  return partes[0];
}

/* ────────────────────────────────────────────────────────────
   PASSO 3 — OBTER DADOS (só com token válido)
──────────────────────────────────────────────────────────── */
function obterDados(token) {
  var email = validarSessao(token);
  if (!email) {
    return { ok: false, erro: 'Sessão expirada. Entre novamente.', naoAutorizado: true };
  }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var dados = {};
  ABAS_DADOS.forEach(function (nome) {
    dados[nome] = lerAba(ss, nome);
  });
  return { ok: true, dados: dados, usuario: email };
}

function lerAba(ss, nome) {
  var sh = ss.getSheetByName(nome);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var cab = vals[0].map(function (c) {
    return String(c).trim();
  });
  var tz = Session.getScriptTimeZone();
  var linhas = [];
  for (var r = 1; r < vals.length; r++) {
    var vazia = true;
    var obj = {};
    for (var c = 0; c < cab.length; c++) {
      if (!cab[c]) continue;
      var val = vals[r][c];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, tz, 'dd/MM/yyyy');
      }
      val = val === null || val === undefined ? '' : String(val).trim();
      if (val !== '') vazia = false;
      obj[cab[c]] = val;
    }
    if (!vazia) linhas.push(obj);
  }
  return linhas;
}

/* Limpa sessões expiradas (opcional — pode ser agendado por gatilho diário). */
function limparSessoesExpiradas() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  var agora = Date.now();
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf('sess_') === 0) {
      var exp = parseInt(String(todas[k]).split('|')[1], 10);
      if (!exp || agora > exp) props.deleteProperty(k);
    }
  });
}

function escaparHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
