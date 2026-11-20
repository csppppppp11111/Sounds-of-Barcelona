/* ===== Sounds of Barcelona — estilo ===== */

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 100%;
  height: 100%;
  background: #000;          /* fundo preto */
  overflow: hidden;          /* sem barras de deslocamento */
  color: #fff;
  font-family: "Courier New", Courier, monospace;
}

/* A tela ocupa o ecrã inteiro, atrás dos textos */
#tela {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* Textos dos cantos: pequenos, maiúsculas, espaçados */
.titulo,
.som,
.agora {
  position: fixed;
  z-index: 2;
  font-size: 12px;
  font-weight: normal;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.titulo { top: 28px; left: 32px; }

.som {
  top: 28px;
  right: 32px;
  background: none;
  border: none;
  color: #fff;
  font-family: inherit;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.3s;
}
.som:hover,
.som.ligado { opacity: 1; }

.agora {
  bottom: 28px;
  left: 32px;
  color: #777;
}

/* Nome da rua, por cima das coordenadas (troca com um fade suave) */
.rua {
  position: fixed;
  z-index: 2;
  bottom: 50px;
  left: 32px;
  max-width: calc(100% - 300px);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #bbb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.5s;
}

/* Telemóvel: margens mais pequenas */
@media (max-width: 600px) {
  .titulo, .som, .agora { font-size: 11px; }
  .titulo { top: 20px; left: 20px; }
  .som    { top: 20px; right: 20px; }
  .agora  { bottom: 20px; left: 20px; }
  .rua    { bottom: 40px; left: 20px; font-size: 11px; max-width: calc(100% - 40px); }
}

/* ===== Botão "+ ADD YOUR SOUND" (canto inferior direito) ===== */
.adicionar {
  position: fixed;
  z-index: 2;
  bottom: 28px;
  right: 32px;
  background: none;
  border: none;
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.18em;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.3s;
}
.adicionar:hover { opacity: 1; }

/* ===== Painel para adicionar um som ===== */
.painel {
  position: fixed;
  z-index: 3;
  bottom: 28px;
  right: 32px;
  width: 340px;
  max-width: calc(100% - 40px);
  padding: 22px;
  background: rgba(0, 0, 0, 0.88);
  border: 1px solid #444;
  font-size: 11px;
  letter-spacing: 0.15em;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.painel[hidden] { display: none; }

.painel-titulo { color: #fff; margin-bottom: 6px; }
.etiqueta      { color: #fff; margin-top: 10px; }
.valor         { color: #777; word-break: break-all; }

/* Botões do painel: texto com um traço fino à volta */
.botao-linha {
  align-self: flex-start;
  background: none;
  border: 1px solid #666;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0.15em;
  padding: 7px 12px;
  cursor: pointer;
}
.botao-linha:hover { border-color: #fff; }
.botao-linha:disabled { opacity: 0.3; cursor: default; border-color: #666; }
.principal { border-color: #fff; }

.campo {
  background: none;
  border: none;
  border-bottom: 1px solid #666;
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.1em;
  padding: 6px 0;
  outline: none;
}
.campo:focus { border-bottom-color: #fff; }
.campo::placeholder { color: #444; }

.mensagem       { min-height: 1.4em; color: #777; line-height: 1.5; }
.mensagem.ok    { color: #5dff9a; }
.mensagem.erro  { color: #ff5d6c; }

.acoes {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}

@media (max-width: 600px) {
  .adicionar { bottom: 20px; right: 20px; font-size: 11px; }
  .painel    { bottom: 20px; right: 20px; }
}

/* Campo da rua + botão FIND lado a lado */
.linha-procura { display: flex; gap: 10px; align-items: flex-end; }
.linha-procura .campo { flex: 1; min-width: 0; }
.botao-linha:disabled.a-procurar { opacity: 0.5; }

/* Crédito obrigatório do OpenStreetMap */
.creditos { color: #444; font-size: 9px; letter-spacing: 0.12em; }

/* Telemóvel: o botão de adicionar sobe para não tapar a rua */
@media (max-width: 600px) {
  .adicionar { bottom: 70px; }
}
