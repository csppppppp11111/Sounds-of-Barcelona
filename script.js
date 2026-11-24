/* =====================================================================
   SOUNDS OF BARCELONA — script.js
   Um arquivo coletivo dos sons de Barcelona.
   O topo e os lados da esfera são Barcelona, com o relevo real.
   Cada som deixa uma marca redonda no sítio onde foi gravado;
   quando toca, a zona dele ondula com o som.
   ===================================================================== */


/* 1. LISTA DE SONS — fica vazia: os sons vêm do Supabase */
const SONS = [];


/* 1b. SUPABASE (o endereço e a chave estão no config.js) */
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


/* 2. PARÂMETROS (podes mexer nestes números) */
const PARAM = {
  pontosCidade: window.innerWidth < 700 ? 7000 : 12000, // pontos da cidade (topo e lados)
  pontosEsfera: window.innerWidth < 700 ? 1200 : 2000,  // pontos da parte de baixo
  tamanho: 0.30,        // raio da esfera em relação ao lado menor do ecrã
  exagero: 0.10,        // altura do relevo da cidade (0,10 = 512 m do Tibidabo)
  forcaMarcas: 1.0,     // altura das marcas dos sons
  ondaZona: 0.05,       // quanto ondula a zona do som que toca
  oscilacao: 0.45,      // quanto a esfera roda para os lados
  corCentro: 262,       // violeta (cidade baixa)
  corBorda: 28,         // laranja dourado (marcas dos sons)
};

// Barcelona: limites aproximados (para validar moradas)
const BARCELONA = { latMin: 41.317, latMax: 41.469, lonMin: 2.052, lonMax: 2.229 };

// Barcelona cobre o topo e os lados da esfera: o centro da cidade fica
// no topo e os bairros mais afastados descem pelos lados.
// CAP = até onde desce a cidade (1 = só o topo, 0 = até ao meio, -1 = tudo).
const CAP = -0.25;
const CENTRO = { lat: 41.402, lon: 2.142 };
const RAIO_KM = 9.0;
const RLAT = RAIO_KM / 111.0;
const RLON = RAIO_KM / (111.0 * Math.cos((CENTRO.lat * Math.PI) / 180));


/* 3. TELA */
const tela = document.getElementById("tela");
const ctx = tela.getContext("2d");
let largura, altura, dpr;

function ajustarTela() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  largura = window.innerWidth;
  altura = window.innerHeight;
  tela.width = largura * dpr;
  tela.height = altura * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", ajustarTela);
ajustarTela();


/* 4. A ESFERA: Barcelona no topo e nos lados */
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

const pontos = [];
const ouro = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < PARAM.pontosCidade; i++) {
  const y = 1 - ((i + 0.5) / PARAM.pontosCidade) * (1 - CAP);
  const r = Math.sqrt(1 - y * y), th = ouro * i;
  const x = r * Math.cos(th), z = r * Math.sin(th);
  const d = esferaParaDisco(x, y, z);
  pontos.push({ x, y, z, cidade: true, X: d.X, Y: d.Y, s: d.s });
}
for (let i = 0; i < PARAM.pontosEsfera; i++) {
  const y = CAP - ((i + 0.5) / PARAM.pontosEsfera) * (1 + CAP);
  const r = Math.sqrt(1 - y * y), th = ouro * i;
  pontos.push({ x: r * Math.cos(th), y, z: r * Math.sin(th), cidade: false, X: 0, Y: 0, s: 2 });
}

const N = pontos.length;
const terreno   = new Float32Array(N);
const ehMar     = new Uint8Array(N);
const marcaBase = new Float32Array(N);
const zona      = new Float32Array(N);
const distZona  = new Float32Array(N);
const ecraX = new Float32Array(N), ecraY = new Float32Array(N), profundidade = new Float32Array(N);
let relevoCarregado = false;

function bordaSuave(s) { const t = Math.min(1, Math.max(0, (1 - s) / 0.1)); return t * t * (3 - 2 * t); }


/* 5. O RELEVO REAL DE BARCELONA
   Terrain Tiles (AWS / Mapzen): a cor de cada pixel guarda a altura.
   Altura (m) = (vermelho * 256 + verde + azul / 256) - 32768. O mar tem altura 0 ou negativa. */
const TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/";
const ZOOM = 12;
let alturaEm = () => 0;

function lonParaTile(lon) { return ((lon + 180) / 360) * 2 ** ZOOM; }
function latParaTile(lat) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** ZOOM;
}
function carregarImagem(url) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = falha;
    img.src = url;
  });
}

