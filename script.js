/* =====================================================================
   SOUNDS OF BARCELONA — script.js  (a esfera)
   Um arquivo coletivo dos sons de Barcelona.
   O topo e os lados da esfera são Barcelona, com o relevo real.
   Cada som deixa uma marca redonda no sítio onde foi gravado;
   quando toca, a zona dele ondula com o som.
   Precisa do comum.js (carregado antes, no index.html).
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. LISTA DE SONS — fica vazia: os sons vêm do Supabase
   --------------------------------------------------------------------- */
const SONS = [];

/* ---------------------------------------------------------------------
   2. PARÂMETROS (podes mexer nestes números)
   --------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------
   3. TELA
   --------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------
   4. A ESFERA: Barcelona no topo, o resto em pontos ténues
   Cada ponto do topo corresponde a um sítio da cidade (lat, lon).
   --------------------------------------------------------------------- */
const pontos = [];
const ouro = Math.PI * (3 - Math.sqrt(5));
// Topo (cidade): pontos espalhados por igual no disco
for (let i = 0; i < PARAM.pontosCidade; i++) {
  const y = 1 - ((i + 0.5) / PARAM.pontosCidade) * (1 - CAP);
  const r = Math.sqrt(1 - y * y), th = ouro * i;
  const x = r * Math.cos(th), z = r * Math.sin(th);
  const d = esferaParaDisco(x, y, z);
  pontos.push({ x, y, z, cidade: true, X: d.X, Y: d.Y, s: d.s });
}
// Resto da esfera
for (let i = 0; i < PARAM.pontosEsfera; i++) {
  const y = CAP - ((i + 0.5) / PARAM.pontosEsfera) * (1 + CAP);
  const r = Math.sqrt(1 - y * y), th = ouro * i;
  pontos.push({ x: r * Math.cos(th), y, z: r * Math.sin(th), cidade: false, X: 0, Y: 0, s: 2 });
}

const N = pontos.length;
const terreno   = new Float32Array(N);  // altura da cidade (metros)
const ehMar     = new Uint8Array(N);    // 1 = mar
const marcaBase = new Float32Array(N);  // relevo de todas as marcas
const zona      = new Float32Array(N);  // 0-1: zona do som que está a tocar
const distZona  = new Float32Array(N);  // distância ao centro dessa zona
const ecraX = new Float32Array(N), ecraY = new Float32Array(N), profundidade = new Float32Array(N);
let relevoCarregado = false;

/* ---------------------------------------------------------------------
   5. O RELEVO REAL DE BARCELONA
   Terrain Tiles (AWS / Mapzen): imagens em que a cor de cada pixel
   guarda a altura. Altura (m) = (vermelho * 256 + verde + azul / 256) - 32768
   O mar tem altura 0 ou negativa.
   --------------------------------------------------------------------- */
const TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/";
const ZOOM = 12;
let alturaEm = () => 0;   // função (lat, lon) -> metros; fica pronta depois de carregar

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

