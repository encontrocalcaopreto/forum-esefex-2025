/**
 * ═══════════════════════════════════════════════════════════════
 * BACKEND — XIII Fórum Científico da EsEFEx
 * Google Apps Script para processar pagamentos Mercado Pago
 * e registrar inscrições em Google Sheets.
 *
 * COMO USAR:
 * 1. Acesse https://script.google.com → Novo projeto
 * 2. Cole este código no editor
 * 3. Substitua ACCESS_TOKEN pela sua chave do Mercado Pago
 * 4. Crie uma planilha Google Sheets e copie o ID dela
 * 5. Substitua SHEET_ID pelo ID da planilha
 * 6. Implante como Web App:
 *    → Implantar → Nova implantação → App da Web
 *    → Executar como: Eu
 *    → Quem tem acesso: Qualquer pessoa
 * 7. Copie a URL gerada e cole no CONFIG.BACKEND_URL do inscricao.html
 * ═══════════════════════════════════════════════════════════════
 */

// ── CONFIGURAÇÃO ──
// ⚠️ Mova as credenciais para PropertiesService no Apps Script:
// Apps Script → Configurações → Propriedades do Script → adicionar MP_ACCESS_TOKEN e SHEET_ID
const ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('MP_ACCESS_TOKEN');
const SHEET_ID     = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
const SHEET_NAME   = 'Inscrições';

// Preços oficiais — NUNCA confiar no frontend
const PRECOS_SERVIDOR = {
  'Inscrição Básica': 100,
  'Inscrição Personalizada': 160,
  'Inscrição Experience Hyrox': 360,
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function validarCPF(cpf) {
  cpf = String(cpf).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let t = 9; t < 11; t++) {
    let d = 0;
    for (let c = 0; c < t; c++) d += parseInt(cpf.charAt(c)) * ((t + 1) - c);
    d = ((10 * d) % 11) % 10;
    if (parseInt(cpf.charAt(t)) !== d) return false;
  }
  return true;
}

function validarPrecos(items) {
  let totalServidor = 0;
  for (const item of items) {
    const precoReal = PRECOS_SERVIDOR[item.tipo];
    if (!precoReal) return { ok: false, message: 'Tipo de ingresso inválido: ' + item.tipo };
    if (item.quantidade < 1 || item.quantidade > 10) return { ok: false, message: 'Quantidade inválida' };
    totalServidor += precoReal * item.quantidade;
  }
  return { ok: true, total: totalServidor };
}

/**
 * Rate limiting — máximo 5 requests/minuto por CPF
 */
function checkRateLimit(cpf) {
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + cpf.replace(/\D/g, '');
  const current = parseInt(cache.get(key) || '0');
  if (current >= 5) return false;
  cache.put(key, String(current + 1), 60);
  return true;
}

