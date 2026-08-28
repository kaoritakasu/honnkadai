import nodemailer, { Transporter } from 'nodemailer';

let transporter: Transporter;

const initEmailService = () => {
  // 開発環境用のデフォルト設定（実装の簡略化）
  // 本番環境ではenv変数で実際のSMTP設定を読み込む
  const emailConfig = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025'),
    secure: process.env.SMTP_SECURE === 'true', // false for local development
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  };

  transporter = nodemailer.createTransport(emailConfig);
};

const sendConsultationReplyEmail = async (
  employeeEmail: string,
  employeeName: string,
  consultationTitle: string,
  response: string
): Promise<void> => {
  try {
    if (!transporter) {
      initEmailService();
    }

    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>${employeeName}様へ</h2>
          <p>いつもお疲れ様です。</p>
          <p>人事相談「<strong>${consultationTitle}</strong>」に対して、返信が届きましたのでお知らせします。</p>
          <hr>
          <h3>人事からの返信内容：</h3>
          <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #007bff;">
            <p>${response.replace(/\n/g, '<br>')}</p>
          </div>
          <hr>
          <p>詳細はマイページの「相談履歴・返信確認」セクションからご確認ください。</p>
          <p style="margin-top: 30px; font-size: 12px; color: #999;">
            このメールは自動送信されています。返信はできません。
          </p>
        </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@company.com',
      to: employeeEmail,
      subject: `【人事相談】「${consultationTitle}」に返信がきました`,
      html: htmlContent,
    });

    console.log(`✓ Reply notification email sent to ${employeeEmail}`);
  } catch (error) {
    console.error('Error sending email:', error);
    // 本番環境ではエラーを記録するが、メール送信失敗で相談返信そのものは成功させる
  }
};

export { initEmailService, sendConsultationReplyEmail };
