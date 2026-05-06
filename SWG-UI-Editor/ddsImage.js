// ddsImage.js
// DDS loader supporting DXT1, DXT3, DXT5 (SWG UI textures)

class DDSImage {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.format = null;
    this.mipmapCount = 1;
    this.levels = [];
  }

  parse(arrayBuffer) {
    const header = new DataView(arrayBuffer, 0, 128);

    // Magic "DDS "
    if (header.getUint32(0, true) !== 0x20534444) {
      throw new Error("Not a DDS file");
    }

    this.height = header.getUint32(12, true);
    this.width  = header.getUint32(16, true);
  this.mipmapCount = Math.max(1, header.getUint32(28, true));

    const fourCC = header.getUint32(84, true);

    const FOURCC_DXT1 = 0x31545844; // "DXT1"
    const FOURCC_DXT3 = 0x33545844; // "DXT3"
    const FOURCC_DXT5 = 0x35545844; // "DXT5"

    if (fourCC === FOURCC_DXT1) {
      this.format = "DXT1";
    } else if (fourCC === FOURCC_DXT3) {
      this.format = "DXT3";
    } else if (fourCC === FOURCC_DXT5) {
      this.format = "DXT5";
    } else {
      throw new Error("Unsupported DDS format (need DXT1/DXT3/DXT5)");
    }

    const bytesPerBlock = this.format === "DXT1" ? 8 : 16;
    let offset = 128;
    let width = this.width;
    let height = this.height;

    this.levels = [];

    for (let level = 0; level < this.mipmapCount; level += 1) {
      const blockWidth = Math.max(1, Math.ceil(width / 4));
      const blockHeight = Math.max(1, Math.ceil(height / 4));
      const levelSize = blockWidth * blockHeight * bytesPerBlock;

      if (offset + levelSize > arrayBuffer.byteLength) {
        throw new Error("DDS file is truncated or has invalid mip sizes");
      }

      this.levels.push({
        width,
        height,
        data: new Uint8Array(arrayBuffer, offset, levelSize)
      });

      offset += levelSize;
      width = Math.max(1, width >> 1);
      height = Math.max(1, height >> 1);

      if (width === 1 && height === 1 && offset >= arrayBuffer.byteLength) {
        break;
      }
    }
  }
}