/**
 * Endpoint principal — recebe POST do frontend
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Ação de verificação de pagamento Pix (polling)
    if (data.action === 'check_payment' && data.payment_id) {
      return checkPixPayment(data.payment_id);
    }

    const { paymentData, inscrito, items } = data;

    // Rate limiting
    if (inscrito && inscrito.cpf && !checkRateLimit(inscrito.cpf)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'rejected',
        message: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 0a. Validar CPF
    if (!validarCPF(inscrito.cpf)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'rejected',
        message: 'CPF inválido.',
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 0b. Validar preços no servidor (NUNCA confiar no total do frontend)
    const precoCheck = validarPrecos(items);
    if (!precoCheck.ok) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'rejected',
        message: precoCheck.message,
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const total = precoCheck.total;

    // 0c. Verificar limites de vagas com lock de concorrência
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (lockErr) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'rejected',
        message: 'Servidor ocupado. Tente novamente em alguns segundos.',
      })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      const limiteCheck = verificarLimiteVagas(items);
      if (!limiteCheck.ok) {
        lock.releaseLock();
        return ContentService.createTextOutput(JSON.stringify({
          status: 'rejected',
          message: limiteCheck.message,
        })).setMimeType(ContentService.MimeType.JSON);
      }
    } catch (limErr) {
      lock.releaseLock();
      throw limErr;
    }

    // 1. Processar pagamento no Mercado Pago
    const paymentResult = processPayment(paymentData, inscrito, items, total);

    if (paymentResult.status === 'approved') {
      // 2. Salvar na planilha
      try {
        saveToSheet(inscrito, items, total, paymentResult);
        Logger.log('Planilha salva com sucesso');
      } catch (sheetErr) {
        Logger.log('ERRO ao salvar na planilha: ' + sheetErr.toString());
      } finally {
        lock.releaseLock();
      }

      // 3. Enviar email de confirmação
      try {
        sendConfirmationEmail(inscrito, items, total, paymentResult.id);
        Logger.log('Email enviado com sucesso');
      } catch (emailErr) {
        Logger.log('ERRO ao enviar email: ' + emailErr.toString());
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'approved',
        payment_id: paymentResult.id,
        message: 'Pagamento aprovado com sucesso!'
      })).setMimeType(ContentService.MimeType.JSON);

    } else if (paymentResult.status === 'pending' && paymentResult.payment_method_id === 'pix') {
      // Pix: status pending — retornar QR Code para o frontend exibir
      // Salvar na planilha como "Aguardando Pix"
      try {
        saveToSheet(inscrito, items, total, paymentResult, 'Aguardando Pix');
        Logger.log('Planilha salva (Pix pendente)');
      } catch (sheetErr) {
        Logger.log('ERRO ao salvar na planilha (Pix): ' + sheetErr.toString());
      } finally {
        lock.releaseLock();
      }

      const pixData = paymentResult.point_of_interaction || {};
      const txData = pixData.transaction_data || {};

      return ContentService.createTextOutput(JSON.stringify({
        status: 'pending_pix',
        payment_id: paymentResult.id,
        qr_code: txData.qr_code || '',
        qr_code_base64: txData.qr_code_base64 || '',
        ticket_url: txData.ticket_url || '',
        message: 'Pix gerado! Escaneie o QR Code para pagar.'
      })).setMimeType(ContentService.MimeType.JSON);

    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: paymentResult.status || 'rejected',
        status_detail: paymentResult.status_detail || '',
        mp_message: paymentResult.message || '',
        mp_cause: paymentResult.cause || '',
        message: paymentResult.status_detail || 'Pagamento não aprovado. Tente novamente.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (err) {
    Logger.log('Erro doPost: ' + err.toString());
    try { LockService.getScriptLock().releaseLock(); } catch(e) {}
    return ContentService.createTextOutput(JSON.stringify({
      status: 400,
      message: 'Erro ao processar inscrição. Tente novamente ou entre em contato com labio.esefex@gmail.com'
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * doGet — mantido como fallback e health check
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'check_payment' && e.parameter.id) {
    return checkPixPayment(e.parameter.id);
  }

  if (e && e.parameter && e.parameter.action === 'vagas') {
    return retornarVagas();
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'Backend do XIII Fórum Científico da EsEFEx ativo.'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Retorna quantidade de vagas restantes para cada categoria
 */