async function carregarRelevo() {
  const x0 = Math.floor(lonParaTile(CENTRO.lon - RLON)), x1 = Math.floor(lonParaTile(CENTRO.lon + RLON));
  const y0 = Math.floor(latParaTile(CENTRO.lat + RLAT)), y1 = Math.floor(latParaTile(CENTRO.lat - RLAT));
  const c = document.createElement("canvas");
  c.width = (x1 - x0 + 1) * 256; c.height = (y1 - y0 + 1) * 256;
  const g = c.getContext("2d", { willReadFrequently: true });
  const pedidos = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    pedidos.push(carregarImagem(TILES + ZOOM + "/" + x + "/" + y + ".png")
      .then((img) => g.drawImage(img, (x - x0) * 256, (y - y0) * 256)));
  }
  await Promise.all(pedidos);
  const dados = g.getImageData(0, 0, c.width, c.height).data;
  alturaEm = (lat, lon) => {
    const px = Math.floor((lonParaTile(lon) - x0) * 256), py = Math.floor((latParaTile(lat) - y0) * 256);
    if (px < 0 || py < 0 || px >= c.width || py >= c.height) return 0;
    const i = (py * c.width + px) * 4;
    return dados[i] * 256 + dados[i + 1] + dados[i + 2] / 256 - 32768;
  };
  for (let i = 0; i < N; i++) {
    const p = pontos[i];
    if (!p.cidade) continue;
    const geo = discoParaGeo(p.X, p.Y);
    const h = alturaEm(geo.lat, geo.lon);
    ehMar[i] = h <= 0.5 ? 1 : 0;
    terreno[i] = Math.max(0, h);
  }
  relevoCarregado = true;
  recalcularMarcas();
}
carregarRelevo().catch((e) => console.warn("Relevo não carregou (a cidade fica lisa):", e));

function terrenoNoDisco(X, Y) {
  if (!relevoCarregado) return 0;
  const geo = discoParaGeo(X, Y);
  return (Math.max(0, alturaEm(geo.lat, geo.lon)) / 512) * PARAM.exagero;
}


/* 6. AS MARCAS DOS SONS (redondas)
   g = graves -> marca mais larga · v = volume -> mais alta · a = agudos -> lombas à volta */
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

function marcasNoDisco(X, Y) {
  let r = 0;
  for (const M of marcas) if (M) r += relevoDaMarca(M, X, Y);
  return 0.28 * Math.tanh((r * PARAM.forcaMarcas) / 0.28);
}

const marcas = [];
const alturaCentro = [];

function recalcularMarcas() {
  for (let i = 0; i < N; i++) {
    const p = pontos[i];
    marcaBase[i] = p.cidade ? marcasNoDisco(p.X, p.Y) * bordaSuave(p.s) : 0;
  }
  for (let k = 0; k < marcas.length; k++) {
    const M = marcas[k];
    alturaCentro[k] = M ? terrenoNoDisco(M.X, M.Y) + marcasNoDisco(M.X, M.Y) : 0;
  }
  alturaCentro.length = marcas.length;
  if (SONS.length) marcarDestaque(faixaAtual);
}

function marcarDestaque(indice) {
  zona.fill(0);
  const M = marcas[indice];
  if (!M) return;
  const RZ = 0.16;
  for (let i = 0; i < N; i++) {
    const p = pontos[i];
    if (!p.cidade) continue;
    const d = Math.hypot(p.X - M.X, p.Y - M.Y);
    distZona[i] = d;
    zona[i] = Math.exp(-((d / RZ) ** 2));
  }
}

function adicionarMarca(som, indice) {
  marcas.splice(indice, 0, som.assinatura ? prepararMarca(som) : null);
  recalcularMarcas();
  atualizarContador();
}

function atualizarContador() {
  const n = SONS.length;
  document.getElementById("contador").textContent =
    n === 0 ? "AN ARCHIVE OF THE CITY'S SOUNDS"
            : n + (n === 1 ? " SOUND" : " SOUNDS") + " IN THE ARCHIVE";
}


/* 7. IMPRESSÃO DIGITAL DO SOM */
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


/* 9. TOCAR OS SONS */
const botaoSom   = document.getElementById("botaoSom");
const textoDesc  = document.getElementById("descricao");
const textoRua   = document.getElementById("rua");
const textoAgora = document.getElementById("agora");

const audio = new Audio();
audio.preload = "auto";
audio.crossOrigin = "anonymous";

let contextoAudio = null, analisador = null, volumeSaida = null, espetro = null;
let somLigado = false;
let faixaAtual = 0;
let falhasSeguidas = 0;

function prepararAudio() {
  if (contextoAudio) return;
  contextoAudio = new (window.AudioContext || window.webkitAudioContext)();
  const fonte = contextoAudio.createMediaElementSource(audio);
  analisador = contextoAudio.createAnalyser();
  analisador.fftSize = 512;
  analisador.smoothingTimeConstant = 0.8;
  volumeSaida = contextoAudio.createGain();
  fonte.connect(analisador);
  analisador.connect(volumeSaida);
  volumeSaida.connect(contextoAudio.destination);
  espetro = new Uint8Array(analisador.frequencyBinCount);
}

