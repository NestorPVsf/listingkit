import sharp from "sharp";
import path from "node:path";

async function analyze(file) {
  const img = sharp(file);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rowCounts = new Array(height).fill(0);
  const colCounts = new Array(width).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (r > 200 && g > 200 && b < 80) {
        rowCounts[y] += 1;
        colCounts[x] += 1;
      }
    }
  }
  const rowsWithSignal = rowCounts.map((c,i)=>[i,c]).filter(([,c])=>c>=8);
  const colsWithSignal = colCounts.map((c,i)=>[i,c]).filter(([,c])=>c>=8);
  const minY = rowsWithSignal[0]?.[0];
  const maxY = rowsWithSignal[rowsWithSignal.length-1]?.[0];
  const minX = colsWithSignal[0]?.[0];
  const maxX = colsWithSignal[colsWithSignal.length-1]?.[0];
  console.log(path.basename(file), {imgW:width, imgH:height, minX,maxX,minY,maxY, w: maxX-minX, h: maxY-minY, ratio: (maxX-minX)/(maxY-minY)});
}

for (const f of process.argv.slice(2)) await analyze(f);
