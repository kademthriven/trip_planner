import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firebaseConfigured, firestore } from "./firebase";

const USERS_KEY = "rove-users-v1";
const SESSION_KEY = "rove-session-v1";

const bytesToBase64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));
const base64ToBytes = (value) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const derivePassword = async (password, salt) => {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    material,
    256,
  );
  return bytesToBase64(bits);
};

const getUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
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

const firebaseUser = (user) => ({
  id: user.uid,
  name: user.displayName || user.email?.split("@")[0] || "Rider",
  email: user.email || "",
  photoURL: user.photoURL || "",
});

const friendlyAuthError = (error) => {
  const messages = {
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/operation-not-allowed":
      "Enable Email/Password sign-in in Firebase Authentication.",
    "auth/configuration-not-found":
      "Firebase Authentication is not enabled yet. Open Firebase Console → Authentication → Get started, then enable Email/Password sign-in.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",
    "auth/weak-password":
      "Choose a stronger password with at least 8 characters.",
  };
  return new Error(
    messages[error?.code] ||
      error?.message ||
      "Authentication failed. Please try again.",
  );
};

export const observeAuthState = (callback) => {
  if (!firebaseConfigured) {
    callback(getSession());
    return () => {};
  }
  return onAuthStateChanged(firebaseAuth, (user) =>
    callback(user ? firebaseUser(user) : null),
  );
};

export const clearSession = async () => {
  localStorage.removeItem(SESSION_KEY);
  if (firebaseConfigured) await signOut(firebaseAuth);
};

export const registerUser = async ({ name, email, password }) => {
  if (firebaseConfigured) {
    try {
      const credential = await createUserWithEmailAndPassword(
        firebaseAuth,
        email.trim().toLowerCase(),
        password,
      );
      await updateProfile(credential.user, { displayName: name.trim() });
      await setDoc(
        doc(firestore, "users", credential.user.uid),
        {
          name: name.trim(),
          email: credential.user.email,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        },
        { merge: true },
      );
      return firebaseUser(credential.user);
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  if (users.some((user) => user.email === normalizedEmail))
    throw new Error("An account with this email already exists.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const user = {
    id: crypto.randomUUID?.() || `user-${Date.now()}`,
    name: name.trim(),
    email: normalizedEmail,
    salt: bytesToBase64(salt),
    passwordHash: await derivePassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
  return storeSession(user);
};

export const loginUser = async ({ email, password }) => {
  if (firebaseConfigured) {
    try {
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim().toLowerCase(),
        password,
      );
      await setDoc(
        doc(firestore, "users", credential.user.uid),
        { lastLoginAt: serverTimestamp() },
        { merge: true },
      );
      return firebaseUser(credential.user);
    } catch (error) {
      throw friendlyAuthError(error);
    }
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = getUsers().find(
    (candidate) => candidate.email === normalizedEmail,
  );
  if (!user) throw new Error("Email or password is incorrect.");
  const passwordHash = await derivePassword(password, base64ToBytes(user.salt));
  if (passwordHash !== user.passwordHash)
    throw new Error("Email or password is incorrect.");
  return storeSession(user);
};
