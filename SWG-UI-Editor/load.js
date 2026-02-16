// ============================================================================
// SWG Galaxy Map Editor — DOM-based parser using ui_ticketpurchase.inc
// ============================================================================

let xmlDoc = null;
let planets = [];
let buttons = [];
let nextId = 1;
const genId = () => nextId++;

// -----------------------------------------------------------------------------
// Wire up UI
// -----------------------------------------------------------------------------

document.getElementById("fileInput").addEventListener("change", handleFileSelect);
document.getElementById("parseBtn").addEventListener("click", handleParse);

// Just store file text on selection
let loadedText = "";

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        loadedText = ev.target.result;
    };
    reader.readAsText(file);
}

// -----------------------------------------------------------------------------
// Parse button
// -----------------------------------------------------------------------------

function handleParse() {
    if (!loadedText.trim()) {
        alert("Select a .inc file first.");
        return;
    }

    const parser = new DOMParser();
    xmlDoc = parser.parseFromString(loadedText, "text/xml");

    // Build models
    buildPlanetsModel();
    buildButtonsModel();

    render();
}

// -----------------------------------------------------------------------------
// Map sections (same logic as old working version)
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Build planets model (from PlanetNames Text nodes)
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Build buttons model (from GalaxyMap buttons)
// -----------------------------------------------------------------------------

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

        // Try to link to a planet by name substring
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
// Canvas + Rendering
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
// Dragging planets (and updating XML)
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

    // Update label Location in XML
    if (planet.labelNode) {
        planet.labelNode.setAttribute("Location", `${Math.round(newX)},${Math.round(newY)}`);
    }

    // Move attached buttons visually and update their XML Location
    planet.buttons.forEach(btn => {
        btn.x += dx;
        btn.y += dy;
        if (btn.node) {
            btn.node.setAttribute("Location", `${Math.round(btn.x)},${Math.round(btn.y)}`);
        }
    });
}

// ============================================================================
// Tables
// ============================================================================

const planetTableBody = document.querySelector("#planetTable tbody");
const buttonTableBody = document.querySelector("#buttonTable tbody");

function renderTables() {
    planetTableBody.innerHTML = "";
    planets.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${p.name}</td><td>${p.x | 0}</td><td>${p.y | 0}</td>`;
        planetTableBody.appendChild(tr);
    });

    buttonTableBody.innerHTML = "";
    buttons.forEach(b => {
        const parent = planets.find(p => p.id === b.parentPlanetId);
        const parentName = parent ? parent.name : "(none)";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${b.label}</td><td>${parentName}</td><td>${b.x | 0}</td><td>${b.y | 0}</td>`;
        buttonTableBody.appendChild(tr);
    });
}
