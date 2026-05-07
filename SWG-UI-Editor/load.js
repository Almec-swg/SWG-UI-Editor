// load.js - SWG Galaxy Map Editor (501x486, matches GalaxyMap viewport)

let xmlDoc = null;
let planets = [];
let canvas, ctx;

// Planet image cache: planetName -> CanvasImageSource (Image or Canvas)
const planetImages = new Map();
let hoveredPlanet = null;

// Reusable offscreen WebGL decoder state for DDS planet textures.
const ddsPlanetDecoder = {
  canvas: null,
  gl: null,
  program: null,
  buffer: null,
  texture: null,
  ext: null,
  aPosition: -1,
  aTexCoord: -1
};

// GalaxyMap page offset within the map page (applied during parse, subtracted on export)
let gmOx = 0;
let gmOy = 0;

// SWG map space (from your .inc)
const CANVAS_W = 501;
const CANVAS_H = 486;
const SWG_W = 501;
const SWG_H = 486;

// ---------------------------------------------------------------------------
// CORRECT COORDINATE FUNCTIONS (RAW PIXEL SPACE)
// ---------------------------------------------------------------------------

// SWG → Canvas (raw pixel passthrough)
function swgToCanvasX(x) { return x; }
function swgToCanvasY(y) { return y; }

// Canvas → SWG (raw pixel passthrough)
function canvasToSwgX(x) { return x; }
function canvasToSwgY(y) { return y; }

function parseCoordPair(str) {
  if (!str) return [0, 0];
  return str.split(",").map(value => Number(value) || 0);
}

function getNodeRect(node) {
  if (!node) return null;

  const [x, y] = parseCoordPair(node.getAttribute("Location") || "0,0");
  const [w, h] = parseCoordPair(node.getAttribute("Size") || "0,0");

  return { x, y, w, h };
}

function getRectCenter(rect) {
  if (!rect) return null;

  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2
  };
}

function isNodeVisible(node) {
  if (!node) return false;
  return (node.getAttribute("Visible") || "true").toLowerCase() !== "false";
}

// ---------------------------------------------------------------------------
// SECTION LOCATORS
// ---------------------------------------------------------------------------
function getMapSections() {
  const root = xmlDoc.documentElement;

  // Find ANY map page anywhere in the document
  const mapPage = [...root.querySelectorAll("Page")]
    .find(p => (p.getAttribute("Name") || "").toLowerCase() === "map");

  if (!mapPage) {
    console.warn("No map page found anywhere in the document.");
    return null;
  }

  // Find GalaxyMap + PlanetNames inside map
  const galaxyMap = mapPage.querySelector('Page[Name="GalaxyMap"]');
  const planetNames = mapPage.querySelector('Page[Name="PlanetNames"]');

  if (!galaxyMap) console.warn("GalaxyMap not found inside map.");
  if (!planetNames) console.warn("PlanetNames not found inside map.");

  return { root, mapPage, galaxyMap, planetNames };
}

function getViewerDataSourceKey(viewer) {
  if (!viewer) return null;
  const ds = viewer.getAttribute("objectdatasource") || "";
  const match = ds.match(/\.([A-Za-z0-9_]+)$/);
  return match ? match[1] : null;
}

function findDataSourceNodeByName(namespaceNode, desiredName) {
  if (!namespaceNode || !desiredName) return null;
  const target = String(desiredName).toLowerCase();
  const dataSources = [...namespaceNode.querySelectorAll("DataSource")];
  return (
    dataSources.find(ds => (ds.getAttribute("Name") || "").toLowerCase() === target) ||
    null
  );
}






