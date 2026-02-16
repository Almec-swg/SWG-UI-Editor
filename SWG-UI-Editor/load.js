// ============================================================================
// SWG Galaxy Map Editor — DOM-based parser + DDS background + dragging + DataSource editor
// ============================================================================

let xmlDoc = null;
let planets = [];
let buttons = [];
let dataSources = [];
let nextId = 1;
const genId = () => nextId++;

// ============================================================================
// UI wiring
// ============================================================================

document.getElementById("fileInput").addEventListener("change", handleFileSelect);
document.getElementById("parseBtn").addEventListener("click", handleParse);

let loadedText = "";

// optional: if you have an export button
const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
  exportBtn.addEventListener("click", handleExport);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    loadedText = ev.target.result;
  };
  reader.readAsText(file);
}

function handleParse() {
  if (!loadedText.trim()) {
    alert("Select a .inc file first.");
    return;
  }

  // ⭐ FIX: Wrap SWG .inc in a root element so DOMParser accepts it
  const wrapped = `<Root>${loadedText}</Root>`;
  const parser = new DOMParser();
  xmlDoc = parser.parseFromString(wrapped, "text/xml");

  // Detect parser errors
  if (xmlDoc.querySelector("parsererror")) {
    console.error("XML parse error:", xmlDoc.querySelector("parsererror").textContent);
    alert("The .inc file contains invalid XML syntax. Parsing failed.");
    return;
  }

  buildPlanetsModel();
  buildButtonsModel();
  buildDataSourcesModel();

  loadBackground().then(() => {
    render();
  }).catch(() => {
    render();
  });
}

function handleExport() {
  if (!xmlDoc) {
    alert("Nothing parsed yet.");
    return;
  }
  const serializer = new XMLSerializer();
  const output = serializer.serializeToString(xmlDoc);
  const outEl = document.getElementById("output");
  if (outEl) outEl.value = output;
}

// ============================================================================
// Map sections
// ============================================================================

function getMapSections() {
  if (!xmlDoc) return null;

  const ticketPurchase = xmlDoc.querySelector("Page[Name='TicketPurchase'] Page[Name='ticketPurchase']");
  if (!ticketPurchase) return null;

  const map = ticketPurchase.querySelector("Page[Name='map']");
  if (!map) return null;

  return {
    map,
    planetNames: map.querySelector("Page[Name='PlanetNames']"),
    planetsPage: map.querySelector("Page[Name='Planets']"),
    galaxyMap: map.querySelector("Page[Name='GalaxyMap']")
  };
}

// ============================================================================
// Planets model
// ============================================================================

function buildPlanetsModel() {
  planets = [];

  const sections = getMapSections();
  if (!sections || !sections.planetNames) return;

  const { planetNames, planetsPage } = sections;

  const labels = Array.from(planetNames.querySelectorAll("Text"));
  const pages = planetsPage ? Array.from(planetsPage.querySelectorAll(":scope > Page")) : [];

  labels.forEach(label => {
    const name = label.getAttribute("Name");
    const loc = label.getAttribute("Location") || "0,0";

    const page = pages.find(p => p.getAttribute("Name") === name);
    let sourceResource = "";

    if (page) {
      const img = page.querySelector("Image");
      if (img) sourceResource = img.getAttribute("SourceResource") || "";
    }

    const [x, y] = loc.split(",").map(Number);

    planets.push({
      id: genId(),
      name,
      x,
      y,
      radius: 10,
      color: "#7fd4ff",
      labelNode: label,
      pageNode: page || null,
      sourceResource,
      buttons: []
    });
  });
}

// ============================================================================
// Buttons model (GalaxyMap buttons)
// ============================================================================

