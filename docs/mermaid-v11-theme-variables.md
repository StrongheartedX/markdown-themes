# Mermaid v11 Theme Variables Reference

Source: Codex analysis of `node_modules/mermaid/dist/` (mermaid@11.12.2 via @streamdown/mermaid@1.0.1)

## Key Findings

### 1. Class Diagram Variables

- **Node fill**: `mainBkg` (chunk-UNWZSS3R.mjs:1767, :1804)
- **Text color**: `classText`, BUT one key selector uses `nodeBorder || classText` (chunk-UNWZSS3R.mjs:1752, :1770)
  - **Warning**: Setting `nodeBorder` to an accent color will override `classText` for class diagram text!

### 2. State Diagram Variables

- **Node fill**: `stateBkg` fallback `mainBkg` (chunk-OFP4IZRJ.mjs:1928)
- **Text color**: `stateLabelColor` (plus some text uses `textColor`) (chunk-OFP4IZRJ.mjs:1830, :1901, :1948)
- **`stateTextColor` does NOT exist** in Mermaid v11 — no match in `node_modules/mermaid/dist/`

### 3. classDef Override Behavior

- Mermaid generates classDef CSS with `!important` (mermaid.esm.mjs:1275-1316)
- Class/state renderers can also apply inline `style` attributes during shape rendering (chunk-ZRZ2AMKI.mjs:5427-5551)
- So classDef/style can override themeVariables — it's not only "themeVariables vs base CSS"

### 4. `theme: "base"` vs `theme: "dark"`/`"default"`

- **`base` + `darkMode: true` is the best path for deep control**
- Mermaid docs explicitly say `base` is the customizable theme
- `base` derives more values from your inputs (mainBkg defaults from primaryColor, classText is fallback-based)
- `dark`/`default` hardcode more defaults (chunk-6PHMZWEM.mjs:865, :971, :1148, :1373)
- Inference: `base` + `darkMode` is more predictable for class/state consistency

### 5. CSS Fallback Approach

- Target SVG selectors used by Mermaid:
  - Class diagram styles: chunk-UNWZSS3R.mjs:1751+
  - State diagram styles: chunk-OFP4IZRJ.mjs:1814+
- Use high-specificity rules under `.mermaid svg ...` and `!important` where needed
- **Caveat**: inline styles (especially inline `!important`) from diagram `style`/`classDef` can still win

### 6. Other Notes

- @streamdown/mermaid@1.0.1 uses local mermaid@11.12.2 directly (not CDN) (node_modules/@streamdown/mermaid/dist/index.js:1)
- Mermaid defaults class/state to dagre-wrapper (chunk-6PHMZWEM.mjs:2523, :2545)
- Mermaid's hue-rotation derivation for `secondaryColor`/`tertiaryColor` (120-degree rotation from `primaryColor`) produces wrong colors for custom dark palettes — always set these explicitly

## Correct Variable Mapping

| Diagram Type | Node Fill | Text Color | Notes |
|---|---|---|---|
| Flowchart | `mainBkg` | `nodeTextColor` | `primaryColor` also affects fills |
| Class | `mainBkg` | `classText` (but `nodeBorder \|\| classText`) | Don't set `nodeBorder` if you want `classText` to work |
| State | `stateBkg` → `mainBkg` | `stateLabelColor` | `stateTextColor` is NOT a real variable |
| Sequence | `actorBkg` | `actorTextColor` | Has its own full set of variables |

## Sources

- https://mermaid.js.org/config/theming.html
- https://mermaid.js.org/config/schema-docs/config-defs-class-diagram-config.html
- https://mermaid.js.org/config/schema-docs/config-defs-state-diagram-config.html
- https://streamdown.ai/docs/mermaid