// ---------------------------------------------------------------------------
// BUILD PLANET MODEL
// ---------------------------------------------------------------------------
function buildPlanetsModel() {
  planets = [];

  const sections = getMapSections();
  if (!sections || !sections.galaxyMap) return;

  const galaxy = sections.galaxyMap;

  // GalaxyMap is offset within the map page — add this to all button/viewer coords
  // so they align with PlanetNames text coords (which are in map-page space).
  const galaxyMapRect = getNodeRect(galaxy);
  gmOx = galaxyMapRect?.x || 0;
  gmOy = galaxyMapRect?.y || 0;

  // Helper: shift a rect by the GalaxyMap parent offset
  function offsetRect(rect) {
    if (!rect) return null;
    return { x: rect.x + gmOx, y: rect.y + gmOy, w: rect.w, h: rect.h };
  }

  const viewerByPlanet = new Map();

  const viewers = galaxy.querySelectorAll("CuiWidget3dObjectListViewer");
  viewers.forEach(viewer => {
    if (!isNodeVisible(viewer)) return;

    let planetName = null;

    const vName = viewer.getAttribute("Name") || "";
    if (/^v/.test(vName)) {
      planetName = vName.replace(/^v/, "");
    }

    const ds = viewer.getAttribute("objectdatasource") || "";
    const m = ds.match(/\.([A-Za-z0-9_]+)$/);
    if (!planetName && m) {
      planetName = m[1];
    }

    if (planetName && !viewerByPlanet.has(planetName)) {
      viewerByPlanet.set(planetName, viewer);
    }
  });

  const buttons = galaxy.querySelectorAll('Button[Name^="button"]');

  buttons.forEach(button => {
    if (!isNodeVisible(button)) return;

    const btnName = button.getAttribute("Name");
    const planetName = btnName.replace(/^button/, "");

    const viewer = viewerByPlanet.get(planetName) || null;
    const label = sections.planetNames?.querySelector(
      `Text[Name="${planetName}"]`
    ) || null;

    if (label && !isNodeVisible(label)) return;

    const buttonRect = offsetRect(getNodeRect(button));
    const viewerRect = offsetRect(getNodeRect(viewer));
    const labelRect = getNodeRect(label);
    const buttonCenter = getRectCenter(buttonRect);
    const viewerCenter = getRectCenter(viewerRect);
    const labelCenter = getRectCenter(labelRect);
    const planetCenter = buttonCenter || viewerCenter || labelCenter;

    if (!planetCenter) return;

    const swgX = planetCenter.x;
    const swgY = planetCenter.y;

    const dataSourceKey = getViewerDataSourceKey(viewer) || planetName;
    const aptKey = getPlanetAptKey(sections, dataSourceKey, planetName);
    const displayName = label?.getAttribute("LocalText") || planetName;

    planets.push({
      name: planetName,
      displayName,
      dataSourceKey,
      aptKey,
      buttonNode: button,
      viewerNode: viewer,
      labelNode: label,
      buttonRect,
      viewerRect,
      labelRect,
      buttonOffset: buttonCenter
        ? { x: buttonRect.x - planetCenter.x, y: buttonRect.y - planetCenter.y }
        : null,
      viewerOffset: viewerCenter
        ? { x: viewerRect.x - planetCenter.x, y: viewerRect.y - planetCenter.y }
        : null,
      labelOffset: labelCenter
        ? { x: labelRect.x - planetCenter.x, y: labelRect.y - planetCenter.y }
        : null,
      labelCenter,
      swgX,
      swgY,
      x: swgX,
      y: swgY,
      radius: Math.max(10, Math.min(buttonRect?.w || viewerRect?.w || 24, buttonRect?.h || viewerRect?.h || 24) / 2 - 4)
    });
  });

  viewerByPlanet.forEach((viewer, planetName) => {
    const already = planets.some(p => p.name === planetName);
    if (already) return;

    const label = sections.planetNames?.querySelector(
      `Text[Name="${planetName}"]`
    ) || null;

    if (label && !isNodeVisible(label)) return;

    const viewerRect = offsetRect(getNodeRect(viewer));
    const labelRect = getNodeRect(label);
    const viewerCenter = getRectCenter(viewerRect);
    const labelCenter = getRectCenter(labelRect);
    const planetCenter = viewerCenter || labelCenter;

    if (!planetCenter) return;

    const swgX = planetCenter.x;
    const swgY = planetCenter.y;

    const dataSourceKey = getViewerDataSourceKey(viewer) || planetName;
    const aptKey = getPlanetAptKey(sections, dataSourceKey, planetName);
    const displayName = label?.getAttribute("LocalText") || planetName;

    planets.push({
      name: planetName,
      displayName,
      dataSourceKey,
      aptKey,
      buttonNode: null,
      viewerNode: viewer,
      labelNode: label,
      buttonRect: null,
      viewerRect,
      labelRect,
      buttonOffset: null,
      viewerOffset: viewerRect
        ? { x: viewerRect.x - planetCenter.x, y: viewerRect.y - planetCenter.y }
        : null,
      labelOffset: labelRect
        ? { x: labelRect.x - planetCenter.x, y: labelRect.y - planetCenter.y }
        : null,
      labelCenter,
      swgX,
      swgY,
      x: swgX,
      y: swgY,
      radius: Math.max(10, Math.min(viewerRect?.w || 24, viewerRect?.h || 24) / 2 - 4)
    });
  });
}

// Extract apt shortcode for a planet (e.g. "tato" from "ui_planet_sel_tato.apt").
// Prefer explicit datasource keys from viewer.objectdatasource and fall back to display/name keys.
function getPlanetAptKey(sections, dataSourceKey, fallbackPlanetName) {
  const ns = sections.galaxyMap?.querySelector('Namespace[Name="data"]');
  const ds =
    findDataSourceNodeByName(ns, dataSourceKey) ||
    findDataSourceNodeByName(ns, fallbackPlanetName);
  const dataNode = ds?.querySelector("Data");
  const aptPath = dataNode?.getAttribute("appearanceTemplate") || "";
  const m = aptPath.match(/ui_planet_sel_([^.]+)\.apt/i);
  return m ? m[1].toLowerCase() : String(dataSourceKey || fallbackPlanetName || "").toLowerCase();
}


