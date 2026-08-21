const SESSION_KEY = "rove-session-v2";

const api = async (path, body) => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "CognoDB authentication failed.");
  return data;
};

const storeSession = (user) => {
  const session = { id: user.id, name: user.name, email: user.email };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
};

export const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
};

export const observeAuthState = (callback) => {
  callback(getSession());
  return () => {};
};

export const clearSession = async () => {
  localStorage.removeItem(SESSION_KEY);
};

export const registerUser = async ({ name, email, password }) => {
  const { user } = await api("/api/auth/register", { name, email, password });
  return storeSession(user);
};

export const loginUser = async ({ email, password }) => {
  const { user } = await api("/api/auth/login", { email, password });
  return storeSession(user);
};
