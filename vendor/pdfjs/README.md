# PDF.js 6.3.289

Vendored from Mozilla's official generic release:
https://github.com/mozilla/pdf.js/releases/download/v6.3.289/pdfjs-6.3.289-dist.zip

The unmodified `build/pdf.mjs`, `build/pdf.worker.mjs`, CMaps, and standard fonts power local text extraction. The full viewer and source maps are not required. Apache-2.0 license: see `LICENSE`; font/CMap notices are retained in their directories.

No CDN, upload, npm installation, or build is required. Serve the project over HTTP(S) so the browser can load the module and worker. When updating, replace both build files and resources together from the same official release, preserve licenses, and rerun import tests.
