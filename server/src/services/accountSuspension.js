/** Suspend / reinstate an account: Supabase Auth ban plus the profile flags. Shared by the Administrator and PACC. */
import { adminClient } from '../config/supabase.js';
import { HttpError, unwrap } from '../utils/httpError.js';

export const BAN_FOREVER = '876000h'; // ~100 years: Supabase Auth refuses sign-in until the ban is lifted

/** Returns the updated profile row. */
export async function suspendAccount(userId, actorId, reason) {
  // 1. Block sign-in in Supabase Auth (refresh tokens stop working too).
  const ban = await adminClient.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
  if (ban.error) throw Object.assign(new HttpError(500, 'The account could not be blocked from signing in. Nothing was changed.'), { cause: ban.error });

  // 2. Mark the profile: the API refuses every request of an inactive account (middleware/auth.js).
  try {
    return unwrap(
      await adminClient
        .from('profiles')
        .update({ is_active: false, suspended_at: new Date().toISOString(), suspended_by: actorId, suspension_reason: reason })
        .eq('id', userId)
        .select('*')
        .single(),
    );
  } catch (err) {
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' }); // roll back the ban
    throw err;
  }
}

/** Returns the updated profile row. */
export async function unsuspendAccount(userId) {
  const unban = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (unban.error) throw Object.assign(new HttpError(500, 'The sign-in block could not be lifted. Nothing was changed.'), { cause: unban.error });
  return unwrap(
    await adminClient
      .from('profiles')
      .update({ is_active: true, suspended_at: null, suspended_by: null, suspension_reason: null })
      .eq('id', userId)
      .select('*')
      .single(),
  );
}
