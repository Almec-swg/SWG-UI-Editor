// ddsLoader.js
// Loads DDS textures (DXT1/DXT3/DXT5) into WebGL

function loadDDS(gl, url, texture, onDone) {
  fetch(url)
    .then(res => res.arrayBuffer())
    .then(buffer => {
      const dds = new DDSImage();
      dds.parse(buffer);

      const ext = gl.getExtension("WEBGL_compressed_texture_s3tc");
      if (!ext) {
        throw new Error("S3TC compression not supported by this browser");
      }

      gl.bindTexture(gl.TEXTURE_2D, texture);

      let internalFormat;

      if (dds.format === "DXT1") {
        internalFormat = ext.COMPRESSED_RGBA_S3TC_DXT1_EXT;
      } else if (dds.format === "DXT3") {
        internalFormat = ext.COMPRESSED_RGBA_S3TC_DXT3_EXT;
      } else if (dds.format === "DXT5") {
        internalFormat = ext.COMPRESSED_RGBA_S3TC_DXT5_EXT;
      }

      dds.levels.forEach((level, index) => {
        gl.compressedTexImage2D(
          gl.TEXTURE_2D,
          index,
          internalFormat,
          level.width,
          level.height,
          0,
          level.data
        );
      });

      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        dds.levels.length > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      onDone();
    })
    .catch(err => {
      console.error("DDS load failed:", err);
    });
}
