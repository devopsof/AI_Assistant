import { createContext, useContext, useMemo, useState } from "react";

import {
  getCurrentUser as readCurrentUser,
  login as loginWithService,
  logout as logoutWithService,
  signup as signupWithService,
} from "./authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readCurrentUser());

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      async login(credentials) {
        const nextUser = await loginWithService(credentials);
        setUser(nextUser);
        return nextUser;
      },
      async signup(details) {
        const nextUser = await signupWithService(details);
        setUser(nextUser);
        return nextUser;
      },
      logout() {
        logoutWithService();
        setUser(null);
      },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }

  return context;
}
