// Modo sin servidor: las cuentas viven en este navegador y se comparte por link.
// Se usa mientras firebase-config.js no tenga la configuración de Firebase.
import { G, Q, computeResult, compat, stationFreq } from "./data.js";
import * as SP from "./spotify.js";

export function startLocal() {
  /* ---------- utilidades ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const enc = encodeURIComponent;
  const app = $("#app");
  const USER_RE = /^[a-z0-9_.]{3,20}$/;
  const KEY = "sintoniza_local_v1";
  const initial = n => esc((n || "?")[0].toUpperCase());
  const fmtDate = ms => new Date(ms).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }
  function tune(p) { p = Math.min(1, Math.max(0, p)); $("#needle").style.left = `calc(${p * 100}% - 1px)`; $("#mhz").textContent = (88 + p * 20).toFixed(1); }
  const modal = $("#modal");
  function openModal(html, onReady) {
    modal.innerHTML = html; modal.showModal();
    modal.querySelectorAll("[data-close]").forEach(b => (b.onclick = () => modal.close()));
    onReady?.(modal);
  }
  modal.addEventListener("close", () => (modal.innerHTML = ""));

  /* ---------- almacenamiento ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { users: {}, session: null }; } catch { return { users: {}, session: null }; } }
  let store = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); }
    catch { toast("No se pudo guardar en este navegador"); }
  }
  const me = () => store.session && store.users[store.session] ? store.users[store.session] : null;
  const myName = () => store.session;

  async function hashPass(pass, salt) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 120000, hash: "SHA-256" }, key, 256);
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
  }

  /* ---------- links para compartir ---------- */
  const b64e = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64d = s => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
  const shareUrl = data => location.origin + location.pathname + "?c=" + b64e({ v: 1, u: myName(), ...data });

  const str = (x, n) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  const cleanSong = s => {
    const t = str(s?.[0] ?? s?.t, 120), a = str(s?.[1] ?? s?.a, 120), u = str(s?.[2] ?? s?.uri, 60);
    return t && a ? { t, a, ...(/^spotify:track:[A-Za-z0-9]+$/.test(u) ? { uri: u } : {}) } : null;
  };
  const packSong = s => [s.t, s.a, s.uri || ""];
  const cleanScores = sc => {
    if (!sc || typeof sc !== "object") return null;
    const o = {}; for (const k in G) { const v = Number(sc[k]); o[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0; }
    return o;
  };
  const topOf = sc => sc ? Object.keys(G).map(k => ({ k, p: sc[k] })).sort((a, b) => b.p - a.p).slice(0, 3) : null;

  // lo que llega por ?c=
  let pending = null;
  (() => {
    const c = new URLSearchParams(location.search).get("c");
    if (!c) return;
    try { pending = b64d(c); } catch { pending = "bad"; }
    history.replaceState(null, "", location.pathname + location.hash);
  })();

  function importPending() {
    if (!pending || !me()) return;
    const p = pending; pending = null;
    if (p === "bad" || typeof p !== "object") return toast("Ese link está dañado o incompleto");
    const from = str(p.u, 20).toLowerCase();
    if (!USER_RE.test(from)) return toast("Ese link está dañado o incompleto");
    const u = me();
    if (p.k === "perfil") {
      if (from === myName()) return toast("Ese es tu propio perfil");
      const scores = cleanScores(p.s);
      u.friends[from] = { scores, top: topOf(scores), favorites: (Array.isArray(p.f) ? p.f : []).slice(0, 30).map(cleanSong).filter(Boolean), addedAt: Date.now() };
      save(); toast(`@${from} agregado a tus amigos`); location.hash = "#amigos";
    } else if (p.k === "playlist") {
      const songs = (Array.isArray(p.s) ? p.s : []).slice(0, 300).map(cleanSong).filter(Boolean);
      const name = str(p.n, 60) || "Playlist compartida";
      u.playlists.unshift({ id: uid(), name, songs: songs.map(s => ({ ...s, by: from, at: Date.now() })), from, createdAt: Date.now() });
      save(); toast(`Playlist «${name}» de @${from} guardada`); location.hash = "#playlists";
    } else if (p.k === "cancion") {
      const s = cleanSong(p.s); if (!s) return toast("Ese link está dañado o incompleto");
      u.inbox.unshift({ id: uid(), from, ...s, msg: str(p.m, 280), at: Date.now(), read: false });
      save(); toast(`@${from} te recomendó una canción`); location.hash = "#buzon";
    }
    route();
  }

  function shareModal(title, desc, url, subject) {
    const mailBody = `${desc}\n\n${url}`;
    openModal(`<div class="genre"><div class="eyebrow">Compartir</div><h3>${esc(title)}</h3>
      <p class="small">${esc(desc)} Quien abra el link y entre con su cuenta lo recibe.</p>
      <div class="inline"><input id="shUrl" readonly value="${esc(url)}"><button class="btn primary" id="shCopy" type="button">Copiar</button></div>
      <div class="row">
        <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${enc(desc + " " + url)}">WhatsApp</a>
        <a class="btn" href="mailto:?subject=${enc(subject)}&body=${enc(mailBody)}" id="shMail">Correo</a>
      </div>
      <label>Mandar a un correo <span class="hint">Se abre tu app de correo con el mensaje listo</span>
        <div class="inline"><input id="shTo" type="email" placeholder="amigo@correo.com"><a class="btn" id="shToBtn" href="#">Abrir correo</a></div></label>
      <div class="row"><button class="btn" data-close type="button">Cerrar</button></div></div>`, m => {
      $("#shCopy", m).onclick = async () => {
        try { await navigator.clipboard.writeText(url); toast("Link copiado"); }
        catch { $("#shUrl", m).select(); toast("Selecciónalo y cópialo con Ctrl+C"); }
      };
      $("#shToBtn", m).onclick = e => {
        const to = $("#shTo", m).value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { e.preventDefault(); return toast("Escribe un correo válido"); }
        e.currentTarget.href = `mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(mailBody)}`;
      };
    });
  }

  /* ---------- cuentas ---------- */
  function viewAuth(mode = "login") {
    $("#tabs").hidden = true; $("#who").textContent = ""; tune(0);
    const reg = mode === "registro";
    const what = pending && pending !== "bad" ? ({ perfil: "su perfil", playlist: "una playlist", cancion: "una canción" }[pending.k]) : null;
    app.innerHTML = `${what ? `<section class="card"><div class="eyebrow">Te compartieron algo</div><p><strong>@${esc(str(pending.u, 20))}</strong> te compartió ${what}. Entra o crea tu cuenta para recibirlo.</p></section>` : ""}
      <section class="card">
      <div class="eyebrow">${reg ? "Crear cuenta" : "Entrar"}</div>
      <h1>${reg ? "Arma tu <span>perfil musical</span>" : "Vuelve a tu <span>estación</span>"}</h1>
      <p class="muted">${reg ? "Solo necesitas un usuario y una contraseña. El correo es opcional." : "Entra con tu usuario y contraseña."}</p>
      <form id="authForm" novalidate>
        <label>Usuario <input id="fUser" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20">
          ${reg ? `<span class="hint">3 a 20 caracteres: letras, números, punto o guion bajo</span>` : ""}</label>
        <label>Contraseña <input id="fPass" type="password" autocomplete="${reg ? "new-password" : "current-password"}">
          ${reg ? `<span class="hint">Mínimo 6 caracteres</span>` : ""}</label>
        ${reg ? `<label>Repite la contraseña <input id="fPass2" type="password" autocomplete="new-password"></label>
        <label>Correo <span class="hint">Opcional. Solo lo ves tú.</span><input id="fMail" type="email" autocomplete="email"></label>` : ""}
        <p class="err" id="authErr"></p>
        <div class="between">
          <button class="btn primary" type="submit">${reg ? "Crear cuenta" : "Entrar"}</button>
          <button class="link" type="button" id="swap">${reg ? "Ya tengo cuenta" : "Crear una cuenta nueva"}</button>
        </div>
        <p class="small">Tu cuenta se guarda en este navegador. Para usarla en otro aparato, comparte tu perfil por link.</p>
      </form></section>`;
    $("#swap").onclick = () => viewAuth(reg ? "login" : "registro");
    $("#authForm").onsubmit = async e => {
      e.preventDefault();
      const err = $("#authErr"); err.textContent = "";
      const u = $("#fUser").value.toLowerCase().trim(), p = $("#fPass").value;
      if (!USER_RE.test(u)) return (err.textContent = "El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.");
      if (p.length < 6) return (err.textContent = "La contraseña debe tener al menos 6 caracteres.");
      if (reg) {
        if (p !== $("#fPass2").value) return (err.textContent = "Las contraseñas no coinciden.");
        const mail = $("#fMail").value.trim();
        if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return (err.textContent = "Ese correo no parece válido.");
        if (store.users[u]) return (err.textContent = "Ese usuario ya existe en este navegador. Prueba otro.");
        const salt = uid();
        store.users[u] = { salt, hash: await hashPass(p, salt), email: mail, createdAt: Date.now(), scores: null, top: null, favorites: [], history: [], friends: {}, playlists: [], inbox: [] };
      } else {
        const acc = store.users[u];
        if (!acc || (await hashPass(p, acc.salt)) !== acc.hash) return (err.textContent = "Usuario o contraseña incorrectos.");
      }
      store.session = u; save(); enter();
    };
    $("#fUser").focus();
  }

  function enter() {
    $("#tabs").hidden = false;
    $("#who").textContent = "@" + myName();
    updateBadge();
    route();
    importPending();
  }
  function updateBadge() {
    const n = (me()?.inbox || []).filter(r => !r.read).length;
    $("#badge").hidden = !n; $("#badge").textContent = n;
  }

  /* ---------- navegación ---------- */
  let view = "encuesta";
  function route() {
    if (!me()) return viewAuth();
    const v = (location.hash || "#encuesta").slice(1);
    view = ["encuesta", "perfil", "amigos", "playlists", "buzon"].includes(v) ? v : "encuesta";
    document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === view));
    ({ encuesta: viewQuiz, perfil: viewProfile, amigos: viewFriends, playlists: viewPlaylists, buzon: viewInbox })[view]();
  }
  addEventListener("hashchange", route);

  /* ---------- canciones ---------- */
  const isFav = s => (me()?.favorites || []).some(f => f.t === s.t && f.a === s.a);
  function songRow(s, n, extra = "") {
    const qy = enc(`${s.t} ${s.a}`);
    const data = `data-t="${esc(s.t)}" data-a="${esc(s.a)}" data-uri="${esc(s.uri || "")}"`;
    return `<li>${n != null ? `<span class="n">${String(n).padStart(2, "0")}</span>` : ""}
      <span class="t"><strong>${esc(s.t)}</strong> <span>· ${esc(s.a)}</span></span>
      <span class="acts">
        ${SP.spotifyConnected() ? `<button class="spb" data-act="play" ${data}>▶ Escuchar</button>` : ""}
        <button class="${isFav(s) ? "on" : ""}" data-act="fav" ${data} aria-label="Favorito">${isFav(s) ? "★" : "☆"}</button>
        <button data-act="send" ${data}>Enviar</button>
        <button data-act="addpl" ${data}>+ Playlist</button>
        <a href="https://open.spotify.com/search/${qy}" target="_blank" rel="noopener">Spotify</a>
        <a href="https://www.youtube.com/results?search_query=${qy}" target="_blank" rel="noopener">YouTube</a>
        ${extra}
      </span></li>`;
  }
  const songFrom = el => ({ t: el.dataset.t, a: el.dataset.a, ...(el.dataset.uri ? { uri: el.dataset.uri } : {}) });

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b || !me()) return;
    const s = songFrom(b), u = me();
    if (b.dataset.act === "fav") {
      const i = u.favorites.findIndex(f => f.t === s.t && f.a === s.a);
      if (i >= 0) u.favorites.splice(i, 1); else u.favorites.unshift(s);
      u.favorites = u.favorites.slice(0, 100); save();
      b.classList.toggle("on", i < 0); b.textContent = i < 0 ? "★" : "☆";
      toast(i < 0 ? "Guardada en favoritas" : "Quitada de favoritas");
    }
    if (b.dataset.act === "send") sendModal(s);
    if (b.dataset.act === "addpl") addToPlaylistModal(s);
    if (b.dataset.act === "play") playModal(s);
  });

  async function playModal(s) {
    openModal(`<div class="genre"><h3>${esc(s.t)}</h3><p class="small">${esc(s.a)}</p><p class="muted" id="pl">Buscando en Spotify…</p>
      <div class="row"><button class="btn" data-close>Cerrar</button></div></div>`);
    try {
      const id = s.uri ? s.uri.split(":").pop() : (await SP.spFind(s.t, s.a))?.id;
      const el = $("#pl", modal); if (!el) return;
      el.outerHTML = id
        ? `<iframe class="player" src="https://open.spotify.com/embed/track/${enc(id)}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Reproductor de Spotify"></iframe>`
        : `<p class="muted">No la encontré en Spotify.</p>`;
    } catch (x) { const el = $("#pl", modal); if (el) el.textContent = x.message; }
  }

  function sendModal(s) {
    openModal(`<form id="sendF"><div class="eyebrow">Recomendar canción</div><h3>${esc(s.t)} · ${esc(s.a)}</h3>
      <label>Mensaje <span class="hint">Opcional, hasta 280 caracteres</span><textarea id="sMsg" maxlength="280" placeholder="Escúchala con audífonos…"></textarea></label>
      <div class="row"><button class="btn primary" type="submit">Crear link</button><button class="btn" type="button" data-close>Cancelar</button></div></form>`, m => {
      $("#sendF", m).onsubmit = e => {
        e.preventDefault();
        const msg = $("#sMsg", m).value.trim().slice(0, 280);
        const url = shareUrl({ k: "cancion", s: packSong(s), m: msg });
        modal.close();
        shareModal(`${s.t} · ${s.a}`, `@${myName()} te recomienda «${s.t}» de ${s.a}${msg ? `: "${msg}"` : "."}`, url, `Te recomiendo «${s.t}»`);
      };
    });
  }

  function addToPlaylistModal(s) {
    const pls = me().playlists;
    openModal(`<form id="plF"><div class="eyebrow">Agregar a playlist</div><h3>${esc(s.t)} · ${esc(s.a)}</h3>
      <label>Playlist <select id="plSel">${pls.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}<option value="__new">+ Nueva playlist…</option></select></label>
      <label id="plNewL" ${pls.length ? "hidden" : ""}>Nombre de la nueva playlist <input id="plNew" maxlength="60"></label>
      <div class="row"><button class="btn primary" type="submit">Agregar</button><button class="btn" type="button" data-close>Cancelar</button></div></form>`, m => {
      const sel = $("#plSel", m);
      if (!pls.length) sel.value = "__new";
      sel.onchange = () => ($("#plNewL", m).hidden = sel.value !== "__new");
      $("#plF", m).onsubmit = e => {
        e.preventDefault();
        const song = { ...s, by: myName(), at: Date.now() };
        if (sel.value === "__new") {
          const name = $("#plNew", m).value.trim(); if (!name) return toast("Ponle un nombre");
          pls.unshift({ id: uid(), name: name.slice(0, 60), songs: [song], createdAt: Date.now() });
        } else {
          const p = pls.find(x => x.id === sel.value);
          if (p.songs.some(x => x.t === s.t && x.a === s.a)) { modal.close(); return toast("Ya estaba en la playlist"); }
          p.songs.push(song);
        }
        save(); modal.close(); toast("Agregada a la playlist");
      };
    });
  }

  /* ---------- encuesta ---------- */
  let qi = 0, ans = [];
  function viewQuiz(restart = false) {
    if (restart === true || qi >= Q.length || !ans.length) { qi = 0; ans = Array(Q.length).fill(null); }
    if (restart !== true && me().top && qi === 0 && ans.every(a => a === null)) return quizIntro();
    renderQuestion();
  }
  function quizIntro() {
    const t = me().top[0]; tune((stationFreq(t.k) - 88) / 20);
    app.innerHTML = `<section class="card">
      <div class="eyebrow">Tu última señal · ${stationFreq(t.k)} FM</div>
      <h1>Tu estación es <span>${esc(G[t.k].n)}</span></h1>
      <p class="muted">Puedes repetir la encuesta cuando quieras. Tu perfil y la compatibilidad con tus amigos usan el último resultado.</p>
      <div class="row"><button class="btn primary" id="again">Hacer la encuesta otra vez</button><a class="btn" href="#perfil">Ver mi perfil</a></div>
    </section>`;
    $("#again").onclick = () => viewQuiz(true);
  }
  function renderQuestion() {
    tune(qi / Q.length);
    const q = Q[qi];
    app.innerHTML = `<section class="card" aria-live="polite">
      <div class="q-num">Pregunta ${qi + 1} de ${Q.length}</div>
      <h2>${q.q}</h2>
      <div class="opts">${q.o.map((o, j) => `<button class="opt ${ans[qi] === j ? "sel" : ""}" data-j="${j}"><span class="k">${"ABCDE"[j]}</span>${o[0]}</button>`).join("")}</div>
      <div class="between"><button class="btn" id="back" ${qi === 0 ? "disabled" : ""}>Atrás</button><span class="small">También puedes usar las teclas A–E</span></div>
    </section>`;
    app.querySelectorAll(".opt").forEach(b => (b.onclick = () => pick(+b.dataset.j)));
    $("#back").onclick = () => { if (qi > 0) { qi--; renderQuestion(); } };
  }
  function pick(j) {
    ans[qi] = j;
    app.querySelectorAll(".opt").forEach(b => b.classList.toggle("sel", +b.dataset.j === j));
    setTimeout(() => { if (qi < Q.length - 1) { qi++; renderQuestion(); } else finishQuiz(); }, 200);
  }
  document.addEventListener("keydown", e => {
    if (view !== "encuesta" || !app.querySelector(".opt") || modal.open || e.target.matches("input,textarea,select")) return;
    const j = "abcde".indexOf(e.key.toLowerCase());
    if (j >= 0 && j < Q[qi].o.length) pick(j);
  });
  function finishQuiz() {
    const { scores, rank } = computeResult(ans);
    const top = rank.slice(0, 3), u = me();
    u.scores = scores; u.top = top; u.history.unshift({ top, at: Date.now() }); u.history = u.history.slice(0, 30); save();
    qi = Q.length;
    const f = stationFreq(top[0].k); tune((f - 88) / 20);
    app.innerHTML = `<section class="card">
      <div class="eyebrow">Tu señal · ${f} FM</div>
      <h1>Tu estación es <span>${esc(G[top[0].k].n)}</span></h1>
      <p class="small">Guardado en tu perfil.</p>
      ${top.map(t => `<div class="genre sep">
        <div class="between"><h3>${esc(G[t.k].n)}</h3><span class="g-pct">${t.p}% compatible</span></div>
        <div class="bar"><div style="width:0" data-w="${t.p}"></div></div>
        <p class="muted">${esc(G[t.k].d)}</p>
        <ol class="songs">${G[t.k].s.map((s, n) => songRow({ t: s[0], a: s[1] }, n + 1)).join("")}</ol></div>`).join("")}
      <div class="genre sep"><h3>También podrías explorar</h3>
        <div class="chips">${rank.slice(3, 6).map(m => `<span class="chip">${esc(G[m.k].n)} · ${m.p}%</span>`).join("")}</div></div>
      <div class="row sep"><button class="btn primary" id="again">Hacer la encuesta otra vez</button><button class="btn" id="shareMe">Compartir mi resultado</button></div>
    </section>`;
    requestAnimationFrame(() => requestAnimationFrame(() => app.querySelectorAll(".bar>div").forEach(d => (d.style.width = d.dataset.w + "%"))));
    $("#again").onclick = () => viewQuiz(true);
    $("#shareMe").onclick = shareProfile;
  }

  /* ---------- perfil ---------- */
  function topBlock(d) {
    if (!d?.top) return `<p class="empty">Todavía no hay resultados. <a href="#encuesta">Haz la encuesta</a>.</p>`;
    return d.top.map(t => `<div class="genre"><div class="between"><strong>${esc(G[t.k]?.n)}</strong><span class="g-pct">${t.p}%</span></div>
      <div class="bar"><div style="width:${t.p}%"></div></div></div>`).join("");
  }
  function shareProfile() {
    const u = me();
    if (!u.scores) return toast("Haz la encuesta primero para compartir tu perfil");
    const url = shareUrl({ k: "perfil", s: u.scores, f: u.favorites.slice(0, 20).map(packSong) });
    shareModal(`Tu perfil @${myName()}`, `Mira mi perfil musical en Sintoniza y compara cuánto coincidimos (yo soy @${myName()}).`, url, "Mi perfil musical en Sintoniza");
  }
  function viewProfile() {
    const u = me(), t = u.top?.[0];
    if (t) tune((stationFreq(t.k) - 88) / 20);
    app.innerHTML = `<section class="card">
        <div class="row"><div class="avatar">${initial(myName())}</div><div><h2>@${esc(myName())}</h2>
        <p class="small">${t ? `Estación ${stationFreq(t.k)} FM · ${esc(G[t.k].n)}` : "Sin estación todavía"} · ${Object.keys(u.friends).length} amigos</p></div></div>
        ${topBlock(u)}
        <div class="row"><button class="btn primary" id="shareMe">Compartir mi perfil</button></div></section>
      <section class="card" id="pSpotify"></section>
      <section class="card"><h2>Canciones favoritas</h2><ol class="songs">${u.favorites.length ? u.favorites.map((s, i) => songRow(s, i + 1)).join("") : `<li class="empty">Marca canciones con ☆ para guardarlas aquí.</li>`}</ol></section>
      <section class="card"><h2>Historial de encuestas</h2><div class="list">${u.history.length ? u.history.slice(0, 10).map(r => `<div class="item"><div class="main"><strong>${esc(G[r.top[0].k].n)}</strong> <span class="muted">· ${r.top.slice(1).map(x => esc(G[x.k].n)).join(", ")}</span></div><span class="small">${fmtDate(r.at)}</span></div>`).join("") : `<p class="empty">Aún no has hecho la encuesta.</p>`}</div></section>
      <section class="card"><h2>Cuenta</h2>
        <form id="mailF"><label>Correo <span class="hint">Opcional. Solo lo ves tú.</span><div class="inline"><input id="mail" type="email" autocomplete="email" value="${esc(u.email)}"><button class="btn" type="submit">Guardar</button></div></label></form>
        <p class="small">Tu cuenta vive en este navegador. Si borras los datos del navegador, se borra.</p>
        <div class="row"><button class="btn" id="logout">Cerrar sesión</button><button class="btn danger" id="delAcc">Borrar mi cuenta</button></div></section>`;
    $("#shareMe").onclick = shareProfile;
    $("#mailF").onsubmit = e => {
      e.preventDefault(); const v = $("#mail").value.trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast("Ese correo no parece válido");
      u.email = v; save(); toast("Correo guardado");
    };
    $("#logout").onclick = () => { store.session = null; save(); viewAuth(); };
    $("#delAcc").onclick = () => {
      if (!confirm("¿Borrar tu cuenta y todo lo guardado? No se puede deshacer.")) return;
      delete store.users[myName()]; store.session = null; save(); viewAuth("registro");
    };
    fillSpotify();
  }

  let spInfo = null;
  async function fillSpotify() {
    const box = $("#pSpotify"); if (!box) return;
    if (!SP.spotifyReady()) { box.innerHTML = `<h2>Spotify</h2><p class="small">La conexión con Spotify se activa cuando se configure el Client ID de Spotify (ver LEEME.md). Mientras tanto, cada canción tiene su botón para abrirla en Spotify.</p>`; return; }
    if (!SP.spotifyConnected()) {
      box.innerHTML = `<h2>Spotify</h2><p class="muted">Conecta tu cuenta para ver tus canciones más escuchadas, escuchar canciones aquí mismo y guardar tus playlists en Spotify.</p>
        <div class="row"><button class="btn sp fill" id="spGo">Conectar Spotify</button></div>`;
      $("#spGo").onclick = () => SP.spotifyLogin(); return;
    }
    box.innerHTML = `<div class="between"><h2>Tu Spotify</h2><button class="btn sm" id="spOut">Desconectar</button></div><p class="small" id="spState">Cargando tus más escuchadas…</p>`;
    $("#spOut").onclick = () => { SP.spotifyLogout(); spInfo = null; route(); };
    try {
      spInfo ||= await Promise.all([SP.spMe(), SP.spTopTracks(), SP.spTopArtists()]);
      const [prof, tracks, artists] = spInfo;
      const gk = SP.genresFromArtists(artists).slice(0, 4);
      const st = $("#spState"); if (!st) return;
      st.outerHTML = `<p class="small">Conectado como ${esc(prof.display_name || prof.id)}</p>
        ${gk.length ? `<div class="genre"><strong>Según lo que escuchas en Spotify</strong><div class="chips">${gk.map(k => `<span class="chip">${esc(G[k].n)}</span>`).join("")}</div></div>` : ""}
        ${artists.length ? `<div class="genre"><strong>Tus artistas más escuchados</strong><div class="chips">${artists.slice(0, 8).map(a => `<span class="chip">${esc(a.name)}</span>`).join("")}</div></div>` : ""}
        <div class="genre"><strong>Tus canciones más escuchadas</strong>${tracks.length ? `<ol class="songs">${tracks.map((s, i) => songRow(s, i + 1)).join("")}</ol>` : `<p class="small">Spotify todavía no tiene suficientes datos tuyos.</p>`}</div>`;
    } catch (x) { const st = $("#spState"); if (st) st.textContent = x.message; }
  }

  /* ---------- amigos ---------- */
  function viewFriends() {
    tune(0.35);
    const u = me();
    const list = Object.entries(u.friends).map(([n, f]) => ({ n, ...f, c: compat(u.scores, f.scores) })).sort((a, b) => (b.c ?? -1) - (a.c ?? -1));
    app.innerHTML = `<section class="card"><h2>Amigos</h2>
        <p class="muted">Para agregar a alguien, pídele el link de su perfil (Mi perfil → Compartir mi perfil) y ábrelo. Para que te agreguen, comparte el tuyo.</p>
        <div class="row"><button class="btn primary" id="shareMe">Compartir mi perfil</button></div></section>
      <section class="card"><h2>Tus amigos</h2><div class="list">${list.length ? list.map(f => `<div class="item"><div class="row main"><div class="avatar">${initial(f.n)}</div><div><strong>@${esc(f.n)}</strong>
        <div class="small">${f.top ? esc(G[f.top[0].k].n) : "Sin encuesta"} · agregado ${fmtDate(f.addedAt)}</div></div></div>
        <div class="row">${f.c != null ? `<span class="pct">${f.c}% compatibles</span>` : ""}<button class="btn sm" data-see="${esc(f.n)}">Ver perfil</button></div></div>`).join("")
        : `<p class="empty">Todavía no tienes amigos agregados.</p>`}</div></section>`;
    $("#shareMe").onclick = shareProfile;
    app.querySelectorAll("[data-see]").forEach(b => (b.onclick = () => viewFriend(b.dataset.see)));
  }
  function viewFriend(n) {
    const u = me(), f = u.friends[n]; if (!f) return viewFriends();
    const c = compat(u.scores, f.scores);
    const mine = new Set((u.top || []).map(t => t.k));
    const shared = (f.top || []).filter(t => mine.has(t.k)).map(t => G[t.k].n);
    app.innerHTML = `<section class="card">
        <button class="link" id="backF" type="button">← Amigos</button>
        <div class="between"><div class="row"><div class="avatar">${initial(n)}</div><h2>@${esc(n)}</h2></div>${c != null ? `<span class="pct">${c}% compatibles</span>` : ""}</div>
        ${shared.length ? `<p class="muted">Tienen en común: ${shared.map(esc).join(", ")}.</p>` : ""}
        ${topBlock(f)}
        <p class="small">Si @${esc(n)} vuelve a hacer la encuesta, pídele su link otra vez para actualizarlo.</p>
        <div class="row"><button class="btn danger sm" id="unf">Quitar de amigos</button></div></section>
      <section class="card"><h2>Sus favoritas</h2><ol class="songs">${f.favorites.length ? f.favorites.map((x, i) => songRow(x, i + 1)).join("") : `<li class="empty">No compartió favoritas.</li>`}</ol></section>`;
    $("#backF").onclick = viewFriends;
    $("#unf").onclick = () => { delete u.friends[n]; save(); toast(`@${n} quitado de tus amigos`); viewFriends(); };
  }

  /* ---------- playlists ---------- */
  function viewPlaylists() {
    tune(0.6);
    const pls = me().playlists;
    app.innerHTML = `<section class="card"><h2>Playlists</h2>
        <p class="muted">Crea playlists y compártelas por link: tus amigos reciben una copia que pueden seguir armando.</p>
        <form id="newPl"><label>Nueva playlist <div class="inline"><input id="plName" maxlength="60" placeholder="ej. Viaje a la playa"><button class="btn primary" type="submit">Crear</button></div></label></form></section>
      <section class="card"><h2>Mis playlists</h2><div class="list">${pls.length ? pls.map(p => `<div class="item"><div class="main"><strong>${esc(p.name)}</strong>
        <div class="small">${p.songs.length} canciones${p.from ? ` · compartida por @${esc(p.from)}` : ""}</div></div>
        <button class="btn sm" data-open="${esc(p.id)}">Abrir</button></div>`).join("") : `<p class="empty">Todavía no tienes playlists.</p>`}</div></section>`;
    $("#newPl").onsubmit = e => {
      e.preventDefault(); const name = $("#plName").value.trim(); if (!name) return;
      const p = { id: uid(), name: name.slice(0, 60), songs: [], createdAt: Date.now() };
      pls.unshift(p); save(); viewPlaylist(p.id);
    };
    app.querySelectorAll("[data-open]").forEach(b => (b.onclick = () => viewPlaylist(b.dataset.open)));
  }
  function viewPlaylist(id) {
    const p = me().playlists.find(x => x.id === id); if (!p) return viewPlaylists();
    app.innerHTML = `<section class="card">
        <button class="link" id="backP" type="button">← Playlists</button>
        <h1>${esc(p.name)}</h1><p class="small">${p.songs.length} canciones${p.from ? ` · compartida por @${esc(p.from)}` : ""}</p>
        <div class="row"><button class="btn primary" id="shareP" ${p.songs.length ? "" : "disabled"}>Compartir</button>
          ${SP.spotifyReady() ? (SP.spotifyConnected() ? `<button class="btn sp fill" id="exp" ${p.songs.length ? "" : "disabled"}>Guardar en mi Spotify</button>` : `<button class="btn sp" id="spGo2">Conectar Spotify para guardarla</button>`) : ""}
          <button class="btn danger" id="delP">Borrar</button></div>
        <p class="small" id="expState"></p></section>
      <section class="card"><h2>Canciones</h2><ol class="songs">${p.songs.length ? p.songs.map((s, i) => songRow(s, i + 1, `${s.by && s.by !== myName() ? `<span class="small">por @${esc(s.by)}</span>` : ""}<button data-rm="${i}" aria-label="Quitar">✕</button>`)).join("") : `<li class="empty">La playlist está vacía. Agrega la primera canción abajo.</li>`}</ol></section>
      <section class="card"><h2>Agregar canción</h2>
        ${SP.spotifyConnected() ? `<form id="spS"><label>Buscar en Spotify <div class="inline"><input id="spQ" placeholder="Canción o artista"><button class="btn sp" type="submit">Buscar</button></div></label></form><ol class="songs" id="spRes"></ol><p class="small">O escríbela a mano:</p>` : ""}
        <form id="addS"><div class="row"><input id="sT" placeholder="Canción" maxlength="120" style="flex:2 1 160px"><input id="sA" placeholder="Artista" maxlength="120" style="flex:1 1 120px"><button class="btn primary" type="submit">Agregar</button></div></form></section>`;
    const add = s => { p.songs.push({ ...s, by: myName(), at: Date.now() }); save(); toast("Agregada"); viewPlaylist(id); };
    $("#backP").onclick = viewPlaylists;
    $("#shareP").onclick = () => shareModal(`Playlist «${p.name}»`, `@${myName()} te comparte la playlist «${p.name}» (${p.songs.length} canciones).`,
      shareUrl({ k: "playlist", n: p.name, s: p.songs.slice(0, 150).map(packSong) }), `Playlist «${p.name}»`);
    $("#delP").onclick = () => {
      if (!confirm(`¿Borrar «${p.name}»? No se puede deshacer.`)) return;
      me().playlists = me().playlists.filter(x => x.id !== id); save(); toast("Playlist borrada"); viewPlaylists();
    };
    $("#spGo2")?.addEventListener("click", () => SP.spotifyLogin());
    $("#exp")?.addEventListener("click", async e => {
      e.target.disabled = true; $("#expState").textContent = "Creando la playlist en tu Spotify…";
      try {
        const r = await SP.spExport(p.name, p.songs);
        const st = $("#expState"); if (!st) return;
        st.innerHTML = `Listo: ${r.added} de ${r.total} canciones guardadas. ${r.url?.startsWith("https://") ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir en Spotify</a>` : ""}`;
      } catch (x) { $("#expState").textContent = x.message; e.target.disabled = false; }
    });
    app.querySelectorAll("[data-rm]").forEach(b => (b.onclick = () => { p.songs.splice(+b.dataset.rm, 1); save(); viewPlaylist(id); }));
    $("#addS").onsubmit = e => {
      e.preventDefault(); const t = $("#sT").value.trim(), a = $("#sA").value.trim();
      if (!t || !a) return toast("Escribe canción y artista");
      add({ t: t.slice(0, 120), a: a.slice(0, 120) });
    };
    if ($("#spS")) $("#spS").onsubmit = async e => {
      e.preventDefault(); const q = $("#spQ").value.trim(); if (!q) return;
      const box = $("#spRes"); box.innerHTML = `<li class="small">Buscando…</li>`;
      try {
        const res = await SP.spSearch(q);
        box.innerHTML = res.length ? res.map((s, i) => `<li><span class="t"><strong>${esc(s.t)}</strong> <span>· ${esc(s.a)}</span></span><span class="acts"><button class="spb" data-i="${i}">+ Agregar</button></span></li>`).join("") : `<li class="small">Sin resultados.</li>`;
        box.querySelectorAll("[data-i]").forEach(b => (b.onclick = () => { const s = res[+b.dataset.i]; add({ t: s.t, a: s.a, uri: s.uri }); }));
      } catch (x) { box.innerHTML = `<li class="err">${esc(x.message)}</li>`; }
    };
  }

  /* ---------- buzón ---------- */
  function viewInbox() {
    tune(0.85);
    const u = me();
    app.innerHTML = `<section class="card"><h2>Te recomendaron</h2>
      <p class="muted">Cuando un amigo te mande el link de una canción y lo abras, aparece aquí. Para mandar una, toca «Enviar» en cualquier canción.</p>
      <div class="list">${u.inbox.length ? u.inbox.map(r => `<div class="item ${r.read ? "" : "unread"}"><div class="main">
        <p class="small">@${esc(r.from)} te recomendó · ${fmtDate(r.at)}</p>${r.msg ? `<p>“${esc(r.msg)}”</p>` : ""}
        <ol class="songs">${songRow(r, null, `<button data-del="${esc(r.id)}" aria-label="Borrar">✕</button>`)}</ol></div></div>`).join("")
        : `<p class="empty">Todavía no te han recomendado canciones.</p>`}</div></section>`;
    app.querySelectorAll("[data-del]").forEach(b => (b.onclick = () => { u.inbox = u.inbox.filter(r => r.id !== b.dataset.del); save(); updateBadge(); viewInbox(); }));
    u.inbox.forEach(r => (r.read = true)); save(); updateBadge();
  }

  /* ---------- arranque ---------- */
  SP.handleSpotifyRedirect().then(r => {
    if (r === "ok") toast("Spotify conectado");
    if (r === "error") toast("No se pudo conectar Spotify");
  }).catch(() => {}).finally(() => { if (me()) enter(); else viewAuth(pending ? "registro" : "login"); });
}
