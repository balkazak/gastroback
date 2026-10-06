import nodemailer from 'nodemailer';
import net from 'net';

/**
 * Creates a reusable nodemailer transporter based on environment variables.
 */
export function getEmailTransporter(overridePort = null, overrideSecure = null) {
  const host = process.env.SMTP_HOST || 'mail.gastromir.kz';
  const port = overridePort !== null ? overridePort : parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = overrideSecure !== null 
    ? overrideSecure 
    : (process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : port === 465);
  const user = process.env.SMTP_USER || 'admin@gastromir.kz';
  const pass = process.env.SMTP_PASS || '';

  if (!pass) {
    console.warn('[EmailService ⚠️] SMTP_PASS is empty or not configured in process.env! Email sending is SKIPPED.');
    return null;
  }

  console.log(`[EmailService 🔌] Initializing SMTP transporter: host=${host}, port=${port}, secure=${secure}, user=${user}`);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false // Prevents certificate verification failures on shared hosting
    },
    connectionTimeout: 5000, // 5s connection timeout
    greetingTimeout: 5000,   // 5s greeting timeout
    socketTimeout: 8000      // 8s socket timeout
  });
}

/**
 * Formats submission data into a readable HTML and text email.
 */
function buildEmailContent({ formType, subject, restaurant, name, phone, email, message, details, file }) {
  const dateStr = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });
  const formTitles = {
    quick_purchase_list: 'Быстрый список закупки (с главной)',
    contact_lead: 'Заявка на сотрудничество (Контакты)',
    price_request: 'Запрос оптового прайса',
    horeca_lead: 'Запрос условий поставки HoReCa',
    cart_invoice: 'Заказ из корзины (Накладная)',
    custom: 'Заявка с сайта'
  };

  const title = formTitles[formType] || formType || 'Новая заявка с сайта';

  // Details table rows
  const detailRows = [];
  if (restaurant) detailRows.push(`<tr><td style="padding: 8px 12px; font-weight: bold; color: #475569; width: 180px; border-bottom: 1px solid #e2e8f0;">Заведение / Компания:</td><td style="padding: 8px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${restaurant}</td></tr>`);
  if (name) detailRows.push(`<tr><td style="padding: 8px 12px; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">Контактное лицо:</td><td style="padding: 8px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${name}</td></tr>`);
  if (phone) detailRows.push(`<tr><td style="padding: 8px 12px; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">Телефон:</td><td style="padding: 8px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;"><a href="tel:${phone}" style="color: #2563eb; text-decoration: none; font-weight: bold;">${phone}</a></td></tr>`);
  if (email) detailRows.push(`<tr><td style="padding: 8px 12px; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">Email:</td><td style="padding: 8px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;"><a href="mailto:${email}" style="color: #2563eb; text-decoration: none;">${email}</a></td></tr>`);

  // Extra details from details object
  if (details && typeof details === 'object') {
    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== null && value !== '') {
        const label = formatKeyLabel(key);
        detailRows.push(`<tr><td style="padding: 8px 12px; font-weight: bold; color: #475569; border-bottom: 1px solid #e2e8f0;">${label}:</td><td style="padding: 8px 12px; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${escapeHtml(String(value))}</td></tr>`);
      }
    }
  }

  // File indicator
  if (file) {
    const fileSizeKb = Math.round((file.size || 0) / 1024);
    detailRows.push(`<tr><td style="padding: 8px 12px; font-weight: bold; color: #16a34a; border-bottom: 1px solid #e2e8f0;">📎 Прикрепленный файл:</td><td style="padding: 8px 12px; color: #16a34a; font-weight: bold; border-bottom: 1px solid #e2e8f0;">${file.originalname || file.filename} (${fileSizeKb} КБ) [прикреплен к письму]</td></tr>`);
  }

  detailRows.push(`<tr><td style="padding: 8px 12px; font-weight: bold; color: #64748b;">Дата и время:</td><td style="padding: 8px 12px; color: #64748b;">${dateStr}</td></tr>`);

  // Message block
  let messageBlock = '';
  if (message) {
    messageBlock = `
      <div style="margin-top: 24px; padding: 16px; background-color: #f8fafc; border-left: 4px solid #f97316; border-radius: 4px;">
        <h3 style="margin-top: 0; margin-bottom: 10px; font-size: 15px; color: #0f172a;">Сообщение / Список товаров:</h3>
        <pre style="white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.5; color: #334155; margin: 0;">${escapeHtml(message)}</pre>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(subject || title)}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 20px; margin: 0; color: #0f172a;">
        <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px 30px; color: #ffffff;">
            <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #f97316; font-weight: bold; margin-bottom: 4px;">GASTROMIR.KZ</div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">${escapeHtml(subject || title)}</h1>
          </div>
          <div style="padding: 30px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.5;">
              <tbody>
                ${detailRows.join('')}
              </tbody>
            </table>
            ${messageBlock}
          </div>
          <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 30px; font-size: 12px; color: #94a3b8; text-align: center;">
            Письмо сформировано автоматически веб-сервером gastromir.kz
          </div>
        </div>
      </body>
    </html>
  `;

  // Text fallback
  const textLines = [
    `=== ${subject || title} ===`,
    `Форма: ${title}`,
    restaurant ? `Заведение: ${restaurant}` : null,
    name ? `Контактное лицо: ${name}` : null,
    phone ? `Телефон: ${phone}` : null,
    email ? `Email: ${email}` : null,
    file ? `Прикрепленный файл: ${file.originalname || file.filename}` : null,
    `Дата: ${dateStr}`,
    message ? `\n--- Сообщение ---\n${message}` : null
  ].filter(Boolean);

  return { html, text: textLines.join('\n') };
}

