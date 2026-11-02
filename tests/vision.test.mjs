import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, detectTokens, StableTokens, CameraSession } from '../dist/js/vision.js';
function image(width = 100, height = 100) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
}
function rect(frame, x, y, w, h, rgb) {
  for (let row = y; row < y + h; row++)
    for (let col = x; col < x + w; col++) {
      const i = (row * frame.width + col) * 4;
      frame.data.set([...rgb, 255], i);
    }
}
test('hue masks classify vivid colours, red wraparound, and reject grey or darkness', () => {
  assert.equal(classify(236, 72, 71), 'coral');
  assert.equal(classify(255, 0, 30), 'coral');
  assert.equal(classify(50, 184, 108), 'green');
  assert.equal(classify(45, 103, 225), 'blue');
  assert.equal(classify(130, 130, 130), null);
  assert.equal(classify(20, 0, 0), null);
});
test('separate same-colour paper pieces keep separate centroids', () => {
  const frame = image();
  rect(frame, 10, 10, 10, 10, [236, 72, 71]);
  rect(frame, 70, 70, 10, 10, [236, 72, 71]);
  const tokens = detectTokens(frame);
  assert.equal(tokens.length, 2);
  assert.deepEqual(
    tokens.map((t) => t.cell).sort((a, b) => a - b),
    [12, 96],
  );
});
test('tiny noise and huge backgrounds do not become pieces', () => {
  const frame = image();
  rect(frame, 0, 0, 2, 2, [45, 103, 225]);
  rect(frame, 20, 20, 50, 50, [50, 184, 108]);
  assert.deepEqual(detectTokens(frame), []);
});
test('pieces at frame edges stay within the city grid', () => {
  const frame = image();
  rect(frame, 94, 94, 6, 6, [45, 103, 225]);
  const [token] = detectTokens(frame);
  assert.equal(token.cell, 120);
});
test('tracking waits for stable detections and expires missing pieces', () => {
  const tracker = new StableTokens(),
    token = { colour: 'green', type: 'park', cell: 20 };
  assert.equal(tracker.update([token], 0).length, 0);
  assert.equal(tracker.update([token], 100).length, 0);
  assert.equal(tracker.update([token], 200).length, 1);
  assert.equal(tracker.update([], 900).length, 1);
  assert.equal(tracker.update([], 951).length, 0);
});
test('one-frame flicker is not accepted and clear removes all tracking', () => {
  const tracker = new StableTokens(),
    token = { colour: 'blue', type: 'block', cell: 21 };
  tracker.update([token], 0);
  tracker.update([], 100);
  tracker.update([token], 200);
  assert.equal(tracker.update([token], 300).length, 0);
  tracker.update([token], 400);
  tracker.clear();
  assert.equal(tracker.update([], 500).length, 0);
});
test('cancelling a pending camera request stops late tracks', async () => {
  let resolve,
    stopped = 0;
  const media = { getUserMedia: () => new Promise((r) => (resolve = r)) },
    video = { srcObject: null, play: async () => {} };
  const camera = new CameraSession(media, video),
    starting = camera.start();
  camera.stop();
  resolve({ getTracks: () => [{ stop: () => stopped++ }] });
  assert.equal(await starting, false);
  assert.equal(stopped, 1);
  assert.equal(video.srcObject, null);
});
test('camera cleanup stops every track and never requests audio', async () => {
  let constraints,
    stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] };
  const camera = new CameraSession(
    {
      getUserMedia: async (c) => {
        constraints = c;
        return stream;
      },
    },
    { srcObject: null, play: async () => {} },
  );
  assert.equal(await camera.start(), true);
  assert.equal(constraints.audio, false);
  camera.stop();
  assert.equal(stopped, 2);
});
test('video playback failure releases the camera', async () => {
  let stopped = false;
  const video = {
    srcObject: null,
    play: async () => {
      throw new Error('play failed');
    },
  };
  const camera = new CameraSession(
    { getUserMedia: async () => ({ getTracks: () => [{ stop: () => (stopped = true) }] }) },
    video,
  );
  await assert.rejects(camera.start(), /play failed/);
  assert.equal(stopped, true);
  assert.equal(video.srcObject, null);
});

test('a rejected permission from a cancelled request cannot overwrite a new session', async () => {
  let reject,
    calls = 0;
  const active = { getTracks: () => [{ stop() {} }] };
  const video = { srcObject: null, play: async () => {} };
  const camera = new CameraSession(
    {
      getUserMedia: () =>
        ++calls === 1 ? new Promise((_, fail) => (reject = fail)) : Promise.resolve(active),
    },
    video,
  );
  const old = camera.start();
  assert.equal(await camera.start(), true);
  reject(new Error('old permission rejected'));
  assert.equal(await old, false);
  assert.equal(video.srcObject, active);
});

test('a late playback failure cannot stop the replacement camera', async () => {
  let reject,
    plays = 0,
    stopped = 0;
  const video = {
    srcObject: null,
    play: () => (++plays === 1 ? new Promise((_, fail) => (reject = fail)) : Promise.resolve()),
  };
  const camera = new CameraSession(
    { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) },
    video,
  );
  const old = camera.start();
  await Promise.resolve();
  assert.equal(await camera.start(), true);
  reject(new Error('old playback failed'));
  assert.equal(await old, false);
  assert.equal(stopped, 1);
  assert.ok(camera.stream);
});