function retornarVagas() {
  const LIMITE_BP = 150;
  const LIMITE_EXP = 60;

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  let vendidosBP = 0;
  let vendidosExp = 0;

  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const status = data[i][17];
      if (status === 'Aprovado' || status === 'Aguardando Pix') {
        const ingressos = String(data[i][10]);
        const qtd = parseInt(data[i][11]) || 0;
        if (ingressos.includes('Experience')) {
          vendidosExp += qtd;
        } else {
          vendidosBP += qtd;
        }
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    basicaPersonalizada: { vendidos: vendidosBP, limite: LIMITE_BP, restantes: Math.max(0, LIMITE_BP - vendidosBP) },
    experience: { vendidos: vendidosExp, limite: LIMITE_EXP, restantes: Math.max(0, LIMITE_EXP - vendidosExp) },
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Verificar status de pagamento Pix na API do Mercado Pago
 * Chamado via doPost (polling do frontend) ou doGet (fallback)
 */
function checkPixPayment(paymentId) {
  try {
    const url = 'https://api.mercadopago.com/v1/payments/' + paymentId;
    const options = {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + ACCESS_TOKEN },
      muteHttpExceptions: true,
    };
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    Logger.log('Pix check - payment ' + paymentId + ' status: ' + result.status);

    // Se pagou, atualizar planilha e enviar email
    if (result.status === 'approved') {
      try {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        const sheet = ss.getSheetByName(SHEET_NAME);
        if (sheet) {
          const data = sheet.getDataRange().getValues();
          for (let i = data.length - 1; i >= 1; i--) {
            if (String(data[i][18]) === String(paymentId) && data[i][17] === 'Aguardando Pix') {
              sheet.getRange(i + 1, 18).setValue('Aprovado');
              Logger.log('Planilha atualizada para Aprovado: ' + paymentId);

              // Enviar email de confirmação
              const nome = data[i][1];
              const email = data[i][2];
              const ingressosStr = data[i][10];
              const total = data[i][12];

              // Montar items a partir da string de ingressos
              const items = [];
              const totalNum = parseFloat(String(total).replace('R$', '').replace(/\s/g, '').replace(',', '.')) || 0;
              const partes = ingressosStr.split(', ');
              partes.forEach(p => {
                const match = p.match(/(.+?) ×(\d+)(?: \(R\$ ([\d.,]+)\))?/);
                if (match) {
                  const qty = parseInt(match[2]);
                  let preco = 0;
                  if (match[3]) {
                    const subtotal = parseFloat(match[3].replace('.', '').replace(',', '.'));
                    preco = qty > 0 ? subtotal / qty : 0;
                  }
                  items.push({ tipo: match[1], quantidade: qty, preco: preco });
                }
              });
              // Fallback: se nenhum preço foi extraído e há apenas 1 item, usar o total
              if (items.length === 1 && items[0].preco === 0 && totalNum > 0) {
                items[0].preco = totalNum / items[0].quantidade;
              }

              try {
                sendConfirmationEmail({ nome: nome, email: email }, items, total, paymentId);
                Logger.log('Email Pix enviado para: ' + email);
              } catch (emailErr) {
                Logger.log('Erro email Pix: ' + emailErr.toString());
              }

              break;
            }
          }
        }
      } catch (sheetErr) {
        Logger.log('Erro ao atualizar planilha Pix: ' + sheetErr.toString());
      }
    }

    // Pix expirado/cancelado — atualizar planilha e notificar
    if (result.status === 'cancelled' || result.status === 'rejected' || result.status === 'expired') {
      try {
        const ss = SpreadsheetApp.openById(SHEET_ID);
        const sheet = ss.getSheetByName(SHEET_NAME);
        if (sheet) {
          const data = sheet.getDataRange().getValues();
          for (let i = data.length - 1; i >= 1; i--) {
            if (String(data[i][18]) === String(paymentId) && data[i][17] === 'Aguardando Pix') {
              const statusLabel = result.status === 'expired' ? 'Pix Expirado' : 'Pix Cancelado';
              sheet.getRange(i + 1, 18).setValue(statusLabel);
              try {
                sendPixExpiredEmail({ nome: data[i][1], email: data[i][2] }, paymentId);
              } catch (emailErr) {
                Logger.log('Erro email expiração (polling): ' + emailErr.toString());
              }
              break;
            }
          }
        }
      } catch (sheetErr) {
        Logger.log('Erro ao marcar Pix expirado: ' + sheetErr.toString());
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: result.status,
      payment_id: paymentId,
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('Erro checkPixPayment: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString(),
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * UTILITÁRIO MANUAL — Re-verifica TODOS os Pix pendentes na planilha.
 * Para cada linha com status "Aguardando Pix", consulta o MP e atualiza
 * se estiver aprovado (inclui envio do email de confirmação).
 *
 * COMO USAR: No editor do Apps Script, selecione esta função no dropdown
 * superior e clique em "Executar". Veja os logs em "Execuções".
 */
function reverificarPixPendentes() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('Planilha não encontrada');
    return;
  }

  const data = sheet.getDataRange().getValues();
  let atualizados = 0;
  let verificados = 0;

  for (let i = 1; i < data.length; i++) {
    const status = data[i][17];
    const paymentId = data[i][18];
    const nome = data[i][1];

    if (status === 'Aguardando Pix' && paymentId) {
      verificados++;
      Logger.log('Verificando: ' + nome + ' (ID: ' + paymentId + ')');

      try {
        const url = 'https://api.mercadopago.com/v1/payments/' + paymentId;
        const options = {
          method: 'get',
          headers: { 'Authorization': 'Bearer ' + ACCESS_TOKEN },
          muteHttpExceptions: true,
        };
        const response = UrlFetchApp.fetch(url, options);
        const result = JSON.parse(response.getContentText());

        Logger.log('  → Status no MP: ' + result.status);

        if (result.status === 'approved') {
          // Atualiza planilha
          sheet.getRange(i + 1, 18).setValue('Aprovado');
          atualizados++;

          // Reconstrói items e envia email
          const email = data[i][2];
          const ingressosStr = data[i][10];
          const total = data[i][12];

          const items = [];
          const totalNum = parseFloat(String(total).replace('R$', '').replace(/\s/g, '').replace(',', '.')) || 0;
          const partes = String(ingressosStr).split(', ');
          partes.forEach(p => {
            const match = p.match(/(.+?) ×(\d+)(?: \(R\$ ([\d.,]+)\))?/);
            if (match) {
              const qty = parseInt(match[2]);
              let preco = 0;
              if (match[3]) {
                const subtotal = parseFloat(match[3].replace('.', '').replace(',', '.'));
                preco = qty > 0 ? subtotal / qty : 0;
              }
              items.push({ tipo: match[1], quantidade: qty, preco: preco });
            }
          });
          if (items.length === 1 && items[0].preco === 0 && totalNum > 0) {
            items[0].preco = totalNum / items[0].quantidade;
          }

          try {
            sendConfirmationEmail({ nome: nome, email: email }, items, total, paymentId);
            Logger.log('  ✓ Atualizado para Aprovado + email enviado para ' + email);
          } catch (emailErr) {
            Logger.log('  ⚠ Atualizado mas falhou email: ' + emailErr.toString());
          }
        } else if (result.status === 'cancelled' || result.status === 'rejected' || result.status === 'expired') {
          const statusLabel = result.status === 'expired' ? 'Pix Expirado' : 'Pix Cancelado';
          sheet.getRange(i + 1, 18).setValue(statusLabel);
          Logger.log('  → Marcado como ' + result.status);

          try {
            sendPixExpiredEmail({ nome: nome, email: email }, paymentId);
            Logger.log('  ✉ Email de Pix expirado enviado para ' + email);
          } catch (emailErr) {
            Logger.log('  ⚠ Falhou email de expiração: ' + emailErr.toString());
          }
        }
      } catch (err) {
        Logger.log('  ✗ Erro ao verificar ' + paymentId + ': ' + err.toString());
      }
    }
  }

  Logger.log('=== RESUMO ===');
  Logger.log('Verificados: ' + verificados);
  Logger.log('Atualizados para Aprovado: ' + atualizados);
}

/**
 * Verificar se há vagas disponíveis antes de processar pagamento
 * Básica + Personalizada: 150 vagas | Experience Hyrox: 60 vagas
 */
function verificarLimiteVagas(items) {
  const LIMITE_BP = 150;
  const LIMITE_EXP = 60;

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: true };

  const data = sheet.getDataRange().getValues();
  let vendidosBP = 0;
  let vendidosExp = 0;

  for (let i = 1; i < data.length; i++) {
    const status = data[i][17];
    if (status === 'Aprovado' || status === 'Aguardando Pix') {
      const ingressos = String(data[i][10]);
      const qtd = parseInt(data[i][11]) || 0;

      if (ingressos.includes('Experience')) {
        vendidosExp += qtd;
      } else {
        vendidosBP += qtd;
      }
    }
  }

  let pedidoBP = 0;
  let pedidoExp = 0;
  items.forEach(item => {
    if (item.tipo.includes('Experience')) pedidoExp += item.quantidade;
    else pedidoBP += item.quantidade;
  });

  if (vendidosBP + pedidoBP > LIMITE_BP) {
    return { ok: false, message: 'Inscrições Básica/Personalizada esgotadas. Restam ' + (LIMITE_BP - vendidosBP) + ' vagas.' };
  }
  if (vendidosExp + pedidoExp > LIMITE_EXP) {
    return { ok: false, message: 'Inscrições Experience Hyrox esgotadas. Restam ' + (LIMITE_EXP - vendidosExp) + ' vagas.' };
  }

  return { ok: true };
}

/**
 * INSTALAR TRIGGER — Executa reverificarPixPendentes a cada 10 minutos.
 * Rode esta função UMA VEZ no editor do Apps Script para ativar.
 * Remove triggers antigos da mesma função antes de criar o novo (evita duplicação).
 */
function instalarTriggerPix() {
  // Remove triggers antigos de reverificarPixPendentes
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'reverificarPixPendentes') {
      ScriptApp.deleteTrigger(t);
      Logger.log('Trigger antigo removido');
    }
  });

  // Cria novo trigger de 10 em 10 minutos
  ScriptApp.newTrigger('reverificarPixPendentes')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log('✓ Trigger instalado: reverificarPixPendentes roda a cada 10 minutos');
}

