// ============================================================================
// SWG GALAXY MAP EDITOR — load.js
// Loads .inc files, parses SWG UI XML, renders planets + buttons,
// and maintains parent–child movement.
// ============================================================================

// -----------------------------------------------------------------------------
// Data Model
// -----------------------------------------------------------------------------

let planets = [];
let buttons = [];

let nextId = 1;
const genId = () => nextId++;

// -----------------------------------------------------------------------------
// File Input Listener
// -----------------------------------------------------------------------------

document.getElementById("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    parseInc(text);
    render();
});

// -----------------------------------------------------------------------------
// REAL SWG .inc PARSER
// -----------------------------------------------------------------------------

function parseInc(incText) {
    planets = [];
    buttons = [];

    // ---------------------------------------------------------
    // 1. Clean the .inc file so the browser can parse it
    // ---------------------------------------------------------

    let xmlText = incText;

    // Remove SWG-style comments: // comment
    xmlText = xmlText.replace(/\/\/.*$/gm, "");

    // Remove C-style comments: /* ... */
    xmlText = xmlText.replace(/\/\*[\s\S]*?\*\//gm, "");

    // Fix missing closing tags by auto-closing simple tags
    xmlText = xmlText.replace(/<(\w+)([^>]*)>/g, (match, tag, attrs) => {
        if (match.endsWith("/>")) return match; // already self-closing
        if (match.includes("</")) return match; // already closed
        return `<${tag}${attrs}></${tag}>`;
    });

    // Wrap in a root node so DOMParser doesn't choke
    xmlText = `<Root>${xmlText}</Root>`;

    // ---------------------------------------------------------
    // 2. Parse using DOMParser
    // ---------------------------------------------------------

    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "text/xml");

    const parseError = xml.querySelector("parsererror");
    if (parseError) {
        console.error("XML Parse Error:", parseError.textContent);
        alert("Failed to parse .inc file. Check console for details.");
        return;
    }

    // ---------------------------------------------------------
    // 3. Extract Windows (Planets)
    // ---------------------------------------------------------

    const windows = [...xml.getElementsByTagName("Window")];

    windows.forEach(win => {
        const name = win.getAttribute("Name");
        if (!name) return;

        // Detect planets by naming convention
        if (!name.toLowerCase().includes("planet")) return;

        const loc = win.querySelector("Location");
        if (!loc) return;

        const x = parseFloat(loc.getAttribute("X")) || 0;
        const y = parseFloat(loc.getAttribute("Y")) || 0;

        planets.push({
            id: genId(),
            name,
            x,
            y,
            radius: 10,
            color: "#7fd4ff",
            buttons: []
        });
    });

    // ---------------------------------------------------------
    // 4. Extract Buttons
    // ---------------------------------------------------------

    const btnNodes = [...xml.getElementsByTagName("Button")];

    btnNodes.forEach(btn => {
        const name = btn.getAttribute("Name") || "Button";

        const loc = btn.querySelector("Location");
        if (!loc) return;

        const x = parseFloat(loc.getAttribute("X")) || 0;
        const y = parseFloat(loc.getAttribute("Y")) || 0;
        const w = parseFloat(loc.getAttribute("Width")) || 80;
        const h = parseFloat(loc.getAttribute("Height")) || 16;

        // Try to detect parent planet by name
        let parentPlanet = planets.find(p =>
            name.toLowerCase().includes(
                p.name.toLowerCase().replace("planet_", "")
            )
        );

        const buttonObj = {
            id: genId(),
            label: name,
            x,
            y,
            width: w,
            height: h,
            parentPlanetId: parentPlanet ? parentPlanet.id : null
        };

        buttons.push(buttonObj);

        if (parentPlanet) {
            parentPlanet.buttons.push(buttonObj);
        }
    });
}

// -----------------------------------------------------------------------------
// Canvas + Rendering
// -----------------------------------------------------------------------------

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");

function drawBackground() {
    ctx.fillStyle = "#000014";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
    ctx.fillText(b.label, b.x + 3, b.y + 11);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();

    planets.forEach(drawPlanet);
    buttons.forEach(drawButton);

    renderTables();
}

// -----------------------------------------------------------------------------
// Dragging Logic
// -----------------------------------------------------------------------------

let drag = { active: false, planet: null, offsetX: 0, offsetY: 0 };

canvas.addEventListener("mousedown", (e) => {
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
});

canvas.addEventListener("mousemove", (e) => {
    if (!drag.active) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    movePlanet(drag.planet, x - drag.offsetX, y - drag.offsetY);
    render();
});

canvas.addEventListener("mouseup", () => drag.active = false);
canvas.addEventListener("mouseleave", () => drag.active = false);

function hitPlanet(x, y) {
    return planets.find(p => {
        const dx = x - p.x;
        const dy = y - p.y;
        return Math.sqrt(dx * dx + dy * dy) <= p.radius + 3;
    });
}

function movePlanet(planet, newX, newY) {
    const dx = newX - planet.x;
    const dy = newY - planet.y;

    planet.x = newX;
    planet.y = newY;

    // Move all attached buttons
    planet.buttons.forEach(btn => {
        btn.x += dx;
        btn.y += dy;
    });
}

// -----------------------------------------------------------------------------
// Tables
// -----------------------------------------------------------------------------

const planetTableBody = document.querySelector("#planetTable tbody");
const buttonTableBody = document.querySelector("#buttonTable tbody");

function renderTables() {
    planetTableBody.innerHTML = "";
    planets.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${p.name}</td><td>${p.x|0}</td><td>${p.y|0}</td>`;
        planetTableBody.appendChild(tr);
    });

    buttonTableBody.innerHTML = "";
    buttons.forEach(b => {
        const parent = planets.find(p => p.id === b.parentPlanetId);
        const parentName = parent ? parent.name : "(none)";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${b.label}</td><td>${parentName}</td><td>${b.x|0}</td><td>${b.y|0}</td>`;
        buttonTableBody.appendChild(tr);
    });
}
