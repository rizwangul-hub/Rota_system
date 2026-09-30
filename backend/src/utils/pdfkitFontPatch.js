/**
 * pdfkitFontPatch.js
 *
 * On Vercel serverless, pdfkit's standard-fonts are not bundled because
 * they are resolved via package.json "imports" (#standard-fonts/*) which
 * Vercel's bundler strips from node_modules. This patch copies our vendored
 * font files from backend/src/assets/pdfkit-fonts/ into pdfkit's expected
 * location at runtime (before pdfkit is required).
 *
 * MUST be required before PDFDocument is instantiated.
 */
const Module = require('module');
const path = require('path');
const fs = require('fs');

// Our vendored copy (always bundled via vercel.json includeFiles)
const FONT_ASSETS_DIR = path.join(__dirname, '../assets/pdfkit-fonts');

// pdfkit's expected location for standard-fonts
// Try multiple root paths since __dirname can vary in serverless
const PDFKIT_ROOTS = [
  path.join(__dirname, '../../node_modules/pdfkit'),
  path.join(process.cwd(), 'node_modules/pdfkit'),
  path.join(process.cwd(), 'backend/node_modules/pdfkit'),
  '/var/task/node_modules/pdfkit',
  '/var/task/backend/node_modules/pdfkit'
];

function ensurePdfkitFonts() {
  // Only run if our vendored fonts exist
  if (!fs.existsSync(FONT_ASSETS_DIR)) return;

  for (const root of PDFKIT_ROOTS) {
    const targetFontsDir = path.join(root, 'js/standard-fonts');
    const targetChunksDir = path.join(root, 'js/standard-fonts/chunks');

    // Skip if the root doesn't exist
    if (!fs.existsSync(root)) continue;

    // Ensure target directories exist
    try {
      fs.mkdirSync(targetFontsDir, { recursive: true });
      fs.mkdirSync(targetChunksDir, { recursive: true });
    } catch (e) {
      continue; // Can't write here, try next
    }

    // Check if Helvetica.cjs already exists (already patched or originally there)
    const helveticaPath = path.join(targetFontsDir, 'Helvetica.cjs');
    if (fs.existsSync(helveticaPath)) continue; // already fine, skip

    // Copy all font files from our vendored dir
    try {
      const fontFiles = fs.readdirSync(FONT_ASSETS_DIR);
      for (const f of fontFiles) {
        const src = path.join(FONT_ASSETS_DIR, f);
        const stat = fs.statSync(src);
        if (stat.isFile()) {
          const dest = path.join(targetFontsDir, f);
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
          }
        }
      }
      // Copy chunks
      const chunksDir = path.join(FONT_ASSETS_DIR, 'chunks');
      if (fs.existsSync(chunksDir)) {
        const chunkFiles = fs.readdirSync(chunksDir);
        for (const f of chunkFiles) {
          const src = path.join(chunksDir, f);
          const dest = path.join(targetChunksDir, f);
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
          }
        }
      }
    } catch (e) {
      // Silently continue if we can't write
    }
  }
}

// Run the font copy immediately when this module is required
ensurePdfkitFonts();
