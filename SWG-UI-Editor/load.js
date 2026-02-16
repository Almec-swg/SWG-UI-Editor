let xmlDoc = null;

// Wire up UI events
document.getElementById('fileInput').addEventListener('change', handleFileSelect);
document.getElementById('parseBtn').addEventListener('click', handleParse);
document.getElementById('exportBtn').addEventListener('click', handleExport);
document.getElementById('addPlanetBtn').addEventListener('click', handleAddPlanet);

// Load file into textarea
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('rawInput').value = ev.target.result;
  };
  reader.readAsText(file);
}

// Parse XML
function handleParse() {
  const text = document.getElementById('rawInput').value.trim();
  if (!text) {
    alert('Paste or load a .inc file first.');
    return;
  }

  const parser = new DOMParser();
  xmlDoc = parser.parseFromString(text, 'text/xml');

  renderPlanets();
  renderButtons();
  renderCodeData();
  renderPreview();
}

// Export XML
function handleExport() {
  if (!xmlDoc) {
    alert('Nothing parsed yet.');
    return;
  }

  const serializer = new XMLSerializer();
  const output = serializer.serializeToString(xmlDoc);
  document.getElementById('output').value = output;
}

// Locate key sections
function getMapSections() {
  if (!xmlDoc) return null;

  const ticketPurchase = xmlDoc.querySelector("Page[Name='TicketPurchase'] Page[Name='ticketPurchase']");
  if (!ticketPurchase) return null;

  const map = ticketPurchase.querySelector("Page[Name='map']");
  if (!map) return null;

  return {
    map,
    planetNames: map.querySelector("Page[Name='PlanetNames']"),
    planets: map.querySelector("Page[Name='Planets']"),
    galaxyMap: map.querySelector("Page[Name='GalaxyMap']")
  };
}

// Extract planets into a model
function getPlanetsModel() {
  const sections = getMapSections();
  if (!sections) return [];

  const { planetNames, planets } = sections;

  const labels = Array.from(planetNames.querySelectorAll("Text"));
  const pages = Array.from(planets.querySelectorAll(":scope > Page"));

  return labels.map(label => {
    const name = label.getAttribute('Name');
    const loc = label.getAttribute('Location') || '0,0';

    const page = pages.find(p => p.getAttribute('Name') === name);
    let sourceResource = '';

    if (page) {
      const img = page.querySelector('Image');
      if (img) sourceResource = img.getAttribute('SourceResource') || '';
    }

    return {
      name,
      labelNode: label,
      pageNode: page || null,
      location: loc,
      sourceResource
    };
  });
}

// Render editable planet table
function renderPlanets() {
  const container = document.getElementById('planetsContainer');
  container.innerHTML = '';

  const planets = getPlanetsModel();
  if (!planets.length) {
    container.textContent = 'No planets found.';
    return;
  }

  const table = document.createElement('table');
  table.border = '1';

  const header = document.createElement('tr');
  header.innerHTML = `
    <th>Name</th>
    <th>Label Location</th>
    <th>Map Resource</th>
  `;
  table.appendChild(header);

  planets.forEach(planet => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = planet.name;
    row.appendChild(nameCell);

    const locCell = document.createElement('td');
    const locInput = document.createElement('input');
    locInput.value = planet.location;
    locInput.size = 10;
    locInput.addEventListener('change', () => {
      planet.location = locInput.value;
      planet.labelNode.setAttribute('Location', locInput.value);
      renderPreview();
    });
    locCell.appendChild(locInput);
    row.appendChild(locCell);

    const resCell = document.createElement('td');
    const resInput = document.createElement('input');
    resInput.value = planet.sourceResource;
    resInput.size = 25;
    resInput.addEventListener('change', () => {
      planet.sourceResource = resInput.value;
      if (!planet.pageNode) createPlanetPage(planet);
      const img = planet.pageNode.querySelector('Image');
      if (img) img.setAttribute('SourceResource', resInput.value);
    });
    resCell.appendChild(resInput);
    row.appendChild(resCell);

    table.appendChild(row);
  });

  container.appendChild(table);
}