function buildButtonsModel() {
  buttons = [];

  const sections = getMapSections();
  if (!sections || !sections.galaxyMap) return;

  const { galaxyMap } = sections;
  const btnNodes = Array.from(galaxyMap.querySelectorAll("Button"));

  btnNodes.forEach(node => {
    const name = node.getAttribute("Name") || "Button";
    const loc = node.getAttribute("Location") || "0,0";
    const [x, y] = loc.split(",").map(Number);

    const buttonObj = {
      id: genId(),
      label: name,
      x,
      y,
      width: 80,
      height: 16,
      node,
      parentPlanetId: null
    };

    const lower = name.toLowerCase();
    const parent = planets.find(p => lower.includes(p.name.toLowerCase()));

    if (parent) {
      buttonObj.parentPlanetId = parent.id;
      parent.buttons.push(buttonObj);
    }

    buttons.push(buttonObj);
  });
}

// ============================================================================
// DataSource model (Namespace Name='data')
// ============================================================================

function buildDataSourcesModel() {
  dataSources = [];
  if (!xmlDoc) return;

  const ns = xmlDoc.querySelector("Namespace[Name='data']");
  if (!ns) return;

  const dsNodes = Array.from(ns.querySelectorAll("DataSource"));

  dsNodes.forEach(ds => {
    const name = ds.getAttribute("Name") || "";
    const dataNode = ds.querySelector("Data");
    if (!dataNode) return;

    const appearanceTemplate = dataNode.getAttribute("appearanceTemplate") || "";

    dataSources.push({
      name,
      appearanceTemplate,
      dataNode
    });
  });
}

// ============================================================================
// DDS decoder (BC1 / DXT1)
// ============================================================================

function parseDDS(arrayBuffer) {
  const d = new DataView(arrayBuffer);
  const magic = d.getUint32(0, true);
  if (magic !== 0x20534444) { // "DDS "
    throw new Error("Not a DDS file");
  }

  const height = d.getUint32(12, true);
  const width = d.getUint32(16, true);
  const pfFlags = d.getUint32(80, true);
  const fourCC = d.getUint32(84, true);

  const DDPF_FOURCC = 0x4;

  if (!(pfFlags & DDPF_FOURCC)) {
    throw new Error("DDS is not FOURCC-compressed");
  }

  const FOURCC_DXT1 =
    ("D".charCodeAt(0)) |
    ("X".charCodeAt(0) << 8) |
    ("T".charCodeAt(0) << 16) |
    ("1".charCodeAt(0) << 24);

  if (fourCC !== FOURCC_DXT1) {
    throw new Error("Only DXT1/BC1 DDS supported");
  }

  const headerSize = 128;
  const dataOffset = headerSize;
  const byteArray = new Uint8Array(arrayBuffer, dataOffset);

  return {
    width,
    height,
    data: byteArray
  };
}

function decodeDXT1(dds) {
  const { width, height, data } = dds;
  const blockBytes = 8;
  const blocksWide = Math.max(1, Math.floor((width + 3) / 4));
  const blocksHigh = Math.max(1, Math.floor((height + 3) / 4));

  const rgba = new Uint8ClampedArray(width * height * 4);

  let offset = 0;

  function unpack565(c) {
    const r = ((c >> 11) & 0x1f) * 255 / 31;
    const g = ((c >> 5) & 0x3f) * 255 / 63;
    const b = (c & 0x1f) * 255 / 31;
    return [r | 0, g | 0, b | 0];
  }

  for (let by = 0; by < blocksHigh; by++) {
    for (let bx = 0; bx < blocksWide; bx++) {
      const c0 = data[offset] | (data[offset + 1] << 8);
      const c1 = data[offset + 2] | (data[offset + 3] << 8);
      const lookup = data[offset + 4] |
        (data[offset + 5] << 8) |
        (data[offset + 6] << 16) |
        (data[offset + 7] << 24);
      offset += blockBytes;

      const [r0, g0, b0] = unpack565(c0);
      const [r1, g1, b1] = unpack565(c1);

      const colors = new Array(4);
      colors[0] = [r0, g0, b0, 255];
      colors[1] = [r1, g1, b1, 255];

      if (c0 > c1) {
        colors[2] = [
          ((2 * r0 + r1) / 3) | 0,
          ((2 * g0 + g1) / 3) | 0,
          ((2 * b0 + b1) / 3) | 0,
          255
        ];
        colors[3] = [
          ((r0 + 2 * r1) / 3) | 0,
          ((g0 + 2 * g1) / 3) | 0,
          ((b0 + 2 * b1) / 3) | 0,
          255
        ];
      } else {
        colors[2] = [
          ((r0 + r1) / 2) | 0,
          ((g0 + g1) / 2) | 0,
          ((b0 + b1) / 2) | 0,
          255
        ];
        colors[3] = [0, 0, 0, 0];
      }

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const pixelIndex = (py * 4 + px);
          const code = (lookup >> (2 * pixelIndex)) & 0x03;
          const color = colors[code];

          const x = bx * 4 + px;
          const y = by * 4 + py;
          if (x >= width || y >= height) continue;

          const idx = (y * width + x) * 4;
          rgba[idx] = color[0];
          rgba[idx + 1] = color[1];
          rgba[idx + 2] = color[2];
          rgba[idx + 3] = color[3];
        }
      }
    }
  }

  return new ImageData(rgba, width, height);
}

