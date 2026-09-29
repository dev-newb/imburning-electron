# Screenshot and animation gallery

Captured from the Electron build's shared renderer with fictional `example.com` accounts and simulated usage. The demo never loads personal credentials, settings, or history. Every full-window image is cropped to the app border, with transparent pixels outside its rounded corners. The interface itself retains its normal theme background.

## Screenshots

| View | Preview |
| --- | --- |
| Portrait, dark: desktop and CLI accounts, live fire, exhausted-pool smoke, reset orbs, frozen provider and history | [PNG](../screenshots/main-portrait-dark.png) |
| Portrait, light | [PNG](../screenshots/main-portrait-light.png) |
| Wide: three providers, side-by-side OpenAI accounts and history | [PNG](../screenshots/wide-preset-dark.png) |
| Compact, dark: aligned account emails | [PNG](../screenshots/compact-dark.png) |
| Compact, light | [PNG](../screenshots/compact-light.png) |
| Settings: sounds, thresholds, tray colours, account controls, export and phone alerts | [PNG](../screenshots/settings-top.png) |
| Pizazz off: static interface | [PNG](../screenshots/pizazz-off-dark.png) |
| Reset-orb detail: teal, amber and red urgency | [PNG](../screenshots/reset-orbs.png) |

## Videos

WebM files preserve the alpha channel for compositing; use an alpha-capable player or editor. Animated WebP previews also preserve transparency and loop directly in the README. The clips have no audio.

| Effect | Transparent video | Animated preview |
| --- | --- | --- |
| Remove a company: flash, shockwave, ash and collapse | [WebM](remove-company-explosion.webm) | [WebP](remove-company-explosion.webp) |
| Hide a tracker with its minus button: burning sweep, smoke and collapse | [WebM](hide-row-smoke.webm) | [WebP](hide-row-smoke.webp) |
| Active token burn: classic pixel fire, alongside maxed-pool smoke | [WebM](burning-classic.webm) | [WebP](burning-classic.webp) |
| Active token burn: particle inferno | [WebM](burning-inferno.webm) | [WebP](burning-inferno.webp) |

## Reproduce

With the repository's dependencies installed, run `npx electron tools/capture-demo.cjs`, then `python3 tools/encode-demo.py`. Encoding requires Pillow with WebP support and FFmpeg with libvpx-vp9. Capture runs offscreen and cannot take keyboard focus. Native RGBA frames are saved in the system temporary directory; only the finished media belongs in Git.