function tocarFaixa(indice) {
  if (SONS.length === 0) { semSons(); return; }
  faixaAtual = (indice + SONS.length) % SONS.length;
  const s = SONS[faixaAtual];
  audio.src = s.ficheiro;
  mostrarInfo(s);
  marcarDestaque(faixaAtual);
  if (contextoAudio) audio.play().catch(() => {});
}

audio.addEventListener("ended", () => tocarFaixa(faixaAtual + 1));
audio.addEventListener("error", () => {
  falhasSeguidas++;
  if (falhasSeguidas >= SONS.length) { semSons(); return; }
  tocarFaixa(faixaAtual + 1);
});
audio.addEventListener("playing", () => { falhasSeguidas = 0; });

function volumeSuave(valor) {
  const agora = contextoAudio.currentTime;
  volumeSaida.gain.cancelScheduledValues(agora);
  volumeSaida.gain.setValueAtTime(volumeSaida.gain.value, agora);
  volumeSaida.gain.linearRampToValueAtTime(valor, agora + 0.3);
}

function ligarSom() {
  prepararAudio();
  contextoAudio.resume();
  somLigado = true;
  volumeSuave(1);
  botaoSom.textContent = "\u25CF SOUND ON";
  botaoSom.classList.add("ligado");
  if (!audio.src) tocarFaixa(0);
  else audio.play().catch(() => {});
}

function desligarSom() {
  somLigado = false;
  if (volumeSaida) volumeSuave(0);
  botaoSom.textContent = "\u25CB SOUND OFF";
  botaoSom.classList.remove("ligado");
}

botaoSom.addEventListener("click", (e) => {
  e.stopPropagation();
  somLigado ? desligarSom() : ligarSom();
});

// Clicar numa marca toca esse som; clicar noutro sítio liga o som
function marcaPerto(x, y) {
  let melhor = -1, melhorDist = 22;
  for (let i = 0; i < centrosEcra.length; i++) {
    const c = centrosEcra[i];
    if (!c || !c.visivel) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < melhorDist) { melhorDist = d; melhor = i; }
  }
  return melhor;
}

tela.addEventListener("click", (e) => {
  const i = marcaPerto(e.clientX, e.clientY);
  if (i >= 0) {
    prepararAudio();
    if (!somLigado) { somLigado = true; contextoAudio.resume(); volumeSuave(1);
      botaoSom.textContent = "\u25CF SOUND ON"; botaoSom.classList.add("ligado"); }
    falhasSeguidas = 0;
    tocarFaixa(i);
  } else if (!somLigado) {
    ligarSom();
  }
});
tela.addEventListener("mousemove", (e) => {
  tela.classList.toggle("sobre-marca", marcaPerto(e.clientX, e.clientY) >= 0);
});


/* 10. CANTO INFERIOR ESQUERDO: descrição, rua · dia, coordenadas */
const coord = { lat: 0, lon: 0, alvoLat: 0, alvoLon: 0, ativa: false };

function formatarData(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d + "." + m + "." + a;
}

function formatar(lat, lon) {
  const la = Math.abs(lat).toFixed(5) + "° " + (lat >= 0 ? "N" : "S");
  const lo = Math.abs(lon).toFixed(5) + "° " + (lon >= 0 ? "E" : "W");
  return la + "\u2003" + lo;
}

let temporizadorInfo = null;
function mostrarInfo(s) {
  if (!coord.ativa) { coord.lat = s.lat; coord.lon = s.lon; }
  coord.alvoLat = s.lat;
  coord.alvoLon = s.lon;
  coord.ativa = true;
  const linhaRua = [s.rua, formatarData(s.data)].filter(Boolean).join("  \u00B7  ");
  clearTimeout(temporizadorInfo);
  textoDesc.style.opacity = 0;
  textoRua.style.opacity = 0;
  temporizadorInfo = setTimeout(() => {
    textoDesc.textContent = s.descricao || "";
    textoRua.textContent = linhaRua;
    textoDesc.style.opacity = 1;
    textoRua.style.opacity = 1;
  }, 500);
}

function atualizarCoordenadas() {
  if (!coord.ativa) return;
  coord.lat += (coord.alvoLat - coord.lat) * 0.05;
  coord.lon += (coord.alvoLon - coord.lon) * 0.05;
  const texto = formatar(coord.lat, coord.lon);
  if (textoAgora.textContent !== texto) textoAgora.textContent = texto;
}

function semSons() {
  coord.ativa = false;
  textoDesc.textContent = "";
  textoRua.textContent = "";
  textoAgora.textContent = "NO SOUNDS YET \u2014 ADD YOURS";
}
semSons();


