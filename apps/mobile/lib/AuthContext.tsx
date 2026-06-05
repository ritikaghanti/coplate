import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadToken, saveToken, clearToken } from "../lib/auth";
import { login as apiLogin, signup as apiSignup } from "../lib/api";

interface AuthState {
  ready: boolean; // finished checking storage on launch
  isAuthed: boolean;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  // On launch, see if we already have a stored token.
  useEffect(() => {
    loadToken()
      .then((t) => setIsAuthed(!!t))
      .finally(() => setReady(true));
  }, []);

  async function signIn(e: string, p: string) {
    const res = await apiLogin({ email: e, password: p });
    await saveToken(res.token);
    setEmail(res.user.email);
    setIsAuthed(true);
  }

  async function register(e: string, p: string) {
    const res = await apiSignup({ email: e, password: p });
    await saveToken(res.token);
    setEmail(res.user.email);
    setIsAuthed(true);
  }

  async function signOut() {
    await clearToken();
    setIsAuthed(false);
    setEmail(null);
  }

  return (
    <AuthContext.Provider value={{ ready, isAuthed, email, signIn, register, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
