import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/shared/context/AuthContext';
import { AUTH_STORAGE_KEY } from '../../src/shared/api/supabaseSession';

const { auth, from } = vi.hoisted(() => {
  const row = { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
  return {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({ select: () => ({ eq: () => row }) })),
  };
});

vi.mock('../../src/shared/api/supabaseClient', () => ({ supabase: { auth, from } }));
vi.mock('../../src/shared/api/supabaseSession', async (importOriginal) => ({
  ...(await importOriginal()),
  isSupabaseConfigured: true,
}));

const SESSION = { user: { id: 'user-1', email: 'a@example.com' } };

const deferred = ({ children }) => <AuthProvider deferClient>{children}</AuthProvider>;
const eager = ({ children }) => <AuthProvider>{children}</AuthProvider>;

/** Lets a pending dynamic import() settle before asserting it never ran. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    auth.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('loads the Supabase client on mount by default', async () => {
    auth.getSession.mockResolvedValue({ data: { session: SESSION } });
    const { result } = renderHook(useAuth, { wrapper: eager });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(auth.onAuthStateChange).toHaveBeenCalled();
  });

  describe('with deferClient', () => {
    it('stays signed out without touching the client when no session is stored', async () => {
      const { result } = renderHook(useAuth, { wrapper: deferred });

      await waitFor(() => expect(result.current.loading).toBe(false));
      await settle();
      expect(result.current.isAuthenticated).toBe(false);
      expect(auth.getSession).not.toHaveBeenCalled();
      expect(auth.onAuthStateChange).not.toHaveBeenCalled();
    });

    it('loads the client when a session is stored (remember me)', async () => {
      localStorage.setItem(AUTH_STORAGE_KEY, '{}');
      auth.getSession.mockResolvedValue({ data: { session: SESSION } });
      const { result } = renderHook(useAuth, { wrapper: deferred });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    });

    it('loads the client when a session is stored for this tab only', async () => {
      sessionStorage.setItem(AUTH_STORAGE_KEY, '{}');
      auth.getSession.mockResolvedValue({ data: { session: SESSION } });
      const { result } = renderHook(useAuth, { wrapper: deferred });

      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    });

    it('loads the client when the URL carries an email-link sign-in', async () => {
      window.location.hash = '#access_token=abc&type=signup';
      renderHook(useAuth, { wrapper: deferred });

      await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    });

    it('loads the client on demand to sign in', async () => {
      const { result } = renderHook(useAuth, { wrapper: deferred });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(() => result.current.signIn('a@example.com', 'pw'));

      expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.com', password: 'pw' });
      await waitFor(() => expect(auth.onAuthStateChange).toHaveBeenCalled());
    });
  });
});
