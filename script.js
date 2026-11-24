/* SOUNDS OF BARCELONA — script.js
   Arquivo coletivo dos sons de Barcelona. Cada som deixa uma marca
   permanente na esfera, no sítio que corresponde ao lugar da cidade. */

/* 1. LISTA DE SONS — vazia: os sons vêm do Supabase */
const SONS = [];

/* 1b. SUPABASE (endereço e chave no config.js) */
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

/* 2. PARÂMETROS */
const PARAM = {
  pontos: window.innerWidth < 700 ? 5000 : 10000,
  tamanho: 0.26,
  rotacao: 0.10,
  forcaDobras: 0.12,
  forcaEspetro: 0.08,
  forcaMarcas: 1.0,
  corCentro: 262,
  corBorda: 28,
  forcaCor: 40,
  tamanhoPonto: 1.0,
};

const BARCELONA = { latMin: 41.317, latMax: 41.469, lonMin: 2.052, lonMax: 2.229 };

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

/* 4. PONTOS DA ESFERA */
const pontos = [];
const LINHAS = Math.round(Math.sqrt(PARAM.pontos / 1.27));

for (let l = 0; l < LINHAS; l++) {
  const lat = Math.PI * ((l + 0.5) / LINHAS - 0.5);
  const y = Math.sin(lat);
  const raio = Math.cos(lat);
  const naLinha = Math.max(6, Math.round(LINHAS * 2 * raio));
  for (let k = 0; k < naLinha; k++) {
    const angulo = (k / naLinha) * Math.PI * 2;
    const x = Math.cos(angulo) * raio;
    const z = Math.sin(angulo) * raio;
    const latitude = (1 - y) / 2;
    const mistura = (Math.sin(angulo * 3) + 1) * 0.08;
    const faixa = Math.min(0.99, Math.abs(1 - latitude - mistura));
    pontos.push({ x, y, z, angulo, faixa });
  }
}

const N = pontos.length;
const ecraX = new Float32Array(N), ecraY = new Float32Array(N);
const tamanhos = new Float32Array(N), alfas = new Float32Array(N);
const matizes = new Uint16Array(N), profundidade = new Float32Array(N);

const marcaBase = new Float32Array(N);
const destaque  = new Float32Array(N);
let maiorMarca = 0;

/* 5. FORMA AO VIVO */
function ruido(x, y, z, t) {
  return (
    Math.sin(x * 2.1 + t * 0.9) * Math.sin(y * 2.7 - t * 0.7) * Math.sin(z * 2.3 + t * 0.5) +
    0.5  * Math.sin(x * 4.3 - y * 3.1 + t * 1.3) * Math.sin(z * 3.7 + t * 0.8) +
    0.25 * Math.sin((x + z) * 6.1 + t * 1.7) * Math.sin(y * 5.3 - t * 1.1)
  ) / 1.75;
}

const F = { base: 0.04, dobras: 0.04, nDobras: 8, torcao: 0.02, t: 0 };

function forma(x, y, z, angulo) {
  const equador = 1 - y * y;
  const t = F.t;
  const organico = ruido(x, y, z, t * 0.6);
  const dobras = Math.sin(y * F.nDobras + Math.sin(angulo * 3 + t * 0.7) * 1.8 + t * 1.3);
  const torcao = Math.sin(angulo * 2 + y * 4 - t * 0.6);
  return organico * F.base + dobras * F.dobras * equador + torcao * F.torcao * equador;
}

/* 6. MARCAS PERMANENTES
   Barcelona "enrolada" na esfera: oeste->este = à volta; sul->norte = de baixo para cima.
   g = graves (lomba larga), m = médios (ondas), a = agudos (picos),
   v = volume (tamanho), p = sons súbitos (picos mais altos) */
function centroNaEsfera(lat, lon) {
  const u = Math.min(1, Math.max(0, (lon - BARCELONA.lonMin) / (BARCELONA.lonMax - BARCELONA.lonMin)));
  const v = Math.min(1, Math.max(0, (lat - BARCELONA.latMin) / (BARCELONA.latMax - BARCELONA.latMin)));
  const azimute = u * Math.PI * 2;
  const latitude = (v - 0.5) * Math.PI * 0.8;
  return {
    x: Math.cos(latitude) * Math.cos(azimute),
    y: Math.sin(latitude),
    z: Math.cos(latitude) * Math.sin(azimute),
  };
}