// ---------------------------------------------------------------------------
// TABLE UPDATES
// ---------------------------------------------------------------------------
function updateTables() {
  const planetTableBody = document.querySelector("#planetTable tbody");
  const buttonTableBody = document.querySelector("#buttonTable tbody");
  const dataSourceTableBody = document.querySelector("#dataSourceTable tbody");

  planetTableBody.innerHTML = "";
  buttonTableBody.innerHTML = "";
  dataSourceTableBody.innerHTML = "";

  planets.forEach(p => {
    const tr1 = document.createElement("tr");
    tr1.innerHTML = `<td>${p.name}</td><td>${p.swgX}</td><td>${p.swgY}</td>`;
    planetTableBody.appendChild(tr1);

    if (p.buttonNode) {
      const btnLoc = p.buttonNode.getAttribute("Location") || "0,0";
      const [bx, by] = btnLoc.split(",");
      const tr2 = document.createElement("tr");
      tr2.innerHTML = `<td>${p.buttonNode.getAttribute("Name")}</td><td>${p.name}</td><td>${bx}</td><td>${by}</td>`;
      buttonTableBody.appendChild(tr2);
    }

    let ds = null;

    if (p.viewerNode) {
      const ns = p.viewerNode.closest("Namespace");
      if (ns) ds = ns.querySelector(`DataSource[Name="${p.name}"]`);
    }

    if (!ds) {
      const sections = getMapSections();
      const ns = sections.galaxyMap.querySelector('Namespace[Name="data"]');
      if (ns) ds = ns.querySelector(`DataSource[Name="${p.name}"]`);
    }

    if (ds) {
      const dataNode = ds.querySelector("Data");
      const apt = dataNode?.getAttribute("appearanceTemplate") || "";
      const tr3 = document.createElement("tr");
      tr3.innerHTML = `<td>${p.name}</td><td>${apt}</td>`;
      dataSourceTableBody.appendChild(tr3);
    }
  });
}

// ---------------------------------------------------------------------------
// PLANET IMAGE LOADING
// ---------------------------------------------------------------------------
const PLANET_TEXTURE_ALIAS_GROUPS = [
  ["tato", "tatt", "tatooine"],
  ["ordmantel", "ordmantell"]
];

// Manual per-planet overrides for cases where desired texture differs from datasource apt.
const PLANET_TEXTURE_OVERRIDES = {
  chandrila: ["corl", "corellia"],
  moraband: ["dath", "dathomir"]
};

const PLANET_TEXTURE_ALIAS_MAP = (() => {
  const map = new Map();
  PLANET_TEXTURE_ALIAS_GROUPS.forEach(group => {
    const normalized = group
      .map(value => String(value || "").toLowerCase())
      .filter(Boolean);
    normalized.forEach(key => map.set(key, new Set(normalized)));
  });
  return map;
})();

function getTextureKeyVariants(rawKey) {
  const base = String(rawKey || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!base) return new Set();

  const variants = new Set([base]);
  const aliasGroup = PLANET_TEXTURE_ALIAS_MAP.get(base);
  if (aliasGroup) {
    aliasGroup.forEach(key => variants.add(key));
  }
  return variants;
}

function getFilenameTextureKeys(filename) {
  const base = filename.replace(/\.[^.]+$/, "").toLowerCase();
  const keys = new Set([base]);

  // ui_planet_sel_tatt.dds -> tatt
  const aptMatch = base.match(/ui[_-]?planet[_-]?sel[_-]?([a-z0-9_]+)/i);
  if (aptMatch?.[1]) {
    getTextureKeyVariants(aptMatch[1]).forEach(value => keys.add(value));
  }

  // Also consider each underscore-separated token as a potential shorthand key.
  base.split(/[_-]+/).forEach(token => {
    getTextureKeyVariants(token).forEach(value => keys.add(value));
  });

  return keys;
}

function getPlanetCandidateTextureKeys(planet) {
  const keys = new Set();

  getTextureKeyVariants(planet?.aptKey).forEach(value => keys.add(value));
  getTextureKeyVariants(planet?.name).forEach(value => keys.add(value));

  const overrides = PLANET_TEXTURE_OVERRIDES[String(planet?.name || "").toLowerCase()] || [];
  overrides.forEach(value => {
    getTextureKeyVariants(value).forEach(alias => keys.add(alias));
  });

  return keys;
}

function findMatchingPlanets(filename) {
  const base = filename.replace(/\.[^.]+$/, "").toLowerCase();
  const filenameKeys = getFilenameTextureKeys(filename);

  const unique = list => {
    const byName = new Map();
    list.forEach(p => byName.set(p.name, p));
    return [...byName.values()];
  };

  // 1) Exact planet name match
  let matches = planets.filter(p => p.name.toLowerCase() === base);
  if (matches.length) return unique(matches);

  // 2) Exact apt key match (can map to multiple planets), including alias keys.
  matches = planets.filter(p => {
    const candidateKeys = getPlanetCandidateTextureKeys(p);
    for (const key of candidateKeys) {
      if (filenameKeys.has(key)) return true;
    }
    return false;
  });
  if (matches.length) return unique(matches);

  // 3) Filename contains apt key (e.g. ui_planet_sel_tato), including aliases.
  matches = planets.filter(p => {
    const candidateKeys = getPlanetCandidateTextureKeys(p);
    for (const key of candidateKeys) {
      if (base.includes(key)) return true;
    }
    return false;
  });
  if (matches.length) return unique(matches);

  // 4) Filename contains planet name
  matches = planets.filter(p => base.includes(p.name.toLowerCase()));
  if (matches.length) return unique(matches);

  return [];
}

