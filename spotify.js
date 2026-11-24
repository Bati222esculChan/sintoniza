// Conexión con Spotify (Authorization Code + PKCE, sin secreto en el navegador)
import { spotifyClientId as CID } from "./firebase-config.js";

const SCOPES = "user-top-read playlist-modify-private playlist-modify-public";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const redirectUri = () => location.origin + location.pathname;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

export const spotifyReady = () => !!CID && !CID.startsWith("PEGA");

function rand(n) {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), b => c[b % 62]).join("");
}
async function challenge(v) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function spotifyLogin() {
  const v = rand(64), st = rand(16);
  ls.set("sp_verifier", v); ls.set("sp_state", st); ls.set("sp_return", location.hash);
  const p = new URLSearchParams({
    client_id: CID, response_type: "code", redirect_uri: redirectUri(), scope: SCOPES,
    code_challenge_method: "S256", code_challenge: await challenge(v), state: st
  });
  location.href = "https://accounts.spotify.com/authorize?" + p;
}

function saveTokens(t) {
  const old = readTokens();
  ls.set("sp_tok", JSON.stringify({
    access: t.access_token,
    refresh: t.refresh_token || old?.refresh,
    exp: Date.now() + (t.expires_in - 60) * 1000
  }));
}
function readTokens() { try { return JSON.parse(ls.get("sp_tok")); } catch { return null; } }
export const spotifyConnected = () => !!readTokens();
export function spotifyLogout() { ls.del("sp_tok"); }

// Al volver de Spotify: cambia el ?code= por tokens. Devuelve null, "ok" o "error".
export async function handleSpotifyRedirect() {
  const p = new URLSearchParams(location.search);
  const code = p.get("code");
  if (!code && !p.get("error")) return null;
  history.replaceState(null, "", location.pathname + (ls.get("sp_return") || ""));
  if (!code || p.get("state") !== ls.get("sp_state")) return "error";
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CID, grant_type: "authorization_code", code,
      redirect_uri: redirectUri(), code_verifier: ls.get("sp_verifier") || ""
    })
  });
  ls.del("sp_verifier"); ls.del("sp_state");
  if (!r.ok) return "error";
  saveTokens(await r.json());
  return "ok";
}

async function accessToken() {
  const t = readTokens();
  if (!t) throw new Error("Conecta Spotify primero.");
  if (Date.now() < t.exp) return t.access;
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: CID })
  });
  if (!r.ok) { spotifyLogout(); throw new Error("Tu sesión de Spotify venció. Conéctalo otra vez."); }
  saveTokens(await r.json());
  return readTokens().access;
}

async function api(path, opts = {}) {
  const r = await fetch("https://api.spotify.com/v1" + path, {
    ...opts,
    headers: { Authorization: "Bearer " + await accessToken(), "Content-Type": "application/json" }
  });
  if (r.status === 401) { spotifyLogout(); throw new Error("Tu sesión de Spotify venció. Conéctalo otra vez."); }
  if (r.status === 403) throw new Error("Spotify no dio permiso. Revisa que tu cuenta esté agregada en la app de Spotify Developer.");
  if (!r.ok) throw new Error("Spotify respondió con un error (" + r.status + ").");
  return r.status === 204 ? null : r.json();
}

const simple = t => ({ t: t.name, a: t.artists.map(x => x.name).join(", "), uri: t.uri, id: t.id });

export const spMe = () => api("/me");
export const spTopTracks = () => api("/me/top/tracks?limit=10&time_range=medium_term").then(r => r.items.map(simple));
export const spTopArtists = () => api("/me/top/artists?limit=12&time_range=medium_term").then(r => r.items);
export const spSearch = q => api("/search?type=track&limit=6&q=" + encodeURIComponent(q)).then(r => r.tracks.items.map(simple));

export async function spFind(t, a) {
  const r = await api("/search?type=track&limit=1&q=" + encodeURIComponent(`${t} ${a}`));
  return r.tracks.items[0] ? simple(r.tracks.items[0]) : null;
}

// Crea una playlist en la cuenta de Spotify del usuario y devuelve su link
export async function spExport(name, songs) {
  const me = await spMe();
  const pl = await api(`/users/${encodeURIComponent(me.id)}/playlists`, {
    method: "POST",
    body: JSON.stringify({ name, public: false, description: "Hecha en Sintoniza" })
  });
  const uris = [];
  for (const s of songs) {
    const uri = s.uri || (await spFind(s.t, s.a))?.uri;
    if (uri) uris.push(uri);
  }
  for (let i = 0; i < uris.length; i += 100)
    await api(`/playlists/${pl.id}/tracks`, { method: "POST", body: JSON.stringify({ uris: uris.slice(i, i + 100) }) });
  return { url: pl.external_urls?.spotify, added: uris.length, total: songs.length };
}

// Traduce los géneros de los artistas de Spotify a los géneros de la encuesta
const KEYS = {
  pop: ["pop"], rock: ["rock", "grunge", "punk"], hiphop: ["hip hop", "rap", "trap", "drill"],
  reggaeton: ["reggaeton", "urbano", "dembow", "latin"], electro: ["edm", "house", "techno", "electro", "dance", "trance", "dubstep"],
  indie: ["indie", "alternative", "shoegaze", "dream"], jazz: ["jazz", "bossa"], rnb: ["r&b", "soul", "funk", "neo soul"],
  metal: ["metal", "core"], clasica: ["classical", "soundtrack", "orchestra", "piano", "compositional"],
  lofi: ["lo-fi", "lofi", "chill", "ambient"], tropical: ["salsa", "cumbia", "bachata", "merengue", "tropical", "vallenato"]
};
export function genresFromArtists(artists) {
  const c = {};
  for (const ar of artists) for (const g of ar.genres || [])
    for (const k in KEYS) if (KEYS[k].some(w => g.toLowerCase().includes(w))) c[k] = (c[k] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}
