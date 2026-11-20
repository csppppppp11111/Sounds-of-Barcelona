/* =====================================================================
   SOUNDS OF BARCELONA — script.js
   Uma bola feita de pontos que se deforma e muda de cor com o som.
   Sem bibliotecas: só canvas 2D e Web Audio API (já vêm no navegador).
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. LISTA DE SONS
   Põe os teus ficheiros na pasta "sons/" e escreve-os aqui, com a rua
   e as coordenadas do sítio onde gravaste.
   A rua e as coordenadas aparecem no canto inferior esquerdo e mudam
   suavemente de uma gravação para a seguinte.
   Os sons tocam por esta ordem, em ciclo.

   DICA: para saberes as coordenadas de uma rua, abre o site, carrega em
   "+ ADD YOUR SOUND", escreve a rua e carrega em FIND — aparecem logo.

   ATENÇÃO: os valores abaixo são EXEMPLOS — troca-os pelos teus.
   --------------------------------------------------------------------- */
const SONS = [
  { ficheiro: "sons/som1.mp3", rua: "La Rambla",              lat: 41.38090, lon: 2.17340 },
  { ficheiro: "sons/som2.mp3", rua: "Mercat de la Boqueria",  lat: 41.38180, lon: 2.17160 },
  { ficheiro: "sons/som3.mp3", rua: "Passeig de Joan de Borbó", lat: 41.37580, lon: 2.18930 },
  { ficheiro: "sons/som4.mp3", rua: "Carrer de Mallorca",     lat: 41.40360, lon: 2.17440 },
];


/* ---------------------------------------------------------------------
   2. PARÂMETROS DA BOLA (podes mexer nestes números)
   --------------------------------------------------------------------- */
const PARAM = {
  pontos: window.innerWidth < 700 ? 4500 : 9000, // menos pontos no telemóvel
  tamanho: 0.27,        // raio da bola em relação ao lado menor do ecrã
  rotacao: 0.12,        // velocidade de rotação
  forcaDobras: 0.18,    // quanto os graves fazem crescer as dobras
  forcaEspetro: 0.10,   // quanto cada frequência empurra os seus pontos
  corCentro: 262,       // cor da parte virada para nós (0–360): violeta
  corBorda: 28,         // cor das bordas e das cristas: laranja dourado
  forcaCor: 40,         // quanto o som faz mudar as cores
  tamanhoPonto: 1.0,    // tamanho dos pontos (1 = normal)
};


/* ---------------------------------------------------------------------
   3. PREPARAR A TELA
   --------------------------------------------------------------------- */
const tela = document.getElementById("tela");
const ctx = tela.getContext("2d");
let largura, altura, dpr;

