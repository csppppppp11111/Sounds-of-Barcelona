/* =====================================================================
   SOUNDS OF BARCELONA — objeto.js  (a página do objeto)
   Constrói o objeto a partir de todos os sons do arquivo:
   uma esfera com base plana, com as marcas dos sons em cima e nos lados
   (sem a cidade). Mostra-o em 3D e deixa descarregar o STL.
   Precisa do comum.js (carregado antes, no objeto.html).
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. PARÂMETROS DO OBJETO (podes mexer nestes números)
   --------------------------------------------------------------------- */
const OBJETO = {
  linhas: 180,          // detalhe de cima a baixo
  colunas: 360,         // detalhe à volta
  corteBase: -0.62,     // altura do corte da base (-1 = fundo da esfera)
  forcaMarcas: 1.6,     // as marcas um pouco mais altas no objeto
  cor: [0.91, 0.89, 0.85], // cor do objeto no ecrã (creme, como PLA branco)
};


/* ---------------------------------------------------------------------
   2. A FORMA: vértices e triângulos
   --------------------------------------------------------------------- */
let marcas = [];

function raioObjeto(x, y, z) {
  if (y <= CAP) return 1;
  const d = esferaParaDisco(x, y, z);
  return 1 + marcasNoDisco(marcas, d.X, d.Y, OBJETO.forcaMarcas) * bordaSuave(d.s);
}

