let xmlDoc = null;

document.getElementById('fileInput').addEventListener('change', handleFileSelect);
document.getElementById('parseBtn').addEventListener('click', handleParse);
document.getElementById('exportBtn').addEventListener('click', handleExport);

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('rawInput').value = ev.target.result;
  };
  reader.readAsText(file);
}

function handleParse() {
  const text = document.getElementById('rawInput').value;
  if (!text.trim()) {
    alert('Paste or load a .inc file first.');
    return;
  }
  const parser = new DOMParser();
  xmlDoc = parser.parseFromString(text, 'text/xml');

  // TODO: find sections and render planets
  renderPlanets();
}

function handleExport() {
  if (!xmlDoc) {
    alert('Nothing parsed yet.');
    return;
  }
  const serializer = new XMLSerializer();
  const output = serializer.serializeToString(xmlDoc);
  document.getElementById('output').value = output;
}
