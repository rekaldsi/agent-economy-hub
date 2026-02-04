// Email sending via Gmail SMTP
const nodemailer = require('nodemailer');

// Gmail SMTP configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_EMAIL || 'mrmagoochi@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

/**
 * Send an email via Gmail SMTP
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body (plain text)
 * @param {string} [options.html] - Email body (HTML)
 * @param {string} [options.cc] - CC recipients
 * @param {string} [options.bcc] - BCC recipients
 * @returns {Promise<Object>} - Send result
 */
async function sendEmail({ to, subject, body, html, cc, bcc }) {
  if (!process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_APP_PASSWORD not configured');
  }

  const mailOptions = {
    from: `"MrMagoochi" <${process.env.GMAIL_EMAIL || 'mrmagoochi@gmail.com'}>`,
    to,
    subject,
    text: body
  };

  if (html) mailOptions.html = html;
  if (cc) mailOptions.cc = cc;
  if (bcc) mailOptions.bcc = bcc;

  const result = await transporter.sendMail(mailOptions);
  
  return {
    success: true,
    messageId: result.messageId,
    to,
    subject
  };
}

module.exports = { sendEmail };
