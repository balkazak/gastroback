import nodemailer from 'nodemailer';

/**
 * Creates a reusable nodemailer transporter based on environment variables.
 */
export function getEmailTransporter(overridePort = null, overrideSecure = null) {
  const host = process.env.SMTP_HOST || 'mail.gastromir.kz';
  const port = overridePort !== null ? overridePort : parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = overrideSecure !== null 
    ? overrideSecure 
    : (process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === 'true' : port === 465);
  const user = process.env.SMTP_USER || 'admin@gastromir.kz';
  const pass = process.env.SMTP_PASS || '';

  if (!pass) {
    console.warn('[EmailService] SMTP_PASS is not configured in .env. Email delivery will be skipped, but submission is stored in database.');
    return null;
  }

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
 * Sends form submission notification to target email.
 */
export async function sendFormEmail(submission) {
  const to = process.env.MAIL_TO || 'gastromir.kz@gmail.com';
  const from = process.env.MAIL_FROM || `"GASTROMIR" <${process.env.SMTP_USER || 'admin@gastromir.kz'}>`;
  const subject = submission.subject || `[GASTROMIR] Новая заявка: ${submission.restaurant || submission.name || 'Сайт'}`;

  const transporter = getEmailTransporter();
  if (!transporter) {
    return {
      success: false,
      skipped: true,
      reason: 'SMTP is not configured in .env. Form saved in database.'
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

  const sendWithTimeout = async (tp) => {
    return Promise.race([
      tp.sendMail(mailOptions),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout (7s)')), 7000))
    ]);
  };

  try {
    const info = await sendWithTimeout(transporter);
    console.log(`[EmailService] Email sent successfully to ${to}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.warn('[EmailService] Primary SMTP attempt failed:', err.message);

    // If initial attempt failed (e.g. port 465 blocked on cloud container), try port 587 (STARTTLS)
    try {
      const fallbackTransporter = getEmailTransporter(587, false);
      if (fallbackTransporter) {
        console.log('[EmailService] Retrying via port 587 (STARTTLS)...');
        const info = await sendWithTimeout(fallbackTransporter);
        console.log(`[EmailService] Email sent successfully via fallback port 587. MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      }
    } catch (fallbackErr) {
      console.error('[EmailService] Fallback port 587 also failed:', fallbackErr.message);
    }

    return { success: false, error: err.message };
  }
}