/* 11. CARREGAR O ARQUIVO (todos os sons guardados no Supabase) */
async function carregarSonsGuardados() {
  if (!db) return;
  const { data, error } = await db
    .from("sons")
    .select("*")
    .eq("aprovado", true)
    .order("criado", { ascending: true });
  if (error) { console.warn("Supabase:", error.message); return; }

  const estavaVazio = SONS.length === 0;
  const semAssinatura = [];
  for (const linha of data) {
    const som = {
      ficheiro: db.storage.from("sons").getPublicUrl(linha.ficheiro).data.publicUrl,
      rua: linha.rua, lat: linha.lat, lon: linha.lon,
      data: linha.data || linha.criado,
      descricao: linha.descricao || "",
      assinatura: linha.assinatura || null,
    };
    SONS.push(som);
    marcas.push(som.assinatura ? prepararMarca(som) : null);
    if (!som.assinatura) semAssinatura.push(som);
  }
  recalcularMarcas();
  atualizarContador();

  if (estavaVazio && SONS.length) {
    falhasSeguidas = 0;
    mostrarInfo(SONS[0]);
    if (contextoAudio) tocarFaixa(0); else marcarDestaque(0);
  }

  for (const som of semAssinatura) {
    try {
      som.assinatura = await analisarSom(som.ficheiro);
      const i = SONS.indexOf(som);
      if (i >= 0) { marcas[i] = prepararMarca(som); recalcularMarcas(); if (i === faixaAtual) marcarDestaque(i); }
    } catch (erro) { console.warn("Não deu para analisar:", som.ficheiro); }
  }
}
carregarSonsGuardados();


/* 12. ADICIONAR UM SOM (gravação, sítio, dia, descrição) */
const NOMINATIM = "https://nominatim.openstreetmap.org";
const TAMANHO_MAXIMO_MB = 30;

function dentroDoRetangulo(lat, lon) {
  return lat >= BARCELONA.latMin && lat <= BARCELONA.latMax &&
         lon >= BARCELONA.lonMin && lon <= BARCELONA.lonMax;
}

function eBarcelona(morada) {
  if (!morada) return false;
  const cidade = (morada.city || morada.town || morada.municipality || morada.village || "").toLowerCase();
  return cidade === "barcelona";
}

function nomeDaRua(morada, alternativa) {
  if (!morada) return alternativa || "";
  const rua = morada.road || morada.pedestrian || morada.footway || morada.square ||
              morada.place || morada.neighbourhood || morada.suburb || alternativa || "";
  return morada.house_number ? rua + " " + morada.house_number : rua;
}

let ultimoPedido = 0;
async function esperarVez() {
  const falta = 1100 - (Date.now() - ultimoPedido);
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  ultimoPedido = Date.now();
}

async function procurarRua(texto) {
  await esperarVez();
  const caixa = [BARCELONA.lonMin, BARCELONA.latMax, BARCELONA.lonMax, BARCELONA.latMin].join(",");
  const url = NOMINATIM + "/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=es" +
              "&viewbox=" + caixa + "&bounded=1&accept-language=es" +
              "&q=" + encodeURIComponent(texto + ", Barcelona");
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error("sem resposta");
  const resultados = await resposta.json();
  const r = resultados.find((x) => eBarcelona(x.address));
  if (!r) return null;
  return { lat: +(+r.lat).toFixed(5), lon: +(+r.lon).toFixed(5), rua: nomeDaRua(r.address, texto) };
}

async function ruaDasCoordenadas(lat, lon) {
  await esperarVez();
  const url = NOMINATIM + "/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=es" +
              "&lat=" + lat + "&lon=" + lon;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error("sem resposta");
  const r = await resposta.json();
  return { rua: nomeDaRua(r.address, ""), barcelona: eBarcelona(r.address) };
}

const botaoAdicionar = document.getElementById("botaoAdicionar");
const painel         = document.getElementById("painel");
const campoFicheiro  = document.getElementById("campoFicheiro");
const nomeFicheiro   = document.getElementById("nomeFicheiro");
const campoLocal     = document.getElementById("campoLocal");
const botaoProcurar  = document.getElementById("botaoProcurar");
const botaoGPS       = document.getElementById("botaoGPS");
const campoData      = document.getElementById("campoData");
const campoDescricao = document.getElementById("campoDescricao");
const mensagem       = document.getElementById("mensagem");
const botaoConfirmar = document.getElementById("botaoConfirmar");
const botaoCancelar  = document.getElementById("botaoCancelar");

let novoFicheiro = null;
let novoLocal = null;

function hojeISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function abrirPainel() {
  document.getElementById("painelAbout").hidden = true;
  document.getElementById("painelObjeto").hidden = true;
  painel.hidden = false;
  botaoAdicionar.hidden = true;
  campoData.max = hojeISO();
  if (!campoData.value) campoData.value = hojeISO();
}

