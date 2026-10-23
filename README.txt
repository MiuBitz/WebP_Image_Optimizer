Image Studio

Open index.html in a modern browser. Drop one image or a batch to automatically
optimize to WebP, then download a result or the whole batch as a ZIP.

Optional settings (collapsed by default):
- Output: WebP, PNG, JPEG. Input: PNG, JPEG, WebP, AVIF, GIF, BMP, depending on browser support.
- Quality or PNG palette size (2–256 colors).
- Target file size in KB (1 KB = 1024 bytes): tries quality reduction, then reduces dimensions.
  Targets are best effort; a notice appears when one cannot be reached.
- Resize to fit maximum width/height, preserving proportions without enlargement.
- Center crop: square, 4:3, 16:9, 4:5 or 9:16.
- JPEG background color for transparency.
- Custom batch name and suffix. Duplicate filenames are numbered safely.

Change settings before dropping files, or click Apply settings afterward.
A new drop replaces the current batch; drops during processing queue the next batch.
Animated inputs export as still images. PNG palette reduction can change colors.
Canvas exports may remove metadata and normalize colors. Original PNG is retained
when smaller, unless resizing, cropping or target-driven resizing was applied.
Processing is limited to 24 megapixels of output to keep memory use manageable.

Images are processed on the device, never uploaded.
PNG encoding uses UPNG.js and Pako; ZIP export uses JSZip, loaded from pinned CDN URLs.
Internet access is required to load these optional tools when opening the page.

Files: index.html, app.js, icon.svg. Keep them together.
Metadata includes description, application name, theme color and social titles/descriptions.
Add deployment-specific canonical, Open Graph URL and social preview URLs when hosting.
