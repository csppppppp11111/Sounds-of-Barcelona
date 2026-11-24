/* SOUNDS OF BARCELONA — script.js */

/* 1. LISTA DE SONS (os teus ficheiros da pasta "sons") */
const SONS = [
  { ficheiro: "sons/som1.mp3", rua: "La Rambla",              lat: 41.38090, lon: 2.17340 },
  { ficheiro: "sons/som2.mp3", rua: "Mercat de la Boqueria",  lat: 41.38180, lon: 2.17160 },
  { ficheiro: "sons/som3.mp3", rua: "Passeig de Joan de Borbó", lat: 41.37580, lon: 2.18930 },
  { ficheiro: "sons/som4.mp3", rua: "Carrer de Mallorca",     lat: 41.40360, lon: 2.17440 },
];

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

/* Sons aprovados guardados no Supabase */
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
const painel        = document.getElementById("painel");
const campoFicheiro = document.getElementById("campoFicheiro");
const nomeFicheiro  = document.getElementById("nomeFicheiro");
const campoLocal    = document.getElementById("campoLocal");
const botaoProcurar = document.getElementById("botaoProcurar");
const botaoGPS      = document.getElementById("botaoGPS");
const mensagem      = document.getElementById("mensagem");
const botaoConfirmar = document.getElementById("botaoConfirmar");
const botaoCancelar = document.getElementById("botaoCancelar");

let novoFicheiro = null;
let novoLocal = null;

function abrirPainel() {
  painel.hidden = false;
  botaoAdicionar.hidden = true;
  campoLocal.focus();
}

