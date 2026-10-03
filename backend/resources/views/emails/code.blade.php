<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ $reset ? 'Reset your Verbo password' : 'Confirm your Verbo email' }}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .email-shell { padding:24px 16px 32px !important; }
      .email-header { padding:22px 24px !important; }
      .email-content { padding:28px 24px !important; }
      .email-heading { font-size:24px !important; }
      .email-code { font-size:30px !important; letter-spacing:6px !important; padding-left:6px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f9f8fe;color:#1c1730;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;color:#f9f8fe;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    {{ $reset ? 'Use your code to reset your Verbo password.' : 'Use your code to confirm your Verbo email address.' }} It expires in {{ $minutes }} minutes.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f9f8fe;">
    <tr>
      <td class="email-shell" align="center" style="padding:32px 16px 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;max-width:560px;">
          <tr>
            <td class="email-header" bgcolor="#2b2643" style="background:#2b2643;border-radius:18px 18px 0 0;padding:24px 36px;">
              <img src="{{ config('mail.logo_url') ?: rtrim(config('app.url'), '/').'/images/verbo-email-logo.png' }}" alt="Verbo" width="148" height="46" style="display:block;width:148px;height:46px;border:0;color:#ffffff;font-size:26px;font-weight:700;">
            </td>
          </tr>
          <tr>
            <td class="email-content" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e3dff0;border-top:0;border-radius:0 0 18px 18px;padding:32px 36px;">
              <p style="margin:0 0 14px;color:#6a6191;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">{{ $reset ? 'Account security' : 'Welcome to Verbo' }}</p>
              <h1 class="email-heading" style="margin:0 0 14px;color:#1c1730;font-size:27px;font-weight:700;line-height:1.25;">{{ $reset ? 'Reset your password' : 'Confirm your email' }}</h1>
              <p style="margin:0 0 26px;color:#514b66;font-size:15px;line-height:1.6;">{{ $reset ? 'Enter this code in Verbo to set a new password.' : 'Enter this code in Verbo to confirm your email address and keep your account secure.' }}</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;">
                <tr>
                  <td align="center" bgcolor="#f1edfc" style="background:#f1edfc;border:1px solid #ded7f6;border-radius:12px;padding:22px 12px;">
                    <span class="email-code" dir="ltr" style="display:inline-block;padding-left:8px;color:#2b2643;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:8px;line-height:1.2;white-space:nowrap;">{{ $code }}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;color:#726c88;font-size:13px;line-height:1.5;">This code expires in {{ $minutes }} minutes and can only be used once.</p>
              <div style="height:1px;background:#e9e6f2;margin:28px 0 22px;"></div>
              <p style="margin:0;color:#726c88;font-size:13px;line-height:1.6;">{{ $reset ? 'Did not ask to reset your password? You can ignore this email. Your password has not changed, and nobody can change it without this code.' : 'Did not create a Verbo account? You can ignore this email.' }}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 16px 0;color:#8b85a0;font-size:12px;line-height:1.5;">
              Sent by Verbo to help keep your account secure.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
