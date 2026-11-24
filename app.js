import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where,
  orderBy, limit, onSnapshot, serverTimestamp, writeBatch, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { G, Q, computeResult, compat, stationFreq } from "./data.js";
import * as SP from "./spotify.js";

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const app = $("#app");
const USER_RE = /^[a-z0-9_.]{3,20}$/;
const toEmail = u => `${u}@usuarios.sintoniza.app`; // correo interno: se entra solo con usuario y contraseña

let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
}
const fmtDate = ts => {
  const d = ts?.toDate ? ts.toDate() : (typeof ts === "number" ? new Date(ts) : null);
  return d ? d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }) : "ahora";
};
const at = x => x?.at?.toMillis ? x.at.toMillis() : (typeof x?.at === "number" ? x.at : Date.now());
const initial = n => esc((n || "?")[0].toUpperCase());

/* ---------- dial FM ---------- */
(() => {
  let h = "";
  for (let f = 88; f <= 108; f += 0.5) {
    const x = (f - 88) / 20 * 100, big = f % 2 === 0;
    h += `<i class="${big ? "big" : ""}" style="left:${x}%"></i>`;
    if (big && f % 4 === 0) h += `<b style="left:${x}%">${f}</b>`;
  }
  $("#ticks").insertAdjacentHTML("afterbegin", h);
})();
function tune(p) {
  $("#needle").style.left = `calc(${Math.min(1, Math.max(0, p)) * 100}% - 1px)`;
  $("#mhz").textContent = (88 + p * 20).toFixed(1);
}

/* ---------- modal ---------- */
const modal = $("#modal");
function openModal(html, onReady) {
  modal.innerHTML = html;
  modal.showModal();
  modal.querySelectorAll("[data-close]").forEach(b => b.onclick = () => modal.close());
  onReady?.(modal);
}
modal.addEventListener("close", () => (modal.innerHTML = ""));

/* ---------- sin configurar ---------- */
const configured = firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith("PEGA");
if (!configured) {
  app.innerHTML = `<section class="card">
    <div class="eyebrow">Falta un paso</div>
    <h2>Conecta tu proyecto de Firebase</h2>
    <p class="muted">Abre <strong>firebase-config.js</strong> y pega la configuración de tu app web de Firebase. Los pasos completos están en <strong>LEEME.md</strong>.</p>
  </section>`;
} else {
  start();
}

