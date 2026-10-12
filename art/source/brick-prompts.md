# Classic Brick generation provenance — C4.3

Generated on 12 October 2026 with the built-in `image_gen` tool, one subject per call, transparent background enabled. No generation CLI or external API was used.

The twelve stack prompts follow [art requirements sections 5–7](../../plan/12-art-requirements.md): four front-orthographic mids, four matching bases and four matching roof caps. Residential mid established the style; the other mids used it as a style reference. Each base and roof used its own class mid as reference. The four city tokens used the matching mid and roof as material references and the section 8 miniature template. Rig used the selected facade as a style reference; hook used the rig. Additional constraints emphasized one compact subject, broad cel shading, true alpha, no scenery/text/shadow and exact requested canvas/bounds.

Original outputs are retained as `_v001.png` under `stack/brick/`, `city/brick/` and `rig/brick/` here. AI output sizes and silhouette bounds were normalized by `scripts/import-brick-assets.cjs`; the tool output itself is not claimed to be pixel exact. Approved PNGs live in `art/approved/` and are synchronized to both public game folders. The optional collection badge is a code-native SVG produced by the importer.

Import dimensions, crop bounds, file sizes and source paths: [QA report](../qa/brick-import.json). Rig socket was measured on approved art at (931,256); hook attachment metadata maps to the existing world anchors without changing physics.