function initDdsPlanetDecoder() {
  if (ddsPlanetDecoder.gl) return ddsPlanetDecoder;

  const decoderCanvas = document.createElement("canvas");
  decoderCanvas.width = 64;
  decoderCanvas.height = 64;

  const gl = decoderCanvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: true
  });

  if (!gl) {
    throw new Error("WebGL is unavailable for DDS planet decoding.");
  }

  const ext = gl.getExtension("WEBGL_compressed_texture_s3tc");
  if (!ext) {
    throw new Error("S3TC DDS textures are not supported in this browser.");
  }

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
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`DDS decoder shader compile failed: ${info}`);
    }
    return shader;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`DDS decoder program link failed: ${gl.getProgramInfoLog(program)}`);
  }

  gl.useProgram(program);

  const vertices = new Float32Array([
    -1, -1, 0, 1,
     1, -1, 1, 1,
    -1,  1, 0, 0,
     1,  1, 1, 0
  ]);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, "aPosition");
  const aTexCoord = gl.getAttribLocation(program, "aTexCoord");
  gl.enableVertexAttribArray(aPosition);
  gl.enableVertexAttribArray(aTexCoord);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);

  const texture = gl.createTexture();

  ddsPlanetDecoder.canvas = decoderCanvas;
  ddsPlanetDecoder.gl = gl;
  ddsPlanetDecoder.program = program;
  ddsPlanetDecoder.buffer = buffer;
  ddsPlanetDecoder.texture = texture;
  ddsPlanetDecoder.ext = ext;
  ddsPlanetDecoder.aPosition = aPosition;
  ddsPlanetDecoder.aTexCoord = aTexCoord;

  return ddsPlanetDecoder;
}

function ddsFormatToGlInternalFormat(ddsFormat, ext) {
  if (ddsFormat === "DXT1") return ext.COMPRESSED_RGBA_S3TC_DXT1_EXT;
  if (ddsFormat === "DXT3") return ext.COMPRESSED_RGBA_S3TC_DXT3_EXT;
  if (ddsFormat === "DXT5") return ext.COMPRESSED_RGBA_S3TC_DXT5_EXT;
  throw new Error(`Unsupported DDS format: ${ddsFormat}`);
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

async function decodeDdsFileToCanvas(file) {
  const decoder = initDdsPlanetDecoder();
  const buffer = await readFileAsArrayBuffer(file);

  const dds = new DDSImage();
  dds.parse(buffer);

  const internalFormat = ddsFormatToGlInternalFormat(dds.format, decoder.ext);
  const gl = decoder.gl;

  decoder.canvas.width = dds.width;
  decoder.canvas.height = dds.height;

  gl.viewport(0, 0, dds.width, dds.height);
  gl.useProgram(decoder.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, decoder.buffer);
  gl.vertexAttribPointer(decoder.aPosition, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(decoder.aTexCoord, 2, gl.FLOAT, false, 16, 8);

  gl.bindTexture(gl.TEXTURE_2D, decoder.texture);
  dds.levels.forEach((level, index) => {
    gl.compressedTexImage2D(
      gl.TEXTURE_2D,
      index,
      internalFormat,
      level.width,
      level.height,
      0,
      level.data
    );
  });

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, dds.levels.length > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = dds.width;
  outCanvas.height = dds.height;
  const outCtx = outCanvas.getContext("2d");
  outCtx.drawImage(decoder.canvas, 0, 0);

  return outCanvas;
}

function loadPlanetImages(files) {
  Array.from(files).forEach(async file => {
    const matchedPlanets = findMatchingPlanets(file.name);
    if (!matchedPlanets.length) {
      console.warn(`No planet matched for image: ${file.name}`);
      return;
    }

    const isDds = file.name.toLowerCase().endsWith(".dds");

    try {
      if (isDds) {
        const canvasImage = await decodeDdsFileToCanvas(file);
        matchedPlanets.forEach(planet => planetImages.set(planet.name, canvasImage));
        render();
        return;
      }

      const img = new Image();
      img.onload = () => {
        matchedPlanets.forEach(planet => planetImages.set(planet.name, img));
        URL.revokeObjectURL(img.src);
        render();
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        console.error(`Failed to decode image: ${file.name}`);
      };
      img.src = URL.createObjectURL(file);
    } catch (error) {
      console.error(`Failed to load planet texture '${file.name}':`, error);
    }
  });
}


// ---------------------------------------------------------------------------
// DRAGGING
// ---------------------------------------------------------------------------
let drag = { active: false, planet: null, offsetX: 0, offsetY: 0 };

function hitPlanet(x, y) {
  // Check in reverse order (top-rendered last = front)
  for (let i = planets.length - 1; i >= 0; i--) {
    const p = planets[i];
    const hw = (p.buttonRect?.w || p.viewerRect?.w || p.radius * 2) / 2;
    const hh = (p.buttonRect?.h || p.viewerRect?.h || p.radius * 2) / 2;
    if (Math.abs(x - p.x) <= hw && Math.abs(y - p.y) <= hh) return p;
  }
  return null;
}

function onMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const p = hitPlanet(x, y);
  if (p) {
    drag.active = true;
    drag.planet = p;
    drag.offsetX = x - p.x;
    drag.offsetY = y - p.y;
  }
}

function onMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (drag.active && drag.planet) {
    movePlanet(drag.planet, x - drag.offsetX, y - drag.offsetY);
    render();
    updateTables();
    return;
  }

  // Hover highlight
  const under = hitPlanet(x, y);
  if (under !== hoveredPlanet) {
    hoveredPlanet = under;
    canvas.style.cursor = under ? "grab" : "default";
    render();
  }
}

