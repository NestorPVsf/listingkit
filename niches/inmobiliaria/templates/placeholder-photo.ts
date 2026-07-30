/**
 * Fotos placeholder para modo `?demo=1` (paso 4.2, restriccion del brief:
 * "nada de servicios externos ni fotos con derechos"). SVG inline como data
 * URI: gradiente solido + texto "FOTO DEMO" + indice, determinista por color
 * de marca para que el preview se sienta coherente sin depender de red.
 */
const HASH_COLORS = [
  ["#8a8578", "#6b6558"],
  ["#a89a86", "#8a7c68"],
  ["#7d8a7f", "#5f6b61"],
  ["#9a8a80", "#7a6b5d"],
  ["#87878a", "#6a6a6b"],
] as const;

export function demoPhotoUrl(index: number, label = "FOTO DEMO"): string {
  const [from, to] = HASH_COLORS[index % HASH_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${from}"/>
        <stop offset="1" stop-color="${to}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="1000" fill="url(#g)"/>
    <text x="400" y="480" font-family="sans-serif" font-size="42" font-weight="700"
      fill="#ffffff" text-anchor="middle" opacity="0.85">${label}</text>
    <text x="400" y="540" font-family="sans-serif" font-size="28" font-weight="500"
      fill="#ffffff" text-anchor="middle" opacity="0.65">#${index + 1}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function demoPhotoUrls(count: number): string[] {
  return Array.from({ length: count }, (_, index) => demoPhotoUrl(index));
}
