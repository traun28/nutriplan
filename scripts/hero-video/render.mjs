/**
 * Offline Ken Burns renderer for the landing-page hero.
 *
 * Reads four stills from /home/user/video-src, cross-fades them with a slow
 * pan/zoom, and writes public/hero.mp4 + public/hero-poster.jpg.
 *
 * Usage (from anywhere):
 *   npm --prefix /tmp/videogen i @napi-rs/canvas h264-mp4-encoder
 *   node scripts/hero-video/render.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire("/tmp/videogen/");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const HME = require("h264-mp4-encoder");

const SRC = "/home/user/video-src";
const OUT = "/home/user/nutriplan/public";
const W = 1280;
const H = 720;
const FPS = 24;
const HOLD = 4.2; // seconds each still is on screen
const FADE = 0.7; // cross-fade overlap

const STILLS = [
  "03-green.jpg",
  "01-veg.jpg",
  "04-fruit.jpg",
  "02-bowl.jpg",
];

function kenBurns(progress, index) {
  // Alternate zoom-in / zoom-out so consecutive clips don't feel identical.
  const zoomIn = index % 2 === 0;
  const start = zoomIn ? 1.08 : 1.22;
  const end = zoomIn ? 1.22 : 1.08;
  const scale = start + (end - start) * progress;
  const panX = (index % 2 === 0 ? -1 : 1) * 0.04 * progress;
  const panY = (index % 3 === 0 ? 1 : -1) * 0.03 * progress;
  return { scale, panX, panY };
}

function drawStill(ctx, img, t, duration, index) {
  const progress = Math.min(1, Math.max(0, t / duration));
  const { scale, panX, panY } = kenBurns(progress, index);
  const iw = img.width;
  const ih = img.height;
  const cover = Math.max(W / iw, H / ih) * scale;
  const dw = iw * cover;
  const dh = ih * cover;
  const dx = (W - dw) / 2 + panX * W;
  const dy = (H - dh) / 2 + panY * H;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function vignette(ctx) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
  g.addColorStop(0, "rgba(7,11,9,0)");
  g.addColorStop(1, "rgba(7,11,9,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const images = [];
  for (const name of STILLS) {
    const buf = readFileSync(join(SRC, name));
    images.push(await loadImage(buf));
  }

  const encoder = await HME.createH264MP4Encoder();
  encoder.width = W;
  encoder.height = H;
  encoder.frameRate = FPS;
  encoder.quantizationParameter = 28;
  encoder.speed = 8;
  encoder.outputFilename = "hero.mp4";
  encoder.sequential = true;
  encoder.initialize();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const clipFrames = Math.round(HOLD * FPS);
  const fadeFrames = Math.round(FADE * FPS);
  const totalFrames = STILLS.length * clipFrames - (STILLS.length - 1) * fadeFrames;

  let frame = 0;
  for (let i = 0; i < STILLS.length; i++) {
    const start = i === 0 ? 0 : i * clipFrames - i * fadeFrames;
    for (let f = 0; f < clipFrames; f++) {
      const abs = start + f;
      if (abs < frame) continue;
      ctx.fillStyle = "#070b09";
      ctx.fillRect(0, 0, W, H);
      drawStill(ctx, images[i], f / FPS, HOLD, i);

      if (i > 0 && f < fadeFrames) {
        const a = 1 - f / fadeFrames;
        ctx.save();
        ctx.globalAlpha = a;
        const prevT = (clipFrames - fadeFrames + f) / FPS;
        drawStill(ctx, images[i - 1], prevT, HOLD, i - 1);
        ctx.restore();
      }

      vignette(ctx);
      encoder.addFrameRgba(ctx.getImageData(0, 0, W, H).data);
      frame++;
    }
  }

  encoder.finalize();
  const mp4 = Buffer.from(encoder.FS.readFile(encoder.outputFilename));
  encoder.delete();
  writeFileSync(join(OUT, "hero.mp4"), mp4);

  // Poster = first frame, JPEG.
  ctx.fillStyle = "#070b09";
  ctx.fillRect(0, 0, W, H);
  drawStill(ctx, images[0], 0, HOLD, 0);
  vignette(ctx);
  writeFileSync(join(OUT, "hero-poster.jpg"), canvas.toBuffer("image/jpeg", 82));

  console.log(`wrote ${join(OUT, "hero.mp4")} (${mp4.length} bytes), ${totalFrames} frames`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
