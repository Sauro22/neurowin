import type { DieValue } from "./bacBoEngine";

export interface CapturePoint {
  x: number;
  y: number;
}

export interface DiceCalibration {
  points: CapturePoint[];
  roiScale: number;
}

export function countWhitePips(frame: ImageData): DieValue | null {
  const { data, width, height } = frame;
  if (width < 12 || height < 12) return null;

  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const spread = max - min;
      const border =
        x < width * 0.08 ||
        y < height * 0.08 ||
        x > width * 0.92 ||
        y > height * 0.92;

      if (!border && min >= 168 && max >= 205 && spread <= 52) {
        mask[y * width + x] = 1;
      }
    }
  }

  const seen = new Uint8Array(width * height);
  const components: number[] = [];
  const minArea = Math.max(3, Math.floor(width * height * 0.0012));
  const maxArea = Math.max(minArea + 1, Math.floor(width * height * 0.075));

  const stackX = new Int16Array(width * height);
  const stackY = new Int16Array(width * height);

  for (let sy = 1; sy < height - 1; sy += 1) {
    for (let sx = 1; sx < width - 1; sx += 1) {
      const startIndex = sy * width + sx;
      if (!mask[startIndex] || seen[startIndex]) continue;

      let top = 0;
      stackX[top] = sx;
      stackY[top] = sy;
      top += 1;
      seen[startIndex] = 1;

      let area = 0;

      while (top > 0) {
        top -= 1;
        const x = stackX[top];
        const y = stackY[top];
        area += 1;

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;

            const nx = x + dx;
            const ny = y + dy;
            if (nx <= 0 || ny <= 0 || nx >= width - 1 || ny >= height - 1) {
              continue;
            }

            const index = ny * width + nx;
            if (mask[index] && !seen[index]) {
              seen[index] = 1;
              stackX[top] = nx;
              stackY[top] = ny;
              top += 1;
            }
          }
        }
      }

      if (area >= minArea && area <= maxArea) {
        components.push(area);
      }
    }
  }

  if (!components.length) return null;

  const sorted = [...components].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const filtered = components.filter(
    (area) => area >= median * 0.42 && area <= median * 2.35,
  );

  const count = filtered.length;
  return count >= 1 && count <= 6 ? (count as DieValue) : null;
}

export function cropSquare(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  centerX: number,
  centerY: number,
  roiScale: number,
) {
  const size = Math.max(
    24,
    Math.round(Math.min(canvasWidth, canvasHeight) * roiScale),
  );

  const x = Math.max(0, Math.round(centerX * canvasWidth - size / 2));
  const y = Math.max(0, Math.round(centerY * canvasHeight - size / 2));
  const width = Math.min(size, canvasWidth - x);
  const height = Math.min(size, canvasHeight - y);

  if (width < 12 || height < 12) return null;
  return ctx.getImageData(x, y, width, height);
}