function fecharPainel() {
  painel.hidden = true;
  botaoAdicionar.hidden = false;
  campoFicheiro.value = "";
  campoLocal.value = "";
  campoData.value = "";
  campoDescricao.value = "";
  nomeFicheiro.textContent = "NO FILE CHOSEN";
  novoFicheiro = null;
  novoLocal = null;
  mostrarMensagem("", "");
  verificarPronto();
}

function mostrarMensagem(texto, tipo) {
  mensagem.textContent = texto;
  mensagem.className = "mensagem " + tipo;
}

function dataValida() {
  return /^\d{4}-\d{2}-\d{2}$/.test(campoData.value) && campoData.value <= hojeISO();
}

function verificarPronto() {
  botaoConfirmar.disabled = !(novoFicheiro && novoLocal && dataValida() && campoDescricao.value.trim());
}

function aProcurar(sim) {
  botaoProcurar.disabled = sim;
  botaoGPS.disabled = sim;
  botaoProcurar.textContent = sim ? "\u2026" : "FIND";
}

function lerCoordenadas(texto) {
  const m = texto.match(/(-?\d{1,2}\.\d+)[,;\s]+(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
}

function aceitar(lat, lon, rua) {
  novoLocal = { lat, lon, rua };
  const titulo = rua ? rua.toUpperCase() + " \u2014 " : "";
  mostrarMensagem("\u2713 " + titulo + formatar(lat, lon), "ok");
  verificarPronto();
}

function recusar(texto) {
  novoLocal = null;
  mostrarMensagem("\u2717 " + texto, "erro");
  verificarPronto();
}

async function validarCoordenadas(lat, lon) {
  aProcurar(true);
  mostrarMensagem("LOOKING UP THE STREET\u2026", "");
  try {
    const r = await ruaDasCoordenadas(lat, lon);
    if (r.barcelona) aceitar(lat, lon, r.rua);
    else recusar("THIS PLACE IS OUTSIDE BARCELONA. ONLY SOUNDS OF BARCELONA.");
  } catch (erro) {
    if (dentroDoRetangulo(lat, lon)) aceitar(lat, lon, "");
    else recusar("THIS PLACE IS OUTSIDE BARCELONA. ONLY SOUNDS OF BARCELONA.");
  }
  aProcurar(false);
}

async function procurar() {
  const texto = campoLocal.value.trim();
  if (!texto) { recusar("WRITE A STREET FIRST"); return; }
  const c = lerCoordenadas(texto);
  if (c) { validarCoordenadas(c.lat, c.lon); return; }
  aProcurar(true);
  mostrarMensagem("SEARCHING\u2026", "");
  try {
    const r = await procurarRua(texto);
    if (r) aceitar(r.lat, r.lon, r.rua);
    else recusar("STREET NOT FOUND IN BARCELONA. CHECK THE NAME OR ADD THE NUMBER.");
  } catch (erro) {
    recusar("NO CONNECTION TO THE STREET SEARCH. TRY AGAIN.");
  }
  aProcurar(false);
}

botaoAdicionar.addEventListener("click", abrirPainel);
botaoCancelar.addEventListener("click", fecharPainel);
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !painel.hidden) fecharPainel(); });

campoFicheiro.addEventListener("change", () => {
  const f = campoFicheiro.files[0];
  novoFicheiro = null;
  if (!f) { nomeFicheiro.textContent = "NO FILE CHOSEN"; verificarPronto(); return; }
  if (!f.type.startsWith("audio")) {
    nomeFicheiro.textContent = "NO FILE CHOSEN";
    mostrarMensagem("\u2717 THIS FILE IS NOT AUDIO (USE MP3, WAV, M4A...)", "erro");
  } else if (f.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
    nomeFicheiro.textContent = "NO FILE CHOSEN";
    mostrarMensagem("\u2717 FILE TOO BIG (MAX " + TAMANHO_MAXIMO_MB + " MB)", "erro");
  } else {
    novoFicheiro = f;
    nomeFicheiro.textContent = f.name;
    if (mensagem.classList.contains("erro") && !novoLocal) mostrarMensagem("", "");
  }
  verificarPronto();
});

botaoProcurar.addEventListener("click", procurar);
campoLocal.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); procurar(); }
});
campoLocal.addEventListener("input", () => {
  if (novoLocal) { novoLocal = null; mostrarMensagem("", ""); verificarPronto(); }
});
campoData.addEventListener("input", verificarPronto);
campoDescricao.addEventListener("input", verificarPronto);

