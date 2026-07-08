// Anonymous, client-side identity for the leaderboard (no login, no server PII).
// A stable random id lives in localStorage; the nickname is user-editable.

const ID_KEY = "ggp_uid";
const NICK_KEY = "ggp_nick";

export function getUserId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getNickname() {
  return localStorage.getItem(NICK_KEY) || "";
}

export function setNickname(name) {
  localStorage.setItem(NICK_KEY, (name || "").trim().slice(0, 24));
}
