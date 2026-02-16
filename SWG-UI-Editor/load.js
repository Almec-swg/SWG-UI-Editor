// ============================================================================
// SWG GALAXY MAP EDITOR — REGEX-BASED PARSER (NO XML)
// ============================================================================

let planets = [];
let buttons = [];
let nextId = 1;
const genId = () => nextId++;

// -----------------------------------------------------------------------------
// Parse Button
// -----------------------------------------------------------------------------

document.getElementById("parseBtn").addEventListener("click", async () => {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput.files[0];

    if (!file) {
        alert("Select a .inc file first.");
        return;
    }

    const text = await file.text();
    parseInc(text);
    render();
});

// ============================================================================
// REGEX PARSER — WORKS WITH REAL SWG .INC FILES
// ============================================================================

function parseInc(text) {
    planets = [];
    buttons = [];

    // Strip comments
    text = text.replace(/\/\/.*$/gm, "");
    text = text.replace(/\/\*[\s\S]*?\*\//gm, "");

    // ---------------------------------------------------------
    // 1. PLANETS from <Text ... Name='X' ... Location='x,y'>
    //    (e.g. inside Page Name='PlanetNames')
    // ---------------------------------------------------------

    const planetLabelRegex =
        /<Text[\s\S]*?Name=['"]([^'"]+)['"][\s\S]*?Location=['"](\d+),(\d+)['"][\s\S]*?>/gi;

    let match;
    while ((match = planetLabelRegex.exec(text)) !== null) {
        const name = match[1];
        const x = parseFloat(match[2]);
        const y = parseFloat(match[3]);

        planets.push({
            id: genId(),
            name,
            x,
            y,
            radius: 10,
            color: "#7fd4ff",
            buttons: []
        });
    }

    // ---------------------------------------------------------
    // 2. BUTTONS from <Button ... Name='X' ... Location='x,y'>
    // ---------------------------------------------------------

    const buttonRegex =
        /<Button[\s\S]*?Name=['"]([^'"]+)['"][\s\S]*?Location=['"](\d+),(\d+)['"][\s\S]*?>/gi;

    while ((match = buttonRegex.exec(text)) !== null) {
        const name = match[1];
        const x = parseFloat(match[2]);
        const y = parseFloat(match[3]);

        const buttonObj = {
            id: genId(),
            label: name,
            x,
            y,
            width: 80,
            height: 16,
            parentPlanetId: null
        };

        // Try to link button to a planet by name substring
        const lower = name.toLowerCase();
        const parent = planets.find(p => lower.includes(p.name.toLowerCase()));

        if (parent) {
            buttonObj.parentPlanetId = parent.id;
            parent.buttons.push(buttonObj);
        }

        buttons.push(buttonObj);
    }
}

// ============================================================================
// RENDERING
// ============================================================================

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

// ============================================================================
// DRAGGING
// ============================================================================

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

    planet.buttons.forEach(btn => {
        btn.x += dx;
        btn.y += dy;
    });
}

// ============================================================================
// TABLES
// ============================================================================

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