// ============================================================================
// Background loading (DDS) — Option B patch + FIXED IMAGE DETECTION
// ============================================================================

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

let bgImageData = null;
let bgLoaded = false;
let bgLoadingPromise = null;

async function loadBackground() {
  if (bgLoaded) return;
  if (bgLoadingPromise) return bgLoadingPromise;

  bgLoadingPromise = (async () => {
    if (!xmlDoc) return;

    const sections = getMapSections();
    if (!sections) return;

    let imgNode = null;

    // Try the expected name first
    if (sections.galaxyMap) {
      imgNode = sections.galaxyMap.querySelector("Image[Name='imageGalaxy']");
    }

    // If not found, fall back to ANY image inside GalaxyMap
    if (!imgNode && sections.galaxyMap) {
      imgNode = sections.galaxyMap.querySelector("Image");
    }

    if (!imgNode) {
      console.warn("Galaxy background image not found.");
      return;
    }

    const srcRes = imgNode.getAttribute("SourceResource") || "ui_rebel_starfield";
    const ddsPath = `assets/${srcRes}.dds`;

    console.log("Loading background DDS:", ddsPath);

    const resp = await fetch(ddsPath);
    if (!resp.ok) {
      console.error("Failed to load background DDS:", ddsPath);
      return;
    }

    const buf = await resp.arrayBuffer();

    const dds = parseDDS(buf);
    const imageData = decodeDXT1(dds);

    bgImageData = imageData;
    bgLoaded = true;
  })();

  return bgLoadingPromise;
}

// ============================================================================
// Rendering
// ============================================================================

function drawBackground() {
  ctx.fillStyle = "#000014";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (bgLoaded && bgImageData) {
    const off = document.createElement("canvas");
    off.width = bgImageData.width;
    off.height = bgImageData.height;
    const octx = off.getContext("2d");
    octx.putImageData(bgImageData, 0, 0);

    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }
}

function drawPlanet(p) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.stroke();

  ctx.fillStyle = "#cfd8ff";
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(p.name, p.x, p.y - p.radius - 4);
}

function drawButton(b) {
  ctx.fillStyle = "#1b2438";
  ctx.fillRect(b.x, b.y, b.width, b.height);
  ctx.strokeStyle = "#4a5a8a";
  ctx.strokeRect(b.x, b.y, b.width, b.height);

  ctx.fillStyle = "#d6e0ff";
  ctx.font = "9px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(b.label, b.x + 3, b.y + 11);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();

  planets.forEach(drawPlanet);
  buttons.forEach(drawButton);

  renderTables();
  renderDataSourcesTable();
}

// ============================================================================
// Dragging (planets + buttons)
// ============================================================================

