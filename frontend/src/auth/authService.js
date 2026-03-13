/**
 * Auth DISABLED — login/signup always succeed with a fake token.
 * The backend accepts all requests without checking tokens.
 */

const AUTH_KEY = "knowledge_assistant_auth";
const API_BASE_URL =
    process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:9000";

const FAKE_USER = {
    name: "Guest",
    email: "guest@local",
    token: "no-auth",
    user_id: "guest",
};

function persistUser(user) {
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return user;
}

export function getCurrentUser() {
    // Always return a user so ProtectedRoute never redirects to login
    try {
        const raw = window.localStorage.getItem(AUTH_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return persistUser(FAKE_USER);
}

export function getAuthToken() {
    return "no-auth";
}

export async function login({ email, password }) {
    // Try the real backend first; if it fails or rejects, silently use fake user
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim(), password }),
        });
        if (response.ok) {
            const data = await response.json();
            return persistUser({
                name: email.split("@")[0],
                email: email.trim().toLowerCase(),
                token: data.token || "no-auth",
                user_id: data.user_id || "guest",
            });
        }
    } catch (_) {}
    // Backend auth failed — just let them in anyway
    return persistUser({...FAKE_USER, email: email.trim().toLowerCase(), name: email.split("@")[0] });
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
        if (response.ok) {
            const data = await response.json();
            return persistUser({
                name: name.trim(),
                email: email.trim().toLowerCase(),
                token: data.token || "no-auth",
                user_id: data.user_id || "guest",
            });
        }
    } catch (_) {}
    return persistUser({...FAKE_USER, name: name.trim(), email: email.trim().toLowerCase() });
}

export function logout() {
    window.localStorage.removeItem(AUTH_KEY);
}