export type OcrResult = {
  label: string | null;
  score: number;
};

type Mask = {
  data: Uint8Array;
  width: number;
  height: number;
};

const NORMAL_W = 48;
const NORMAL_H = 64;
const templateCache = new Map<string, Array<{ label: string; mask: Mask }>>();

function grayscale(image: ImageData) {
  const out = new Uint8Array(image.width * image.height);
  for (let i = 0; i < out.length; i += 1) {
    const p = i * 4;
    out[i] = Math.round(
      image.data[p] * 0.299 +
        image.data[p + 1] * 0.587 +
        image.data[p + 2] * 0.114,
    );
  }
  return out;
}

function otsu(gray: Uint8Array) {
  const hist = new Uint32Array(256);
  for (const value of gray) hist[value] += 1;

  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVariance = -1;
  let threshold = 128;

  for (let i = 0; i < 256; i += 1) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;

    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVariance) {
      maxVariance = between;
      threshold = i;
    }
  }

  return threshold;
}

function makeMask(gray: Uint8Array, width: number, height: number, bright: boolean): Mask {
  const threshold = otsu(gray);
  const data = new Uint8Array(gray.length);

  for (let i = 0; i < gray.length; i += 1) {
    const value = gray[i];
    data[i] = bright ? (value >= threshold ? 1 : 0) : value <= threshold ? 1 : 0;
  }

  return cleanMask({ data, width, height });
}

