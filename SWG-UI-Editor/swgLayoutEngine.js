// swgLayoutEngine.js

// Basic element shape your editor should pass in:
// {
//   name: 'buttonTatooine',
//   location: { x: 341, y: 366 },
//   size: { w: 52, h: 51 },
//   scrollExtent: { w: 52, h: 51 },
//   packLocation: { h: 'nfn', v: 'nfn' }, // or 'cpc', etc.
//   packSize: { h: 'a', v: 'a' },        // 'a', 'p', 'f'
//   parent: { ...same shape... }         // or null for root
// }

const SWG_MAP_WIDTH = 501;
const SWG_MAP_HEIGHT = 486;
const BG_WIDTH = 512;
const BG_HEIGHT = 512;

// Background scale to match SWG map frame
const BG_SCALE_X = SWG_MAP_WIDTH / BG_WIDTH;
const BG_SCALE_Y = SWG_MAP_HEIGHT / BG_HEIGHT;

function applyPackSize(element, parent) {
  const ps = element.packSize || { h: 'a', v: 'a' };
  let w = element.scrollExtent?.w ?? element.size?.w ?? 0;
  let h = element.scrollExtent?.h ?? element.size?.h ?? 0;

  if (parent) {
    if (ps.h === 'p') w = parent.width * (w / SWG_MAP_WIDTH);
    if (ps.h === 'f') w = parent.width;
    if (ps.v === 'p') h = parent.height * (h / SWG_MAP_HEIGHT);
    if (ps.v === 'f') h = parent.height;
  }

  return { w, h };
}

function applyPackLocation(element, parent, width, height) {
  const pl = element.packLocation || { h: 'nfn', v: 'nfn' };

  let baseX = 0;
  let baseY = 0;

  if (parent) {
    // horizontal
    if (pl.h === 'cpc') {
      baseX = (parent.width - width) / 2;
    } else if (pl.h === 'nfp') {
      baseX = parent.width - width;
    } else if (pl.h === 'pfn') {
      baseX = 0; // bottom-left horizontally same as left
    } else if (pl.h === 'pfp') {
      baseX = parent.width - width;
    }

    // vertical
    if (pl.v === 'cpc') {
      baseY = (parent.height - height) / 2;
    } else if (pl.v === 'pfp') {
      baseY = parent.height - height;
    } else if (pl.v === 'pfn') {
      baseY = parent.height - height;
    }
  }

  return { baseX, baseY };
}

function applyScrollExtentOffset(element, width, height) {
  const se = element.scrollExtent || { w: width, h: height };
  const offsetX = (se.w - width) / 2;
  const offsetY = (se.h - height) / 2;
  return { offsetX, offsetY };
}

function computeElementLayout(element) {
  const parent = element.parent || {
    x: 0,
    y: 0,
    width: SWG_MAP_WIDTH,
    height: SWG_MAP_HEIGHT
  };

  // 1) size (PackSize)
  const { w, h } = applyPackSize(element, parent);

  // 2) pack location
  const { baseX, baseY } = applyPackLocation(element, parent, w, h);

  // 3) local location
  const loc = element.location || { x: 0, y: 0 };
  let x = parent.x + baseX + loc.x;
  let y = parent.y + baseY + loc.y;

  // 4) scrollExtent vs size offset
  const { offsetX, offsetY } = applyScrollExtentOffset(element, w, h);
  x += offsetX;
  y += offsetY;

  // 5) background scaling (map space → DDS space)
  x *= BG_SCALE_X;
  y *= BG_SCALE_Y;
  const width = w * BG_SCALE_X;
  const height = h * BG_SCALE_Y;

  return { x, y, width, height };
}

export { computeElementLayout, SWG_MAP_WIDTH, SWG_MAP_HEIGHT, BG_SCALE_X, BG_SCALE_Y };
