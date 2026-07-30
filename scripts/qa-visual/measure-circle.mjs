import sharp from "sharp";
import path from "node:path";

async function boundingBoxOfYellow(file) {
  const img = sharp(file);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * channels;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      if (r > 200 && g > 200 && b < 80) {
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    file: path.basename(file),
    imgW: width,
    imgH: height,
    w: maxX - minX,
    h: maxY - minY,
    ratio: (maxX - minX) / (maxY - minY),
    count,
  };
}

const files = process.argv.slice(2);
for (const f of files) {
  console.log(await boundingBoxOfYellow(f));
}
