/**
 * pdfkitFontPatch.js
 *
 * On Vercel serverless, pdfkit's standard font files (Helvetica.cjs, etc.)
 * are not automatically bundled because they are loaded via dynamic require().
 * This patch intercepts those require() calls and redirects them to our
 * vendored copy in backend/src/assets/pdfkit-fonts/.
 *
 * MUST be required before PDFDocument is instantiated.
 */
const Module = require('module');
const path = require('path');
const fs = require('fs');

const FONT_ASSETS_DIR = path.join(__dirname, '../assets/pdfkit-fonts');

const _resolveFilename = Module._resolveFilename.bind(Module);

Module._resolveFilename = function (request, parent, isMain, options) {
  // Intercept pdfkit standard-font requires: e.g. ".../pdfkit/js/standard-fonts/Helvetica.cjs"
  const MARKER = path.join('pdfkit', 'js', 'standard-fonts');
  if (request.includes('standard-fonts') || (parent && parent.filename && parent.filename.includes(MARKER))) {
    // Extract just the filename portion
    const basename = path.basename(request);
    const candidate = path.join(FONT_ASSETS_DIR, basename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    // Try chunks subdirectory
    const chunksCandidate = path.join(FONT_ASSETS_DIR, 'chunks', basename);
    if (fs.existsSync(chunksCandidate)) {
      return chunksCandidate;
    }
  }
  // Also intercept chunks requires from within pdfkit fonts
  if (parent && parent.filename && parent.filename.includes(FONT_ASSETS_DIR) && request.startsWith('./chunks/')) {
    const chunkFile = path.basename(request);
    const chunkPath = path.join(FONT_ASSETS_DIR, 'chunks', chunkFile);
    if (fs.existsSync(chunkPath)) {
      return chunkPath;
    }
  }
  return _resolveFilename(request, parent, isMain, options);
};