/**
 * Processar pagamento via API Mercado Pago
 */
function processPayment(paymentData, inscrito, items, total) {
  const url = 'https://api.mercadopago.com/v1/payments';

  Logger.log('paymentData recebido: ' + JSON.stringify(paymentData));
  Logger.log('total: ' + total);

  // O Brick envia campos extras (selectedPaymentMethod, formData, paymentType)
  // que a API do MP rejeita. Extrair apenas os campos válidos do formData.
  const fd = paymentData.formData || paymentData;

  const body = {
    transaction_amount: total,
    token: fd.token,
    installments: fd.installments || 1,
    payment_method_id: fd.payment_method_id,
    issuer_id: fd.issuer_id,
    description: 'Inscrição XIII Fórum Científico da EsEFEx 2026',
    external_reference: inscrito.cpf.replace(/\D/g, ''),
    payer: {
      email: (fd.payer && fd.payer.email) || inscrito.email,
      identification: {
        type: 'CPF',
        number: inscrito.cpf.replace(/\D/g, ''),
      },
      first_name: inscrito.nome.split(' ')[0],
      last_name: inscrito.nome.split(' ').slice(1).join(' '),
    },
  };

  // Para Pix não precisa de token/installments/issuer
  if (paymentData.paymentType === 'bank_transfer' || fd.payment_method_id === 'pix') {
    delete body.token;
    delete body.installments;
    delete body.issuer_id;
  }

  Logger.log('Body enviado ao MP: ' + JSON.stringify(body));

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + ACCESS_TOKEN,
      'X-Idempotency-Key': Utilities.getUuid(),
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());

  Logger.log('MP Response: ' + JSON.stringify(result));

  return {
    status: result.status,
    id: result.id,
    status_detail: result.status_detail,
    message: result.message,
    cause: result.cause,
    payment_method_id: result.payment_method_id,
    payment_type_id: result.payment_type_id,
    fee_details: result.fee_details,
    transaction_details: result.transaction_details,
    point_of_interaction: result.point_of_interaction,
  };
}

