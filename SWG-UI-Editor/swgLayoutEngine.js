// ============================================================================
// SWG Galaxy Map Layout Engine (Simplified, Stable Version)
// - Treats Galaxy Map labels/buttons as absolute in 501x486 space
// - Ignores PackLocation/PackSize/ScrollExtent for Galaxy Map elements
// - Scales to 512x512 canvas
// ============================================================================

const SWG_MAP_WIDTH = 501;
const SWG_MAP_HEIGHT = 486;

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 512;

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
// Galaxy Map detection
// ---------------------------------------------------------------------------

function isGalaxyMapElement(element) {
  const name = (element.name || "").toLowerCase();
  if (!name) return false;

  // Planet labels + buttons + map pages
  if (name === "planetnames" || name === "map" || name.includes("button")) {
    return true;
  }

  // Known planet label names
  const planetNames = [
    "corellia","dantooine","dathomir","endor","lok","dungeon2","naboo","rori",
    "talus","hoth","taanab","mandalore","tatooine","chandrila","kaas",
    "coruscant","moraband","jakku","yavin4"
  ];

  return planetNames.includes(name);
}

// ---------------------------------------------------------------------------
// Main layout
// ---------------------------------------------------------------------------

function computeElementLayout(element) {
  const parent = element.parent || {
    x: 0,
    y: 0,
    width: SWG_MAP_WIDTH,
    height: SWG_MAP_HEIGHT
  };

  const loc = element.location || { x: 0, y: 0 };
  const size = element.size || { w: 0, h: 0 };

  // -------------------------------------------------------------------------
  // GALAXY MAP ELEMENTS: Location is absolute in 501x486 space
  // -------------------------------------------------------------------------
  if (isGalaxyMapElement(element)) {
    const swgX = loc.x;
    const swgY = loc.y;

    return {
      x: swgX * SCALE_X,
      y: swgY * SCALE_Y,
      width: size.w * SCALE_X,
      height: size.h * SCALE_Y
    };
  }

  // -------------------------------------------------------------------------
  // GENERIC SWG LAYOUT (for anything else you might add later)
  // -------------------------------------------------------------------------

  const ps = element.packSize || { h: "a", v: "a" };
  let w = element.scrollExtent?.w || size.w || 0;
  let h = element.scrollExtent?.h || size.h || 0;

  if (ps.h === "p") w = parent.width * (w / SWG_MAP_WIDTH);
  if (ps.h === "f") w = parent.width;

  if (ps.v === "p") h = parent.height * (h / SWG_MAP_HEIGHT);
  if (ps.v === "f") h = parent.height;

  const pl = element.packLocation || { h: "nfn", v: "nfn" };
  let baseX = 0, baseY = 0;

  if (pl.h === "cpc") baseX = (parent.width - w) / 2;
  else if (pl.h === "nfp" || pl.h === "pfp") baseX = parent.width - w;

  if (pl.v === "cpc") baseY = (parent.height - h) / 2;
  else if (pl.v === "pfp" || pl.v === "pfn") baseY = parent.height - h;

  let x = parent.x + baseX + loc.x;
  let y = parent.y + baseY + loc.y;

  return {
    x: x * SCALE_X,
    y: y * SCALE_Y,
    width: w * SCALE_X,
    height: h * SCALE_Y
  };
}

// ---------------------------------------------------------------------------
// Expose globally
// ---------------------------------------------------------------------------

window.computeElementLayout = computeElementLayout;
window.parseLocation = parseLocation;
window.parseSize = parseSize;
window.parsePackLocation = parsePackLocation;
window.parsePackSize = parsePackSize;
