import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { invalidateReference } from '../hooks/useReference.js';
import { ACCOUNT_SUSPENDED_EVENT, api } from '../lib/api.js';
import { STAFF_ROLES, SUSPENDED_MESSAGE, isSuspensionError } from '../lib/constants.js';
import { supabase } from '../lib/supabaseClient.js';
import { friendlyAuthError } from '../lib/imageFile.js';
import { shouldUploadPendingPhoto, takePendingAvatar } from '../lib/pendingAvatar.js';

const AuthContext = createContext(null);

/** Upload a photo chosen during sign-up (kept on this device until the account is approved). */
async function uploadPendingPhoto(userId) {
  const file = await takePendingAvatar(userId);
  if (!file) return;
  try {
    const fd = new FormData();
    fd.append('avatar', file, file.name || 'photo.jpg');
    await api.post('/me/avatar', fd);
  } catch {
    /* non-critical: the photo can be added later in My account */
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  // Why the user was signed out without asking (shown on the sign-in page), e.g. a suspension.
  const [signOutNotice, setSignOutNotice] = useState(null);

  const loadProfile = useCallback(async (s) => {
    if (!s) {
      setProfile(null);
      return;
    }
    try {
      const res = await api.get('/me');
      setProfile(res.data);
      setProfileError(null);
      if (shouldUploadPendingPhoto(res.data)) await uploadPendingPhoto(res.data.id);
    } catch (err) {
      setProfile(null);
      setProfileError(err.message);
      if (err.status === 401 || err.status === 403) {
        if (isSuspensionError(err.message)) setSignOutNotice(SUSPENDED_MESSAGE);
        await supabase.auth.signOut();
      }
    }
  }, []);

  // Any API call answered "account suspended" (an Admin suspended this account mid-session) → sign out.
  useEffect(() => {
    const onSuspended = async () => {
      setSignOutNotice(SUSPENDED_MESSAGE);
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
    };
    window.addEventListener(ACCOUNT_SUSPENDED_EVENT, onSuspended);
    return () => window.removeEventListener(ACCOUNT_SUSPENDED_EVENT, onSuspended);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // The reference lists depend on who is signed in (contractors are staff-only), so a list cached on the
      // public portal while signed out must not be reused after sign-in, and vice versa.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') invalidateReference();
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') loadProfile(s);
      if (event === 'SIGNED_OUT') setProfile(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : friendlyAuthError(error.message));
      setSignOutNotice(null);
      setSession(data.session);
      try {
        const res = await api.get('/me');
        setProfile(res.data);
        return res.data;
      } catch (err) {
        // Signed in to Supabase but refused by the API (deactivated / suspended): do not keep a half session.
        if (err.status === 401 || err.status === 403) {
          await supabase.auth.signOut();
          setSession(null);
        }
        throw err;
      }
    },
    [],
  );

  /** Staff access request: the account starts with no staff access until an admin approves it. */
  const signUp = useCallback(async ({ email, password, full_name, requested_role, agency_id, position }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name, requested_role, agency_id: agency_id ? String(agency_id) : null, position: position || null },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw new Error(friendlyAuthError(error.message));
    // Supabase returns an empty identities list when the email is already registered.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('An account with this email already exists. Sign in instead.');
    }
    return { needsConfirmation: !data.session, userId: data.user?.id ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo(() => {
    const role = profile?.role ?? null;
    return {
      session,
      profile,
      role,
      loading,
      profileError,
      signOutNotice,
      clearSignOutNotice: () => setSignOutNotice(null),
      isAuthenticated: Boolean(session && profile),
      isStaff: STAFF_ROLES.includes(role),
      isPending: ['pending', 'rejected'].includes(profile?.approval_status),
      hasRole: (...roles) => roles.flat().includes(role),
      signIn,
      signUp,
      signOut,
      refreshProfile: () => loadProfile(session),
    };
  }, [session, profile, loading, profileError, signOutNotice, signIn, signUp, signOut, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
