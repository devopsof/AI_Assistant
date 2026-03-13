const AUTH_KEY = "knowledge_assistant_auth";
const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:9000";

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split(".");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized);
    return JSON.parse(json);
  } catch (_error) {
    return null;
  }
}

function persistToken(token) {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify({ token }));
}

function readToken() {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.token || null;
  } catch (_error) {
    return null;
  }
}

export function getAuthToken() {
  return readToken();
}

export function getCurrentUser() {
  const token = readToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  return {
    user_id: payload.sub || "",
    email: payload.email || "",
  };
}

export async function login({ email, password }) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (response.status === 401) {
      throw new Error("Invalid email or password");
    }
    if (!response.ok) {
      throw new Error("Could not connect to server");
    }
    const data = await response.json();
    const token = data.access_token;
    if (!token) {
      throw new Error("Could not connect to server");
    }
    persistToken(token);
    return getCurrentUser();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Could not connect to server");
  }
}

export async function signup({ name, email, password, confirmPassword }) {
  if (password !== confirmPassword) {
    throw new Error("Passwords do not match.");
  }
  try {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (response.status === 400) {
      throw new Error("An account with this email already exists");
    }
    if (!response.ok) {
      throw new Error("Could not connect to server");
    }
    return await login({ email, password });
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Could not connect to server");
  }
}

export function logout() {
  window.localStorage.removeItem(AUTH_KEY);
}