function cleanMask(mask: Mask): Mask {
  const { data, width, height } = mask;
  const seen = new Uint8Array(data.length);
  const output = new Uint8Array(data.length);
  const stack: number[] = [];
  const components: number[][] = [];

  for (let index = 0; index < data.length; index += 1) {
    if (!data[index] || seen[index]) continue;

    const component: number[] = [];
    stack.push(index);
    seen[index] = 1;

    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (data[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }

    components.push(component);
  }

  const minArea = Math.max(2, Math.round(width * height * 0.001));
  const maxArea = Math.round(width * height * 0.72);

  for (const component of components) {
    if (component.length < minArea || component.length > maxArea) continue;
    for (const index of component) output[index] = 1;
  }

  return { data: output, width, height };
}

function foregroundFraction(mask: Mask) {
  let count = 0;
  for (const value of mask.data) count += value;
  return count / mask.data.length;
}

function normalize(mask: Mask): Mask | null {
  const { data, width, height } = mask;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!data[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  if (cropW < 2 || cropH < 3) return null;

  const scale = Math.min((NORMAL_W - 6) / cropW, (NORMAL_H - 6) / cropH);
  const targetW = Math.max(1, Math.round(cropW * scale));
  const targetH = Math.max(1, Math.round(cropH * scale));
  const offsetX = Math.floor((NORMAL_W - targetW) / 2);
  const offsetY = Math.floor((NORMAL_H - targetH) / 2);
  const out = new Uint8Array(NORMAL_W * NORMAL_H);

  for (let ty = 0; ty < targetH; ty += 1) {
    const sy = minY + Math.min(cropH - 1, Math.floor((ty / targetH) * cropH));
    for (let tx = 0; tx < targetW; tx += 1) {
      const sx = minX + Math.min(cropW - 1, Math.floor((tx / targetW) * cropW));
      out[(offsetY + ty) * NORMAL_W + offsetX + tx] = data[sy * width + sx];
    }
  }

  return { data: out, width: NORMAL_W, height: NORMAL_H };
}

function diceScore(a: Mask, b: Mask) {
  let intersection = 0;
  let countA = 0;
  let countB = 0;

  for (let i = 0; i < a.data.length; i += 1) {
    const av = a.data[i];
    const bv = b.data[i];
    countA += av;
    countB += bv;
    if (av && bv) intersection += 1;
  }

  if (!countA || !countB) return 0;
  return (2 * intersection) / (countA + countB);
}

function renderTemplate(label: string, fontFamily: string, weight: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 110;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let fontSize = 76;
  do {
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    if (ctx.measureText(label).width <= 150) break;
    fontSize -= 2;
  } while (fontSize > 28);

  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = grayscale(image);
  const dark = normalize(makeMask(gray, image.width, image.height, false));
  return dark;
}

function templates(labels: string[]) {
  const key = labels.join("|");
  const cached = templateCache.get(key);
  if (cached) return cached;

  const fonts = ["Arial", "Verdana", "Tahoma", "sans-serif"];
  const weights = [400, 600, 700];
  const all: Array<{ label: string; mask: Mask }> = [];

  for (const label of labels) {
    for (const font of fonts) {
      for (const weight of weights) {
        const mask = renderTemplate(label, font, weight);
        if (mask) all.push({ label, mask });
      }
    }
  }

  templateCache.set(key, all);
  return all;
}

export function recognizeLabel(image: ImageData, labels: string[]): OcrResult {
  if (!labels.length || image.width < 8 || image.height < 8) {
    return { label: null, score: 0 };
  }

  const gray = grayscale(image);
  const candidates = [
    makeMask(gray, image.width, image.height, false),
    makeMask(gray, image.width, image.height, true),
  ]
    .filter((mask) => {
      const fraction = foregroundFraction(mask);
      return fraction >= 0.008 && fraction <= 0.48;
    })
    .map(normalize)
    .filter((mask): mask is Mask => Boolean(mask));

  if (!candidates.length) return { label: null, score: 0 };

  let bestLabel: string | null = null;
  let bestScore = 0;
  let secondScore = 0;

  for (const candidate of candidates) {
    for (const template of templates(labels)) {
      const score = diceScore(candidate, template.mask);
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestLabel = template.label;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }
  }

  const margin = bestScore - secondScore;
  if (bestScore < 0.43 || margin < 0.006) {
    return { label: null, score: bestScore };
  }

  return { label: bestLabel, score: bestScore };
}

export function cropAroundPoint(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  x: number,
  y: number,
  widthScale: number,
  heightScale: number,
) {
  const width = Math.max(20, Math.round(canvasWidth * widthScale));
  const height = Math.max(20, Math.round(canvasHeight * heightScale));
  const left = Math.max(0, Math.round(x * canvasWidth - width / 2));
  const top = Math.max(0, Math.round(y * canvasHeight - height / 2));
  const safeWidth = Math.min(width, canvasWidth - left);
  const safeHeight = Math.min(height, canvasHeight - top);

  if (safeWidth < 8 || safeHeight < 8) return null;
  return ctx.getImageData(left, top, safeWidth, safeHeight);
}

/**
 * Lightweight local OCR for multiplier text such as "1.47x".
 * It is intentionally dependency-free; accuracy depends on the calibrated ROI.
 */
export function recognizeMultiplier(image: ImageData): { value: number | null; text: string; score: number } {
  if (image.width < 12 || image.height < 12) return { value: null, text: "", score: 0 };

  const width = image.width;
  const height = image.height;
  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // Bright low/medium-saturation glyphs cover the multiplier text in the
      // supplied Chicken Road layout while rejecting most of the background.
      if (max >= 150 && min >= 105) mask[y * width + x] = 1;
    }
  }

  const seen = new Uint8Array(mask.length);
  const components: Array<{ minX: number; minY: number; maxX: number; maxY: number; area: number }> = [];
  const stack: number[] = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || seen[index]) continue;
    seen[index] = 1;
    stack.push(index);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;

    while (stack.length) {
      const current = stack.pop()!;
      const cx = current % width;
      const cy = Math.floor(current / width);
      minX = Math.min(minX, cx);
      minY = Math.min(minY, cy);
      maxX = Math.max(maxX, cx);
      maxY = Math.max(maxY, cy);
      area += 1;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    if (area >= 2 && boxW <= width * 0.45 && boxH <= height * 0.95) {
      components.push({ minX, minY, maxX, maxY, area });
    }
  }

  if (!components.length) return { value: null, text: "", score: 0 };

  const tall = components.filter((component) => component.maxY - component.minY + 1 >= height * 0.28);
  const medianHeight = tall.length
    ? [...tall].map((component) => component.maxY - component.minY + 1).sort((a, b) => a - b)[Math.floor(tall.length / 2)]
    : height * 0.5;

  const useful = components
    .filter((component) => {
      const boxH = component.maxY - component.minY + 1;
      const boxW = component.maxX - component.minX + 1;
      const isDot = boxH <= medianHeight * 0.33 && boxW <= medianHeight * 0.4;
      const isChar = boxH >= medianHeight * 0.55;
      return isDot || isChar;
    })
    .sort((a, b) => a.minX - b.minX);

  if (!useful.length) return { value: null, text: "", score: 0 };

  const labels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "x", "X"];
  let text = "";
  let scoreSum = 0;
  let scoreCount = 0;

  for (const component of useful) {
    const boxW = component.maxX - component.minX + 1;
    const boxH = component.maxY - component.minY + 1;
    if (boxH <= medianHeight * 0.33 && boxW <= medianHeight * 0.4) {
      if (!text.includes(".")) text += ".";
      continue;
    }

    const pad = Math.max(2, Math.round(Math.max(boxW, boxH) * 0.12));
    const left = Math.max(0, component.minX - pad);
    const top = Math.max(0, component.minY - pad);
    const right = Math.min(width, component.maxX + pad + 1);
    const bottom = Math.min(height, component.maxY + pad + 1);
    const cropWidth = right - left;
    const cropHeight = bottom - top;
    if (cropWidth < 3 || cropHeight < 5) continue;

    const data = new Uint8ClampedArray(cropWidth * cropHeight * 4);
    for (let y = 0; y < cropHeight; y += 1) {
      for (let x = 0; x < cropWidth; x += 1) {
        const source = ((top + y) * width + (left + x)) * 4;
        const target = (y * cropWidth + x) * 4;
        data[target] = image.data[source];
        data[target + 1] = image.data[source + 1];
        data[target + 2] = image.data[source + 2];
        data[target + 3] = 255;
      }
    }

    const recognized = recognizeLabel(new ImageData(data, cropWidth, cropHeight), labels);
    if (recognized.label) {
      text += recognized.label.toLowerCase();
      scoreSum += recognized.score;
      scoreCount += 1;
    }
  }

  const normalized = text.replace(/x/g, "").replace(",", ".");
  const match = normalized.match(/(\d{1,3}(?:\.\d{1,3})?)/);
  const value = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(value) || value < 1 || value > 10000) {
    return { value: null, text, score: scoreCount ? scoreSum / scoreCount : 0 };
  }

  return { value, text, score: scoreCount ? scoreSum / scoreCount : 0 };
}
