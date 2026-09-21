# Hero video

The landing-page hero is a Ken Burns pan/zoom across four dark, cinematic
nutrition stills. The MP4 and poster JPEG are generated offline so the site
never depends on a runtime video encoder.

## Source stills

Place the four JPEGs at `/home/user/video-src/`:

| File | Subject |
|---|---|
| `01-veg.jpg` | Mixed vegetables on a dark wooden table |
| `02-bowl.jpg` | Grain bowl with greens |
| `03-green.jpg` | Leafy greens and herbs |
| `04-fruit.jpg` | Dark fruit still-life |

Do not commit the stills — they are working files for the renderer only.

## Render

```bash
mkdir -p /tmp/videogen
npm --prefix /tmp/videogen init -y
npm --prefix /tmp/videogen i @napi-rs/canvas h264-mp4-encoder
node scripts/hero-video/render.mjs
```

Writes:

- `public/hero.mp4`
- `public/hero-poster.jpg`