/**
 * Salvar inscrição na Google Sheets
 */
function saveToSheet(inscrito, items, total, paymentResult, statusOverride) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);

  // Criar aba e cabeçalho se não existir
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'Data',
      'Nome',
      'Email',
      'CPF',
      'Telefone',
      'Formação Acadêmica',
      'Vínculo Institucional',
      'Instituição',
      'Cidade',
      'Curso',
      'Ingressos (detalhe)',
      'Qtd Total',
      'Total Bruto (R$)',
      'Forma de Pagamento',
      'Taxa Estimada (%)',
      'Taxa Estimada (R$)',
      'Valor Líquido (R$)',
      'Status Pagamento',
      'ID Pagamento'
    ]);
    sheet.getRange(1, 1, 1, 19).setFontWeight('bold').setBackground('#1a1510').setFontColor('#ff6b1a');
    sheet.setFrozenRows(1);
  }

  // Formatar ingressos com valores: "Básica ×2 (R$100,00), Experience ×1 (R$180,00)"
  const ingressosStr = items.map(i =>
    i.tipo + ' ×' + i.quantidade + ' (R$ ' + (i.preco * i.quantidade).toFixed(2).replace('.', ',') + ')'
  ).join(', ');

  // Quantidade total de ingressos
  const qtdTotal = items.reduce((sum, i) => sum + i.quantidade, 0);

  // Determinar forma de pagamento
  const metodoPagamento = paymentResult.payment_type_id || paymentResult.payment_method_id || 'N/A';
  let formaPgto = 'Outro';
  if (metodoPagamento === 'credit_card') formaPgto = 'Cartão de Crédito';
  else if (metodoPagamento === 'debit_card') formaPgto = 'Cartão de Débito';
  else if (metodoPagamento === 'bank_transfer' || paymentResult.payment_method_id === 'pix') formaPgto = 'Pix';
  else if (metodoPagamento === 'account_money') formaPgto = 'Saldo MP';

  // Calcular taxa estimada
  let taxaPct = 0;
  if (formaPgto === 'Cartão de Crédito') taxaPct = 4.98;
  else if (formaPgto === 'Cartão de Débito') taxaPct = 1.99;
  else if (formaPgto === 'Pix') taxaPct = 0.99;

  // Se o MP retornou fee_details, usar o valor real
  let taxaReais = total * (taxaPct / 100);
  if (paymentResult.fee_details && paymentResult.fee_details.length > 0) {
    taxaReais = paymentResult.fee_details.reduce((sum, f) => sum + (f.amount || 0), 0);
    taxaPct = (taxaReais / total * 100);
  }

  const valorLiquido = total - taxaReais;

  sheet.appendRow([
    new Date(),
    inscrito.nome,
    inscrito.email,
    inscrito.cpf,
    inscrito.telefone || '',
    inscrito.formacao,
    inscrito.vinculo,
    inscrito.instituicao,
    inscrito.cidade,
    inscrito.curso,
    ingressosStr,
    qtdTotal,
    total,
    formaPgto,
    Math.round(taxaPct * 100) / 100,
    Math.round(taxaReais * 100) / 100,
    Math.round(valorLiquido * 100) / 100,
    statusOverride || 'Aprovado',
    paymentResult.id
  ]);
}

