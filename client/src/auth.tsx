import { createContext, useContext, useState, type ReactNode } from "react";
import { api, setToken, getToken, type User } from "./api";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("veti_user");
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const persist = (t: string, u: User) => {
    setToken(t);
    localStorage.setItem("veti_user", JSON.stringify(u));
    setTokenState(t);
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    persist(res.token, res.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.register({ name, email, password });
    persist(res.token, res.user);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem("veti_user");
    setTokenState(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}