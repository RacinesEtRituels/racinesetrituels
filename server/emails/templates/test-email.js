import { renderLayout } from './layout.js';

/** Email de test de configuration Resend / DNS. */
export function testEmailHtml() {
  const body = `
    <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#1b110e;">
      Bonjour Alexandre,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.7;">
      Votre domaine Resend est correctement configur&eacute;.<br>
      Ceci est le premier email envoy&eacute; depuis <strong>Racines &amp; Rituels</strong>.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"
      style="width:100%;background:#f9f6f1;border-radius:6px;margin-bottom:4px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 10px;font-size:14px;color:#2d7a4f;font-family:Arial,sans-serif;">
          &#10003; &nbsp;<strong>Resend</strong>
        </p>
        <p style="margin:0 0 10px;font-size:14px;color:#2d7a4f;font-family:Arial,sans-serif;">
          &#10003; &nbsp;<strong>IONOS</strong>
        </p>
        <p style="margin:0 0 10px;font-size:14px;color:#2d7a4f;font-family:Arial,sans-serif;">
          &#10003; &nbsp;<strong>DNS</strong>
        </p>
        <p style="margin:0 0 10px;font-size:14px;color:#2d7a4f;font-family:Arial,sans-serif;">
          &#10003; &nbsp;<strong>DKIM</strong>
        </p>
        <p style="margin:0;font-size:14px;color:#2d7a4f;font-family:Arial,sans-serif;">
          &#10003; &nbsp;<strong>SPF</strong>
        </p>
      </td></tr>
    </table>
  `;

  return renderLayout({
    title: 'Racines & Rituels — Email de test',
    body,
    ctaText: null,
    ctaUrl: null,
  });
}