function construirForma() {
  const NL = OBJETO.linhas, NC = OBJETO.colunas;
  const v = [];
  const ponto = (lat, lon) => {
    const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
    const d = raioObjeto(x, y, z);
    return [x * d, Math.max(y * d, OBJETO.corteBase), z * d];   // corta a base: fica plana
  };
  const sul = v.length; v.push(ponto(-Math.PI / 2, 0));
  for (let l = 1; l < NL; l++) {
    const lat = -Math.PI / 2 + (Math.PI * l) / NL;
    for (let c = 0; c < NC; c++) v.push(ponto(lat, (2 * Math.PI * c) / NC));
  }
  const norte = v.length; v.push(ponto(Math.PI / 2, 0));
  const idx = (l, c) => 1 + (l - 1) * NC + (c % NC);

  const tri = [];
  for (let c = 0; c < NC; c++) tri.push(sul, idx(1, c), idx(1, c + 1));
  for (let l = 1; l < NL - 1; l++) {
    for (let c = 0; c < NC; c++) {
      const a = idx(l, c), b = idx(l, c + 1), cc = idx(l + 1, c + 1), d = idx(l + 1, c);
      tri.push(a, cc, b, a, d, cc);
    }
  }
  for (let c = 0; c < NC; c++) tri.push(norte, idx(NL - 1, c + 1), idx(NL - 1, c));

  // Medidas: largura máxima e altura (em unidades da esfera)
  let maxH = 0, minY = Infinity, maxY = -Infinity;
  for (const p of v) { maxH = Math.max(maxH, Math.hypot(p[0], p[2])); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  return { v, tri, largura: 2 * maxH, minY, maxY };
}


/* ---------------------------------------------------------------------
   3. DESCARREGAR O STL (para imprimir em 3D)
   --------------------------------------------------------------------- */
function gerarSTL(forma, diametroMm) {
  const k = diametroMm / forma.largura;
  // No STL o "cima" é o eixo Z e a base fica em Z = 0
  const P = forma.v.map((p) => [p[0] * k, -p[2] * k, (p[1] - forma.minY) * k]);
  const nTri = forma.tri.length / 3;
  const buffer = new ArrayBuffer(84 + nTri * 50);
  const dv = new DataView(buffer);
  const cabecalho = "SOUNDS OF BARCELONA - " + marcas.length + " sounds - " + hojeISO();
  for (let i = 0; i < 80; i++) dv.setUint8(i, i < cabecalho.length ? cabecalho.charCodeAt(i) & 127 : 32);
  dv.setUint32(80, nTri, true);
  let o = 84;
  for (let t = 0; t < forma.tri.length; t += 3) {
    const A = P[forma.tri[t]], B = P[forma.tri[t + 1]], C = P[forma.tri[t + 2]];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const nn = Math.hypot(nx, ny, nz) || 1;
    for (const val of [nx / nn, ny / nn, nz / nn, ...A, ...B, ...C]) { dv.setFloat32(o, val, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Blob([buffer], { type: "model/stl" });
}

function descarregar(diametroMm) {
  if (!forma) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(gerarSTL(forma, diametroMm));
  a.download = "sounds-of-barcelona_" + hojeISO() + "_" + marcas.length + "-sounds_" + diametroMm + "mm.stl";
  document.body.appendChild(a); a.click(); a.remove();
}
document.getElementById("stl60").addEventListener("click", () => descarregar(60));
document.getElementById("stl120").addEventListener("click", () => descarregar(120));


/* ---------------------------------------------------------------------
   4. VER EM 3D (WebGL, sem bibliotecas)
   --------------------------------------------------------------------- */
const tela = document.getElementById("tela3d");
const gl = tela.getContext("webgl2", { antialias: true });

const VERT = `#version 300 es
in vec3 posicao; in vec3 normal;
uniform mat4 projecao, vista;
out vec3 vNormal, vPos;
void main() {
  vNormal = normal; vPos = posicao;
  gl_Position = projecao * vista * vec4(posicao, 1.0);
}`;
const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal, vPos;
uniform vec3 cor, olho;
out vec4 saida;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(olho - vPos);
  vec3 l1 = normalize(vec3(0.5, 1.0, 0.6));     // luz principal, de cima
  vec3 l2 = normalize(vec3(-0.8, 0.2, -0.4));   // luz de recorte, de trás
  float dif = max(dot(n, l1), 0.0) * 0.85 + max(dot(n, l2), 0.0) * 0.25;
  float bri = pow(max(dot(n, normalize(l1 + v)), 0.0), 40.0) * 0.12;
  float borda = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.15;
  vec3 c = cor * (0.26 + dif) + bri + borda;
  saida = vec4(pow(c, vec3(1.0 / 1.1)), 1.0);
}`;

function compilar(tipo, codigo) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, codigo); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

let programa, local = {}, nIndices = 0, forma = null;
if (gl) {
  programa = gl.createProgram();
  gl.attachShader(programa, compilar(gl.VERTEX_SHADER, VERT));
  gl.attachShader(programa, compilar(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(programa);
  gl.useProgram(programa);
  for (const n of ["projecao", "vista", "cor", "olho"]) local[n] = gl.getUniformLocation(programa, n);
  gl.enable(gl.DEPTH_TEST);
} else {
  document.getElementById("estado").textContent = "THIS BROWSER CANNOT SHOW 3D. YOU CAN STILL DOWNLOAD THE FILE.";
}

// Manda a forma para a placa gráfica (com normais suaves)
function enviarForma(f) {
  if (!gl) return;
  const nV = f.v.length;
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3);
  const yMeio = (f.minY + f.maxY) / 2;   // centra o objeto na vertical
  for (let i = 0; i < nV; i++) { pos[i * 3] = f.v[i][0]; pos[i * 3 + 1] = f.v[i][1] - yMeio; pos[i * 3 + 2] = f.v[i][2]; }
  for (let t = 0; t < f.tri.length; t += 3) {
    const a = f.tri[t] * 3, b = f.tri[t + 1] * 3, c = f.tri[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const k of [a, b, c]) { nor[k] += nx; nor[k + 1] += ny; nor[k + 2] += nz; }
  }
  // A base plana fica com normal virada para baixo (aresta nítida)
  for (let i = 0; i < nV; i++) {
    if (f.v[i][1] <= OBJETO.corteBase + 1e-6) {
      const r = Math.hypot(f.v[i][0], f.v[i][2]);
      if (r < 0.999 * Math.sqrt(1 - OBJETO.corteBase ** 2)) { nor[i * 3] = 0; nor[i * 3 + 1] = -1; nor[i * 3 + 2] = 0; }
    }
  }
  const atributo = (nome, dados) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, dados, gl.STATIC_DRAW);
    const l = gl.getAttribLocation(programa, nome);
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0);
  };
  atributo("posicao", pos);
  atributo("normal", nor);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(f.tri), gl.STATIC_DRAW);
  nIndices = f.tri.length;
}

// Pequenas contas de matrizes (câmara)
function perspetiva(fov, asp, perto, longe) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (perto - longe);
  return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (longe + perto) * nf, -1, 0, 0, 2 * longe * perto * nf, 0];
}
function olharPara(o, alvo) {
  let zx = o[0] - alvo[0], zy = o[1] - alvo[1], zz = o[2] - alvo[2];
  const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = zz, xy = 0, xz = -zx;                        // cima = (0,1,0) x z
  const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * o[0] + xy * o[1] + xz * o[2]), -(yx * o[0] + yy * o[1] + yz * o[2]), -(zx * o[0] + zy * o[1] + zz * o[2]), 1];
}


/* ---------------------------------------------------------------------
   5. RODAR COM O RATO OU O DEDO, ZOOM COM A RODA
   --------------------------------------------------------------------- */
const camara = { rodar: 2.36, inclinar: 0.55, distancia: 5.6 };
let arrastar = null, ultimoToque = 0;

tela.addEventListener("pointerdown", (e) => {
  arrastar = { x: e.clientX, y: e.clientY };
  tela.setPointerCapture(e.pointerId);
  tela.classList.add("a-arrastar");
});
tela.addEventListener("pointermove", (e) => {
  if (!arrastar) return;
  camara.rodar += (e.clientX - arrastar.x) * 0.008;
  camara.inclinar = Math.min(1.45, Math.max(-1.2, camara.inclinar + (e.clientY - arrastar.y) * 0.006));
  arrastar = { x: e.clientX, y: e.clientY };
  ultimoToque = performance.now();
});
const largar = () => { arrastar = null; tela.classList.remove("a-arrastar"); ultimoToque = performance.now(); };
tela.addEventListener("pointerup", largar);
tela.addEventListener("pointercancel", largar);
tela.addEventListener("wheel", (e) => {
  e.preventDefault();
  camara.distancia = Math.min(10, Math.max(2.6, camara.distancia * (1 + e.deltaY * 0.001)));
}, { passive: false });


/* ---------------------------------------------------------------------
   6. DESENHAR
   --------------------------------------------------------------------- */
function desenhar(tempo) {
  if (gl) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(tela.clientWidth * dpr), h = Math.round(tela.clientHeight * dpr);
    if (tela.width !== w || tela.height !== h) { tela.width = w; tela.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Quando ninguém mexe, o objeto roda devagar sozinho
    if (!arrastar && performance.now() - ultimoToque > 2500) camara.rodar += 0.0025;

    if (nIndices) {
      const r = camara.distancia;
      const olho = [r * Math.cos(camara.inclinar) * Math.cos(camara.rodar), r * Math.sin(camara.inclinar),
                    r * Math.cos(camara.inclinar) * Math.sin(camara.rodar)];
      gl.uniformMatrix4fv(local.projecao, false, perspetiva(0.6, w / h, 0.1, 50));
      gl.uniformMatrix4fv(local.vista, false, olharPara(olho, [0, 0, 0]));
      gl.uniform3fv(local.cor, OBJETO.cor);
      gl.uniform3fv(local.olho, olho);
      gl.drawElements(gl.TRIANGLES, nIndices, gl.UNSIGNED_INT, 0);
    }
  }
  requestAnimationFrame(desenhar);
}
requestAnimationFrame(desenhar);


/* ---------------------------------------------------------------------
   7. COMEÇAR: ler o arquivo, construir o objeto, mostrar as medidas
   --------------------------------------------------------------------- */
function mostrarMedidas() {
  const alturaRel = (forma.maxY - forma.minY) / forma.largura;   // altura / largura
  const n = marcas.filter(Boolean).length;
  document.getElementById("estado").textContent =
    n === 0 ? "NO SOUNDS YET: THE OBJECT IS STILL A SMOOTH SPHERE"
            : n + (n === 1 ? " SOUND" : " SOUNDS") + " · ARCHIVE ON " + formatarData(hojeISO());
  document.getElementById("stl60").textContent =
    "↓ PROTOTYPE · 6 × " + (6 * alturaRel).toFixed(1) + " CM";
  document.getElementById("stl120").textContent =
    "↓ FINAL · 12 × " + (12 * alturaRel).toFixed(1) + " CM";
}

function reconstruir() {
  forma = construirForma();
  enviarForma(forma);
  mostrarMedidas();
}

let quantosSons = -1;   // quantos sons tinha o arquivo da última vez

// Lê o arquivo e, se houver sons novos, volta a construir o objeto
async function atualizar() {
  const sons = await lerArquivo();
  if (sons.length === quantosSons) return;        // nada de novo
  quantosSons = sons.length;
  marcas = sons.map((s) => (s.assinatura ? prepararMarca(s) : null));
  reconstruir();
  // Sons antigos sem impressão digital: analisa-os e volta a construir
  const faltam = sons.filter((s) => !s.assinatura);
  for (const s of faltam) {
    try { s.assinatura = await analisarSom(s.ficheiro); marcas[sons.indexOf(s)] = prepararMarca(s); }
    catch (erro) { console.warn("Não deu para analisar:", s.ficheiro); }
  }
  if (faltam.length) reconstruir();
}

async function comecar() {
  reconstruir();                                   // esfera lisa enquanto carrega
  document.getElementById("estado").textContent = "LOADING THE ARCHIVE\u2026";
  await atualizar();
  // De 30 em 30 segundos vê se alguém acrescentou um som
  setInterval(atualizar, 30000);
}
comecar();