// Create missing planet map pages
function createPlanetPage(planet) {
  const sections = getMapSections();
  if (!sections) return;
  const { planets } = sections;

  const page = xmlDoc.createElement('Page');
  page.setAttribute('BackgroundOpacity', '1.00');
  page.setAttribute('Name', planet.name);
  page.setAttribute('PackLocation', 'nfn,nfn');
  page.setAttribute('PackSize', 'a,a');
  page.setAttribute('RStyleDefault', 'rs_default');
  page.setAttribute('ScrollExtent', '498,482');
  page.setAttribute('Size', '498,482');

  const img = xmlDoc.createElement('Image');
  img.setAttribute('BackgroundOpacity', '1.00');
  img.setAttribute('Name', 'New Image');
  img.setAttribute('PackLocation', 'nfn,nfn');
  img.setAttribute('PackSize', 'a,a');
  img.setAttribute('ScrollExtent', '498,482');
  img.setAttribute('Size', '498,482');
  img.setAttribute('SourceRect', '0,0,1024,1024');
  img.setAttribute('SourceResource', planet.sourceResource || '');

  page.appendChild(img);
  planets.appendChild(page);

  planet.pageNode = page;
}

// Add new planet
function handleAddPlanet() {
  const name = prompt('New planet name (e.g., Kashyyyk):');
  if (!name) return;

  const sections = getMapSections();
  if (!sections) return;

  const { planetNames } = sections;

  const label = xmlDoc.createElement('Text');
  label.setAttribute('Name', name);
  label.setAttribute('LocalText', name);
  label.setAttribute('Location', '200,200');
  label.setAttribute('Font', 'bold_13');
  label.setAttribute('TextColor', '#62FF15');
  label.textContent = name;

  planetNames.appendChild(label);

  renderPlanets();
  renderPreview();
}

// Extract GalaxyMap buttons
function getGalaxyButtons() {
  const sections = getMapSections();
  if (!sections) return [];

  const { galaxyMap } = sections;
  if (!galaxyMap) return [];

  const buttons = Array.from(galaxyMap.querySelectorAll("Button"));

  return buttons.map(btn => ({
    name: btn.getAttribute('Name'),
    node: btn,
    location: btn.getAttribute('Location') || '0,0'
  }));
}

// Render GalaxyMap button table
function renderButtons() {
  const container = document.getElementById('buttonsContainer');
  container.innerHTML = '';

  const buttons = getGalaxyButtons();
  if (!buttons.length) {
    container.textContent = 'No GalaxyMap buttons found.';
    return;
  }

  const table = document.createElement('table');
  table.border = '1';

  const header = document.createElement('tr');
  header.innerHTML = `
    <th>Name</th>
    <th>Location</th>
  `;
  table.appendChild(header);

  buttons.forEach(btn => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = btn.name;
    row.appendChild(nameCell);

    const locCell = document.createElement('td');
    const locInput = document.createElement('input');
    locInput.value = btn.location;
    locInput.size = 10;
    locInput.addEventListener('change', () => {
      btn.location = locInput.value;
      btn.node.setAttribute('Location', locInput.value);
    });
    locCell.appendChild(locInput);
    row.appendChild(locCell);

    table.appendChild(row);
  });

  container.appendChild(table);
}

// Extract CodeData
function getCodeData() {
  const codeData = xmlDoc.querySelector("Data[Name='CodeData']");
  if (!codeData) return [];

  const attributes = Array.from(codeData.attributes);

  return attributes.map(attr => ({
    key: attr.name,
    value: attr.value,
    node: codeData
  }));
}

// Render CodeData table
function renderCodeData() {
  const container = document.getElementById('codeDataContainer');
  container.innerHTML = '';

  const entries = getCodeData();
  if (!entries.length) {
    container.textContent = 'No CodeData found.';
    return;
  }

  const table = document.createElement('table');
  table.border = '1';

  const header = document.createElement('tr');
  header.innerHTML = `
    <th>Key</th>
    <th>Value</th>
  `;
  table.appendChild(header);

  entries.forEach(entry => {
    const row = document.createElement('tr');

    const keyCell = document.createElement('td');
    keyCell.textContent = entry.key;
    row.appendChild(keyCell);

    const valCell = document.createElement('td');
    const valInput = document.createElement('input');
    valInput.value = entry.value;
    valInput.size = 40;
    valInput.addEventListener('change', () => {
      entry.node.setAttribute(entry.key, valInput.value);
    });
    valCell.appendChild(valInput);
    row.appendChild(valCell);

    table.appendChild(row);
  });

  container.appendChild(table);
}

// Coordinate preview
function renderPreview() {
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const planets = getPlanetsModel();

  planets.forEach(p => {
    const [x, y] = p.location.split(',').map(Number);

    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f0';
    ctx.fillText(p.name, x + 8, y + 4);
  });
}
