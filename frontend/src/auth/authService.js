const AUTH_KEY = "knowledge_assistant_auth";
const API_BASE_URL =
    process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:9000";

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

export function getAuthToken() {
    const user = getCurrentUser();
    return user ? user.token : null;
}

export async function login({ email, password }) {
    if (!email || !password) {
        throw new Error("Email and password are required.");
    }

    let response;
    try {
        response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim(), password }),
        });
    } catch (_error) {
        throw new Error(`Cannot reach the backend at ${API_BASE_URL}. Start the FastAPI server and try again.`);
    }

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.detail || "Login failed.");
    }

    return persistUser({
        name: email.split("@")[0],
        email: email.trim().toLowerCase(),
        token: data.token,
        user_id: data.user_id,
    });
}

export async function signup({ name, email, password, confirmPassword }) {
    if (!name || !email || !password) {
        throw new Error("All fields are required.");
    }
    if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
    }

    let response;
    try {
        response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim(), password }),
        });
    } catch (_error) {
        throw new Error(`Cannot reach the backend at ${API_BASE_URL}. Start the FastAPI server and try again.`);
    }

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.detail || "Signup failed.");
    }

    return persistUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        token: data.token,
        user_id: data.user_id,
    });
}

export function logout() {
    window.localStorage.removeItem(AUTH_KEY);
}