function prepararMarca(som) {
  const s = som.assinatura;
  const c = centroNaEsfera(som.lat, som.lon);
  let t1 = { x: -c.z, y: 0, z: c.x };
  const n1 = Math.hypot(t1.x, t1.z) || 1;
  t1 = { x: t1.x / n1, y: 0, z: t1.z / n1 };
  const t2 = { x: c.y * t1.z, y: c.z * t1.x - c.x * t1.z, z: -c.y * t1.x };
  return {
    c, t1, t2,
    largura: 0.28 + 0.32 * s.g,
    lomba:   (0.10 + 0.32 * s.v) * (0.45 + 0.55 * s.g),
    ondas:   0.07 * s.m,
    nOndas:  12 + 14 * s.m,
    picos:   (0.15 + 0.55 * s.a) * (0.6 + 0.8 * s.p) * (0.5 + 0.5 * s.v),
    nPicos:  Math.round(4 + 6 * s.a),
    nAnel:   7 + 9 * s.a,
  };
}

function relevoDaMarca(M, px, py, pz) {
  const dot = Math.max(-1, Math.min(1, px * M.c.x + py * M.c.y + pz * M.c.z));
  const dist = Math.acos(dot);
  if (dist > M.largura * 2.6) return 0;
  const env  = Math.exp(-((dist / M.largura) ** 2));
  const env2 = Math.exp(-((dist / (M.largura * 1.3)) ** 2));
  const ang = Math.atan2(px * M.t2.x + py * M.t2.y + pz * M.t2.z,
                         px * M.t1.x + py * M.t1.y + pz * M.t1.z);
  const estrela = Math.pow(0.5 + 0.5 * Math.cos(ang * M.nPicos), 4) *
                  Math.pow(0.5 + 0.5 * Math.cos(dist * M.nAnel), 2);
  return env * M.lomba +
         env * M.ondas * Math.sin(dist * M.nOndas) +
         env2 * M.picos * estrela;
}

const marcas = [];

function recalcularMarcas() {
  marcaBase.fill(0);
  for (const M of marcas) {
    if (!M) continue;
    for (let i = 0; i < N; i++) {
      const p = pontos[i];
      marcaBase[i] += relevoDaMarca(M, p.x, p.y, p.z);
    }
  }
  maiorMarca = 0;
  for (let i = 0; i < N; i++) {
    marcaBase[i] = 0.7 * Math.tanh((marcaBase[i] * PARAM.forcaMarcas) / 0.7);
    if (marcaBase[i] > maiorMarca) maiorMarca = marcaBase[i];
  }
}

function marcarDestaque(indice) {
  destaque.fill(0);
  const M = marcas[indice];
  if (!M) return;
  for (let i = 0; i < N; i++) {
    const p = pontos[i];
    destaque[i] = Math.max(0, relevoDaMarca(M, p.x, p.y, p.z));
  }
}

function adicionarMarca(som, indice) {
  marcas.splice(indice, 0, som.assinatura ? prepararMarca(som) : null);
  recalcularMarcas();
}

/* 7. IMPRESSÃO DIGITAL DO SOM (analisa a gravação inteira uma vez) */
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

/* 8. CORES */
const paleta = [];
for (let h = 0; h < 360; h++) paleta.push(`hsl(${h}, 100%, 62%)`);

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

function primeiraInteracao(e) {
  const t = e.target;
  if (t.closest && t.closest("#painel, #botaoAdicionar")) return;
  if (t !== botaoSom && !somLigado) ligarSom();
  window.removeEventListener("pointerdown", primeiraInteracao);
  window.removeEventListener("keydown", primeiraInteracao);
}
window.addEventListener("pointerdown", primeiraInteracao);
window.addEventListener("keydown", primeiraInteracao);

/* 10. CANTO INFERIOR ESQUERDO */
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

/* 11. CARREGAR O ARQUIVO DO SUPABASE */
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