/**
 * Enviar email de confirmação para o inscrito
 */
function sendConfirmationEmail(inscrito, items, total, paymentId) {
  const firstName = escapeHtml(inscrito.nome.split(' ')[0]);

  // Montar lista de ingressos e kits
  let itemsHtml = '';
  const kits = {
    'Inscrição Básica': ['Livro do Fórum', 'Sachê Liquidz', 'Bloco e caneta'],
    'Inscrição Personalizada': ['Livro do Fórum', 'Sachê Liquidz', 'Bloco e caneta', 'Garrafa de alumínio EsEFEx'],
    'Inscrição Experience Hyrox': ['Livro do Fórum', 'Sachê Liquidz', 'Bloco e caneta', 'Garrafa de alumínio EsEFEx', 'Camisa Hyrox Experience'],
  };

  items.forEach(item => {
    const kitItems = kits[item.tipo] || [];
    const kitHtml = kitItems.map(k => '<li style="padding:3px 0;color:#9a8a78;">' + k + '</li>').join('');
    itemsHtml += `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #2a2015;">${escapeHtml(item.tipo)}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #2a2015;text-align:center;">${escapeHtml(String(item.quantidade))}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #2a2015;text-align:right;">R$ ${(item.preco * item.quantidade).toFixed(2).replace('.', ',')}</td>
      </tr>
      <tr>
        <td colspan="3" style="padding:6px 16px 14px;border-bottom:1px solid #2a2015;">
          <strong style="font-size:12px;color:#9a8a78;text-transform:uppercase;letter-spacing:1px;">Kit incluso:</strong>
          <ul style="margin:4px 0 0 16px;list-style:disc;">${kitHtml}</ul>
        </td>
      </tr>`;
  });

  const htmlBody = `
  <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;background:#0e0c0a;color:#f0ebe4;border-radius:12px;overflow:hidden;border:1px solid rgba(220,120,20,.2);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#ff6b1a 0%,#f59e0b 100%);padding:28px 24px;text-align:center;">
      <h1 style="margin:0;font-size:22px;color:#fff;font-weight:700;letter-spacing:1px;">Inscrição Confirmada!</h1>
      <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.85);">XIII Fórum Científico da EsEFEx</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 24px;">

      <p style="font-size:16px;margin-bottom:20px;">
        Olá, <strong>${firstName}</strong>! 👋
      </p>

      <p style="color:#9a8a78;font-size:14px;line-height:1.7;margin-bottom:24px;">
        Obrigado por se inscrever no <strong style="color:#f0ebe4;">XIII Fórum Científico da Escola de Educação Física do Exército</strong>!
        Sua inscrição foi confirmada com sucesso.
      </p>

      <!-- Event Info -->
      <div style="background:#1a1510;border:1px solid rgba(220,120,20,.14);border-radius:10px;padding:18px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:5px 0;color:#9a8a78;width:100px;">📅 Data</td>
            <td style="padding:5px 0;font-weight:600;">11 e 12 de junho de 2026</td>
          </tr>
          <tr>
            <td style="padding:5px 0;color:#9a8a78;">📍 Local</td>
            <td style="padding:5px 0;font-weight:600;">Escola de Educação Física do Exército — Rio de Janeiro, RJ</td>
          </tr>
        </table>
      </div>

      <!-- Order Summary -->
      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:2px;color:#9a8a78;margin-bottom:12px;">Resumo da Inscrição</h2>

      <table style="width:100%;border-collapse:collapse;font-size:14px;background:#1a1510;border:1px solid rgba(220,120,20,.14);border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#211a12;">
            <th style="padding:10px 16px;text-align:left;color:#9a8a78;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Ingresso</th>
            <th style="padding:10px 16px;text-align:center;color:#9a8a78;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Qtd</th>
            <th style="padding:10px 16px;text-align:right;color:#9a8a78;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          <tr style="background:#211a12;">
            <td colspan="2" style="padding:12px 16px;font-weight:700;font-size:15px;">Total</td>
            <td style="padding:12px 16px;text-align:right;font-weight:700;font-size:15px;color:#ff6b1a;">R$ ${total.toFixed(2).replace('.', ',')}</td>
          </tr>
        </tbody>
      </table>

      <!-- Payment ID -->
      <p style="margin-top:16px;font-size:13px;color:#5a4e42;">
        ID do pagamento: <strong style="color:#9a8a78;">#${paymentId}</strong>
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin-top:32px;">
        <p style="font-size:15px;color:#f0ebe4;margin-bottom:8px;">
          🎉 <strong>Nos vemos no Fórum!</strong>
        </p>
        <p style="font-size:13px;color:#5a4e42;">
          Equipe do XIII Fórum Científico da EsEFEx
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#080604;border-top:1px solid rgba(220,120,20,.14);padding:18px 24px;text-align:center;">
      <p style="font-size:12px;color:#5a4e42;margin:0;">
        Escola de Educação Física do Exército — Rio de Janeiro, RJ<br>
        <a href="https://forumesefex.com" style="color:#ff6b1a;text-decoration:none;">forumesefex.com</a> ·
        <a href="mailto:labio.esefex@gmail.com" style="color:#ff6b1a;text-decoration:none;">labio.esefex@gmail.com</a>
      </p>
    </div>
  </div>`;

  MailApp.sendEmail({
    to: inscrito.email,
    subject: 'Inscrição Confirmada — XIII Fórum Científico da EsEFEx',
    htmlBody: htmlBody,
    name: 'XIII Fórum Científico da EsEFEx',
    replyTo: 'labio.esefex@gmail.com',
  });
}

