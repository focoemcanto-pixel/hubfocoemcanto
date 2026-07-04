export function passwordResetEmailHtml(resetUrl: string) {
  return `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#07070b;font-family:Arial,Helvetica,sans-serif;color:#f8f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#07070b;padding:28px 14px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#111116;border:1px solid rgba(245,199,107,.28);border-radius:28px;overflow:hidden;">
          <tr><td style="padding:34px 30px 18px;text-align:center;background:radial-gradient(circle at 80% 0,rgba(245,199,107,.22),transparent 38%),#111116;">
            <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#f5c76b;font-weight:800;">Escola Foco em Canto</div>
            <h1 style="margin:12px 0 8px;font-size:34px;line-height:1;color:#fff;">Recupere sua senha</h1>
            <p style="margin:0;color:#b9b9c3;font-size:16px;line-height:1.5;">Recebemos uma solicitação para redefinir seu acesso ao Hub.</p>
          </td></tr>
          <tr><td style="padding:24px 30px 30px;">
            <p style="margin:0 0 18px;color:#d8d8df;font-size:16px;line-height:1.55;">Clique no botão abaixo para criar uma nova senha. Por segurança, este link expira em 45 minutos.</p>
            <p style="margin:28px 0;text-align:center;"><a href="${resetUrl}" style="display:inline-block;background:linear-gradient(180deg,#ffe39b,#e9b348);color:#171007;text-decoration:none;font-weight:900;border-radius:16px;padding:15px 24px;font-size:16px;">Criar nova senha</a></p>
            <p style="margin:0 0 12px;color:#92929d;font-size:13px;line-height:1.45;">Se o botão não funcionar, copie e cole este link no navegador:</p>
            <p style="margin:0;word-break:break-all;color:#f5c76b;font-size:13px;line-height:1.45;">${resetUrl}</p>
            <hr style="border:0;border-top:1px solid rgba(255,255,255,.1);margin:26px 0;">
            <p style="margin:0;color:#8f8f99;font-size:13px;line-height:1.45;">Se você não solicitou essa recuperação, ignore este e-mail. Sua senha atual continuará igual.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'missing_resend_api_key' };
  const from = process.env.RESEND_FROM || process.env.MAIL_FROM || 'Escola Foco em Canto <noreply@focoemcanto.com>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: 'Recupere sua senha - Escola Foco em Canto',
      html: passwordResetEmailHtml(resetUrl),
    }),
  });
  if (!response.ok) return { ok: false, reason: await response.text().catch(() => 'send_failed') };
  return { ok: true };
}