function formatKeyLabel(key) {
  const map = {
    venuesCount: 'Количество заведений',
    categories: 'Категории закупки',
    volume: 'Месячный объем',
    comment: 'Комментарий',
    address: 'Адрес доставки',
    paymentMethod: 'Способ оплаты',
    deliveryDate: 'Дата доставки',
    deliveryTime: 'Время доставки',
  };
  return map[key] || key;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sends notification via Telegram Bot API (HTTPS port 443, never blocked by cloud firewalls).
 */
export async function sendTelegramNotification(submission) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;

  const titleMap = {
    quick_purchase_list: '⚡ Быстрый список закупки',
    contact_lead: '🤝 Заявка на сотрудничество',
    price_request: '📊 Запрос оптового прайса',
    horeca_lead: '🍽 Запрос условий HoReCa',
    cart_invoice: '🛒 Заказ из корзины (Накладная)',
    custom: '📩 Новая заявка'
  };

  const title = titleMap[submission.formType] || '📩 Новая заявка';
  const lines = [
    `<b>${title} — GASTROMIR.KZ</b>`,
    submission.restaurant ? `🏢 <b>Заведение:</b> ${escapeHtml(submission.restaurant)}` : null,
    submission.name ? `👤 <b>Имя:</b> ${escapeHtml(submission.name)}` : null,
    submission.phone ? `📞 <b>Телефон:</b> <a href="tel:${submission.phone}">${submission.phone}</a>` : null,
    submission.email ? `📧 <b>Email:</b> ${submission.email}` : null,
    submission.file ? `📎 <b>Файл:</b> <a href="https://gastroback-production.up.railway.app/uploads/attachments/${submission.file.filename}">${escapeHtml(submission.file.originalname || submission.file.filename)}</a>` : null,
    submission.message ? `\n💬 <b>Сообщение:</b>\n${escapeHtml(submission.message)}` : null
  ].filter(Boolean);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: false
      })
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`[Telegram ✅ SUCCESS] Notification delivered to chat: ${chatId}`);
      return { success: true };
    } else {
      console.error(`[Telegram ❌] Send failed: ${data.description}`);
      return { success: false, error: data.description };
    }
  } catch (err) {
    console.error(`[Telegram ❌] Network error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Sends transactional email via Resend HTTPS REST API (Port 443, never blocked by Railway).
 */
export async function sendResendEmail(submission) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const to = process.env.MAIL_TO || 'gastromir.kz@gmail.com';
  const from = process.env.RESEND_FROM || 'GASTROMIR <onboarding@resend.dev>';
  const subject = submission.subject || `[GASTROMIR] Новая заявка: ${submission.restaurant || submission.name || 'Сайт'}`;
  const { html, text } = buildEmailContent(submission);

  console.log(`[Resend 🚀] Sending email via Resend HTTPS API to ${to}...`);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text
      })
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`[Resend ✅ SUCCESS] Email delivered! Resend ID: ${data.id}`);
      return { success: true, messageId: data.id, provider: 'resend' };
    } else {
      console.error('[Resend ❌] Send failed:', data);
      return { success: false, error: data.message || JSON.stringify(data) };
    }
  } catch (err) {
    console.error(`[Resend ❌] Network error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Sends form submission notification to target email.
 */
export async function sendFormEmail(submission) {
  const to = process.env.MAIL_TO || 'gastromir.kz@gmail.com';
  const from = process.env.MAIL_FROM || `"GASTROMIR" <${process.env.SMTP_USER || 'admin@gastromir.kz'}>`;
  const subject = submission.subject || `[GASTROMIR] Новая заявка: ${submission.restaurant || submission.name || 'Сайт'}`;

  console.log(`\n================== [EmailService: SEND INITIATED] ==================`);
  console.log(`[EmailService] To: ${to}`);
  console.log(`[EmailService] From: ${from}`);
  console.log(`[EmailService] Subject: "${subject}"`);
  console.log(`[EmailService] Has file: ${Boolean(submission.file)}`);

  // 1. Dispatch Telegram notification if configured (instant, reliable)
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    sendTelegramNotification(submission).catch(err => {
      console.error('[EmailService Telegram Background Error]:', err);
    });
  }

  // 2. Dispatch via Resend HTTPS API if configured
  if (process.env.RESEND_API_KEY) {
    const resendRes = await sendResendEmail(submission);
    if (resendRes && resendRes.success) {
      return resendRes;
    }
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    console.error('[EmailService ❌] Transporter could NOT be created. Check if SMTP_PASS is defined in Railway Variables.');
    return {
      success: false,
      skipped: true,
      reason: 'SMTP is not configured in process.env. Form saved in database.'
    };
  }

  const { html, text } = buildEmailContent(submission);

  const mailOptions = {
    from,
    to,
    subject,
    text,
    html,
    attachments: []
  };

  if (submission.file && submission.file.path) {
    mailOptions.attachments.push({
      filename: submission.file.originalname || submission.file.filename,
      path: submission.file.path
    });
  }

  const sendWithTimeout = async (tp, label = 'SMTP') => {
    return Promise.race([
      tp.sendMail(mailOptions),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} connection timeout (7s exceeded)`)), 7000))
    ]);
  };

  try {
    console.log('[EmailService 🚀] Attempting send via default transporter...');
    const info = await sendWithTimeout(transporter, 'Primary SMTP');
    console.log(`[EmailService ✅ SUCCESS] Email delivered! MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EmailService ⚠️] Primary send failed! Code: ${err.code || 'UNKNOWN'}, Message: ${err.message}`);

    // If initial attempt failed, retry via port 587 explicitly
    try {
      console.log('[EmailService 🔄] Retrying send via explicit port 587 (STARTTLS)...');
      const fallbackTransporter = getEmailTransporter(587, false);
      if (fallbackTransporter) {
        const info = await sendWithTimeout(fallbackTransporter, 'Fallback Port 587');
        console.log(`[EmailService ✅ SUCCESS] Email delivered via port 587! MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      }
    } catch (fallbackErr) {
      console.error(`[EmailService ❌] Port 587 fallback also failed! Code: ${fallbackErr.code || 'UNKNOWN'}, Message: ${fallbackErr.message}`);
    }

    return { success: false, error: err.message, code: err.code };
  }
}