function ajustarTela() {
  dpr = Math.min(window.devicePixelRatio || 1, 2); // ecrãs retina, com limite
  largura = window.innerWidth;
  altura = window.innerHeight;
  tela.width = largura * dpr;
  tela.height = altura * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", ajustarTela);
ajustarTela();


/* ---------------------------------------------------------------------
   4. CRIAR OS PONTOS DA ESFERA
   Os pontos ficam em GRELHA: linhas (paralelos) de cima a baixo e,
   em cada linha, pontos à mesma distância uns dos outros. É isto que
   dá as "riscas" de pontos que se veem nas dobras.
   --------------------------------------------------------------------- */
const pontos = [];
const LINHAS = Math.round(Math.sqrt(PARAM.pontos / 1.27));   // nº de paralelos

for (let l = 0; l < LINHAS; l++) {
  const lat = Math.PI * ((l + 0.5) / LINHAS - 0.5);   // de -90° a +90°
  const y = Math.sin(lat);
  const raio = Math.cos(lat);
  // linhas maiores (perto do equador) levam mais pontos
  const naLinha = Math.max(6, Math.round(LINHAS * 2 * raio));
  for (let k = 0; k < naLinha; k++) {
    const angulo = (k / naLinha) * Math.PI * 2;
    const x = Math.cos(angulo) * raio;
    const z = Math.sin(angulo) * raio;

    // Cada ponto "ouve" uma frequência: em cima os agudos, em baixo os graves
    const latitude = (1 - y) / 2;
    const mistura = (Math.sin(angulo * 3) + 1) * 0.08;
    const faixa = Math.min(0.99, Math.abs(1 - latitude - mistura));

    pontos.push({ x, y, z, angulo, faixa });
  }
}

// Tabelas para guardar os pontos já calculados em cada fotograma
const N = pontos.length;
const ecraX = new Float32Array(N), ecraY = new Float32Array(N);
const tamanhos = new Float32Array(N), alfas = new Float32Array(N);
const matizes = new Uint16Array(N), profundidade = new Float32Array(N);


/* ---------------------------------------------------------------------
   5. A FORMA: ONDAS, DOBRAS E TORÇÃO
   Três camadas somadas, cada uma comandada por uma parte do som:
     - ondas orgânicas  -> volume geral
     - dobras (como tecido, mais fortes no "equador") -> graves
     - torção (ondas na diagonal) -> agudos
   O número de dobras muda com os médios, por isso a forma muda
   de música para música.
   --------------------------------------------------------------------- */
function ruido(x, y, z, t) {
  return (
    Math.sin(x * 2.1 + t * 0.9) * Math.sin(y * 2.7 - t * 0.7) * Math.sin(z * 2.3 + t * 0.5) +
    0.5  * Math.sin(x * 4.3 - y * 3.1 + t * 1.3) * Math.sin(z * 3.7 + t * 0.8) +
    0.25 * Math.sin((x + z) * 6.1 + t * 1.7) * Math.sin(y * 5.3 - t * 1.1)
  ) / 1.75;
}

// Valores da forma, atualizados em cada fotograma (ver desenhar)
const F = { base: 0.05, dobras: 0.05, nDobras: 8, torcao: 0.02, t: 0 };

function forma(x, y, z, angulo) {
  const equador = 1 - y * y;               // 1 no meio, 0 nos polos
  const t = F.t;
  const organico = ruido(x, y, z, t * 0.6);
  const dobras = Math.sin(y * F.nDobras + Math.sin(angulo * 3 + t * 0.7) * 1.8 + t * 1.3);
  const torcao = Math.sin(angulo * 2 + y * 4 - t * 0.6);
  return organico * F.base + dobras * F.dobras * equador + torcao * F.torcao * equador;
}


/* ---------------------------------------------------------------------
   6. PALETA DE CORES
   Guardamos as 360 cores do círculo cromático de antemão.
   A bola usa duas: violeta no centro e laranja nas bordas
   (passando pelo rosa e o vermelho), como na referência.
   --------------------------------------------------------------------- */
const paleta = [];
for (let h = 0; h < 360; h++) paleta.push(`hsl(${h}, 100%, 62%)`);


/* ---------------------------------------------------------------------
   7. SOM (Web Audio API)
   O "analisador" diz-nos, 60 vezes por segundo, quanta energia
   há em cada frequência (dos graves aos agudos).
   --------------------------------------------------------------------- */
const botaoSom = document.getElementById("botaoSom");
const textoAgora = document.getElementById("agora");   // coordenadas
const textoRua = document.getElementById("rua");       // nome da rua

const audio = new Audio();
audio.preload = "auto";

let contextoAudio = null;
let analisador = null;
let volumeSaida = null;      // controla se se ouve ou não (1 = som, 0 = silêncio)
let espetro = null;          // energia de cada frequência (0–255)
let somLigado = false;
let faixaAtual = 0;
let falhasSeguidas = 0;

// Liga o áudio ao analisador (só se pode fazer depois de um clique ou toque)
function prepararAudio() {
  if (contextoAudio) return;
  contextoAudio = new (window.AudioContext || window.webkitAudioContext)();
  const fonte = contextoAudio.createMediaElementSource(audio);
  analisador = contextoAudio.createAnalyser();
  analisador.fftSize = 512;                 // 256 faixas de frequência
  analisador.smoothingTimeConstant = 0.8;   // suaviza os saltos
  volumeSaida = contextoAudio.createGain();
  // som -> analisador (a bola "ouve") -> volume (nós ouvimos ou não) -> colunas
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
  if (contextoAudio) audio.play().catch(() => {});  // toca mesmo em silêncio
}

// Quando um som acaba, passa ao seguinte
audio.addEventListener("ended", () => tocarFaixa(faixaAtual + 1));

// Se um ficheiro não existir, salta para o seguinte
audio.addEventListener("error", () => {
  if (audio.src.startsWith("blob:")) return;  // erro num ficheiro largado: ignora
  falhasSeguidas++;
  if (falhasSeguidas >= SONS.length) { semSons(); return; }
  tocarFaixa(faixaAtual + 1);
});
audio.addEventListener("playing", () => { falhasSeguidas = 0; });

function semSons() {
  if (typeof coord !== "undefined") coord.ativa = false;  // não tapar o aviso
  textoRua.textContent = "";
  textoAgora.textContent = "NO SOUNDS YET — ADD YOURS";
}

// Muda o volume devagar (0,3 s) para não dar um estalo
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
  botaoSom.textContent = "\u25CF SOUND ON";      // ● bolinha cheia
  botaoSom.classList.add("ligado");
  if (!audio.src) tocarFaixa(0);
  else audio.play().catch(() => {});
}