/* 12. ADICIONAR UM SOM */
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
const DISTANCIA = 3.2;
const LUZ = (() => { const l = [-0.45, 0.55, 0.7]; const n = Math.hypot(...l); return l.map((v) => v / n); })();

function desenhar(tempoMs) {
  const t = tempoMs / 1000;
  lerSom(t);
  atualizarCoordenadas();

  F.t = t;
  F.base   += ((0.02 + somVivo.volume * 0.06) - F.base) * 0.1;
  F.dobras += ((0.02 + somVivo.graves * PARAM.forcaDobras) - F.dobras) * 0.1;
  F.torcao += ((0.01 + somVivo.agudos * 0.10) - F.torcao) * 0.1;
  F.nDobras += ((8 + somVivo.medios * 10) - F.nDobras) * 0.02;

  const desvioCor = (somVivo.brilho - 0.5) * PARAM.forcaCor + Math.sin(t * 0.07) * 12;
  const invasao = somVivo.volume * 0.2;
  let distCor = PARAM.corBorda - PARAM.corCentro;
  if (distCor < 0) distCor += 360;
  const pulso = audio.paused ? 0 : somVivo.volume * 2.2 + 0.25 * (0.5 + 0.5 * Math.sin(t * 3));

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, largura, altura);

  const cx = largura / 2, cy = altura / 2;
  const escala = Math.min(largura, altura) * PARAM.tamanho / (1 + maiorMarca * 0.6) *
                 (1 + somVivo.graves * 0.05);

  const rotY = t * PARAM.rotacao;
  const rotX = 0.3 + Math.sin(t * 0.1) * 0.2;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const comEspetro = espetro && !audio.paused;
  const e = 0.03;

  for (let i = 0; i < N; i++) {
    const p = pontos[i];

    const vivo = forma(p.x, p.y, p.z, p.angulo);
    let desloc = marcaBase[i] + destaque[i] * pulso * 0.5 + vivo;
    if (comEspetro) desloc += (espetro[1 + Math.floor(p.faixa * 159)] / 255) * PARAM.forcaEspetro;
    const d = 1 + desloc;

    const inclinacao = (forma(p.x, p.y + e, p.z, p.angulo) - vivo) / e;

    const x = p.x * d, y = p.y * d, z = p.z * d;
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    const nx = p.x * cosY - p.z * sinY;
    const nz1 = p.x * sinY + p.z * cosY;
    const ny = p.y * cosX - nz1 * sinX;
    const nz = p.y * sinX + nz1 * cosX;
    const difusa = Math.max(0, nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2]);
    let luz = (0.55 + 0.6 * difusa) * (1 - inclinacao * 0.25);
    luz = Math.max(0.3, Math.min(1.25, luz));

    const persp = DISTANCIA / (DISTANCIA - z2);
    ecraX[i] = cx + x1 * escala * persp;
    ecraY[i] = cy - y2 * escala * persp;
    profundidade[i] = z2;

    const brilhoMarca = 1 + destaque[i] * pulso * 2;
    const frente = Math.max(0, (z2 + 1.2) / 2.4);
    alfas[i] = Math.min(1, luz * (0.1 + 0.9 * frente * frente) * (1 + somVivo.volume * 0.4) * brilhoMarca);
    tamanhos[i] = (0.6 + frente * 1.7) * persp * PARAM.tamanhoPonto * (1 + destaque[i] * pulso);

    let borda = 1 - Math.abs(nz);
    borda = Math.pow(Math.min(1, borda * 1.45), 1.1) + desloc * 1.8 + invasao;
    borda = Math.max(0, Math.min(1, borda));
    const matiz = PARAM.corCentro + borda * distCor + desvioCor;
    matizes[i] = ((Math.round(matiz) % 360) + 360) % 360;
  }

  for (let passo = 0; passo < 2; passo++) {
    for (let i = 0; i < N; i++) {
      if ((profundidade[i] >= 0) !== (passo === 1)) continue;
      ctx.fillStyle = paleta[matizes[i]];
      ctx.globalAlpha = alfas[i];
      ctx.beginPath();
      ctx.arc(ecraX[i], ecraY[i], tamanhos[i] * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(desenhar);
}

requestAnimationFrame(desenhar);