botaoGPS.addEventListener("click", () => {
  if (!navigator.geolocation) { recusar("THIS BROWSER CANNOT GIVE YOUR LOCATION"); return; }
  mostrarMensagem("LOCATING\u2026", "");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      campoLocal.value = "";
      validarCoordenadas(+pos.coords.latitude.toFixed(5), +pos.coords.longitude.toFixed(5));
    },
    () => recusar("LOCATION NOT AVAILABLE \u2014 WRITE THE STREET"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

async function enviarParaSupabase(ficheiro, som) {
  const ext = (ficheiro.name.split(".").pop() || "m4a").toLowerCase().replace(/[^a-z0-9]/g, "");
  const caminho = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const envio = await db.storage.from("sons").upload(caminho, ficheiro, {
    contentType: ficheiro.type || "audio/mpeg",
    upsert: false,
  });
  if (envio.error) throw envio.error;
  const linha = await db.from("sons").insert({
    ficheiro: caminho,
    rua: (som.rua || "").slice(0, 120),
    lat: som.lat,
    lon: som.lon,
    data: som.data,
    descricao: som.descricao,
    assinatura: som.assinatura,
  });
  if (linha.error) throw linha.error;
}

botaoConfirmar.addEventListener("click", async () => {
  if (botaoConfirmar.disabled) return;
  const ficheiro = novoFicheiro;
  const som = {
    ficheiro: URL.createObjectURL(ficheiro),
    rua: novoLocal.rua, lat: novoLocal.lat, lon: novoLocal.lon,
    data: campoData.value,
    descricao: campoDescricao.value.trim().slice(0, 80),
    assinatura: null,
  };

  botaoConfirmar.disabled = true;
  botaoCancelar.disabled = true;
  mostrarMensagem("LISTENING TO YOUR SOUND\u2026", "");
  try {
    som.assinatura = await analisarSom(ficheiro);
  } catch (erro) {
    console.warn("Não deu para analisar:", erro.message || erro);
  }

  if (db) {
    mostrarMensagem("SENDING\u2026", "");
    try {
      await enviarParaSupabase(ficheiro, som);
      mostrarMensagem("\u2713 SENT! YOUR SOUND IS NOW PART OF THE SPHERE.", "ok");
    } catch (erro) {
      console.warn("Supabase:", erro.message || erro);
      mostrarMensagem("\u2717 COULD NOT SAVE IT. IT WILL ONLY PLAY HERE.", "erro");
    }
  }
  botaoCancelar.disabled = false;
  await new Promise((r) => setTimeout(r, 2200));

  const posicao = SONS.length ? faixaAtual + 1 : 0;
  SONS.splice(posicao, 0, som);
  adicionarMarca(som, posicao);
  falhasSeguidas = 0;
  fecharPainel();
  prepararAudio();
  if (!somLigado) ligarSom();
  tocarFaixa(posicao);
});


/* 12b. PAINÉIS ABOUT E GENERATE OBJECT (só um painel aberto de cada vez) */
const painelAbout  = document.getElementById("painelAbout");
const painelObjeto = document.getElementById("painelObjeto");
const mensagemObjeto = document.getElementById("mensagemObjeto");

function abrirSo(qual) {
  for (const p of [painel, painelAbout, painelObjeto]) if (p !== qual) p.hidden = true;
  botaoAdicionar.hidden = false;
  qual.hidden = false;
}
document.getElementById("botaoAbout").addEventListener("click", () => abrirSo(painelAbout));
document.getElementById("fecharAbout").addEventListener("click", () => { painelAbout.hidden = true; });
document.getElementById("botaoObjeto").addEventListener("click", () => {
  mensagemObjeto.textContent = "";
  mensagemObjeto.className = "mensagem";
  abrirSo(painelObjeto);
});
document.getElementById("fecharObjeto").addEventListener("click", () => { painelObjeto.hidden = true; });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { painelAbout.hidden = true; painelObjeto.hidden = true; }
});


/* 12c. GENERATE OBJECT — esfera com base plana e as marcas dos sons (sem a cidade) */
const OBJETO = {
  linhas: 180,          // detalhe de cima a baixo
  colunas: 360,         // detalhe à volta
  corteBase: -0.62,     // altura do corte da base (-1 = fundo da esfera)
  forcaMarcas: 1.6,     // as marcas um pouco mais altas no objeto
};

function raioObjeto(x, y, z) {
  if (y <= CAP) return 1;
  const d = esferaParaDisco(x, y, z);
  return 1 + OBJETO.forcaMarcas * marcasNoDisco(d.X, d.Y) * bordaSuave(d.s);
}