// Desligar = silêncio. Os sons continuam a passar (e as coordenadas a
// mudar), por isso a bola continua a mexer-se, só que não se ouve.
function desligarSom() {
  somLigado = false;
  if (volumeSaida) volumeSuave(0);
  botaoSom.textContent = "\u25CB SOUND OFF";     // ○ bolinha vazia
  botaoSom.classList.remove("ligado");
}

botaoSom.addEventListener("click", (e) => {
  e.stopPropagation();
  somLigado ? desligarSom() : ligarSom();
});

// Os navegadores não deixam tocar som antes de a pessoa interagir.
// Por isso, o primeiro clique/toque/tecla em qualquer sítio liga o som.
function primeiraInteracao(e) {
  // Se o primeiro clique for no botão do som, é o botão que decide.
  // Cliques no "+ ADD YOUR SOUND" e no painel também não ligam o som.
  const t = e.target;
  if (t.closest && t.closest("#painel, #botaoAdicionar")) return; // espera
  if (t !== botaoSom && !somLigado) ligarSom();
  window.removeEventListener("pointerdown", primeiraInteracao);
  window.removeEventListener("keydown", primeiraInteracao);
}
window.addEventListener("pointerdown", primeiraInteracao);
window.addEventListener("keydown", primeiraInteracao);

/* Coordenadas no canto inferior esquerdo.
   "mostrada" é o que está escrito agora; "alvo" é para onde vai.
   Em cada fotograma, os números aproximam-se do alvo (efeito contador). */
const coord = { lat: 0, lon: 0, alvoLat: 0, alvoLon: 0, ativa: false };

function irPara(lat, lon, rua) {
  if (!coord.ativa) { coord.lat = lat; coord.lon = lon; }  // a 1.ª aparece logo
  coord.alvoLat = lat;
  coord.alvoLon = lon;
  coord.ativa = true;
  mostrarRua(rua || "");
}

// Troca o nome da rua com um fade: apaga, muda o texto, volta a acender
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

// 41.38090° N   2.17340° E  (sul e oeste ficam com S e W)
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

// Mostra já a rua e as coordenadas da primeira gravação
if (SONS.length) irPara(SONS[0].lat, SONS[0].lon, SONS[0].rua); else semSons();

/* ---------------------------------------------------------------------
   7b. ADICIONAR UM SOM (botão "+ ADD YOUR SOUND")
   A pessoa escolhe uma gravação e diz onde a gravou.
   Só é aceite se o sítio ficar dentro de Barcelona.
   --------------------------------------------------------------------- */

/* Para encontrar ruas usamos o OpenStreetMap (serviço "Nominatim"):
   é gratuito e não precisa de conta. Regras de uso: no máximo
   1 pedido por segundo e mostrar o crédito (está no painel).

   Para saber se é Barcelona, o OpenStreetMap diz-nos a cidade de cada
   morada. Só se não houver internet é que usamos um retângulo
   aproximado à volta da cidade. */
const NOMINATIM = "https://nominatim.openstreetmap.org";
const BARCELONA = { latMin: 41.317, latMax: 41.469, lonMin: 2.052, lonMax: 2.229 };
const TAMANHO_MAXIMO_MB = 30;

function dentroDoRetangulo(lat, lon) {
  return lat >= BARCELONA.latMin && lat <= BARCELONA.latMax &&
         lon >= BARCELONA.lonMin && lon <= BARCELONA.lonMax;
}

// A morada do OpenStreetMap diz que é em Barcelona?
function eBarcelona(morada) {
  if (!morada) return false;
  const cidade = (morada.city || morada.town || morada.municipality || morada.village || "").toLowerCase();
  return cidade === "barcelona";
}

// Nome curto da rua a partir da morada (ex.: "Carrer de Mallorca 401")
function nomeDaRua(morada, alternativa) {
  if (!morada) return alternativa || "";
  const rua = morada.road || morada.pedestrian || morada.footway || morada.square ||
              morada.place || morada.neighbourhood || morada.suburb || alternativa || "";
  return morada.house_number ? rua + " " + morada.house_number : rua;
}

// Espera para nunca fazer mais de 1 pedido por segundo
let ultimoPedido = 0;
async function esperarVez() {
  const falta = 1100 - (Date.now() - ultimoPedido);
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  ultimoPedido = Date.now();
}

