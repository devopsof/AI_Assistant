const AUTH_KEY = "knowledge_assistant_auth";

function persistUser(user) {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

export function getCurrentUser() {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export async function login({ email, password }) {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }
  return persistUser({
    name: email.split("@")[0],
    email,
    token: "mock-session-token",
  });
}

export async function signup({ name, email, password, confirmPassword }) {
  if (!name || !email || !password) {
    throw new Error("All fields are required.");
  }
  if (password !== confirmPassword) {
    throw new Error("Passwords do not match.");
  }
  return persistUser({
    name,
    email,
    token: "mock-session-token",
  });
}

export function logout() {
  window.localStorage.removeItem(AUTH_KEY);
}