function onMouseUp() {
  drag.active = false;
  drag.planet = null;
}

// ---------------------------------------------------------------------------
// MOVE PLANET
// ---------------------------------------------------------------------------
function movePlanet(planet, newX, newY) {
  planet.x = newX;
  planet.y = newY;

  const swgX = Math.round(newX);
  const swgY = Math.round(newY);

  planet.swgX = swgX;
  planet.swgY = swgY;

  if (planet.buttonNode) {
    // buttonNode lives in GalaxyMap-local space — subtract the GalaxyMap offset
    const nextX = Math.round(swgX + (planet.buttonOffset?.x || 0) - gmOx);
    const nextY = Math.round(swgY + (planet.buttonOffset?.y || 0) - gmOy);
    planet.buttonNode.setAttribute("Location", `${nextX},${nextY}`);
  }

  if (planet.viewerNode) {
    // viewerNode also lives in GalaxyMap-local space
    const nextX = Math.round(swgX + (planet.viewerOffset?.x || 0) - gmOx);
    const nextY = Math.round(swgY + (planet.viewerOffset?.y || 0) - gmOy);
    planet.viewerNode.setAttribute("Location", `${nextX},${nextY}`);
  }

  if (planet.labelNode) {
    const nextX = Math.round(swgX + (planet.labelOffset?.x || 0));
    const nextY = Math.round(swgY + (planet.labelOffset?.y || 0));
    planet.labelNode.setAttribute("Location", `${nextX},${nextY}`);
    planet.labelCenter = planet.labelRect
      ? {
          x: nextX + planet.labelRect.w / 2,
          y: nextY + planet.labelRect.h / 2
        }
      : null;
  }
}