// Passa as alturas para os pontos da cidade
function aplicarRelevo(funcao) {
  alturaEm = funcao;
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

// Relevo APROXIMADO (desenhado à mão): aparece logo ao abrir o site e
// fica se o relevo real não carregar. Linha de costa, planície a subir
// até Collserola (Tibidabo, 512 m), Montjuïc e os turons.
const COSTA = [ // [latitude, longitude da linha de costa]
  [41.30, 2.130], [41.33, 2.160], [41.355, 2.172], [41.372, 2.180], [41.380, 2.192],
  [41.392, 2.206], [41.405, 2.218], [41.420, 2.236], [41.45, 2.262], [41.50, 2.300],
];
function lonDaCosta(lat) {
  if (lat <= COSTA[0][0]) return COSTA[0][1];
  for (let k = 1; k < COSTA.length; k++) {
    if (lat <= COSTA[k][0]) {
      const [la0, lo0] = COSTA[k - 1], [la1, lo1] = COSTA[k];
      return lo0 + ((lat - la0) / (la1 - la0)) * (lo1 - lo0);
    }
  }
  return COSTA[COSTA.length - 1][1];
}
function degrau(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function colina(lat, lon, cLat, cLon, alturaM, raioKm) {
  const dx = (lon - cLon) * 83.3, dy = (lat - cLat) * 111;
  return alturaM * Math.exp(-(dx * dx + dy * dy) / (raioKm * raioKm));
}
function relevoAproximado(lat, lon) {
  const d = (lonDaCosta(lat) - lon) * 83.3 * 0.85;   // km até ao mar
  if (d <= 0) return 0;                               // mar
  let h = 6 * d                                        // a planície sobe devagar
        + 430 * degrau(4.5, 7.5, d)                    // a serra de Collserola
        - 330 * degrau(8.5, 11.5, d);                  // e o outro lado da serra
  h += colina(lat, lon, 41.364, 2.159, 150, 0.9);     // Montjuïc
  h += colina(lat, lon, 41.419, 2.162, 160, 0.45);    // Turó de la Rovira
  h += colina(lat, lon, 41.415, 2.147, 120, 0.4);     // Park Güell / El Carmel
  h += colina(lat, lon, 41.422, 2.119, 70, 0.8);      // Tibidabo
  h += 14 * Math.sin(lat * 900) * Math.sin(lon * 700); // pequenas ondulações
  return Math.max(1, h);
}
// Relevo REAL (Terrain Tiles): quando chega, substitui o aproximado
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
  aplicarRelevo((lat, lon) => {
    const px = Math.floor((lonParaTile(lon) - x0) * 256), py = Math.floor((latParaTile(lat) - y0) * 256);
    if (px < 0 || py < 0 || px >= c.width || py >= c.height) return 0;
    const i = (py * c.width + px) * 4;
    return dados[i] * 256 + dados[i + 1] + dados[i + 2] / 256 - 32768;
  });
  console.log("Relevo real carregado.");
}

// Altura do terreno (em unidades da esfera) num ponto do disco
function terrenoNoDisco(X, Y) {
  if (!relevoCarregado) return 0;
  const geo = discoParaGeo(X, Y);
  return (Math.max(0, alturaEm(geo.lat, geo.lon)) / 512) * PARAM.exagero;
}

/* ---------------------------------------------------------------------
   6. AS MARCAS DOS SONS (redondas)
   Cada som deixa uma lomba redonda no sítio onde foi gravado:
     g = graves -> marca mais larga
     v = volume -> marca mais alta
     a = agudos -> pequenas lombas à volta
   --------------------------------------------------------------------- */
// Relevo de todas as marcas num ponto da cidade
function marcasAqui(X, Y) { return marcasNoDisco(marcas, X, Y, PARAM.forcaMarcas); }

const marcas = [];        // pela mesma ordem que SONS
const alturaCentro = [];  // altura no centro de cada marca (para os marcadores)

function recalcularMarcas() {
  for (let i = 0; i < N; i++) {
    const p = pontos[i];
    marcaBase[i] = p.cidade ? marcasAqui(p.X, p.Y) * bordaSuave(p.s) : 0;
  }
  for (let k = 0; k < marcas.length; k++) {
    const M = marcas[k];
    alturaCentro[k] = M ? terrenoNoDisco(M.X, M.Y) + marcasAqui(M.X, M.Y) : 0;
  }
  alturaCentro.length = marcas.length;
  if (SONS.length) marcarDestaque(faixaAtual);
}

// A zona do som que está a tocar (o bairro à volta da marca)
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

// Liga o relevo: primeiro o aproximado (logo), depois o real (quando chegar)
aplicarRelevo(relevoAproximado);
carregarRelevo().catch(() => console.warn("Relevo real não carregou: fica o relevo aproximado."));


/* ---------------------------------------------------------------------
   9. TOCAR OS SONS
   --------------------------------------------------------------------- */
const botaoSom   = document.getElementById("botaoSom");
const textoDesc  = document.getElementById("descricao");
const textoRua   = document.getElementById("rua");
const textoAgora = document.getElementById("agora");

const audio = new Audio();
audio.preload = "auto";
audio.crossOrigin = "anonymous";   // para a esfera "ouvir" os sons do Supabase

let contextoAudio = null, analisador = null, volumeSaida = null, espetro = null;
let somLigado = false;
let jaOuviu = false;    // já ligou o som pelo menos uma vez?
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
  jaOuviu = true;
  prepararAudio();
  contextoAudio.resume();
  somLigado = true;
  volumeSuave(1);
  botaoSom.textContent = "● SOUND ON";
  botaoSom.classList.add("ligado");
  if (!audio.src) tocarFaixa(0);
  else audio.play().catch(() => {});
}

function desligarSom() {
  somLigado = false;
  if (volumeSaida) volumeSuave(0);
  botaoSom.textContent = "○ SOUND OFF";
  botaoSom.classList.remove("ligado");
}

botaoSom.addEventListener("click", (e) => {
  e.stopPropagation();
  somLigado ? desligarSom() : ligarSom();
});

/* Clicar na esfera:
   - em cima de uma marca: toca esse som
   - noutro sítio: liga o som (os navegadores só deixam tocar depois de um clique) */

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
    if (!somLigado) { somLigado = true; jaOuviu = true; contextoAudio.resume(); volumeSuave(1);
      botaoSom.textContent = "\u25CF SOUND ON"; botaoSom.classList.add("ligado"); }
    falhasSeguidas = 0;
    tocarFaixa(i);
  } else if (!somLigado) {
    ligarSom();
  }
});
// Clicar em qualquer sítio da página (fora dos botões) também liga o som.
// Os browsers não deixam tocar som antes do primeiro clique: é uma regra deles.
document.addEventListener("click", (e) => {
  if (somLigado || jaOuviu) return;
  if (e.target.closest("button, a, label, input, .painel")) return;
  ligarSom();
});
tela.addEventListener("mousemove", (e) => {
  tela.classList.toggle("sobre-marca", marcaPerto(e.clientX, e.clientY) >= 0);
});

/* ---------------------------------------------------------------------
   10. CANTO INFERIOR ESQUERDO: descrição, rua · dia, coordenadas
   --------------------------------------------------------------------- */
