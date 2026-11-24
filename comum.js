/* =====================================================================
   SOUNDS OF BARCELONA — comum.js
   Código partilhado pelas duas páginas:
   a esfera (index.html) e o objeto (objeto.html).
   ===================================================================== */


/* ---------------------------------------------------------------------
   A. SUPABASE (o endereço e a chave estão no config.js)
   --------------------------------------------------------------------- */
let db = null;
try {
  const url = window.SUPABASE_URL, chave = window.SUPABASE_CHAVE;
  if (url && chave && !chave.includes("COLA_AQUI") && window.supabase) {
    db = window.supabase.createClient(url.trim(), chave.trim());
  }
} catch (erro) {
  console.warn("Supabase não ligado:", erro.message);
  db = null;
}

// Vai buscar todos os sons guardados, do mais antigo para o mais recente
async function lerArquivo() {
  if (!db) return [];
  const { data, error } = await db
    .from("sons")
    .select("*")
    .eq("aprovado", true)
    .order("criado", { ascending: true });
  if (error) { console.warn("Supabase:", error.message); return []; }
  return data.map((linha) => ({
    ficheiro: db.storage.from("sons").getPublicUrl(linha.ficheiro).data.publicUrl,
    rua: linha.rua, lat: linha.lat, lon: linha.lon,
    data: linha.data || linha.criado,
    descricao: linha.descricao || "",
    assinatura: linha.assinatura || null,
  }));
}


/* ---------------------------------------------------------------------
   B. BARCELONA NA ESFERA
   O centro da cidade fica no topo e os bairros afastados descem pelos lados.
   --------------------------------------------------------------------- */
const BARCELONA = { latMin: 41.317, latMax: 41.469, lonMin: 2.052, lonMax: 2.229 };
const CAP = -0.25;                       // até onde desce a cidade (1 = só o topo, -1 = tudo)
const CENTRO = { lat: 41.402, lon: 2.142 };
const RAIO_KM = 9.0;
const RLAT = RAIO_KM / 111.0;
const RLON = RAIO_KM / (111.0 * Math.cos((CENTRO.lat * Math.PI) / 180));

function discoParaGeo(X, Y) { return { lat: CENTRO.lat + Y * RLAT, lon: CENTRO.lon + X * RLON }; }
function geoParaDisco(lat, lon) { return { X: (lon - CENTRO.lon) / RLON, Y: (lat - CENTRO.lat) / RLAT }; }

function discoParaEsfera(X, Y) {
  const s = Math.min(1, Math.hypot(X, Y)), a = Math.atan2(Y, X);
  const y = 1 - s * s * (1 - CAP), r = Math.sqrt(Math.max(0, 1 - y * y));
  return { x: r * Math.cos(a), y, z: r * Math.sin(a) };
}
function esferaParaDisco(x, y, z) {
  const s = Math.sqrt(Math.max(0, (1 - y) / (1 - CAP))), a = Math.atan2(z, x);
  return { X: s * Math.cos(a), Y: s * Math.sin(a), s };
}

// Suaviza a orla da cidade (para não haver um degrau)
function bordaSuave(s) { const t = Math.min(1, Math.max(0, (1 - s) / 0.1)); return t * t * (3 - 2 * t); }


/* ---------------------------------------------------------------------
   C. AS MARCAS DOS SONS (redondas)
   g = graves  -> marca mais larga
   v = volume  -> marca mais alta
   a = agudos  -> pequenas lombas à volta
   --------------------------------------------------------------------- */
function prepararMarca(som) {
  const s = som.assinatura;
  const c = geoParaDisco(som.lat, som.lon);
  const L = 0.06 + 0.07 * s.g;
  const altura = 0.035 + 0.09 * s.v;
  const satelites = [];
  const n = Math.round(s.a * 6);
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2 + s.m * 3;
    satelites.push({ X: c.X + Math.cos(ang) * L * 1.7, Y: c.Y + Math.sin(ang) * L * 1.7 });
  }
  return { X: c.X, Y: c.Y, L, altura, satelites };
}

function relevoDaMarca(M, X, Y) {
  const d = Math.hypot(X - M.X, Y - M.Y);
  if (d > M.L * 4) return 0;
  let r = M.altura * Math.exp(-((d / M.L) ** 2));
  const l2 = M.L * 0.45;
  for (const sat of M.satelites) {
    const ds = Math.hypot(X - sat.X, Y - sat.Y);
    r += M.altura * 0.45 * Math.exp(-((ds / l2) ** 2));
  }
  return r;
}

// Soma de todas as marcas num ponto (com um limite, para não crescer demais)
function marcasNoDisco(lista, X, Y, forca) {
  let r = 0;
  for (const M of lista) if (M) r += relevoDaMarca(M, X, Y);
  return 0.28 * Math.tanh((r * (forca || 1)) / 0.28);
}


/* ---------------------------------------------------------------------
   D. IMPRESSÃO DIGITAL DO SOM (graves, médios, agudos, volume, picos)
   --------------------------------------------------------------------- */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

async function analisarSom(fonte) {
  const dados = await (fonte instanceof Blob ? fonte.arrayBuffer()
                                             : fetch(fonte).then((r) => r.arrayBuffer()));
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const tmp = new Offline(1, 1, 44100);
  const buffer = await new Promise((ok, falha) => tmp.decodeAudioData(dados, ok, falha));
  const canal = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const TAM = 2048, BOCADOS = 48;
  const limites = [60, 150, 300, 600, 1200, 2400, 4800, 9600, 16000];
  const bandas = new Array(8).fill(0);
  const energias = [];
  const re = new Float32Array(TAM), im = new Float32Array(TAM);
  const total = Math.max(1, canal.length - TAM);

  for (let b = 0; b < BOCADOS; b++) {
    const inicio = Math.floor((total * b) / (BOCADOS - 1 || 1));
    let soma2 = 0;
    for (let i = 0; i < TAM; i++) {
      const s = canal[inicio + i] || 0;
      soma2 += s * s;
      re[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (TAM - 1)));
      im[i] = 0;
    }
    energias.push(Math.sqrt(soma2 / TAM));
    fft(re, im);
    for (let k = 0; k < 8; k++) {
      const de = Math.floor((limites[k] * TAM) / sr), ate = Math.min(TAM / 2, Math.floor((limites[k + 1] * TAM) / sr));
      let e = 0;
      for (let j = de; j < ate; j++) e += Math.hypot(re[j], im[j]);
      bandas[k] += ate > de ? e / (ate - de) : 0;
    }
  }
  for (let k = 0; k < 8; k++) bandas[k] *= Math.sqrt((limites[k] + limites[k + 1]) / 2 / 100);
  const maxB = Math.max(...bandas) || 1;
  const n = bandas.map((b) => b / maxB);
  const media = energias.reduce((a, b) => a + b, 0) / energias.length || 0;
  const maxE = Math.max(...energias);
  const arred = (x) => Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000;
  return {
    g: arred((n[0] + n[1] + n[2]) / 3),
    m: arred((n[3] + n[4] + n[5]) / 3),
    a: arred((n[6] + n[7]) / 2),
    v: arred(media * 5),
    p: arred(media > 0 ? (maxE / media - 1) / 4 : 0),
  };
}


/* ---------------------------------------------------------------------
   E. DATAS
   --------------------------------------------------------------------- */
function hojeISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function formatarData(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d + "." + m + "." + a;
}
