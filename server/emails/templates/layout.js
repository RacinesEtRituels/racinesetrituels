/**
 * Layout email partagé — Racines & Rituels.
 *
 * Compatible Gmail, Apple Mail, Outlook (VML CTA button).
 * Table-based, inline styles only, max-width 600px.
 *
 * @param {object} opts
 * @param {string} opts.title     - <title> de l'email
 * @param {string} opts.body      - Contenu HTML injecté dans la zone centrale
 * @param {string} [opts.ctaText] - Texte du bouton CTA (omis si absent)
 * @param {string} [opts.ctaUrl]  - URL du bouton CTA
 */
export function renderLayout({ title, body, ctaText, ctaUrl }) {
  const year = new Date().getFullYear();

  // Bouton CTA compatible Outlook via VML
  const ctaRow = ctaText && ctaUrl ? `
        <tr>
          <td align="center" style="padding:4px 40px 36px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
              href="${ctaUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="6%"
              fillcolor="#e64c19" strokecolor="#e64c19">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">
                ${ctaText}
              </center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${ctaUrl}"
              style="display:inline-block;padding:14px 36px;background:#e64c19;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;border-radius:6px;letter-spacing:0.5px;-webkit-text-size-adjust:none;">
              ${ctaText}
            </a>
            <!--<![endif]-->
          </td>
        </tr>` : '';

  return `<!DOCTYPE html>
<html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ed;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:#f5f2ed;padding:40px 16px;">
    <tr><td align="center">

      <!--[if mso]>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td>
      <![endif]-->

      <!-- Email card -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
        style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;">

        <!-- HEADER -->
        <tr>
          <td style="padding:28px 40px 24px;background:#1b110e;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:3px;color:#ffffff;
              text-transform:uppercase;font-family:Georgia,'Times New Roman',serif;line-height:1.2;">
              Racines &amp; Rituels
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#9a8b7d;letter-spacing:2px;
              text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
              Cosmétiques naturels africains
            </p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:36px 40px 28px;font-family:Arial,Helvetica,sans-serif;">
            ${body}
          </td>
        </tr>

        <!-- CTA -->
        ${ctaRow}

        <!-- FOOTER -->
        <tr>
          <td style="padding:20px 40px 24px;border-top:1px solid #f0ebe3;text-align:center;
            background:#faf8f5;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0 0 6px;font-size:12px;color:#999999;">
              Des questions ?&nbsp;
              <a href="mailto:contact@racinesetrituels.com"
                style="color:#e64c19;text-decoration:none;">contact@racinesetrituels.com</a>
            </p>
            <p style="margin:0;font-size:11px;color:#bbbbbb;">
              &copy; ${year} Racines &amp; Rituels &mdash; Tous droits r&eacute;serv&eacute;s
            </p>
          </td>
        </tr>

      </table>

      <!--[if mso]></td></tr></table><![endif]-->

    </td></tr>
  </table>
</body>
</html>`;
}
