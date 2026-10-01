{{ $reset ? 'Reset your Verbo password' : 'Confirm your Verbo email' }}

{{ $reset ? 'Use this code to set a new password:' : 'Use this code to confirm your email address:' }}

{{ $code }}

The code expires in {{ $minutes }} minutes and can only be used once.

{{ $reset ? 'If you did not ask to reset your password, ignore this email. Your password has not changed, and nobody can change it without this code.' : 'If you did not create a Verbo account, you can ignore this email.' }}

— Verbo