/* ---------- arranque ---------- */
function start() {
  const fb = initializeApp(firebaseConfig);
  const auth = getAuth(fb);
  const db = getFirestore(fb);

  // estado
  let me = null, meDoc = null, following = [], inbox = [], playlists = [];
  let unsubs = [], view = "encuesta", openPl = null, openFriend = null, plUnsub = null;
  const names = {};
  let spInfo = null; // datos de Spotify ya cargados

  // vuelta desde Spotify
  const spReturn = SP.handleSpotifyRedirect().then(r => {
    if (r === "ok") toast("Spotify conectado");
    if (r === "error") toast("No se pudo conectar Spotify");
  }).catch(() => toast("No se pudo conectar Spotify"));

  async function nameOf(uid) {
    if (names[uid]) return names[uid];
    try { const s = await getDoc(doc(db, "users", uid)); names[uid] = s.exists() ? s.data().username : "usuario"; }
    catch { names[uid] = "usuario"; }
    return names[uid];
  }
  const namesOf = uids => Promise.all([...new Set(uids)].map(nameOf));
  async function uidOf(username) {
    const u = username.toLowerCase().trim().replace(/^@/, "");
    if (!USER_RE.test(u)) return null;
    const s = await getDoc(doc(db, "usernames", u));
    return s.exists() ? s.data().uid : null;
  }

  /* ---------- cuentas ---------- */
  function viewAuth(mode = "login") {
    $("#tabs").hidden = true; $("#who").textContent = ""; tune(0);
    const reg = mode === "registro";
    app.innerHTML = `<section class="card">
      <div class="eyebrow">${reg ? "Crear cuenta" : "Entrar"}</div>
      <h1>${reg ? "Arma tu <span>perfil musical</span>" : "Vuelve a tu <span>estación</span>"}</h1>
      <p class="muted">${reg ? "Solo necesitas un usuario y una contraseña. El correo es opcional." : "Entra con tu usuario y contraseña."}</p>
      <form id="authForm" novalidate>
        <label>Usuario <input id="fUser" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required>
          ${reg ? `<span class="hint">3 a 20 caracteres: letras, números, punto o guion bajo</span>` : ""}</label>
        <label>Contraseña <input id="fPass" type="password" autocomplete="${reg ? "new-password" : "current-password"}" required>
          ${reg ? `<span class="hint">Mínimo 6 caracteres</span>` : ""}</label>
        ${reg ? `<label>Repite la contraseña <input id="fPass2" type="password" autocomplete="new-password" required></label>
        <label>Correo <span class="hint">Opcional. Solo lo ves tú.</span><input id="fMail" type="email" autocomplete="email"></label>` : ""}
        <p class="err" id="authErr"></p>
        <div class="between">
          <button class="btn primary" type="submit">${reg ? "Crear cuenta" : "Entrar"}</button>
          <button class="link" type="button" id="swap">${reg ? "Ya tengo cuenta" : "Crear una cuenta nueva"}</button>
        </div>
      </form></section>`;
    $("#swap").onclick = () => viewAuth(reg ? "login" : "registro");
    $("#authForm").onsubmit = async e => {
      e.preventDefault();
      const err = $("#authErr"); err.textContent = "";
      const u = $("#fUser").value.toLowerCase().trim(), p = $("#fPass").value;
      if (!USER_RE.test(u)) return (err.textContent = "El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.");
      if (p.length < 6) return (err.textContent = "La contraseña debe tener al menos 6 caracteres.");
      const btn = e.submitter; btn.disabled = true;
      try {
        if (!reg) { await signInWithEmailAndPassword(auth, toEmail(u), p); return; }
        if (p !== $("#fPass2").value) throw { msg: "Las contraseñas no coinciden." };
        const mail = $("#fMail").value.trim();
        if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw { msg: "Ese correo no parece válido." };
        if ((await getDoc(doc(db, "usernames", u))).exists()) throw { msg: "Ese usuario ya existe. Prueba otro." };
        const cred = await createUserWithEmailAndPassword(auth, toEmail(u), p);
        const uid = cred.user.uid;
        try {
          const b = writeBatch(db);
          b.set(doc(db, "usernames", u), { uid });
          b.set(doc(db, "users", uid), { username: u, createdAt: serverTimestamp(), favorites: [], scores: null, top: null });
          b.set(doc(db, "users", uid, "private", "info"), { email: mail });
          await b.commit();
        } catch (x) { await deleteUser(cred.user).catch(() => {}); throw { msg: "Ese usuario ya existe. Prueba otro." }; }
      } catch (x) {
        btn.disabled = false;
        err.textContent = x.msg || ({
          "auth/invalid-credential": "Usuario o contraseña incorrectos.",
          "auth/wrong-password": "Usuario o contraseña incorrectos.",
          "auth/user-not-found": "Usuario o contraseña incorrectos.",
          "auth/email-already-in-use": "Ese usuario ya existe. Prueba otro.",
          "auth/too-many-requests": "Demasiados intentos. Espera un momento.",
          "auth/network-request-failed": "Sin conexión. Revisa tu internet."
        }[x.code] || "Algo falló. Intenta de nuevo.");
      }
    };
    $("#fUser").focus();
  }

  onAuthStateChanged(auth, async u => {
    unsubs.forEach(f => f()); unsubs = []; plUnsub?.(); plUnsub = null;
    me = u; meDoc = null; following = []; inbox = []; playlists = [];
    if (!u) return viewAuth();
    await spReturn;
    $("#tabs").hidden = false;
    unsubs.push(onSnapshot(doc(db, "users", u.uid), s => {
      meDoc = s.data() || null;
      if (meDoc) { names[u.uid] = meDoc.username; $("#who").textContent = "@" + meDoc.username; }
      if (view === "perfil") fillProfile();
    }));
    unsubs.push(onSnapshot(query(collection(db, "follows"), where("from", "==", u.uid)), s => {
      following = s.docs.map(d => d.data().to);
      if (view === "amigos" && !openFriend) fillFriends();
    }));
    unsubs.push(onSnapshot(query(collection(db, "recs"), where("to", "==", u.uid)), s => {
      inbox = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => at(b) - at(a));
      const n = inbox.filter(r => !r.read).length;
      $("#badge").hidden = !n; $("#badge").textContent = n;
      if (view === "buzon") fillInbox();
    }));
    unsubs.push(onSnapshot(query(collection(db, "playlists"), where("members", "array-contains", u.uid)), s => {
      playlists = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0));
      if (view === "playlists" && !openPl) fillPlaylists();
    }));
    route();
  });

  /* ---------- navegación ---------- */
  function route() {
    if (!me) return;
    const v = (location.hash || "#encuesta").slice(1);
    view = ["encuesta", "perfil", "amigos", "playlists", "buzon"].includes(v) ? v : "encuesta";
    openPl = null; openFriend = null; plUnsub?.(); plUnsub = null;
    document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === view));
    ({ encuesta: viewQuiz, perfil: viewProfile, amigos: viewFriends, playlists: viewPlaylists, buzon: viewInbox })[view]();
  }
  addEventListener("hashchange", route);

  /* ---------- filas de canciones ---------- */
  const isFav = s => (meDoc?.favorites || []).some(f => f.t === s.t && f.a === s.a);
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

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b || !me) return;
    const s = songFrom(b);
    try {
      if (b.dataset.act === "fav") {
        const ref = doc(db, "users", me.uid);
        const cur = (meDoc?.favorites || []).find(f => f.t === s.t && f.a === s.a);
        await updateDoc(ref, { favorites: cur ? arrayRemove(cur) : arrayUnion(s) });
        b.classList.toggle("on", !cur); b.textContent = cur ? "☆" : "★";
        toast(cur ? "Quitada de favoritas" : "Guardada en favoritas");
      }
      if (b.dataset.act === "send") sendModal(s);
      if (b.dataset.act === "addpl") addToPlaylistModal(s);
      if (b.dataset.act === "play") playModal(s);
    } catch (x) { toast(x.message || "No se pudo guardar"); }
  });

  async function playModal(s) {
    openModal(`<div class="genre"><h3>${esc(s.t)}</h3><p class="small">${esc(s.a)}</p><p class="muted" id="pl">Buscando en Spotify…</p>
      <div class="row"><button class="btn" data-close>Cerrar</button></div></div>`);
    try {
      const id = s.uri ? s.uri.split(":").pop() : (await SP.spFind(s.t, s.a))?.id;
      $("#pl", modal).outerHTML = id
        ? `<iframe class="player" src="https://open.spotify.com/embed/track/${enc(id)}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Reproductor de Spotify"></iframe>`
        : `<p class="muted">No la encontré en Spotify.</p>`;
    } catch (x) { $("#pl", modal).textContent = x.message; }
  }

  async function sendModal(s) {
    await namesOf(following);
    openModal(`<form id="sendF"><div class="eyebrow">Recomendar canción</div><h3>${esc(s.t)} · ${esc(s.a)}</h3>
      ${following.length ? `<label>Para <select id="sTo">${following.map(u => `<option value="${esc(u)}">@${esc(names[u])}</option>`).join("")}</select></label>
      <label>Mensaje <span class="hint">Opcional, hasta 280 caracteres</span><textarea id="sMsg" maxlength="280" placeholder="Escúchala con audífonos…"></textarea></label>`
      : `<p class="empty">Todavía no sigues a nadie. Agrega amigos en la pestaña Amigos.</p>`}
      <div class="row">${following.length ? `<button class="btn primary" type="submit">Enviar</button>` : ""}<button class="btn" type="button" data-close>Cancelar</button></div></form>`,
      m => {
        $("#sendF", m).onsubmit = async e => {
          e.preventDefault(); e.submitter.disabled = true;
          try {
            await addDoc(collection(db, "recs"), { from: me.uid, to: $("#sTo", m).value, t: s.t, a: s.a, uri: s.uri || "", msg: $("#sMsg", m).value.trim().slice(0, 280), read: false, at: serverTimestamp() });
            modal.close(); toast("Canción enviada");
          } catch { e.submitter.disabled = false; toast("No se pudo enviar"); }
        };
      });
  }

  function addToPlaylistModal(s) {
    openModal(`<form id="plF"><div class="eyebrow">Agregar a playlist</div><h3>${esc(s.t)} · ${esc(s.a)}</h3>
      <label>Playlist <select id="plSel">${playlists.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}<option value="__new">+ Nueva playlist…</option></select></label>
      <label id="plNewL" ${playlists.length ? "hidden" : ""}>Nombre de la nueva playlist <input id="plNew" maxlength="60"></label>
      <div class="row"><button class="btn primary" type="submit">Agregar</button><button class="btn" type="button" data-close>Cancelar</button></div></form>`,
      m => {
        const sel = $("#plSel", m);
        if (!playlists.length) sel.value = "__new";
        sel.onchange = () => ($("#plNewL", m).hidden = sel.value !== "__new");
        $("#plF", m).onsubmit = async e => {
          e.preventDefault();
          const song = { ...s, by: me.uid, at: Date.now() };
          try {
            if (sel.value === "__new") {
              const name = $("#plNew", m).value.trim(); if (!name) return toast("Ponle un nombre");
              await addDoc(collection(db, "playlists"), { name, owner: me.uid, members: [me.uid], songs: [song], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            } else {
              await updateDoc(doc(db, "playlists", sel.value), { songs: arrayUnion(song), updatedAt: serverTimestamp() });
            }
            modal.close(); toast("Agregada a la playlist");
          } catch { toast("No se pudo agregar"); }
        };
      });
  }

  /* ---------- encuesta ---------- */
  let qi = 0, ans = [];
  function viewQuiz(restart = false) {
    if (restart || qi >= Q.length) { qi = 0; ans = Array(Q.length).fill(null); }
    if (!ans.length) ans = Array(Q.length).fill(null);
    if (!restart && meDoc?.top && qi === 0 && ans.every(a => a === null)) return quizIntro();
    renderQuestion();
  }
  function quizIntro() {
    tune(0);
    const t = meDoc.top[0];
    app.innerHTML = `<section class="card">
      <div class="eyebrow">Tu última señal · ${stationFreq(t.k)} FM</div>
      <h1>Tu estación es <span>${esc(G[t.k]?.n)}</span></h1>
      <p class="muted">Puedes repetir la encuesta cuando quieras. Tu perfil y la compatibilidad con tus amigos se actualizan con el último resultado.</p>
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
    app.querySelectorAll(".opt").forEach(b => b.onclick = () => pick(+b.dataset.j));
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
  async function finishQuiz() {
    const { scores, rank } = computeResult(ans);
    const top = rank.slice(0, 3);
    qi = Q.length;
    const f = stationFreq(top[0].k); tune((f - 88) / 20);
    app.innerHTML = `<section class="card">
      <div class="eyebrow">Tu señal · ${f} FM</div>
      <h1>Tu estación es <span>${esc(G[top[0].k].n)}</span></h1>
      <p class="small" id="saveState">Guardando en tu perfil…</p>
      ${top.map(t => `<div class="genre sep">
        <div class="between"><h3>${esc(G[t.k].n)}</h3><span class="g-pct">${t.p}% compatible</span></div>
        <div class="bar"><div style="width:0" data-w="${t.p}"></div></div>
        <p class="muted">${esc(G[t.k].d)}</p>
        <ol class="songs">${G[t.k].s.map((s, n) => songRow({ t: s[0], a: s[1] }, n + 1)).join("")}</ol></div>`).join("")}
      <div class="genre sep"><h3>También podrías explorar</h3>
        <div class="chips">${rank.slice(3, 6).map(m => `<span class="chip">${esc(G[m.k].n)} · ${m.p}%</span>`).join("")}</div></div>
      <div class="row sep"><button class="btn primary" id="again">Hacer la encuesta otra vez</button><a class="btn" href="#amigos">Compararme con amigos</a></div>
    </section>`;
    requestAnimationFrame(() => requestAnimationFrame(() => app.querySelectorAll(".bar>div").forEach(d => (d.style.width = d.dataset.w + "%"))));
    $("#again").onclick = () => viewQuiz(true);
    try {
      await addDoc(collection(db, "users", me.uid, "results"), { scores, top, at: serverTimestamp() });
      await updateDoc(doc(db, "users", me.uid), { scores, top, updatedAt: serverTimestamp() });
      $("#saveState").textContent = "Guardado en tu perfil.";
    } catch { const s = $("#saveState"); if (s) s.textContent = "No se pudo guardar el resultado. Revisa tu conexión."; }
  }

  /* ---------- perfil ---------- */
  function topBlock(d) {
    if (!d?.top) return `<p class="empty">Todavía no hay resultados. <a href="#encuesta">Haz la encuesta</a>.</p>`;
    return d.top.map(t => `<div class="genre"><div class="between"><strong>${esc(G[t.k]?.n)}</strong><span class="g-pct">${t.p}%</span></div>
      <div class="bar"><div style="width:${t.p}%"></div></div></div>`).join("");
  }
  function viewProfile() {
    app.innerHTML = `<section class="card" id="pTop"></section>
      <section class="card" id="pSpotify"></section>
      <section class="card"><h2>Canciones favoritas</h2><ol class="songs" id="pFavs"></ol></section>
      <section class="card"><h2>Historial de encuestas</h2><div class="list" id="pHist"><p class="small">Cargando…</p></div></section>
      <section class="card"><h2>Cuenta</h2>
        <form id="mailF"><label>Correo <span class="hint">Opcional. Solo lo ves tú.</span><div class="inline"><input id="mail" type="email" autocomplete="email"><button class="btn" type="submit">Guardar</button></div></label></form>
        <div class="row"><button class="btn danger" id="logout">Cerrar sesión</button></div></section>`;
    fillProfile(); fillSpotify();
    getDoc(doc(db, "users", me.uid, "private", "info")).then(s => { const i = $("#mail"); if (i) i.value = s.data()?.email || ""; }).catch(() => {});
    $("#mailF").onsubmit = async e => {
      e.preventDefault();
      const v = $("#mail").value.trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast("Ese correo no parece válido");
      try { await setDoc(doc(db, "users", me.uid, "private", "info"), { email: v }); toast("Correo guardado"); } catch { toast("No se pudo guardar"); }
    };
    $("#logout").onclick = () => signOut(auth);
    getDocs(query(collection(db, "users", me.uid, "results"), orderBy("at", "desc"), limit(10))).then(s => {
      const h = $("#pHist"); if (!h) return;
      h.innerHTML = s.empty ? `<p class="empty">Aún no has hecho la encuesta.</p>` : s.docs.map(d => {
        const r = d.data();
        return `<div class="item"><div class="main"><strong>${esc(G[r.top[0].k]?.n)}</strong> <span class="muted">· ${r.top.slice(1).map(t => esc(G[t.k]?.n)).join(", ")}</span></div><span class="small">${fmtDate(r.at)}</span></div>`;
      }).join("");
    }).catch(() => { const h = $("#pHist"); if (h) h.innerHTML = `<p class="err">No se pudo cargar el historial.</p>`; });
  }
  function fillProfile() {
    const top = $("#pTop"); if (!top || !meDoc) return;
    const t = meDoc.top?.[0];
    top.innerHTML = `<div class="row"><div class="avatar">${initial(meDoc.username)}</div><div><h2>@${esc(meDoc.username)}</h2>
      <p class="small">${t ? `Estación ${stationFreq(t.k)} FM · ${esc(G[t.k]?.n)}` : "Sin estación todavía"} · ${following.length} siguiendo</p></div></div>${topBlock(meDoc)}`;
    if (t) tune((stationFreq(t.k) - 88) / 20);
    const favs = meDoc.favorites || [];
    $("#pFavs").innerHTML = favs.length ? favs.map((s, i) => songRow(s, i + 1)).join("") : `<li class="empty">Marca canciones con ☆ para guardarlas aquí.</li>`;
  }

  async function fillSpotify() {
    const box = $("#pSpotify"); if (!box) return;
    if (!SP.spotifyReady()) {
      box.innerHTML = `<h2>Spotify</h2><p class="small">Para conectar Spotify falta poner el Client ID en firebase-config.js (ver LEEME.md).</p>`; return;
    }
    if (!SP.spotifyConnected()) {
      box.innerHTML = `<h2>Spotify</h2><p class="muted">Conecta tu cuenta para ver tus canciones más escuchadas, escuchar canciones aquí mismo y guardar tus playlists en Spotify.</p>
        <div class="row"><button class="btn sp fill" id="spGo">Conectar Spotify</button></div>`;
      $("#spGo").onclick = () => SP.spotifyLogin(); return;
    }
    box.innerHTML = `<div class="between"><h2>Tu Spotify</h2><button class="btn sm" id="spOut">Desconectar</button></div><p class="small" id="spState">Cargando tus más escuchadas…</p>`;
    $("#spOut").onclick = () => { SP.spotifyLogout(); spInfo = null; fillSpotify(); route(); };
    try {
      spInfo ||= await Promise.all([SP.spMe(), SP.spTopTracks(), SP.spTopArtists()]);
      const [prof, tracks, artists] = spInfo;
      const gk = SP.genresFromArtists(artists).slice(0, 4);
      if (!$("#pSpotify")) return;
      $("#spState").outerHTML = `<p class="small">Conectado como ${esc(prof.display_name || prof.id)}</p>
        ${gk.length ? `<div class="genre"><strong>Según lo que escuchas en Spotify</strong><div class="chips">${gk.map(k => `<span class="chip">${esc(G[k].n)}</span>`).join("")}</div></div>` : ""}
        ${artists.length ? `<div class="genre"><strong>Tus artistas más escuchados</strong><div class="chips">${artists.slice(0, 8).map(a => `<span class="chip">${esc(a.name)}</span>`).join("")}</div></div>` : ""}
        <div class="genre"><strong>Tus canciones más escuchadas</strong>${tracks.length ? `<ol class="songs">${tracks.map((s, i) => songRow(s, i + 1)).join("")}</ol>` : `<p class="small">Spotify todavía no tiene suficientes datos tuyos.</p>`}</div>`;
    } catch (x) { const s = $("#spState"); if (s) s.textContent = x.message; }
  }

  /* ---------- amigos ---------- */
  function viewFriends() {
    tune(0.35);
    app.innerHTML = `<section class="card"><h2>Amigos</h2>
        <p class="muted">Sigue a otros usuarios para ver su perfil, saber qué tan compatibles son y mandarles canciones.</p>
        <form id="folF"><label>Usuario <div class="inline"><input id="folU" placeholder="ej. maria.music" autocapitalize="none" spellcheck="false"><button class="btn primary" type="submit">Seguir</button></div></label><p class="err" id="folErr"></p></form></section>
      <section class="card"><h2>Sigues a</h2><div class="list" id="fList"></div></section>
      <section class="card"><h2>Te siguen</h2><div class="list" id="fBack"><p class="small">Cargando…</p></div></section>`;
    $("#folF").onsubmit = async e => {
      e.preventDefault(); const err = $("#folErr"); err.textContent = "";
      const raw = $("#folU").value; if (!raw.trim()) return;
      try {
        const uid = await uidOf(raw);
        if (!uid) return (err.textContent = "No existe ese usuario.");
        if (uid === me.uid) return (err.textContent = "Ese eres tú.");
        if (following.includes(uid)) return (err.textContent = "Ya lo sigues.");
        await follow(uid); $("#folU").value = ""; toast("Ahora sigues a @" + await nameOf(uid));
      } catch { err.textContent = "No se pudo seguir. Intenta de nuevo."; }
    };
    fillFriends();
    getDocs(query(collection(db, "follows"), where("to", "==", me.uid))).then(async s => {
      const ids = s.docs.map(d => d.data().from); await namesOf(ids);
      const box = $("#fBack"); if (!box) return;
      box.innerHTML = ids.length ? ids.map(u => `<div class="item"><div class="row main"><div class="avatar">${initial(names[u])}</div><strong>@${esc(names[u])}</strong></div>
        <div class="row">${following.includes(u) ? `<span class="small">Se siguen mutuamente</span>` : `<button class="btn sm" data-follow="${esc(u)}">Seguir también</button>`}</div></div>`).join("")
        : `<p class="empty">Nadie te sigue todavía. Comparte tu usuario: @${esc(meDoc?.username || "")}</p>`;
      box.querySelectorAll("[data-follow]").forEach(b => b.onclick = async () => { await follow(b.dataset.follow); b.outerHTML = `<span class="small">Se siguen mutuamente</span>`; });
    }).catch(() => {});
  }
  const follow = uid => setDoc(doc(db, "follows", `${me.uid}_${uid}`), { from: me.uid, to: uid, at: serverTimestamp() });

  async function fillFriends() {
    const box = $("#fList"); if (!box) return;
    if (!following.length) { box.innerHTML = `<p class="empty">Todavía no sigues a nadie.</p>`; return; }
    const docs = await Promise.all(following.map(u => getDoc(doc(db, "users", u)).catch(() => null)));
    const people = docs.filter(d => d?.exists()).map(d => ({ uid: d.id, ...d.data() }));
    people.forEach(p => (names[p.uid] = p.username));
    people.sort((a, b) => (compat(meDoc?.scores, b.scores) ?? -1) - (compat(meDoc?.scores, a.scores) ?? -1));
    if (!$("#fList")) return;
    $("#fList").innerHTML = people.map(p => {
      const c = compat(meDoc?.scores, p.scores);
      return `<div class="item"><div class="row main"><div class="avatar">${initial(p.username)}</div><div><strong>@${esc(p.username)}</strong>
        <div class="small">${p.top ? esc(G[p.top[0].k]?.n) : "Sin encuesta todavía"}</div></div></div>
        <div class="row">${c != null ? `<span class="pct">${c}% compatibles</span>` : ""}<button class="btn sm" data-see="${esc(p.uid)}">Ver perfil</button></div></div>`;
    }).join("");
    $("#fList").querySelectorAll("[data-see]").forEach(b => b.onclick = () => viewFriend(b.dataset.see));
  }

  async function viewFriend(uid) {
    openFriend = uid;
    app.innerHTML = `<section class="card"><p class="small">Cargando…</p></section>`;
    const s = await getDoc(doc(db, "users", uid)); if (openFriend !== uid) return;
    const p = s.data(); if (!p) { app.innerHTML = `<section class="card"><p class="err">No se encontró ese usuario.</p></section>`; return; }
    const c = compat(meDoc?.scores, p.scores);
    const mine = new Set((meDoc?.top || []).map(t => t.k));
    const shared = (p.top || []).filter(t => mine.has(t.k)).map(t => G[t.k].n);
    app.innerHTML = `<section class="card">
        <button class="link" id="backF" type="button">← Amigos</button>
        <div class="between"><div class="row"><div class="avatar">${initial(p.username)}</div><h2>@${esc(p.username)}</h2></div>
          ${c != null ? `<span class="pct">${c}% compatibles</span>` : ""}</div>
        ${shared.length ? `<p class="muted">Tienen en común: ${shared.map(esc).join(", ")}.</p>` : ""}
        ${topBlock(p)}
        <div class="row"><button class="btn danger sm" id="unf">Dejar de seguir</button></div></section>
      <section class="card"><h2>Sus favoritas</h2><ol class="songs">${(p.favorites || []).length ? p.favorites.map((x, i) => songRow(x, i + 1)).join("") : `<li class="empty">Todavía no tiene favoritas.</li>`}</ol></section>`;
    $("#backF").onclick = () => { openFriend = null; viewFriends(); };
    $("#unf").onclick = async () => { await deleteDoc(doc(db, "follows", `${me.uid}_${uid}`)); toast("Dejaste de seguir a @" + p.username); openFriend = null; viewFriends(); };
  }

  /* ---------- playlists ---------- */
  function viewPlaylists() {
    tune(0.6);
    app.innerHTML = `<section class="card"><h2>Playlists compartidas</h2>
        <p class="muted">Crea una playlist, invita a tus amigos y armen la lista entre todos.</p>
        <form id="newPl"><label>Nueva playlist <div class="inline"><input id="plName" maxlength="60" placeholder="ej. Viaje a la playa"><button class="btn primary" type="submit">Crear</button></div></label></form></section>
      <section class="card"><h2>Mis playlists</h2><div class="list" id="plList"></div></section>`;
    $("#newPl").onsubmit = async e => {
      e.preventDefault(); const name = $("#plName").value.trim(); if (!name) return;
      try {
        const r = await addDoc(collection(db, "playlists"), { name, owner: me.uid, members: [me.uid], songs: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        $("#plName").value = ""; viewPlaylist(r.id);
      } catch { toast("No se pudo crear"); }
    };
    fillPlaylists();
  }
  async function fillPlaylists() {
    const box = $("#plList"); if (!box) return;
    if (!playlists.length) { box.innerHTML = `<p class="empty">Todavía no tienes playlists.</p>`; return; }
    await namesOf(playlists.map(p => p.owner));
    if (!$("#plList")) return;
    $("#plList").innerHTML = playlists.map(p => `<div class="item"><div class="main"><strong>${esc(p.name)}</strong>
      <div class="small">${(p.songs || []).length} canciones · ${p.members.length} ${p.members.length === 1 ? "miembro" : "miembros"} · de @${esc(names[p.owner])}</div></div>
      <button class="btn sm" data-open="${esc(p.id)}">Abrir</button></div>`).join("");
    $("#plList").querySelectorAll("[data-open]").forEach(b => b.onclick = () => viewPlaylist(b.dataset.open));
  }

  function viewPlaylist(id) {
    openPl = id; plUnsub?.();
    app.innerHTML = `<section class="card" id="plHead"><p class="small">Cargando…</p></section>
      <section class="card"><h2>Canciones</h2><ol class="songs" id="plSongs"></ol></section>
      <section class="card"><h2>Agregar canción</h2>
        ${SP.spotifyConnected() ? `<form id="spS"><label>Buscar en Spotify <div class="inline"><input id="spQ" placeholder="Canción o artista"><button class="btn sp" type="submit">Buscar</button></div></label></form><ol class="songs" id="spRes"></ol><p class="small">O escríbela a mano:</p>` : ""}
        <form id="addS"><div class="row"><input id="sT" placeholder="Canción" maxlength="120" style="flex:2 1 160px"><input id="sA" placeholder="Artista" maxlength="120" style="flex:1 1 120px"><button class="btn primary" type="submit">Agregar</button></div></form></section>
      <section class="card" id="plMembers"></section>`;
    const add = async s => {
      try { await updateDoc(doc(db, "playlists", id), { songs: arrayUnion({ ...s, by: me.uid, at: Date.now() }), updatedAt: serverTimestamp() }); toast("Agregada"); }
      catch { toast("No se pudo agregar"); }
    };
    $("#addS").onsubmit = e => {
      e.preventDefault(); const t = $("#sT").value.trim(), a = $("#sA").value.trim();
      if (!t || !a) return toast("Escribe canción y artista");
      add({ t, a }); $("#sT").value = ""; $("#sA").value = ""; $("#sT").focus();
    };
    if ($("#spS")) $("#spS").onsubmit = async e => {
      e.preventDefault(); const q = $("#spQ").value.trim(); if (!q) return;
      const box = $("#spRes"); box.innerHTML = `<li class="small">Buscando…</li>`;
      try {
        const res = await SP.spSearch(q);
        box.innerHTML = res.length ? res.map((s, i) => `<li><span class="t"><strong>${esc(s.t)}</strong> <span>· ${esc(s.a)}</span></span>
          <span class="acts"><button class="spb" data-i="${i}">+ Agregar</button></span></li>`).join("") : `<li class="small">Sin resultados.</li>`;
        box.querySelectorAll("[data-i]").forEach(b => b.onclick = () => { const s = res[+b.dataset.i]; add({ t: s.t, a: s.a, uri: s.uri }); b.disabled = true; b.textContent = "Agregada"; });
      } catch (x) { box.innerHTML = `<li class="err">${esc(x.message)}</li>`; }
    };
    plUnsub = onSnapshot(doc(db, "playlists", id), async s => {
      if (openPl !== id) return;
      if (!s.exists()) { toast("La playlist ya no existe"); openPl = null; return viewPlaylists(); }
      const p = { id, ...s.data() };
      await namesOf([...p.members, ...(p.songs || []).map(x => x.by)]);
      if (openPl !== id) return;
      renderPlaylist(p);
    }, () => { toast("Ya no tienes acceso a esa playlist"); openPl = null; viewPlaylists(); });
  }
  function renderPlaylist(p) {
    const owner = p.owner === me.uid;
    const songs = [...(p.songs || [])].sort((a, b) => a.at - b.at);
    $("#plHead").innerHTML = `<button class="link" id="backP" type="button">← Playlists</button>
      <h1>${esc(p.name)}</h1><p class="small">${songs.length} canciones · creada por @${esc(names[p.owner])}</p>
      <div class="row">${SP.spotifyReady() ? (SP.spotifyConnected()
        ? `<button class="btn sp fill" id="exp" ${songs.length ? "" : "disabled"}>Guardar en mi Spotify</button>`
        : `<button class="btn sp" id="spGo2">Conectar Spotify para guardarla</button>`) : ""}
        ${owner ? `<button class="btn danger" id="delP">Borrar playlist</button>` : `<button class="btn danger" id="leaveP">Salirme</button>`}</div>
      <p class="small" id="expState"></p>`;
    $("#backP").onclick = () => { openPl = null; plUnsub?.(); viewPlaylists(); };
    $("#spGo2")?.addEventListener("click", () => SP.spotifyLogin());
    $("#exp")?.addEventListener("click", async e => {
      e.target.disabled = true; $("#expState").textContent = "Creando la playlist en tu Spotify…";
      try {
        const r = await SP.spExport(p.name, songs);
        const st = $("#expState"); if (!st) return;
        st.innerHTML = `Listo: ${r.added} de ${r.total} canciones guardadas. ${r.url?.startsWith("https://") ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir en Spotify</a>` : ""}`;
      } catch (x) { $("#expState").textContent = x.message; e.target.disabled = false; }
    });
    $("#delP")?.addEventListener("click", async () => {
      if (!confirm(`¿Borrar "${p.name}" para todos los miembros? No se puede deshacer.`)) return;
      openPl = null; plUnsub?.(); await deleteDoc(doc(db, "playlists", p.id)); toast("Playlist borrada"); viewPlaylists();
    });
    $("#leaveP")?.addEventListener("click", async () => {
      openPl = null; plUnsub?.();
      await updateDoc(doc(db, "playlists", p.id), { members: arrayRemove(me.uid), updatedAt: serverTimestamp() });
      toast("Saliste de la playlist"); viewPlaylists();
    });

    $("#plSongs").innerHTML = songs.length ? songs.map((s, i) => {
      const canDel = owner || s.by === me.uid;
      return songRow(s, i + 1, `<span class="small">por @${esc(names[s.by])}</span>${canDel ? `<button data-rm="${i}" aria-label="Quitar">✕</button>` : ""}`);
    }).join("") : `<li class="empty">La playlist está vacía. Agrega la primera canción abajo.</li>`;
    $("#plSongs").querySelectorAll("[data-rm]").forEach(b => b.onclick = async () => {
      try { await updateDoc(doc(db, "playlists", p.id), { songs: arrayRemove(songs[+b.dataset.rm]), updatedAt: serverTimestamp() }); } catch { toast("No se pudo quitar"); }
    });

    $("#plMembers").innerHTML = `<h2>Miembros</h2><div class="list">${p.members.map(u => `<div class="item"><div class="row main"><div class="avatar">${initial(names[u])}</div>
      <strong>@${esc(names[u])}</strong>${u === p.owner ? ` <span class="small">dueño</span>` : ""}</div>
      ${owner && u !== p.owner ? `<button class="btn sm danger" data-kick="${esc(u)}">Quitar</button>` : ""}</div>`).join("")}</div>
      ${owner ? `<form id="invF"><label>Invitar por usuario <div class="inline"><input id="invU" placeholder="usuario" autocapitalize="none" spellcheck="false"><button class="btn primary" type="submit">Invitar</button></div></label><p class="err" id="invErr"></p></form>` : ""}`;
    $("#plMembers").querySelectorAll("[data-kick]").forEach(b => b.onclick = () =>
      updateDoc(doc(db, "playlists", p.id), { members: arrayRemove(b.dataset.kick), updatedAt: serverTimestamp() }).catch(() => toast("No se pudo quitar")));
    $("#invF")?.addEventListener("submit", async e => {
      e.preventDefault(); const err = $("#invErr"); err.textContent = "";
      const uid = await uidOf($("#invU").value).catch(() => null);
      if (!uid) return (err.textContent = "No existe ese usuario.");
      if (p.members.includes(uid)) return (err.textContent = "Ya es miembro.");
      try { await updateDoc(doc(db, "playlists", p.id), { members: arrayUnion(uid), updatedAt: serverTimestamp() }); toast("Invitado"); }
      catch { err.textContent = "No se pudo invitar."; }
    });
  }

  /* ---------- buzón ---------- */
  function viewInbox() {
    tune(0.85);
    app.innerHTML = `<section class="card"><h2>Te recomendaron</h2><div class="list" id="inList"></div></section>
      <section class="card"><h2>Enviadas</h2><div class="list" id="outList"><p class="small">Cargando…</p></div></section>`;
    fillInbox();
    getDocs(query(collection(db, "recs"), where("from", "==", me.uid))).then(async s => {
      const out = s.docs.map(d => d.data()).sort((a, b) => at(b) - at(a)).slice(0, 30);
      await namesOf(out.map(r => r.to));
      const box = $("#outList"); if (!box) return;
      box.innerHTML = out.length ? out.map(r => `<div class="item"><div class="main"><strong>${esc(r.t)}</strong> <span class="muted">· ${esc(r.a)}</span>
        <div class="small">para @${esc(names[r.to])} · ${fmtDate(r.at)} · ${r.read ? "vista" : "sin ver"}</div></div></div>`).join("")
        : `<p class="empty">Aún no has enviado canciones. Usa «Enviar» en cualquier canción.</p>`;
    }).catch(() => {});
  }
  async function fillInbox() {
    const box = $("#inList"); if (!box) return;
    if (!inbox.length) { box.innerHTML = `<p class="empty">Cuando un amigo te mande una canción, aparecerá aquí.</p>`; return; }
    await namesOf(inbox.map(r => r.from));
    if (!$("#inList")) return;
    $("#inList").innerHTML = inbox.map(r => `<div class="item ${r.read ? "" : "unread"}"><div class="main">
      <p class="small">@${esc(names[r.from])} te recomendó · ${fmtDate(r.at)}</p>
      ${r.msg ? `<p>“${esc(r.msg)}”</p>` : ""}
      <ol class="songs">${songRow({ t: r.t, a: r.a, uri: r.uri || "" }, null, `<button data-del="${esc(r.id)}" aria-label="Borrar">✕</button>`)}</ol></div></div>`).join("");
    $("#inList").querySelectorAll("[data-del]").forEach(b => b.onclick = () => deleteDoc(doc(db, "recs", b.dataset.del)).catch(() => toast("No se pudo borrar")));
    inbox.filter(r => !r.read).forEach(r => updateDoc(doc(db, "recs", r.id), { read: true }).catch(() => {}));
  }
}
