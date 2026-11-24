// Géneros, canciones y preguntas de la encuesta
export const G = {
  pop:{n:"Pop",d:"Coros que se pegan, producción brillante y canciones hechas para cantar a todo pulmón.",
    s:[["Blinding Lights","The Weeknd"],["Levitating","Dua Lipa"],["As It Was","Harry Styles"],["Espresso","Sabrina Carpenter"],["Cruel Summer","Taylor Swift"]]},
  rock:{n:"Rock",d:"Guitarras, batería con fuerza y bandas que suenan mejor en vivo.",
    s:[["Bohemian Rhapsody","Queen"],["De música ligera","Soda Stereo"],["Do I Wanna Know?","Arctic Monkeys"],["Everlong","Foo Fighters"],["Smells Like Teen Spirit","Nirvana"]]},
  hiphop:{n:"Hip-hop y rap",d:"Letras con algo que contar, flow y beats pesados.",
    s:[["Lose Yourself","Eminem"],["HUMBLE.","Kendrick Lamar"],["Es épico","Canserbero"],["SICKO MODE","Travis Scott"],["God's Plan","Drake"]]},
  reggaeton:{n:"Reggaetón y urbano latino",d:"El dembow manda: para bailar, salir y cantarlo en español.",
    s:[["Tití Me Preguntó","Bad Bunny"],["Provenza","Karol G"],["Gasolina","Daddy Yankee"],["Normal","Feid"],["Mi Gente","J Balvin"]]},
  electro:{n:"Electrónica",d:"Drops, sintetizadores y canciones que crecen hasta explotar en la pista.",
    s:[["One More Time","Daft Punk"],["Levels","Avicii"],["Delilah (pull me out of this)","Fred again.."],["Don't You Worry Child","Swedish House Mafia"],["Summer","Calvin Harris"]]},
  indie:{n:"Indie y alternativo",d:"Sonido con personalidad, un poco melancólico y lejos de lo obvio.",
    s:[["The Less I Know the Better","Tame Impala"],["Labios Rotos","Zoé"],["Reptilia","The Strokes"],["Chamber of Reflection","Mac DeMarco"],["Motion Sickness","Phoebe Bridgers"]]},
  jazz:{n:"Jazz",d:"Improvisación, instrumentos que conversan y noches largas.",
    s:[["Take Five","Dave Brubeck Quartet"],["So What","Miles Davis"],["My Favorite Things","John Coltrane"],["Don't Know Why","Norah Jones"],["My Funny Valentine","Chet Baker"]]},
  rnb:{n:"R&B y soul",d:"Voces que se lucen, groove suave y mucho sentimiento.",
    s:[["Kill Bill","SZA"],["Best Part","Daniel Caesar"],["Thinkin Bout You","Frank Ocean"],["Let's Get It On","Marvin Gaye"],["Focus","H.E.R."]]},
  metal:{n:"Metal",d:"Distorsión, velocidad y descargas de energía sin frenos.",
    s:[["Master of Puppets","Metallica"],["Chop Suey!","System of a Down"],["Duality","Slipknot"],["The Trooper","Iron Maiden"],["Can You Feel My Heart","Bring Me the Horizon"]]},
  clasica:{n:"Clásica y bandas sonoras",d:"Orquestas, piano y música que cuenta historias sin palabras.",
    s:[["Clair de lune","Claude Debussy"],["Las cuatro estaciones: Invierno","Antonio Vivaldi"],["Sinfonía n.º 5","Ludwig van Beethoven"],["Time","Hans Zimmer"],["Experience","Ludovico Einaudi"]]},
  lofi:{n:"Lo-fi y chill",d:"Ritmos relajados y texturas cálidas para estudiar, leer o bajar revoluciones.",
    s:[["Feather","Nujabes"],["South of the River","Tom Misch"],["Kerala","Bonobo"],["Show Me How","Men I Trust"],["People Everywhere (Still Alive)","Khruangbin"]]},
  tropical:{n:"Salsa y cumbia",d:"Percusión, metales y sabor: la música de las fiestas que nunca pasa de moda.",
    s:[["El Cantante","Héctor Lavoe"],["La vida es un carnaval","Celia Cruz"],["Pedro Navaja","Rubén Blades"],["Cali Pachanguero","Grupo Niche"],["Nunca es suficiente","Los Ángeles Azules"]]}
};

