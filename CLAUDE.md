# Markdown Themes

A themed markdown viewer for AI-assisted writing. Watch Claude edit files in real-time with beautiful style guide themes.

## Stack

- **Tauri 2** - Desktop app framework (Rust backend)
- **React 19** - UI
- **Tailwind v4** - CSS-based config with `@theme` directive
- **Streamdown** - Vercel's react-markdown replacement for AI streaming
- **Shiki** - Syntax highlighting (via @streamdown/code)

## Project Structure

```
src/
├── App.tsx                    # Main app, theme state
├── index.css                  # Tailwind + CSS variables
├── components/
│   ├── MarkdownViewer.tsx     # Streamdown renderer
│   ├── ThemeSelector.tsx      # Theme dropdown
│   └── Toolbar.tsx            # File open, streaming indicator
├── hooks/
│   └── useFileWatcher.ts      # Tauri fs watch + streaming detection
└── themes/
    ├── index.ts               # Theme registry
    ├── dark-academia.css
    ├── cyberpunk.css
    ├── parchment.css
    └── cosmic.css
```

## Key Concepts

### Streaming Detection
`useFileWatcher` detects rapid file changes (< 1.5s apart) and sets `isStreaming: true`. This triggers:
- Streamdown's `caret="block"` for typing cursor
- "AI writing..." indicator in toolbar
- `parseIncompleteMarkdown` for mid-stream rendering

### Theming
Themes use CSS custom properties. Each theme file sets variables like:
```css
.theme-dark-academia {
  --bg-primary: #1a1915;
  --text-primary: #d4c5a9;
  --accent: #8b7355;
  --font-body: 'Cormorant Garamond', serif;
}
```

Tailwind's `@theme` directive maps these to utility classes.

## Documentation (use /docs-seeker)

Context7 library IDs for this project's stack:

| Library | Context7 ID | Use for |
|---------|-------------|---------|
| Tauri v2 | `/websites/v2_tauri_app` | Core Tauri docs |
| Tauri Plugins | `/tauri-apps/plugins-workspace` | fs, dialog, store plugins |
| Streamdown | `/vercel/streamdown` | AI streaming markdown |
| Shiki | `/shikijs/shiki` | Syntax highlighting, CSS themes |
| Tailwind v4 | `/websites/tailwindcss` | Utility classes, @theme |

Example queries:
- `tauri fs plugin watch files`
- `streamdown caret animation plugins`
- `shiki css variables theme`

## Commands

```bash
npm run dev          # Vite dev server only
npm run tauri dev    # Full Tauri app (requires system deps)
npm run build        # Production build
```

## Tauri Prerequisites (Ubuntu/Debian)

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

## Themes from htmlstyleguides

Port themes from `~/projects/htmlstyleguides/styles/`. Priority candidates:
- noir, nordic, glassmorphism (dark modes)
- retro-futurism, art-deco, art-nouveau (stylized)
- editorial, letterpress (typography-focused)

Convert to CSS variables format matching existing themes.
