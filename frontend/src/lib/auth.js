// Account auth state (token + user), kept in localStorage and exposed as a tiny
// reactive store via useSyncExternalStore so header/pages update on login/logout.
import { useSyncExternalStore } from "react";

const TOKEN_KEY = "ggp_token";
const USER_KEY = "ggp_user";
const listeners = new Set();

function read() {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY) || "",
      user: JSON.parse(localStorage.getItem(USER_KEY) || "null"),
    };
  } catch {
    return { token: "", user: null };
  }
}

let state = read();

function emit() {
  state = read(); // new object reference so subscribers re-render
  listeners.forEach((l) => l());
}

export function getToken() {
  return state.token;
}
export function getAuthUser() {
  return state.user;
}
export function isLoggedIn() {
  return !!state.token;
}
export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  emit();
}
export function updateAuthUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  emit();
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  emit();
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function snapshot() {
  return state;
}

// { token, user } — re-renders on any auth change.
export function useAuth() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
