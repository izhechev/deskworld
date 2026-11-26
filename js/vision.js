import { SIZE } from './world.js';
export const COLOURS = {
  coral: { type: 'home', rgb: [236, 72, 71] },
  green: { type: 'park', rgb: [50, 184, 108] },
  blue: { type: 'block', rgb: [45, 103, 225] },
};
export function classify(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  if (max < 0.25 || delta / max < 0.45) return null;
  let hue =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 20 || hue > 340) return 'coral';
  if (hue >= 75 && hue <= 165) return 'green';
  if (hue >= 190 && hue <= 255) return 'blue';
  return null;
}
export function detectTokens({ data, width, height }, minArea = 18) {
  const labels = new Int8Array(width * height),
    seen = new Uint8Array(width * height);
  const colours = Object.keys(COLOURS);
  for (let i = 0; i < labels.length; i++)
    labels[i] = colours.indexOf(classify(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])) + 1;
  const blobs = [];
  for (let i = 0; i < labels.length; i++) {
    if (!labels[i] || seen[i]) continue;
    const queue = [i];
    seen[i] = 1;
    let sx = 0,
      sy = 0;
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0;
    for (let h = 0; h < queue.length; h++) {
      const p = queue[h],
        x = p % width,
        y = Math.floor(p / width);
      sx += x;
      sy += y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbours = [];
      if (x > 0) neighbours.push(p - 1);
      if (x < width - 1) neighbours.push(p + 1);
      if (y > 0) neighbours.push(p - width);
      if (y < height - 1) neighbours.push(p + width);
      for (const next of neighbours)
        if (!seen[next] && labels[next] === labels[i]) {
          seen[next] = 1;
          queue.push(next);
        }
    }
    const area = queue.length;
    if (area < minArea || area > width * height * 0.12) continue;
    const colour = colours[labels[i] - 1];
    const x = sx / area,
      y = sy / area;
    const cell =
      Math.min(SIZE - 1, Math.floor((y / height) * SIZE)) * SIZE +
      Math.min(SIZE - 1, Math.floor((x / width) * SIZE));
    blobs.push({
      colour,
      type: COLOURS[colour].type,
      cell,
      x: x / width,
      y: y / height,
      area,
      bounds: {
        x: minX / width,
        y: minY / height,
        w: (maxX - minX + 1) / width,
        h: (maxY - minY + 1) / height,
      },
    });
  }
  // Limit work and prefer the clearest pieces when background colours are present.
  return blobs.sort((a, b) => b.area - a.area).slice(0, 12);
}
export class StableTokens {
  constructor() {
    this.frames = new Map();
    this.active = new Map();
  }
  update(tokens, now) {
    const present = new Set();
    for (const token of tokens) {
      const key = `${token.colour}:${token.cell}`;
      if (present.has(key)) continue;
      present.add(key);
      const frames = (this.frames.get(key) || 0) + 1;
      this.frames.set(key, frames);
      if (frames >= 3) this.active.set(key, { ...token, lastSeen: now });
    }
    for (const key of this.frames.keys()) if (!present.has(key)) this.frames.delete(key);
    for (const [key, token] of this.active) if (now - token.lastSeen > 750) this.active.delete(key);
    return [...this.active.values()];
  }
  clear() {
    this.frames.clear();
    this.active.clear();
  }
}
export class CameraSession {
  constructor(media, video) {
    this.media = media;
    this.video = video;
    this.generation = 0;
    this.stream = null;
  }
  async start() {
    this.stop();
    const generation = this.generation;
    if (!this.media?.getUserMedia)
      throw new Error('Camera access needs HTTPS or localhost in a supported browser.');
    let stream;
    try {
      stream = await this.media.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: { ideal: 'environment' },
        },
      });
    } catch (error) {
      if (generation !== this.generation) return false;
      throw error;
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop();
      throw error;
    }
    if (generation !== this.generation) return false;
    return true;
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