export const Q = [
  {q:"¿Cuándo escuchas más música?", o:[
    ["Entrenando o en el gym",{hiphop:3,metal:3,electro:2,reggaeton:2,rock:1}],
    ["Estudiando o trabajando",{lofi:3,clasica:3,jazz:2,indie:1}],
    ["En fiestas o antes de salir",{reggaeton:3,electro:3,pop:2,tropical:2}],
    ["Caminando o en el bus con audífonos",{indie:3,rnb:2,hiphop:2,pop:1,rock:1}],
    ["Descansando en casa",{rnb:2,jazz:2,lofi:2,indie:1,clasica:1}]]},
  {q:"¿Cuánta energía le pides a una canción?", o:[
    ["Poca, que me relaje",{lofi:3,jazz:2,clasica:2,rnb:1}],
    ["Media, que acompañe",{indie:2,rnb:2,pop:1,jazz:1}],
    ["Alta, que me prenda",{pop:2,reggaeton:2,electro:2,rock:2,tropical:1,hiphop:1}],
    ["Al máximo, que me sacuda",{metal:3,rock:2,electro:2,hiphop:1}]]},
  {q:"¿Qué es lo primero que te engancha?", o:[
    ["La letra y lo que cuenta",{hiphop:3,indie:2,rock:1,tropical:1}],
    ["El ritmo para bailar",{reggaeton:3,tropical:3,electro:2,pop:1}],
    ["Los instrumentos y la técnica",{jazz:3,metal:2,clasica:2,rock:2}],
    ["La vibra o el ambiente",{lofi:3,indie:2,electro:1,rnb:1}],
    ["La voz",{rnb:3,pop:2,jazz:1}]]},
  {q:"¿En qué idioma prefieres tu música?", o:[
    ["En español",{reggaeton:3,tropical:3,rock:1,indie:1,hiphop:1}],
    ["En inglés",{pop:2,rock:2,rnb:2,hiphop:2,metal:2,indie:1}],
    ["Me da igual",{pop:1,electro:1,indie:1,hiphop:1}],
    ["Mejor sin letra",{clasica:3,lofi:3,jazz:2,electro:2}]]},
  {q:"¿Qué sonido te gusta más?", o:[
    ["Guitarras eléctricas",{rock:3,metal:3,indie:2}],
    ["Sintetizadores",{electro:3,pop:2,indie:1}],
    ["Beats y bajos profundos",{hiphop:3,reggaeton:2,rnb:2,lofi:1}],
    ["Piano y cuerdas",{clasica:3,jazz:2,rnb:1}],
    ["Trompetas y percusión",{tropical:3,jazz:2}]]},
  {q:"¿Tu plan ideal de viernes?", o:[
    ["Discoteca hasta tarde",{reggaeton:3,electro:3,pop:1,tropical:1}],
    ["Un concierto en vivo",{rock:3,metal:2,indie:2,jazz:1}],
    ["En casa con audífonos",{lofi:2,indie:2,clasica:2,hiphop:1}],
    ["Reunión con familia o amigos",{tropical:3,pop:2,reggaeton:1}],
    ["Un bar tranquilo",{jazz:3,rnb:2,indie:1}]]},
  {q:"¿Qué época de la música te llama más?", o:[
    ["70s y 80s",{rock:3,tropical:2,jazz:1,metal:1,rnb:1}],
    ["90s y 2000s",{hiphop:2,rock:2,rnb:2,pop:1,reggaeton:1,metal:1}],
    ["Lo que está sonando hoy",{pop:3,reggaeton:3,electro:2,hiphop:1}],
    ["Clásicos de siempre",{clasica:3,jazz:3,tropical:1}]]},
  {q:"¿Qué quieres sentir al escuchar?", o:[
    ["Euforia",{electro:3,pop:2,reggaeton:2,tropical:1}],
    ["Nostalgia",{indie:3,rock:2,tropical:1,lofi:1}],
    ["Calma",{lofi:3,clasica:2,jazz:2}],
    ["Rabia o adrenalina",{metal:3,hiphop:2,rock:2}],
    ["Romance",{rnb:3,pop:1,tropical:1,jazz:1}]]}
];

// Puntaje máximo posible por género, para que el % sea honesto
const MAX = {};
for (const k in G) MAX[k] = Q.reduce((a, q) => a + Math.max(0, ...q.o.map(o => o[1][k] || 0)), 0);

// ans: índice elegido por pregunta → {scores: {genero: %}, rank: [{k, p}]}
export function computeResult(ans) {
  const raw = {}; for (const k in G) raw[k] = 0;
  ans.forEach((a, qi) => { const w = Q[qi].o[a][1]; for (const k in w) raw[k] += w[k]; });
  const scores = {}; for (const k in G) scores[k] = Math.round(raw[k] / MAX[k] * 100);
  const rank = Object.keys(G).map(k => ({ k, p: scores[k] })).sort((a, b) => b.p - a.p);
  return { scores, rank };
}

// Compatibilidad entre dos perfiles: correlación de Pearson llevada a 0–100 %
export function compat(a, b) {
  if (!a || !b) return null;
  const ks = Object.keys(G), n = ks.length;
  const ma = ks.reduce((s, k) => s + (a[k] || 0), 0) / n, mb = ks.reduce((s, k) => s + (b[k] || 0), 0) / n;
  let d = 0, na = 0, nb = 0;
  for (const k of ks) { const x = (a[k] || 0) - ma, y = (b[k] || 0) - mb; d += x * y; na += x * x; nb += y * y; }
  if (!na || !nb) return 50;
  return Math.round((d / Math.sqrt(na * nb) + 1) / 2 * 100);
}

export const stationFreq = k => (88 + (Object.keys(G).indexOf(k) + 1) / 13 * 20).toFixed(1);
