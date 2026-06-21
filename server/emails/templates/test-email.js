export function testEmailHtml() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Racines &amp; Rituels — Email de test</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;background:#2d2d2d;text-align:center;">
            <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:2px;color:#fff;text-transform:uppercase;">
              Racines &amp; Rituels
            </p>
            <p style="margin:6px 0 0;font-size:12px;color:#aaa;letter-spacing:1px;">Cosmétiques naturels</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px 28px;">
            <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#2d2d2d;">Bonjour Alexandre,</p>
            <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
              Votre domaine Resend est correctement configuré.<br>
              Ceci est le premier email envoyé depuis <strong>Racines &amp; Rituels</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9f6f1;border-radius:6px;margin-bottom:28px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 10px;font-size:14px;color:#2d7a4f;">✓ &nbsp;<strong>Resend</strong></p>
                <p style="margin:0 0 10px;font-size:14px;color:#2d7a4f;">✓ &nbsp;<strong>IONOS</strong></p>
                <p style="margin:0 0 10px;font-size:14px;color:#2d7a4f;">✓ &nbsp;<strong>DNS</strong></p>
                <p style="margin:0 0 10px;font-size:14px;color:#2d7a4f;">✓ &nbsp;<strong>DKIM</strong></p>
                <p style="margin:0;font-size:14px;color:#2d7a4f;">✓ &nbsp;<strong>SPF</strong></p>
              </td></tr>
            </table>
            <p style="margin:0;font-size:16px;font-weight:700;color:#2d2d2d;">Tout est prêt ! 🌿</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #eee;text-align:center;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              © ${new Date().getFullYear()} Racines &amp; Rituels — Cosmétiques naturels africains
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