/**
 * Enviar email informando que o Pix expirou e a inscrição não foi concluída
 */
function sendPixExpiredEmail(inscrito, paymentId) {
  const firstName = escapeHtml(inscrito.nome.split(' ')[0]);

  const htmlBody = `
  <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;background:#0e0c0a;color:#f0ebe4;border-radius:12px;overflow:hidden;border:1px solid rgba(220,120,20,.2);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#dc2626 0%,#f59e0b 100%);padding:28px 24px;text-align:center;">
      <h1 style="margin:0;font-size:22px;color:#fff;font-weight:700;letter-spacing:1px;">Pagamento Pix Expirado</h1>
      <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.85);">XIII Fórum Científico da EsEFEx</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 24px;">

      <p style="font-size:16px;margin-bottom:20px;">
        Olá, <strong>${firstName}</strong>!
      </p>

      <p style="color:#9a8a78;font-size:14px;line-height:1.7;margin-bottom:24px;">
        Identificamos que o <strong style="color:#f0ebe4;">QR Code Pix</strong> gerado para sua inscrição no
        <strong style="color:#f0ebe4;">XIII Fórum Científico da EsEFEx</strong> não foi pago dentro do prazo
        e <strong style="color:#f87171;">expirou</strong>.
      </p>

      <!-- Info Box -->
      <div style="background:#1a1510;border:1px solid rgba(220,38,38,.3);border-radius:10px;padding:18px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:5px 0;color:#9a8a78;width:130px;">ID do pagamento</td>
            <td style="padding:5px 0;font-weight:600;color:#f87171;">#${paymentId}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;color:#9a8a78;">Status</td>
            <td style="padding:5px 0;font-weight:600;color:#f87171;">Expirado / Cancelado</td>
          </tr>
        </table>
      </div>

      <p style="color:#9a8a78;font-size:14px;line-height:1.7;margin-bottom:24px;">
        <strong style="color:#f0ebe4;">Sua inscrição não foi concluída.</strong> O QR Code Pix tem validade de 30 minutos
        e, após esse período, é automaticamente cancelado por segurança.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:32px 0 24px;">
        <a href="https://forumesefex.com/inscricao.html"
           style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#ff6b1a,#f59e0b);
                  color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;
                  letter-spacing:.5px;">
          Refazer minha inscrição
        </a>
      </div>

      <p style="color:#5a4e42;font-size:13px;line-height:1.6;text-align:center;">
        Caso tenha dúvidas ou acredite que houve um erro, entre em contato conosco pelo email
        <a href="mailto:labio.esefex@gmail.com" style="color:#ff6b1a;text-decoration:none;">labio.esefex@gmail.com</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#080604;border-top:1px solid rgba(220,120,20,.14);padding:18px 24px;text-align:center;">
      <p style="font-size:12px;color:#5a4e42;margin:0;">
        Escola de Educação Física do Exército — Rio de Janeiro, RJ<br>
        <a href="https://forumesefex.com" style="color:#ff6b1a;text-decoration:none;">forumesefex.com</a> ·
        <a href="mailto:labio.esefex@gmail.com" style="color:#ff6b1a;text-decoration:none;">labio.esefex@gmail.com</a>
      </p>
    </div>
  </div>`;

  MailApp.sendEmail({
    to: inscrito.email,
    subject: 'Pagamento Pix Expirado — XIII Fórum Científico da EsEFEx',
    htmlBody: htmlBody,
    name: 'XIII Fórum Científico da EsEFEx',
    replyTo: 'labio.esefex@gmail.com',
  });
}
