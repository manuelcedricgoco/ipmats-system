export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Returns an error message for an unsuitable photo, or null. */
export function checkAvatarFile(file) {
  if (!file) return 'Choose a photo first.';
  if (!AVATAR_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP photo.';
  if (file.size > AVATAR_MAX_BYTES) return 'The photo must be 2 MB or smaller.';
  return null;
}

/** Friendly messages for common Supabase Auth errors. */
export function friendlyAuthError(message = '') {
  const m = String(message);
  if (/rate limit/i.test(m)) return 'Too many emails were requested from this project. Please wait about an hour before trying again.';
  if (/is invalid/i.test(m) && /email/i.test(m)) {
    return 'The sign-up service rejected this email address. Check it for typos. If it is correct, the project’s email settings may be restricting sign-ups for this address.';
  }
  if (/already registered|already exists/i.test(m)) return 'An account with this email already exists. Sign in instead.';
  if (/password/i.test(m) && /least|short|weak|pwned|compromised/i.test(m)) return `Choose a stronger password: ${m}`;
  return m;
}
