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
const ACCESS_TOKEN = 'APP_USR-1211894729308716-040910-c3e72baa9b946fbb943dc6b3c1599394-1039107041'; // Trocar pelo Access Token real
const SHEET_ID     = '1Dhj1LvwNzykNN7PSN34m9EQhNl3vXy_aDLqZDIa8elY'; // ID da Google Sheets
const SHEET_NAME   = 'Inscrições'; // Nome da aba

/**
 * Endpoint principal — recebe POST do frontend
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { paymentData, inscrito, items, total } = data;

    // 1. Processar pagamento no Mercado Pago
    const paymentResult = processPayment(paymentData, inscrito, items, total);

    if (paymentResult.status === 'approved') {
      // 2. Salvar na planilha
      try {
        saveToSheet(inscrito, items, total, paymentResult);
        Logger.log('Planilha salva com sucesso');
      } catch (sheetErr) {
        Logger.log('ERRO ao salvar na planilha: ' + sheetErr.toString());
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
    return ContentService.createTextOutput(JSON.stringify({
      status: 400,
      message: 'Erro interno: ' + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Permitir CORS preflight
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'Backend do XIII Fórum Científico da EsEFEx ativo.'
  })).setMimeType(ContentService.MimeType.JSON);
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
  };
}

/**
 * Salvar inscrição na Google Sheets
 */
function saveToSheet(inscrito, items, total, paymentResult) {
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
    'Aprovado',
    paymentResult.id
  ]);
}

/**
 * Enviar email de confirmação para o inscrito
 */
function sendConfirmationEmail(inscrito, items, total, paymentId) {
  const firstName = inscrito.nome.split(' ')[0];

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
        <td style="padding:10px 16px;border-bottom:1px solid #2a2015;">${item.tipo}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #2a2015;text-align:center;">${item.quantidade}</td>
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
        <a href="mailto:forumesefex@esefex.eb.mil.br" style="color:#ff6b1a;text-decoration:none;">forumesefex@esefex.eb.mil.br</a>
      </p>
    </div>
  </div>`;

  MailApp.sendEmail({
    to: inscrito.email,
    subject: 'Inscrição Confirmada — XIII Fórum Científico da EsEFEx',
    htmlBody: htmlBody,
    name: 'XIII Fórum Científico da EsEFEx',
    replyTo: 'forumesefex@esefex.eb.mil.br',
  });
}
