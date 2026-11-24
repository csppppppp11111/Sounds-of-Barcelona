/* SOUNDS OF BARCELONA — script.js */

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

/* 2. PARÂMETROS DA BOLA */
const PARAM = {
  pontos: window.innerWidth < 700 ? 4500 : 9000,
  tamanho: 0.27,
  rotacao: 0.12,
  forcaDobras: 0.18,
  forcaEspetro: 0.10,
  corCentro: 262,
  corBorda: 28,
  forcaCor: 40,
  tamanhoPonto: 1.0,
};

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

/* 4. PONTOS DA ESFERA (em grelha) */
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

/* 5. A FORMA: ONDAS, DOBRAS E TORÇÃO */
function ruido(x, y, z, t) {
  return (
    Math.sin(x * 2.1 + t * 0.9) * Math.sin(y * 2.7 - t * 0.7) * Math.sin(z * 2.3 + t * 0.5) +
    0.5  * Math.sin(x * 4.3 - y * 3.1 + t * 1.3) * Math.sin(z * 3.7 + t * 0.8) +
    0.25 * Math.sin((x + z) * 6.1 + t * 1.7) * Math.sin(y * 5.3 - t * 1.1)
  ) / 1.75;
}

const F = { base: 0.05, dobras: 0.05, nDobras: 8, torcao: 0.02, t: 0 };

function forma(x, y, z, angulo) {
  const equador = 1 - y * y;
  const t = F.t;
  const organico = ruido(x, y, z, t * 0.6);
  const dobras = Math.sin(y * F.nDobras + Math.sin(angulo * 3 + t * 0.7) * 1.8 + t * 1.3);
  const torcao = Math.sin(angulo * 2 + y * 4 - t * 0.6);
  return organico * F.base + dobras * F.dobras * equador + torcao * F.torcao * equador;
}

/* 6. CORES */
const paleta = [];
for (let h = 0; h < 360; h++) paleta.push(`hsl(${h}, 100%, 62%)`);

/* 7. SOM */
const botaoSom = document.getElementById("botaoSom");
const textoAgora = document.getElementById("agora");
const textoRua = document.getElementById("rua");

const audio = new Audio();
audio.preload = "auto";
audio.crossOrigin = "anonymous";

let contextoAudio = null;
let analisador = null;
let volumeSaida = null;
let espetro = null;
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
  audio.src = SONS[faixaAtual].ficheiro;
  irPara(SONS[faixaAtual].lat, SONS[faixaAtual].lon, SONS[faixaAtual].rua);
  if (contextoAudio) audio.play().catch(() => {});
}

audio.addEventListener("ended", () => tocarFaixa(faixaAtual + 1));

audio.addEventListener("error", () => {
  if (audio.src.startsWith("blob:")) return;
  falhasSeguidas++;
  if (falhasSeguidas >= SONS.length) { semSons(); return; }
  tocarFaixa(faixaAtual + 1);
});
audio.addEventListener("playing", () => { falhasSeguidas = 0; });

function semSons() {
  if (typeof coord !== "undefined") coord.ativa = false;
  textoRua.textContent = "";
  textoAgora.textContent = "NO SOUNDS YET — ADD YOURS";
}

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

/* Coordenadas e rua no canto inferior esquerdo */
const coord = { lat: 0, lon: 0, alvoLat: 0, alvoLon: 0, ativa: false };

function irPara(lat, lon, rua) {
  if (!coord.ativa) { coord.lat = lat; coord.lon = lon; }
  coord.alvoLat = lat;
  coord.alvoLon = lon;
  coord.ativa = true;
  mostrarRua(rua || "");
}

let temporizadorRua = null;
function mostrarRua(rua) {
  if (textoRua.textContent === rua) return;
  clearTimeout(temporizadorRua);
  textoRua.style.opacity = 0;
  temporizadorRua = setTimeout(() => {
    textoRua.textContent = rua;
    textoRua.style.opacity = 1;
  }, 500);
}

function formatar(lat, lon) {
  const la = Math.abs(lat).toFixed(5) + "° " + (lat >= 0 ? "N" : "S");
  const lo = Math.abs(lon).toFixed(5) + "° " + (lon >= 0 ? "E" : "W");
  return la + "\u2003" + lo;
}

function atualizarCoordenadas() {
  if (!coord.ativa) return;
  coord.lat += (coord.alvoLat - coord.lat) * 0.05;
  coord.lon += (coord.alvoLon - coord.lon) * 0.05;
  const texto = formatar(coord.lat, coord.lon);
  if (textoAgora.textContent !== texto) textoAgora.textContent = texto;
}

if (SONS.length) irPara(SONS[0].lat, SONS[0].lon, SONS[0].rua); else semSons();

/* Sons guardados no Supabase */
async function carregarSonsGuardados() {
  if (!db) return;
  const { data, error } = await db
    .from("sons")
    .select("ficheiro, rua, lat, lon")
    .eq("aprovado", true)
    .order("criado", { ascending: true });
  if (error) { console.warn("Supabase:", error.message); return; }
  const estavaVazio = SONS.length === 0;
  for (const linha of data) {
    const url = db.storage.from("sons").getPublicUrl(linha.ficheiro).data.publicUrl;
    SONS.push({ ficheiro: url, rua: linha.rua, lat: linha.lat, lon: linha.lon });
  }
  if (estavaVazio && SONS.length) {
    falhasSeguidas = 0;
    irPara(SONS[0].lat, SONS[0].lon, SONS[0].rua);
    if (contextoAudio) tocarFaixa(0);
  }
}
carregarSonsGuardados();

/* 7b. ADICIONAR UM SOM */
const NOMINATIM = "https://nominatim.openstreetmap.org";
const BARCELONA = { latMin: 41.317, latMax: 41.469, lonMin: 2.052, lonMax: 2.229 };
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
  return