// Rua -> coordenadas. Devolve { lat, lon, rua } ou null se não encontrar.
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

// Coordenadas -> rua. Devolve { rua, barcelona }.
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

let novoFicheiro = null;   // a gravação escolhida
let novoLocal = null;      // { lat, lon, rua } já confirmado em Barcelona

function abrirPainel() {
  painel.hidden = false;
  botaoAdicionar.hidden = true;
  campoLocal.focus();
}

function fecharPainel() {
  painel.hidden = true;
  botaoAdicionar.hidden = false;
  // limpa tudo para a próxima vez
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
  mensagem.className = "mensagem " + tipo;    // "ok" (verde) ou "erro" (vermelho)
}

// O botão ADD só fica ativo quando há ficheiro E localização válida
function verificarPronto() {
  botaoConfirmar.disabled = !(novoFicheiro && novoLocal);
}

// Enquanto procura, os botões ficam bloqueados
function aProcurar(sim) {
  botaoProcurar.disabled = sim;
  botaoGPS.disabled = sim;
  botaoProcurar.textContent = sim ? "\u2026" : "FIND";
}

// Se alguém escrever coordenadas em vez da rua, também aceitamos
// ("41.3809, 2.1734" ou um link do Google Maps com "@41.3809,2.1734").
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

// Temos coordenadas (do GPS ou escritas): descobrir a rua e se é Barcelona
async function validarCoordenadas(lat, lon) {
  aProcurar(true);
  mostrarMensagem("LOOKING UP THE STREET\u2026", "");
  try {
    const r = await ruaDasCoordenadas(lat, lon);
    if (r.barcelona) aceitar(lat, lon, r.rua);
    else recusar("THIS PLACE IS OUTSIDE BARCELONA. ONLY SOUNDS OF BARCELONA.");
  } catch (erro) {
    // Sem internet: usa o retângulo aproximado e fica sem nome de rua
    if (dentroDoRetangulo(lat, lon)) aceitar(lat, lon, "");
    else recusar("THIS PLACE IS OUTSIDE BARCELONA. ONLY SOUNDS OF BARCELONA.");
  }
  aProcurar(false);
}

// Botão FIND (ou tecla Enter no campo)
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

// 1. Escolher o ficheiro
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

// 2a. Escrever a rua: procura ao carregar em FIND ou Enter
botaoProcurar.addEventListener("click", procurar);
campoLocal.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); procurar(); }
});
// Se a pessoa mudar o texto, a localização antiga deixa de valer
campoLocal.addEventListener("input", () => {
  if (novoLocal) { novoLocal = null; mostrarMensagem("", ""); verificarPronto(); }
});

// 2b. Usar a localização do telemóvel / computador (GPS)
// Nota: só funciona em https (Netlify, GitHub Pages) ou no Live Server.
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

// 3. Adicionar: entra logo a seguir ao som atual e começa a tocar
botaoConfirmar.addEventListener("click", () => {
  if (!novoFicheiro || !novoLocal) return;
  const novo = {
    ficheiro: URL.createObjectURL(novoFicheiro),
    lat: novoLocal.lat,
    lon: novoLocal.lon,
    rua: novoLocal.rua,
    adicionado: true,
  };
  const posicao = SONS.length ? faixaAtual + 1 : 0;
  SONS.splice(posicao, 0, novo);
  falhasSeguidas = 0;
  fecharPainel();
  prepararAudio();
  if (!somLigado) ligarSom();
  tocarFaixa(posicao);
});

/* ---------------------------------------------------------------------
   8. LER O SOM A CADA FOTOGRAMA
   Resume o espetro em 4 números suaves, entre 0 e 1.
   --------------------------------------------------------------------- */
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
    g = media(1, 8);       // graves (≈ 90–600 Hz)
    m = media(8, 48);      // médios
    a = media(48, 160);    // agudos
    v = media(1, 160);     // volume geral
    // "brilho" do som: onde está o centro de gravidade das frequências
    let soma = 0, pesada = 0;
    for (let i = 1; i < 160; i++) { soma += espetro[i]; pesada += espetro[i] * i; }
    b = soma > 0 ? pesada / soma / 100 : 0.5;
  } else {
    // Sem som: a bola "respira" devagar
    g = 0.08 + 0.05 * Math.sin(t * 0.8);
    m = 0.05; a = 0.03; v = 0.1; b = 0.5;
  }
  // Suavização: aproxima-se 15% do valor novo em cada fotograma
  som.graves += (g - som.graves) * 0.15;
  som.medios += (m - som.medios) * 0.15;
  som.agudos += (a - som.agudos) * 0.15;
  som.volume += (v - som.volume) * 0.15;
  som.brilho += (Math.min(b, 1) - som.brilho) * 0.05;
}


