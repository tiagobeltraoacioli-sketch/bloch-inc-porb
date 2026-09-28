# Browser PDF assets

BlochAI generates PDF bytes locally. It sends no prompt, answer, graph or report to a PDF service. The exporter imports these same-origin assets and downloads its same-origin static font without cookies. All text remains literal; only validated HTTPS source URLs become link actions. No scripts, forms or attachments are embedded.

- `blochai-pdf-lib.js`: pdf-lib 1.17.1 ES module, MIT, from the installed official `pdf-lib` package. Only its missing source-map directive was removed. https://github.com/Hopding/pdf-lib
- `blochai-fontkit.js`: @pdf-lib/fontkit 1.1.1 bundled UMD, MIT, from the official npm tarball. Its outer UMD wrapper is replaced with a local ES module export so the bundled pako dependency remains self-contained and no global is created. https://github.com/Hopding/fontkit
- `BlochAI-DejaVuSans.ttf`: unmodified DejaVu Sans bundled with LibreOffice. License and notices are included. The filename identifies this asset; the font itself is unmodified. Portuguese accents, Latin, Greek and Cyrillic are covered. Unsupported characters are rendered as explicit Unicode code points instead of invisible missing glyphs.

`vendor-manifest.json` records SHA-256 hashes. License files ship alongside the assets. No CDN is used. Custom font embedding keeps PDF text searchable and selectable. Up to 12 completed exchanges, 96,000 text characters and 90 pages are allowed. Each bounded graph has at most 40 nodes and 80 edges. Each transaction list has at most 20 records. Graphs are vector diagrams with numbered legends; they do not imply identity, ownership or risk.

`buildBlochAiPdf(document, {fontBytes})` accepts injected font bytes for offline tests and returns PDF bytes. In browsers, omit `fontBytes` to load the local font. `downloadBlochAiPdf(document, {isCurrent})` checks the active conversation both before creation and before initiating the local download. The private UI revalidates the organization session before importing the exporter.
