// ============================================================================
// SWG Layout Engine (Global Version for load.js)
// Computes true SWG UI positions using PackLocation, PackSize, ScrollExtent,
// parent offsets, and scaling to the 512x512 canvas.
// ============================================================================

// SWG map ScrollExtent (from your .inc)
const SWG_MAP_WIDTH = 501;
const SWG_MAP_HEIGHT = 486;

// Canvas size (your index.html)
const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 512;

// Scale SWG map → canvas
const SCALE_X = CANVAS_WIDTH / SWG_MAP_WIDTH;
const SCALE_Y = CANVAS_HEIGHT / SWG_MAP_HEIGHT;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseLocation(str) {
  if (!str) return { x: 0, y: 0 };
  const [x, y] = str.split(",").map(Number);
  return { x: x || 0, y: y || 0 };
}

function parseSize(str) {
  if (!str) return { w: 0, h: 0 };
  const [w, h] = str.split(",").map(Number);
  return { w: w || 0, h: h || 0 };
}

function parsePackLocation(str) {
  if (!str) return { h: "nfn", v: "nfn" };
  const [h, v] = str.split(",");
  return { h: h || "nfn", v: v || "nfn" };
}

function parsePackSize(str) {
  if (!str) return { h: "a", v: "a" };
  const [h, v] = str.split(",");
  return { h: h || "a", v: v || "a" };
}

// ---------------------------------------------------------------------------
// PackSize
// ---------------------------------------------------------------------------

function applyPackSize(element, parent) {
  const ps = element.packSize;
  let w = element.scrollExtent.w || element.size.w || 0;
  let h = element.scrollExtent.h || element.size.h || 0;

  if (parent) {
    if (ps.h === "p") w = parent.width * (w / SWG_MAP_WIDTH);
    if (ps.h === "f") w = parent.width;

    if (ps.v === "p") h = parent.height * (h / SWG_MAP_HEIGHT);
    if (ps.v === "f") h = parent.height;
  }

  return { w, h };
}

// ---------------------------------------------------------------------------
// PackLocation
// ---------------------------------------------------------------------------

function applyPackLocation(element, parent, width, height) {
  const pl = element.packLocation;
  let baseX = 0;
  let baseY = 0;

  if (parent) {
    // Horizontal
    if (pl.h === "cpc") baseX = (parent.width - width) / 2;
    else if (pl.h === "nfp") baseX = parent.width - width;
    else if (pl.h === "pfp") baseX = parent.width - width;

    // Vertical
    if (pl.v === "cpc") baseY = (parent.height - height) / 2;
    else if (pl.v === "pfp") baseY = parent.height - height;
    else if (pl.v === "pfn") baseY = parent.height - height;
  }

  return { baseX, baseY };
}

// ---------------------------------------------------------------------------
// ScrollExtent offset
// ---------------------------------------------------------------------------

function applyScrollExtentOffset(element, width, height) {
  const se = element.scrollExtent;
  const offsetX = (se.w - width) / 2;
  const offsetY = (se.h - height) / 2;
  return { offsetX, offsetY };
}

// ---------------------------------------------------------------------------
// Main layout function
// ---------------------------------------------------------------------------

function computeElementLayout(element) {
  const parent = element.parent || {
    x: 0,
    y: 0,
    width: SWG_MAP_WIDTH,
    height: SWG_MAP_HEIGHT
  };

  // 1) PackSize
  const { w, h } = applyPackSize(element, parent);

  // 2) PackLocation
  const { baseX, baseY } = applyPackLocation(element, parent, w, h);

  // 3) Local Location
  const loc = element.location;
  let x = parent.x + baseX + loc.x;
  let y = parent.y + baseY + loc.y;

  // 4) ScrollExtent offset
  const { offsetX, offsetY } = applyScrollExtentOffset(element, w, h);
  x += offsetX;
  y += offsetY;

  // 5) Scale to canvas
  x *= SCALE_X;
  y *= SCALE_Y;
  const width = w * SCALE_X;
  const height = h * SCALE_Y;

  return { x, y, width, height };
}

// Expose globally
window.computeElementLayout = computeElementLayout;
window.parseLocation = parseLocation;
window.parseSize = parseSize;
window.parsePackLocation = parsePackLocation;
window.parsePackSize = parsePackSize;