/* ---------------------------------------------------------------------
   9. DESENHAR A BOLA
   --------------------------------------------------------------------- */
const DISTANCIA = 3.2;   // distância da "câmara" (perspetiva)

// Luz vinda de cima, à esquerda, da frente (dá o volume 3D)
const LUZ = (() => { const l = [-0.45, 0.55, 0.7]; const n = Math.hypot(...l); return l.map(v => v / n); })();


function desenhar(tempoMs) {
  const t = tempoMs / 1000;
  lerSom(t);
  atualizarCoordenadas();

  // --- A forma reage ao som (com suavidade) ---
  F.t = t;
  F.base   += ((0.04 + som.volume * 0.10) - F.base) * 0.1;
  F.dobras += ((0.03 + som.graves * PARAM.forcaDobras) - F.dobras) * 0.1;
  F.torcao += ((0.015 + som.agudos * 0.12) - F.torcao) * 0.1;
  F.nDobras += ((8 + som.medios * 10) - F.nDobras) * 0.02;   // devagar, sem saltos

  // --- As cores reagem ao som ---
  // Sons agudos puxam as duas cores num sentido, sons graves no outro;
  // quando o som é forte, o laranja das bordas "invade" o centro.
  const desvioCor = (som.brilho - 0.5) * PARAM.forcaCor + Math.sin(t * 0.07) * 12;
  const invasao = som.volume * 0.25;
  let distCor = PARAM.corBorda - PARAM.corCentro;            // caminho mais curto
  if (distCor < 0) distCor += 360;                           // violeta -> rosa -> laranja

  // Limpa o ecrã com preto
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
  const e = 0.03;   // pequeno passo para medir a inclinação das dobras

  for (let i = 0; i < N; i++) {
    const p = pontos[i];

    // 1) Quanto este ponto sai para fora (forma + espetro)
    const base = forma(p.x, p.y, p.z, p.angulo);
    let desloc = base;
    if (comEspetro) desloc += (espetro[1 + Math.floor(p.faixa * 159)] / 255) * PARAM.forcaEspetro;
    const d = 1 + desloc;

    // 2) Inclinação da dobra: compara com um ponto um pouco acima.
    //    Faces viradas para cima ficam claras, viradas para baixo escuras.
    const inclinacao = (forma(p.x, p.y + e, p.z, p.angulo) - base) / e;

    // 3) Rodar
    const x = p.x * d, y = p.y * d, z = p.z * d;
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    // 4) Luz: direção da superfície (aprox.) vs. direção da luz
    const nx = p.x * cosY - p.z * sinY;
    const nz1 = p.x * sinY + p.z * cosY;
    const ny = p.y * cosX - nz1 * sinX;
    const nz = p.y * sinX + nz1 * cosX;
    const difusa = Math.max(0, nx * LUZ[0] + ny * LUZ[1] + nz * LUZ[2]);
    let luz = (0.55 + 0.6 * difusa) * (1 - inclinacao * 0.25);
    luz = Math.max(0.3, Math.min(1.25, luz));

    // 5) Perspetiva
    const persp = DISTANCIA / (DISTANCIA - z2);
    ecraX[i] = cx + x1 * escala * persp;
    ecraY[i] = cy - y2 * escala * persp;
    profundidade[i] = z2;

    // Frente forte, trás muito apagada -> lê-se como um objeto sólido
    const frente = Math.max(0, (z2 + 1.2) / 2.4);
    alfas[i] = Math.min(1, luz * (0.1 + 0.9 * frente * frente) * (1 + som.volume * 0.4));
    tamanhos[i] = (0.6 + frente * 1.7) * persp * PARAM.tamanhoPonto;

    // 6) Cor: violeta onde a bola está virada para nós, laranja nas
    //    bordas e nas cristas das dobras (que "apanham a luz")
    let borda = 1 - Math.abs(nz);                       // 0 = de frente, 1 = de lado
    borda = Math.pow(Math.min(1, borda * 1.45), 1.1) + desloc * 1.8 + invasao;     // cristas puxam para laranja
    borda = Math.max(0, Math.min(1, borda));
    let matiz = PARAM.corCentro + borda * distCor + desvioCor;
    matizes[i] = ((Math.round(matiz) % 360) + 360) % 360;
  }

  // Desenha primeiro os pontos de trás, depois os da frente.
  // Os pontos são redondos (círculos), como na referência.
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