function gerarSTL(diametroMm) {
  const NL = OBJETO.linhas, NC = OBJETO.colunas;
  const v = [];
  const ponto = (lat, lon) => {
    const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
    const d = raioObjeto(x, y, z);
    return [x * d, Math.max(y * d, OBJETO.corteBase), z * d];
  };
  const sul = v.length; v.push(ponto(-Math.PI / 2, 0));
  for (let l = 1; l < NL; l++) {
    const lat = -Math.PI / 2 + (Math.PI * l) / NL;
    for (let c = 0; c < NC; c++) v.push(ponto(lat, (2 * Math.PI * c) / NC));
  }
  const norte = v.length; v.push(ponto(Math.PI / 2, 0));
  const idx = (l, c) => 1 + (l - 1) * NC + (c % NC);

  const tri = [];
  for (let c = 0; c < NC; c++) tri.push([sul, idx(1, c), idx(1, c + 1)]);
  for (let l = 1; l < NL - 1; l++) {
    for (let c = 0; c < NC; c++) {
      const a = idx(l, c), b = idx(l, c + 1), cc = idx(l + 1, c + 1), d = idx(l + 1, c);
      tri.push([a, cc, b]); tri.push([a, d, cc]);
    }
  }
  for (let c = 0; c < NC; c++) tri.push([norte, idx(NL - 1, c + 1), idx(NL - 1, c)]);

  let maxH = 0, minY = Infinity;
  for (const p of v) { maxH = Math.max(maxH, Math.hypot(p[0], p[2])); minY = Math.min(minY, p[1]); }
  const k = diametroMm / 2 / maxH;
  const final = v.map((p) => [p[0] * k, -p[2] * k, (p[1] - minY) * k]);

  const buffer = new ArrayBuffer(84 + tri.length * 50);
  const dv = new DataView(buffer);
  const cabecalho = "SOUNDS OF BARCELONA - " + SONS.length + " sounds - " + hojeISO();
  for (let i = 0; i < 80; i++) dv.setUint8(i, i < cabecalho.length ? cabecalho.charCodeAt(i) & 127 : 32);
  dv.setUint32(80, tri.length, true);
  let o = 84;
  for (const [ia, ib, ic] of tri) {
    const A = final[ia], B = final[ib], C = final[ic];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const nn = Math.hypot(nx, ny, nz) || 1;
    for (const val of [nx / nn, ny / nn, nz / nn, ...A, ...B, ...C]) { dv.setFloat32(o, val, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  let maxZ = 0;
  for (const p of final) if (p[2] > maxZ) maxZ = p[2];
  return { blob: new Blob([buffer], { type: "model/stl" }), alturaMm: Math.round(maxZ * 10) / 10 };
}

function descarregarObjeto(diametroMm) {
  mensagemObjeto.className = "mensagem";
  mensagemObjeto.textContent = "BUILDING\u2026";
  setTimeout(() => {
    const r = gerarSTL(diametroMm);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(r.blob);
    a.download = "sounds-of-barcelona_" + hojeISO() + "_" + SONS.length + "-sounds_" + diametroMm + "mm.stl";
    document.body.appendChild(a); a.click(); a.remove();
    mensagemObjeto.className = "mensagem ok";
    mensagemObjeto.textContent = "\u2713 " + SONS.length + " SOUNDS \u00B7 " + diametroMm / 10 +
      " CM MAX \u00B7 " + (r.alturaMm / 10).toFixed(1) + " CM HIGH";
  }, 50);
}
document.getElementById("objeto60").addEventListener("click", () => descarregarObjeto(60));
document.getElementById("objeto120").addEventListener("click", () => descarregarObjeto(120));


/* 13. LER O SOM AO VIVO */
const somVivo = { graves: 0, medios: 0, agudos: 0, volume: 0, brilho: 0.5 };

function media(inicio, fim) {
  let soma = 0;
  for (let i = inicio; i < fim; i++) soma += espetro[i];
  return soma / ((fim - inicio) * 255);
}

function lerSom(t) {
  let g, m, a, v, b;
  if (analisador && !audio.paused) {
    analisador.getByteFrequencyData(espetro);
    g = media(1, 8); m = media(8, 48); a = media(48, 160); v = media(1, 160);
    let soma = 0, pesada = 0;
    for (let i = 1; i < 160; i++) { soma += espetro[i]; pesada += espetro[i] * i; }
    b = soma > 0 ? pesada / soma / 100 : 0.5;
  } else {
    g = 0.08 + 0.05 * Math.sin(t * 0.8); m = 0.05; a = 0.03; v = 0.1; b = 0.5;
  }
  somVivo.graves += (g - somVivo.graves) * 0.15;
  somVivo.medios += (m - somVivo.medios) * 0.15;
  somVivo.agudos += (a - somVivo.agudos) * 0.15;
  somVivo.volume += (v - somVivo.volume) * 0.15;
  somVivo.brilho += (Math.min(b, 1) - somVivo.brilho) * 0.05;
}


/* 14. DESENHAR A ESFERA */
const DISTANCIA = 3.4;
const paleta = [];
for (let h = 0; h < 360; h++) paleta.push(`hsl(${h}, 100%, 60%)`);
const centrosEcra = [];

function desenhar(tempoMs) {
  const t = tempoMs / 1000;
  lerSom(t);
  atualizarCoordenadas();

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, largura, altura);

  const aTocar = !audio.paused && SONS.length > 0;
  const vol = aTocar ? somVivo.volume : 0;
  const cx = largura / 2, cy = altura * 0.52;
  const escala = Math.min(largura, altura) * PARAM.tamanho * (1 + somVivo.graves * 0.02);

  const ry = 2.36 + Math.sin(t * 0.07) * PARAM.oscilacao;
  const rx = 0.88 + Math.sin(t * 0.05) * 0.08;
  const cY = Math.cos(ry), sY = Math.sin(ry), cX = Math.cos(rx), sX = Math.sin(rx);
  const amp = PARAM.ondaZona * (0.15 + vol * 1.8);
  let distCor = PARAM.corBorda - PARAM.corCentro; if (distCor < 0) distCor += 360;

  for (let i = 0; i < N; i++) {
    const p = pontos[i];
    let d = 1;
    if (p.cidade) {
      const borda = bordaSuave(p.s);
      d += (terreno[i] / 512) * PARAM.exagero * borda + marcaBase[i];
      if (zona[i] > 0.01) d += zona[i] * amp * Math.sin(distZona[i] * 70 - t * 5) * borda;
    }
    const x = p.x * d, y = p.y * d, z = p.z * d;
    const x1 = x * cY - z * sY, z1 = x * sY + z * cY;
    const y2 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
    const persp = DISTANCIA / (DISTANCIA - z2);
    ecraX[i] = cx + x1 * escala * persp;
    ecraY[i] = cy - y2 * escala * persp;
    profundidade[i] = z2;
  }

  for (let passo = 0; passo < 2; passo++) {
    for (let i = 0; i < N; i++) {
      const z2 = profundidade[i];
      if ((z2 >= 0) !== (passo === 1)) continue;
      const p = pontos[i];
      const frente = Math.max(0, (z2 + 1.1) / 2.2);
      let cor, alfa, tam;
      if (!p.cidade) {
        cor = PARAM.corCentro; alfa = 0.06 + 0.30 * frente * frente; tam = 0.5 + frente * 0.8;
      } else if (ehMar[i]) {
        cor = 232; alfa = 0.10 + 0.40 * frente * frente; tam = 0.5 + frente * 0.9;
      } else {
        const alt = Math.min(1, terreno[i] / 450);
        const z = zona[i];
        const tCor = Math.min(1, alt * 0.35 + marcaBase[i] * 9 + z * (0.4 + vol * 1.5));
        cor = Math.round(PARAM.corCentro + tCor * distCor) % 360;
        alfa = Math.min(1, (0.18 + 0.82 * frente * frente) * (0.85 + marcaBase[i] * 6 + z * (0.3 + vol * 2)));
        tam = (0.7 + frente * 1.5) * (1 + z * vol * 1.2);
      }
      ctx.fillStyle = paleta[cor];
      ctx.globalAlpha = alfa;
      ctx.beginPath();
      ctx.arc(ecraX[i], ecraY[i], tam * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Marcadores: um círculo em cima de cada marca (clicável)
  centrosEcra.length = marcas.length;
  for (let k = 0; k < marcas.length; k++) {
    const M = marcas[k];
    if (!M) { centrosEcra[k] = null; continue; }
    const e = discoParaEsfera(M.X, M.Y);
    const d = 1 + (alturaCentro[k] || 0);
    const x = e.x * d, y = e.y * d, z = e.z * d;
    const x1 = x * cY - z * sY, z1 = x * sY + z * cY;
    const y2 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
    const persp = DISTANCIA / (DISTANCIA - z2);
    centrosEcra[k] = { x: cx + x1 * escala * persp, y: cy - y2 * escala * persp, visivel: z2 > -0.05 };
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  const pulso = 0.5 + 0.5 * Math.sin(t * 4);
  for (let k = 0; k < centrosEcra.length; k++) {
    const c = centrosEcra[k];
    if (!c || !c.visivel) continue;
    const atual = k === faixaAtual && SONS.length > 0;
    ctx.strokeStyle = atual ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(c.x, c.y, atual ? 6 + vol * 10 + pulso * 2 : 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Linha do som que está a tocar até à informação no canto
  const ca = centrosEcra[faixaAtual];
  if (ca && ca.visivel && SONS.length > 0) {
    const caixa = document.getElementById("info").getBoundingClientRect();
    const fimX = caixa.left + Math.min(caixa.width, 220), fimY = caixa.top - 10;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(ca.x, ca.y);
    ctx.lineTo(fimX, fimY);
    ctx.lineTo(caixa.left, fimY);
    ctx.stroke();
  }

  requestAnimationFrame(desenhar);
}

requestAnimationFrame(desenhar);
