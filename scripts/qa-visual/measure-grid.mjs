import sharp from "sharp";
import path from "node:path";

// Find near-black vertical/horizontal line positions along a scanline in the photo region (y in [700,750] for verticals, x in [500,550] for horizontals)
async function analyze(file, yScan, xScan) {
  const img = sharp(file);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // vertical lines: scan a horizontal row at yScan, find columns where pixel is near-black
  const vertCols = [];
  for (let x = 0; x < width; x += 1) {
    const idx = (yScan * width + x) * channels;
    const r = data[idx], g = data[idx+1], b = data[idx+2];
    if (r < 40 && g < 40 && b < 40) vertCols.push(x);
  }
  // horizontal lines: scan a vertical column at xScan, find rows near-black
  const horizRows = [];
  for (let y = 0; y < height; y += 1) {
    const idx = (y * width + xScan) * channels;
    const r = data[idx], g = data[idx+1], b = data[idx+2];
    if (r < 40 && g < 40 && b < 40) horizRows.push(y);
  }
  // cluster consecutive into line centers
  function cluster(arr) {
    const lines = [];
    let cur = [];
    for (const v of arr) {
      if (cur.length === 0 || v - cur[cur.length-1] <= 2) cur.push(v);
      else { lines.push(cur); cur = [v]; }
    }
    if (cur.length) lines.push(cur);
    return lines.map(c => c.reduce((a,b)=>a+b,0)/c.length);
  }
  const vLines = cluster(vertCols);
  const hLines = cluster(horizRows);
  const vDeltas = vLines.slice(1).map((v,i)=>v-vLines[i]);
  const hDeltas = hLines.slice(1).map((v,i)=>v-hLines[i]);
  console.log(path.basename(file), { vLinesCount: vLines.length, hLinesCount: hLines.length, vDeltas, hDeltas });
}

await analyze("output/qa-visual/editorial-crema/post-instagram.png", 300, 500);
await analyze("output/qa-visual/editorial-crema/story-instagram.png", 400, 500);
console.log("--- retry post with cleaner probes ---");
await analyze("output/qa-visual/editorial-crema/post-instagram.png", 200, 1000);
await analyze("output/qa-visual/editorial-crema/post-instagram.png", 950, 1000);