function fecharPainel() {
  painel.hidden = true;
  botaoAdicionar.hidden = false;
  campoFicheiro.value = "";
  campoLocal.value = "";
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

function verificarPronto() {
  botaoConfirmar.disabled = !(novoFicheiro && novoLocal);
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

botaoGPS.addEventListener("click", () => {
  if (!navigator.geolocation) {
    recusar("THIS BROWSER CANNOT GIVE YOUR LOCATION");
    return;
  }
  mostrarMensagem("LOCATING\u2026", "");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = +pos.coords.latitude.toFixed(5);
      const lon = +pos.coords.longitude.toFixed(5);
      campoLocal.value = "";
      validarCoordenadas(lat, lon);
    },
    () => recusar("LOCATION NOT AVAILABLE \u2014 WRITE THE STREET"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

async function enviarParaSupabase(ficheiro, local) {
  const ext = (ficheiro.name.split(".").pop() || "m4a").toLowerCase().replace(/[^a-z0-9]/g, "");
  const caminho = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const envio = await db.storage.from("sons").upload(caminho, ficheiro, {
    contentType: ficheiro.type || "audio/mpeg",
    upsert: false,
  });
  if (envio.error) throw envio.error;
  const linha = await db.from("sons").insert({
    ficheiro: caminho,
    rua: (local.rua || "").slice(0, 120),
    lat: local.lat,
    lon: local.lon,
  });
  if (linha.error) throw linha.error;
}

botaoConfirmar.addEventListener("click", async () => {
  if (!novoFicheiro || !novoLocal) return;
  const ficheiro = novoFicheiro;
  const local = novoLocal;

  if (db) {
    botaoConfirmar.disabled = true;
    botaoCancelar.disabled = true;
    mostrarMensagem("SENDING\u2026", "");
    try {
      await enviarParaSupabase(ficheiro, local);
      mostrarMensagem("\u2713 SENT! IT WILL PLAY FOR EVERYONE ONCE APPROVED.", "ok");
    } catch (erro) {
      console.warn("Supabase:", erro.message || erro);
      mostrarMensagem("\u2717 COULD NOT SAVE IT. IT WILL ONLY PLAY HERE.", "erro");
    }
    botaoCancelar.disabled = false;
    await new Promise((r) => setTimeout(r, 2500));
  }

  const novo = {
    ficheiro: URL.createObjectURL(ficheiro),
    lat: local.lat,
    lon: local.lon,
    rua: local.rua,
  };
  const posicao = SONS.length ? faixaAtual + 1 : 0;
  SONS.splice(posicao, 0, novo);
  falhasSeguidas = 0;
  fecharPainel();
  prepararAudio();
  if (!somLigado) ligarSom();
  tocarFaixa(posicao);
});

/* 8. LER O SOM */
const som = { graves: 0, medios: 0, agudos: 0, volume: 0, brilho: 0.5 };

function media(inicio, fim) {
  let soma = 0;
  for (let i = inicio; i < fim; i++) soma += espetro[i];
  return soma / ((fim - inicio) * 255);
}

function lerSom(t) {
  let g, m, a, v, b;
  if (analisador && !audio.paused) {
    analisador.getByteFrequencyData(espetro);
    g = media(1, 8);
    m = media(8, 48);
    a = media(48, 160);
    v = media(1, 160);
    let soma = 0, pesada = 0;
    for (let i = 1; i < 160; i++) { soma += espetro[i]; pesada += espetro[i] * i; }
    b = soma > 0 ? pesada / soma / 100 : 0.5;
  } else {
    g = 0.08 + 0.05 * Math.sin(t * 0.8);
    m = 0.05; a = 0.03; v = 0.1; b = 0.5;
  }
  som.graves += (g - som.graves) * 0.15;
  som.medios += (m - som.medios) * 0.15;
  som.agudos += (a - som.agudos) * 0.15;
  som.volume += (v - som.volume) * 0.15;
  som.brilho += (Math.min(b, 1) - som.brilho) * 0.05;
}

/* 9. DESENHAR A BOLA */
const DISTANCIA = 3.2;
const LUZ = (() => { const l = [-0.45, 0.55, 0.7]; const n = Math.hypot(...l); return l.map(v => v / n); })();

function desenhar(tempoMs) {
  const t = tempoMs / 1000;
  lerSom(t);
  atualizarCoordenadas();

  F.t = t;
  F.base   += ((0.04 + som.volume * 0.10) - F.base) * 0.1;
  F.dobras += ((0.03 + som.graves * PARAM.forcaDobras) - F.dobras) * 0.1;
  F.torcao += ((0.015 + som.agudos * 0.12) - F.torcao) * 0.1;
  F.nDobras += ((8 + som.medios * 10) - F.nDobras) * 0.02;

  const desvioCor = (som.brilho - 0.5) * PARAM.forcaCor + Math.sin(t * 0.07) * 12;
  const invasao = som.volume * 0.25;
  let distCor = PARAM.corBorda - PARAM.corCentro;
  if (distCor < 0) distCor += 360;

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, largura, altura);

  const cx = largura / 2;
  const cy = altura / 2;
  const escala = Math.min(largura, altura) * PARAM.tamanho * (1 + som.graves * 0.06);

  const rotY = t * PARAM.rotacao;
  const rotX = 0.3 + Math.sin(t * 0.1) * 0.2;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const comEspetro = espetro && !audio.paused;
  const e = 0.03;

  for (let i = 0; i < N; i++) {
    const p = pontos[i];

    const base = forma(p.x, p.y, p.z, p.angulo);
    let desloc = base;
    if (comEspetro) desloc += (espetro[1 + Math.floor(p.faixa * 159)] / 255) * PARAM.forcaEspetro;
    const d = 1 + desloc;

    const inclinacao = (forma(p.x, p.y + e, p.z, p.angulo) - base) / e;

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

    const frente = Math.max(0, (z2 + 1.2) / 2.4);
    alfas[i] = Math.min(1, luz * (0.1 + 0.9 * frente * frente) * (1 + som.volume * 0.4));
    tamanhos[i] = (0.6 + frente * 1.7) * persp * PARAM.tamanhoPonto;

    let borda = 1 - Math.abs(nz);
    borda = Math.pow(Math.min(1, borda * 1.45), 1.1) + desloc * 1.8 + invasao;
    borda = Math.max(0, Math.min(1, borda));
    let matiz = PARAM.corCentro + borda * distCor + desvioCor;
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