// ---------------------------------------------------------------------------
// RENDER PLANETS
// ---------------------------------------------------------------------------
function drawPlanetMarker(p, hovered) {
  const bw = p.buttonRect?.w || (p.radius * 2 + 8);
  const bh = p.buttonRect?.h || (p.radius * 2 + 8);
  const vw = p.viewerRect?.w || (bw * 0.85);
  const vh = p.viewerRect?.h || (bh * 0.85);
  const rx = bw / 2;   // outer ring half-width
  const ry = bh / 2;   // outer ring half-height
  const irx = vw / 2;  // inner sphere half-width
  const iry = vh / 2;  // inner sphere half-height
  const cx = p.x;
  const cy = p.y;

  // --- Outer glow ring (hovered = brighter) ---
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = hovered ? "#ffffff" : "#1cffff";
  ctx.lineWidth = hovered ? 2 : 1.5;
  ctx.shadowColor = hovered ? "#ffffff" : "#1cffff";
  ctx.shadowBlur = hovered ? 10 : 6;
  ctx.stroke();
  ctx.restore();

  const img = planetImages.get(p.name);
  if (img) {
    // Clip to inner ellipse and draw image
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.beginPath();
    ctx.ellipse(cx, cy, irx, iry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - irx, cy - iry, vw, vh);
    ctx.restore();

    // Thin inner border over the image
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, irx, iry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(28,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  } else {
    // Fallback: radial gradient sphere
    const grad = ctx.createRadialGradient(
      cx - irx * 0.25, cy - iry * 0.25, irx * 0.05,
      cx, cy, Math.max(irx, iry)
    );
    grad.addColorStop(0, "#b0e8ff");
    grad.addColorStop(0.35, "#3a78b8");
    grad.addColorStop(0.75, "#0e2c50");
    grad.addColorStop(1, "#050f1c");

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, irx, iry, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(28,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // --- Label ---
  const labelText = p.displayName || p.name;
  const labelX = p.labelCenter ? p.labelCenter.x : cx;
  const labelY = p.labelCenter ? p.labelCenter.y : cy + ry + 10;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px sans-serif";
  ctx.shadowColor = "#000000";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "#62FF15";
  ctx.fillText(labelText, labelX, labelY);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  planets.forEach(p => drawPlanetMarker(p, p === hoveredPlanet));
}

function collectUiMapOptions() {
  if (!xmlDoc) return [];

  const options = new Set();

  // Pull from planet page map images (SourceResource='ui_map_*').
  [...xmlDoc.querySelectorAll('[SourceResource]')].forEach(node => {
    const value = (node.getAttribute('SourceResource') || '').trim();
    if (value.toLowerCase().startsWith('ui_map_')) {
      options.add(value);
    }
  });

  // Pull from data namespaces if ui_map attributes already exist.
  [...xmlDoc.querySelectorAll('Data[ui_map]')].forEach(node => {
    const value = (node.getAttribute('ui_map') || '').trim();
    if (value) options.add(value);
  });

  return [...options].sort((a, b) => a.localeCompare(b));
}

function renderUiMapDatalist() {
  const select = document.getElementById('ap-uiMap');
  if (!select) return;

  const currentValue = select.value;
  const options = collectUiMapOptions();
  select.innerHTML = '';

  options.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if (currentValue && options.includes(currentValue)) {
    select.value = currentValue;
  } else if (options.length) {
    select.value = options[0];
  }
}

function capitalizeFirstChar(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}



// ---------------------------------------------------------------------------
// ADD PLANET
// ---------------------------------------------------------------------------
function addPlanet(displayName, key, aptTemplate, uiMap, size) {
  if (!xmlDoc) return;

  const sections = getMapSections();
  if (!sections || !sections.galaxyMap) return;

  const galaxy = sections.galaxyMap;
  const planetNames = sections.planetNames;

  // Keep insertion order aligned with the base UI file so new widgets render like existing ones.
  const imageGalaxy = galaxy.querySelector('Image[Name="imageGalaxy"]');
  const firstPlanetViewer = galaxy.querySelector('CuiWidget3dObjectListViewer');
  const insertAnchor = firstPlanetViewer || imageGalaxy || galaxy.querySelector('Namespace[Name="data"]') || null;

  // Default position: canvas center in GalaxyMap-local coords
  const cx = Math.round(CANVAS_W / 2);
  const cy = Math.round(CANVAS_H / 2);
  const localX = cx - gmOx;
  const localY = cy - gmOy;

  // Sizes: large = button 55×52, viewer 51×48 / small = button 41×39, viewer 33×31
  const isLarge = (size === 'large');
  const bw = isLarge ? 55 : 41;
  const bh = isLarge ? 52 : 39;
  const vw = isLarge ? 51 : 33;
  const vh = isLarge ? 48 : 31;

  const btnX = localX - Math.floor(bw / 2);
  const btnY = localY - Math.floor(bh / 2);
  const vX   = localX - Math.floor(vw / 2);
  const vY   = localY - Math.floor(vh / 2);

  function setAttrs(el, attrs) {
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  }

  const nodeKey = capitalizeFirstChar((key || '').trim());

  // Resolve appearance template. If a new planet uses an auto-generated apt that
  // is not present among existing map datasource appearances, fall back to Corellia
  // so the planet viewer is visible by default.
  const ns = galaxy.querySelector('Namespace[Name="data"]');
  const planetsPage = sections.mapPage?.querySelector('Page[Name="Planets"]') || null;
  const normalizedApt = (aptTemplate || `appearance/ui_planet_sel_${key.toLowerCase()}.apt`).trim();
  const existingAptSet = new Set(
    [...(ns?.querySelectorAll("DataSource > Data") || [])]
      .map(data => (data.getAttribute("appearanceTemplate") || "").toLowerCase())
      .filter(Boolean)
  );

  const autoGeneratedApt = `appearance/ui_planet_sel_${key.toLowerCase()}.apt`;
  const fallbackApt = "appearance/ui_planet_sel_corl.apt";
  const availableUiMaps = collectUiMapOptions();
  const fallbackUiMap = availableUiMaps[0] || 'ui_map_corellia';
  const finalUiMap = (uiMap || fallbackUiMap).trim();

  const isLikelyAutoNewApt = normalizedApt.toLowerCase() === autoGeneratedApt.toLowerCase();
  const aptExistsInCurrentMap = existingAptSet.has(normalizedApt.toLowerCase());
  const finalAptTemplate = (!aptExistsInCurrentMap && isLikelyAutoNewApt)
    ? fallbackApt
    : normalizedApt;

  if (finalAptTemplate !== normalizedApt) {
    console.warn(
      `Appearance '${normalizedApt}' was not found in existing map datasource templates. ` +
      `Using fallback '${finalAptTemplate}' for planet '${key}'.`
    );
  }

  // --- CuiWidget3dObjectListViewer ---
  const viewer = xmlDoc.createElement('CuiWidget3dObjectListViewer');
  setAttrs(viewer, {
    AutoZoomOutOnly: 'true',
    CameraForceTarget: 'true',
    camerayaw: '90',
    dragyawok: 'false',
    fieldofview: '60',
    FitDistanceFactor: '1',
    GetsInput: 'false',
    lightambientcolor: '#222222',
    lightcolor: '#ffffff',
    Location: `${vX},${vY}`,
    Name: `v${nodeKey}`,
    objectdatasource: `data.${nodeKey}`,
    PackLocation: 'cpc,cpc',
    PackSize: 'p,p',
    RotateSpeed: '0.3',
    RStyleDefault: 'rs_default',
    ScrollExtent: `${vw},${vh}`,
    Size: `${vw},${vh}`,
  });
  if (insertAnchor) {
    galaxy.insertBefore(viewer, insertAnchor);
  } else {
    galaxy.appendChild(viewer);
  }

  // --- Button ---
  const button = xmlDoc.createElement('Button');
  setAttrs(button, {
    BackgroundColor: '#FFFFFF',
    Location: `${btnX},${btnY}`,
    MaximumSize: '800,600',
    Name: `button${nodeKey}`,
    PackLocation: 'cpc,cpc',
    PackSize: 'p,p',
    ScrollExtent: `${bw},${bh}`,
    Size: `${bw},${bh}`,
    Style: '/Styles.New.buttons.planetLrg.style',
  });
  if (insertAnchor) {
    galaxy.insertBefore(button, insertAnchor);
  } else {
    galaxy.appendChild(button);
  }

  // --- PlanetNames Text label ---
  if (planetNames) {
    const lw = 75, lh = 19;
    // Place label just below the button in map-page space
    const lx = cx - Math.floor(lw / 2);
    const ly = cy + Math.ceil(bh / 2) + 4;

    const text = xmlDoc.createElement('Text');
    setAttrs(text, {
      BackgroundColor: '#FFFFFF',
      ColorCarat: '#FFFFFF',
      ColorSelection: '#FFFFFF',
      Font: 'bold_13',
      LocalText: displayName,
      Location: `${lx},${ly}`,
      MinimumSize: '0,19',
      Name: nodeKey,
      OpacityRelativeMin: '0.70',
      PackLocation: 'cpc,cpc',
      PackSize: 'p,f',
      PalText: 'contrast1',
      ScrollExtent: `${lw},${lh}`,
      Size: `${lw},${lh}`,
      TextAlignment: 'Center',
      TextAlignmentVertical: 'Center',
      TextColor: '#62FF15',
    });
    text.textContent = displayName;
    planetNames.appendChild(text);
  }

  // --- DataSource in Namespace[Name="data"] ---
  if (ns) {
    const ds = xmlDoc.createElement('DataSource');
    ds.setAttribute('Name', nodeKey);
    const data = xmlDoc.createElement('Data');
    data.setAttribute('appearanceTemplate', finalAptTemplate);
    data.setAttribute('Name', nodeKey);
    ds.appendChild(data);
    ns.appendChild(ds);
  }

  // --- Planet map page (Page Name='Planets' -> Page Name='<Planet>' -> Image SourceResource='ui_map_*') ---
  if (planetsPage) {
    let planetPage = planetsPage.querySelector(`:scope > Page[Name="${nodeKey}"]`);

    if (!planetPage) {
      planetPage = xmlDoc.createElement('Page');
      setAttrs(planetPage, {
        BackgroundOpacity: '1.00',
        Name: nodeKey,
        PackLocation: 'nfn,nfn',
        PackSize: 'a,a',
        RStyleDefault: 'rs_default',
        ScrollExtent: '482,482',
        Size: '482,482'
      });
      planetsPage.appendChild(planetPage);
    }

    let mapImage = planetPage.querySelector(':scope > Image');
    if (!mapImage) {
      mapImage = xmlDoc.createElement('Image');
      setAttrs(mapImage, {
        BackgroundOpacity: '1.00',
        Name: 'New Image',
        PackLocation: 'nfn,nfn',
        PackSize: 'a,a',
        ScrollExtent: '482,482',
        Size: '482,482',
        SourceRect: '0,0,1024,1024'
      });
      planetPage.appendChild(mapImage);
    }

    mapImage.setAttribute('SourceResource', finalUiMap);
  }

  // --- CodeData <Data> button reference ---
  // Walks up from GalaxyMap to find the ticketPurchase page's CodeData node
  const codeData = xmlDoc.querySelector('Data[Name="CodeData"]');
  if (codeData) {
    codeData.setAttribute(`button${nodeKey}`, `map.GalaxyMap.button${nodeKey}`);
  }

  // Rebuild model and redraw
  buildPlanetsModel();
  render();
  updateTables();
}

function openAddPlanetModal() {
  document.getElementById('ap-displayName').value = '';
  document.getElementById('ap-key').value = '';
  document.getElementById('ap-apt').value = '';
  const uiMapSelect = document.getElementById('ap-uiMap');
  if (uiMapSelect) {
    uiMapSelect.value = '';
    uiMapSelect.dataset.userEdited = '0';
  }
  renderUiMapDatalist();
  document.querySelector('input[name="ap-size"][value="large"]').checked = true;
  document.getElementById('addPlanetModal').style.display = 'flex';
  document.getElementById('ap-displayName').focus();
}

function closeAddPlanetModal() {
  document.getElementById('addPlanetModal').style.display = 'none';
}


// ---------------------------------------------------------------------------
// PARSE + EXPORT
// ---------------------------------------------------------------------------
function parseFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    xmlDoc = new DOMParser().parseFromString(e.target.result, "text/xml");
    buildPlanetsModel();
    render();
    updateTables();
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------------
// PRETTY-PRINT XML
// ---------------------------------------------------------------------------
function prettyPrintXml(node, depth) {
  const indent = '\t'.repeat(depth);
  const childIndent = '\t'.repeat(depth + 1);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    return text ? indent + text + '\n' : '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  // Build attribute string — one attribute per line if there are many
  const attrs = Array.from(node.attributes);
  let attrStr = '';
  if (attrs.length === 0) {
    attrStr = '';
  } else if (attrs.length === 1) {
    attrStr = ' ' + attrToString(attrs[0]);
  } else {
    attrStr = '\n' + attrs.map(a => childIndent + attrToString(a)).join('\n') + '\n' + indent;
  }

  // Gather meaningful children
  const children = Array.from(node.childNodes).filter(c =>
    c.nodeType === Node.ELEMENT_NODE ||
    (c.nodeType === Node.TEXT_NODE && c.textContent.trim() !== '')
  );

  if (children.length === 0) {
    return `${indent}<${node.tagName}${attrStr} />\n`;
  }

  // Single inline text child (e.g. <Text ...>Corellia</Text>)
  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
    const text = children[0].textContent.trim();
    return `${indent}<${node.tagName}${attrStr}>${text}</${node.tagName}>\n`;
  }

  let out = `${indent}<${node.tagName}${attrStr}>\n`;
  children.forEach(child => {
    out += prettyPrintXml(child, depth + 1);
  });
  out += `${indent}</${node.tagName}>\n`;
  return out;
}

function attrToString(attr) {
  // Escape special chars in attribute values
  const val = attr.value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `${attr.name}='${val}'`;
}

function exportXml() {
  if (!xmlDoc) return;
  const pretty = prettyPrintXml(xmlDoc.documentElement, 0);
  document.getElementById('output').value = pretty;
}

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("mapCanvas");
  ctx = canvas.getContext("2d");

  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  document.getElementById("parseBtn").onclick = () => {
    const file = document.getElementById("fileInput").files[0];
    if (file) parseFile(file);
  };

  document.getElementById("exportBtn").onclick = exportXml;

  document.getElementById("copyBtn").onclick = () => {
    const output = document.getElementById("output");
    if (!output.value) return;
    navigator.clipboard.writeText(output.value).then(() => {
      const btn = document.getElementById("copyBtn");
      const prev = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = prev; }, 1500);
    });
  };

  document.getElementById("loadPlanetImgBtn").onclick = () => {
    document.getElementById("planetImgInput").click();
  };

  document.getElementById("planetImgInput").onchange = e => {
    if (e.target.files.length) loadPlanetImages(e.target.files);
  };

  // Add Planet modal
  document.getElementById("addPlanetBtn").onclick = () => {
    if (!xmlDoc) { alert("Parse a .inc file first."); return; }
    openAddPlanetModal();
  };

  document.getElementById("ap-cancelBtn").onclick = closeAddPlanetModal;

  // Auto-fill internal key from display name
  document.getElementById("ap-displayName").oninput = e => {
    const normalizedDisplayName = capitalizeFirstChar(e.target.value);
    if (normalizedDisplayName !== e.target.value) {
      const caret = e.target.selectionStart;
      e.target.value = normalizedDisplayName;
      if (caret !== null) e.target.setSelectionRange(caret, caret);
    }

    const key = normalizedDisplayName.replace(/\s+/g, '').replace(/[^A-Za-z0-9_]/g, '').toLowerCase();
    document.getElementById("ap-key").value = key;
    const aptEl = document.getElementById("ap-apt");
    const uiMapEl = document.getElementById("ap-uiMap");
    if (!aptEl.value || aptEl.dataset.autoFilled === "1") {
      aptEl.value = key ? `appearance/ui_planet_sel_${key.toLowerCase()}.apt` : '';
      aptEl.dataset.autoFilled = "1";
    }
    if (uiMapEl && (!uiMapEl.dataset.userEdited || uiMapEl.dataset.userEdited === "0")) {
      if (!uiMapEl.value && uiMapEl.options.length) {
        uiMapEl.value = uiMapEl.options[0].value;
      }
    }
  };

  // Once user edits apt manually, stop auto-filling it
  document.getElementById("ap-apt").oninput = e => {
    e.target.dataset.autoFilled = "0";
  };

  // Track manual ui_map selection so display-name typing does not overwrite it.
  document.getElementById("ap-uiMap").onchange = e => {
    e.target.dataset.userEdited = "1";
  };

  document.getElementById("ap-confirmBtn").onclick = () => {
    const displayNameRaw = document.getElementById("ap-displayName").value.trim();
    const displayName = capitalizeFirstChar(displayNameRaw);
    const key = document.getElementById("ap-key").value.trim();
    const apt = document.getElementById("ap-apt").value.trim();
    const uiMap = document.getElementById("ap-uiMap").value.trim();
    const size = document.querySelector('input[name="ap-size"]:checked').value;
    if (!displayName || !key) { alert("Display name and internal key are required."); return; }
    const existing = planets.find(p => p.name.toLowerCase() === key.toLowerCase());
    if (existing) { alert(`A planet with key "${key}" already exists.`); return; }
    closeAddPlanetModal();
    addPlanet(displayName, key, apt, uiMap, size);
  };

  // Close modal on overlay click
  document.getElementById("addPlanetModal").onclick = e => {
    if (e.target === document.getElementById("addPlanetModal")) closeAddPlanetModal();
  };
});
