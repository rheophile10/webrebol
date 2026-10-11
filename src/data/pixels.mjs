/** @import { Pixel } from "../types/values.mjs" */

const OPAQUE = 255;

/**
 * Packs the bytes of a REBOL color into one pixel.
 * @param {number[]} bytes - Red, green, blue and the REBOL alpha. Absent bytes are zero.
 * @returns {Pixel}
 * @standard alpha - The REBOL alpha 0 is a pixel that is not transparent. The pixel holds 255 for it, as a canvas does.
 * @keypoint The bytes of a pixel have the sequence of the picture data of a canvas. Thus a page shows an image without a calculation.
 * @uses OPAQUE
 * @usedby makeImage, giveFilled (src/natives/objects.mjs), writePixel (src/store/pictures.mjs),
 *   START (src/view/raster.mjs), readColor (src/view/raster.mjs), WHITE (test/view.test.mjs)
 */
export const packPixel = (bytes) =>
  (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16) | ((OPAQUE - (bytes[3] ?? 0)) << 24);

/**
 * Gives the bytes of the REBOL color of a pixel.
 * @param {Pixel} pixel
 * @returns {number[]}
 * @standard inverse - The bytes of a packed color are the same bytes again.
 * @uses OPAQUE
 * @usedby moldImage (src/store/mold.mjs), readPixel (src/store/pictures.mjs)
 */
export const unpackPixel = (pixel) => [pixel & 255, (pixel >> 8) & 255, (pixel >> 16) & 255, OPAQUE - (pixel >>> 24)];
