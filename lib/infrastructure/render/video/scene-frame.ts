import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type {
  VideoBrand,
  VideoScene,
} from "@/lib/engine/ports/video-storyboard";
import { VIDEO_HEIGHT, VIDEO_WIDTH } from "./duration-plan";

const SAFE_MARGIN = 96;
const MAX_TITLE_LINES = 4;
const MAX_BODY_LINES = 6;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)
    ? value
    : fallback;
}

function wrapText(
  value: string,
  maxCharacters: number,
  maxLines: number,
): readonly string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || current.length === 0) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) {
      break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  const consumed = lines.join(" ").length;
  if (consumed < value.trim().length && lines.length > 0) {
    const lastIndex = lines.length - 1;
    const last = lines[lastIndex] ?? "";
    lines[lastIndex] = `${last.slice(0, Math.max(1, maxCharacters - 1)).trimEnd()}…`;
  }
  return lines;
}

function textElements(
  lines: readonly string[],
  x: number,
  startY: number,
  lineHeight: number,
  className: string,
  anchor: "start" | "middle" = "start",
): string {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${startY + index * lineHeight}" class="${className}" text-anchor="${anchor}">${escapeXml(line)}</text>`,
    )
    .join("");
}

function sceneOverlaySvg(scene: VideoScene, brand: VideoBrand): Buffer {
  const primary = safeColor(brand.primaryColor, "#F26A2E");
  const secondary = safeColor(brand.secondaryColor, "#2E6B57");
  const text = safeColor(brand.textColor, "#FFFFFF");
  const titleLines = wrapText(scene.title, 25, MAX_TITLE_LINES);
  const bodyLines = scene.lines
    .flatMap((line) => wrapText(line, 38, 2))
    .slice(0, MAX_BODY_LINES);
  const centered = scene.kind === "cta" || scene.kind === "closing";
  const titleSize = centered ? 82 : scene.kind === "hook" ? 78 : 64;
  const contentX = centered ? VIDEO_WIDTH / 2 : SAFE_MARGIN;
  const titleY = centered ? 720 : scene.kind === "hook" ? 360 : 1180;
  const bodyY = titleY + titleLines.length * (titleSize + 12) + 52;
  const anchor = centered ? "middle" : "start";
  const label =
    scene.kind === "photo"
      ? ""
      : `<rect x="${SAFE_MARGIN}" y="${SAFE_MARGIN + 44}" width="190" height="12" rx="6" fill="${primary}"/>`;

  return Buffer.from(`
    <svg width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" viewBox="0 0 ${VIDEO_WIDTH} ${VIDEO_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0.25"/>
          <stop offset="0.48" stop-color="#000000" stop-opacity="0.08"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0.82"/>
        </linearGradient>
      </defs>
      <rect width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}" fill="url(#shade)"/>
      ${centered ? `<rect x="64" y="510" width="952" height="900" rx="48" fill="${secondary}" fill-opacity="0.86"/>` : ""}
      ${label}
      <style>
        .title { font-family: "Segoe UI", Arial, sans-serif; font-size: ${titleSize}px; font-weight: 700; fill: ${text}; }
        .body { font-family: "Segoe UI", Arial, sans-serif; font-size: 42px; font-weight: 500; fill: ${text}; }
        .brand { font-family: "Segoe UI", Arial, sans-serif; font-size: 34px; font-weight: 600; fill: ${text}; letter-spacing: 2px; }
      </style>
      ${textElements(titleLines, contentX, titleY, titleSize + 12, "title", anchor)}
      ${textElements(bodyLines, contentX, bodyY, 58, "body", anchor)}
      <text x="${SAFE_MARGIN}" y="${VIDEO_HEIGHT - SAFE_MARGIN}" class="brand">${escapeXml(brand.name)}</text>
    </svg>
  `);
}

async function optionalLogoComposite(
  brand: VideoBrand,
  scene: VideoScene,
): Promise<readonly sharp.OverlayOptions[]> {
  if (!brand.logoPath || scene.kind !== "closing") {
    return [];
  }
  const logo = await sharp(await readFile(brand.logoPath))
    .resize({ width: 360, height: 220, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();
  return [
    {
      input: logo,
      left: Math.round((VIDEO_WIDTH - (metadata.width ?? 0)) / 2),
      top: 560,
    },
  ];
}

/**
 * Sharp hace cover+crop centrado manteniendo aspect ratio; después compone el
 * PNG de texto. FFmpeg nunca recibe texto del usuario ni expresiones drawtext.
 */
export async function renderSceneFrame(
  scene: VideoScene,
  brand: VideoBrand,
  outputPath: string,
): Promise<void> {
  const overlay = await sharp(sceneOverlaySvg(scene, brand)).png().toBuffer();
  const logo = await optionalLogoComposite(brand, scene);

  await sharp(scene.backgroundImagePath, { limitInputPixels: 40_000_000 })
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: false,
    })
    .composite([{ input: overlay, left: 0, top: 0 }, ...logo])
    .png()
    .toFile(outputPath);
}