/**
 * Diagnostic tool to check socket connectivity and SMTP credentials directly from Railway container.
 */
function testTcpPort(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port, timeout: timeoutMs });
    
    socket.on('connect', () => {
      const duration = Date.now() - start;
      socket.destroy();
      resolve({ port, open: true, durationMs: duration, error: null });
    });

    socket.on('timeout', () => {
      const duration = Date.now() - start;
      socket.destroy();
      resolve({ port, open: false, durationMs: duration, error: 'TIMEOUT (port unreachable / blocked by cloud firewall)' });
    });

    socket.on('error', (err) => {
      const duration = Date.now() - start;
      resolve({ port, open: false, durationMs: duration, error: `${err.code || ''}: ${err.message}` });
    });
  });
}

export async function debugCheckSmtp() {
  const host = process.env.SMTP_HOST || 'mail.gastromir.kz';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER || 'admin@gastromir.kz';
  const pass = process.env.SMTP_PASS || '';
  const to = process.env.MAIL_TO || 'gastromir.kz@gmail.com';
  const from = process.env.MAIL_FROM || 'admin@gastromir.kz';

  console.log('\n================== [SMTP DEBUG DIAGNOSTIC START] ==================');
  console.log('[SMTP DIAGNOSTIC] Host:', host);
  console.log('[SMTP DIAGNOSTIC] Port:', port);
  console.log('[SMTP DIAGNOSTIC] User:', user);
  console.log('[SMTP DIAGNOSTIC] Password present:', Boolean(pass), 'Length:', pass.length);
  console.log('[SMTP DIAGNOSTIC] Mail To:', to);

  // 1. Check raw TCP socket connection from this container
  const test587 = await testTcpPort(host, 587, 4000);
  const test465 = await testTcpPort(host, 465, 4000);
  const test25 = await testTcpPort(host, 25, 4000);

  console.log('[SMTP DIAGNOSTIC] Port 587 status:', test587);
  console.log('[SMTP DIAGNOSTIC] Port 465 status:', test465);
  console.log('[SMTP DIAGNOSTIC] Port 25 status:', test25);

  // 2. Transporter verification
  let verify587 = null;
  if (test587.open) {
    try {
      const tp = getEmailTransporter(587, false);
      if (tp) {
        verify587 = await Promise.race([
          tp.verify(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Verify timeout (5s)')), 5000))
        ]);
        console.log('[SMTP DIAGNOSTIC] Verify port 587:', verify587);
      }
    } catch (e) {
      verify587 = { error: e.message, code: e.code };
      console.error('[SMTP DIAGNOSTIC] Verify port 587 failed:', e.message);
    }
  }

  let verify465 = null;
  if (test465.open) {
    try {
      const tp = getEmailTransporter(465, true);
      if (tp) {
        verify465 = await Promise.race([
          tp.verify(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Verify timeout (5s)')), 5000))
        ]);
        console.log('[SMTP DIAGNOSTIC] Verify port 465:', verify465);
      }
    } catch (e) {
      verify465 = { error: e.message, code: e.code };
      console.error('[SMTP DIAGNOSTIC] Verify port 465 failed:', e.message);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    config: {
      host,
      configuredPort: port,
      user,
      passwordPresent: Boolean(pass),
      passwordLength: pass.length,
      to,
      from
    },
    socketConnectivity: {
      port587: test587,
      port465: test465,
      port25: test25
    },
    transporterVerify: {
      port587: verify587,
      port465: verify465
    }
  };
}