const coord = { lat: 0, lon: 0, alvoLat: 0, alvoLon: 0, ativa: false };

function formatar(lat, lon) {
  const la = Math.abs(lat).toFixed(5) + "° " + (lat >= 0 ? "N" : "S");
  const lo = Math.abs(lon).toFixed(5) + "° " + (lon >= 0 ? "E" : "W");
  return la + " " + lo;
}

let temporizadorInfo = null;
function mostrarInfo(s) {
  if (!coord.ativa) { coord.lat = s.lat; coord.lon = s.lon; }
  coord.alvoLat = s.lat;
  coord.alvoLon = s.lon;
  coord.ativa = true;
  const linhaRua = [s.rua, formatarData(s.data)].filter(Boolean).join("  ·  ");
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
  textoAgora.textContent = "NO SOUNDS YET — ADD YOURS";
}
semSons();

/* ---------------------------------------------------------------------
   11. CARREGAR O ARQUIVO (todos os sons guardados no Supabase)
   --------------------------------------------------------------------- */
async function carregarSonsGuardados() {
  const lista = await lerArquivo();
  const estavaVazio = SONS.length === 0;
  const semAssinatura = [];
  for (const som of lista) {
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

  // Sons antigos sem impressão digital: analisa-os agora, um a um
  for (const som of semAssinatura) {
    try {
      som.assinatura = await analisarSom(som.ficheiro);
      const i = SONS.indexOf(som);
      if (i >= 0) { marcas[i] = prepararMarca(som); recalcularMarcas(); if (i === faixaAtual) marcarDestaque(i); }
    } catch (erro) { console.warn("Não deu para analisar:", som.ficheiro); }
  }
}
carregarSonsGuardados();

/* ---------------------------------------------------------------------
   12. ADICIONAR UM SOM (gravação, sítio, dia, descrição)
   --------------------------------------------------------------------- */
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

function abrirPainel() {
  document.getElementById("painelAbout").hidden = true;
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

// O botão ADD só fica ativo com tudo preenchido
function verificarPronto() {
  botaoConfirmar.disabled = !(novoFicheiro && novoLocal && dataValida() && campoDescricao.value.trim());
}

function aProcurar(sim) {
  botaoProcurar.disabled = sim;
  botaoGPS.disabled = sim;
  botaoProcurar.textContent = sim ? "…" : "FIND";
}

function lerCoordenadas(texto) {
  const m = texto.match(/(-?\d{1,2}\.\d+)[,;\s]+(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
}

function aceitar(lat, lon, rua) {
  novoLocal = { lat, lon, rua };
  const titulo = rua ? rua.toUpperCase() + " — " : "";
  mostrarMensagem("✓ " + titulo + formatar(lat, lon), "ok");
  verificarPronto();
}

function recusar(texto) {
  novoLocal = null;
  mostrarMensagem("✗ " + texto, "erro");
  verificarPronto();
}

async function validarCoordenadas(lat, lon) {
  aProcurar(true);
  mostrarMensagem("LOOKING UP THE STREET…", "");
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
  mostrarMensagem("SEARCHING…", "");
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
    mostrarMensagem("✗ THIS FILE IS NOT AUDIO (USE MP3, WAV, M4A...)", "erro");
  } else if (f.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
    nomeFicheiro.textContent = "NO FILE CHOSEN";
    mostrarMensagem("✗ FILE TOO BIG (MAX " + TAMANHO_MAXIMO_MB + " MB)", "erro");
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
  mostrarMensagem("LOCATING…", "");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      campoLocal.value = "";
      validarCoordenadas(+pos.coords.latitude.toFixed(5), +pos.coords.longitude.toFixed(5));
    },
    () => recusar("LOCATION NOT AVAILABLE — WRITE THE STREET"),
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

// ADD: analisa o som, envia-o, deixa a marca na esfera e toca-o
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
  mostrarMensagem("LISTENING TO YOUR SOUND…", "");
  try {
    som.assinatura = await analisarSom(ficheiro);
  } catch (erro) {
    console.warn("Não deu para analisar:", erro.message || erro);
  }

  if (db) {
    mostrarMensagem("SENDING…", "");
    try {
      await enviarParaSupabase(ficheiro, som);
      mostrarMensagem("✓ SENT! YOUR SOUND IS NOW PART OF THE SPHERE.", "ok");
    } catch (erro) {
      console.warn("Supabase:", erro.message || erro);
      mostrarMensagem("✗ COULD NOT SAVE IT. IT WILL ONLY PLAY HERE.", "erro");
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

/* ---------------------------------------------------------------------
   13. LER O SOM AO VIVO
   --------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------
   14. DESENHAR A ESFERA
   --------------------------------------------------------------------- */
const DISTANCIA = 3.4;
const paleta = [];
for (let h = 0; h < 360; h++) paleta.push(`hsl(${h}, 100%, 60%)`);
const centrosEcra = [];   // onde está cada marca no ecrã (para os cliques)

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

  // A esfera inclinada para vermos o topo e os lados; oscila devagar
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

  // Primeiro os pontos de trás, depois os da frente
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
