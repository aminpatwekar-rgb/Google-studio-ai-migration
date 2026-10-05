/**
 * ONYX never drops a returning visitor straight into the dashboard. A restored
 * Supabase session only becomes usable once the person explicitly confirms
 * "Continue as …". The confirmation lives in sessionStorage so that closing the
 * browser (or opening a fresh tab) asks again, while an in-session navigation
 * or reload does not nag.
 */
const KEY = "onyx.account-confirmed";

export function markSessionConfirmed(userId: string | null | undefined) {
  if (!userId || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, userId);
  } catch {
    /* private mode — the confirmation screen will simply show again */
  }
}

export function isSessionConfirmed(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(KEY) === userId;
  } catch {
    return false;
  }
}

export function clearSessionConfirmation() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
