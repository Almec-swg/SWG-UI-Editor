// ddsBackground.js
// Clean 512×512 DDS renderer (no cropping, no nudging)

let ddsGl = null;
let ddsProgram = null;
let ddsTexture = null;
let ddsBuffer = null;
let ddsCanvas = null;

const DEFAULT_DDS_PATH = "assets/ui_rebel_starfield.dds";
const DDS_PATH_STORAGE_KEY = "swg-ui-editor.dds-background";

function getConfiguredDdsPath() {
  const params = new URLSearchParams(window.location.search);
  const queryPath = params.get("background");
  if (queryPath) return queryPath;

  return localStorage.getItem(DDS_PATH_STORAGE_KEY) || DEFAULT_DDS_PATH;
}

function renderBackgroundPathInput(path) {
  const input = document.getElementById("backgroundPathInput");
  if (input) {
    input.value = path;
  }
}

function loadConfiguredBackground(path) {
  if (!ddsGl || !ddsTexture) return;

  localStorage.setItem(DDS_PATH_STORAGE_KEY, path);
  renderBackgroundPathInput(path);

  loadDDS(ddsGl, path, ddsTexture, () => {
    renderDdsBackground();
  });
}

function bindBackgroundControls() {
  const input = document.getElementById("backgroundPathInput");
  const applyButton = document.getElementById("applyBackgroundBtn");
  if (!input || !applyButton) return;

  const applyPath = () => {
    const nextPath = input.value.trim() || DEFAULT_DDS_PATH;
    loadConfiguredBackground(nextPath);
  };

  applyButton.addEventListener("click", applyPath);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      applyPath();
    }
  });
}

function initDdsBackground() {
  const canvas = document.getElementById("ddsCanvas");
  const gl = canvas.getContext("webgl");
  if (!gl) return;

  ddsCanvas = canvas;
  ddsGl = gl;

  const vsSource = `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      vTexCoord = aTexCoord;
    }
  `;

  const fsSource = `
    precision mediump float;
    varying vec2 vTexCoord;
    uniform sampler2D uTexture;
    void main() {
      gl_FragColor = texture2D(uTexture, vTexCoord);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  ddsProgram = prog;
  gl.useProgram(prog);

  // Fullscreen quad with full UV range (no cropping)
  const vertices = new Float32Array([
    -1, -1,  0, 1,
     1, -1,  1, 1,
    -1,  1,  0, 0,
     1,  1,  1, 0
  ]);

  ddsBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ddsBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(prog, "aPosition");
  const aTexCoord = gl.getAttribLocation(prog, "aTexCoord");

  gl.enableVertexAttribArray(aPosition);
  gl.enableVertexAttribArray(aTexCoord);

  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);

  ddsTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, ddsTexture);

  bindBackgroundControls();
  loadConfiguredBackground(getConfiguredDdsPath());
}

function renderDdsBackground() {
  if (!ddsGl || !ddsProgram || !ddsCanvas) return;
  const gl = ddsGl;

  gl.viewport(0, 0, ddsCanvas.width, ddsCanvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(ddsProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, ddsBuffer);
  gl.bindTexture(gl.TEXTURE_2D, ddsTexture);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

window.setDdsBackground = loadConfiguredBackground;
window.addEventListener("DOMContentLoaded", initDdsBackground);
