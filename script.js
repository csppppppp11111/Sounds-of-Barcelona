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
  [41.30, 2.130], [41.33,