let drag = {
  active: false,
  type: null,
  target: null,
  offsetX: 0,
  offsetY: 0
};

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const p = hitPlanet(x, y);
  if (p) {
    drag.active = true;
    drag.type = "planet";
    drag.target = p;
    drag.offsetX = x - p.x;
    drag.offsetY = y - p.y;
    return;
  }

  const b = hitButton(x, y);
  if (b) {
    drag.active = true;
    drag.type = "button";
    drag.target = b;
    drag.offsetX = x - b.x;
    drag.offsetY = y - b.y;
    return;
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!drag.active || !drag.target) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (drag.type === "planet") {
    movePlanet(drag.target, x - drag.offsetX, y - drag.offsetY);
  } else if (drag.type === "button") {
    moveButton(drag.target, x - drag.offsetX, y - drag.offsetY);
  }

  render();
});

canvas.addEventListener("mouseup", () => {
  drag.active = false;
  drag.type = null;
  drag.target = null;
});

canvas.addEventListener("mouseleave", () => {
  drag.active = false;
  drag.type = null;
  drag.target = null;
});

function hitPlanet(x, y) {
  return planets.find(p => {
    const dx = x - p.x;
    const dy = y - p.y;
    return Math.sqrt(dx * dx + dy * dy) <= p.radius + 3;
  });
}

function hitButton(x, y) {
  return buttons.find(b => {
    return x >= b.x && x <= b.x + b.width &&
           y >= b.y && y <= b.y + b.height;
  });
}

function movePlanet(planet, newX, newY) {
  const dx = newX - planet.x;
  const dy = newY - planet.y;

  planet.x = newX;
  planet.y = newY;

  if (planet.labelNode) {
    planet.labelNode.setAttribute("Location", `${Math.round(newX)},${Math.round(newY)}`);
  }

  planet.buttons.forEach(btn => {
    btn.x += dx;
    btn.y += dy;
    if (btn.node) {
      btn.node.setAttribute("Location", `${Math.round(btn.x)},${Math.round(btn.y)}`);
    }
  });
}

function moveButton(button, newX, newY) {
  button.x = newX;
  button.y = newY;
  if (button.node) {
    button.node.setAttribute("Location", `${Math.round(newX)},${Math.round(newY)}`);
  }
}

// ============================================================================
// Tables (planets + buttons)
// ============================================================================

const planetTableBody = document.querySelector("#planetTable tbody");
const buttonTableBody = document.querySelector("#buttonTable tbody");

function renderTables() {
  if (planetTableBody) {
    planetTableBody.innerHTML = "";
    planets.forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${p.name}</td><td>${p.x | 0}</td><td>${p.y | 0}</td>`;
      planetTableBody.appendChild(tr);
    });
  }

  if (buttonTableBody) {
    buttonTableBody.innerHTML = "";
    buttons.forEach(b => {
      const parent = planets.find(p => p.id === b.parentPlanetId);
      const parentName = parent ? parent.name : "(none)";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${b.label}</td><td>${parentName}</td><td>${b.x | 0}</td><td>${b.y | 0}</td>`;
      buttonTableBody.appendChild(tr);
    });
  }
}

// ============================================================================
// DataSource table (appearanceTemplate editor)
// ============================================================================

const dataSourceTableBody = document.querySelector("#dataSourceTable tbody");

function renderDataSourcesTable() {
  if (!dataSourceTableBody) return;

  dataSourceTableBody.innerHTML = "";

  dataSources.forEach(ds => {
    const tr = document.createElement("tr");

    // Planet / DataSource name
    const nameTd = document.createElement("td");
    nameTd.textContent = ds.name;
    tr.appendChild(nameTd);

    // appearanceTemplate editor
    const appTd = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = ds.appearanceTemplate;

    input.addEventListener("change", () => {
      ds.appearanceTemplate = input.value;
      ds.dataNode.setAttribute("appearanceTemplate", input.value);
    });

    appTd.appendChild(input);
    tr.appendChild(appTd);

    dataSourceTableBody.appendChild(tr);
  });
}
