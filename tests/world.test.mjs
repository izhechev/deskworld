import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE,
  index,
  createTown,
  createChallengeTown,
  findRoute,
  townStats,
  createSimulation,
  advance,
  serializeTown,
  parseTown,
  mergeTokens,
} from '../dist/js/world.js';
const run = (sim, tiles, seconds, dt = 0.05) => {
  for (let t = 0; t < seconds - 1e-8; t += dt) advance(sim, tiles, Math.min(dt, seconds - t));
};
test('starter city connects every home to a studio', () => {
  const stats = townStats(createTown());
  assert.equal(stats.homes, 8);
  assert.equal(stats.connected, 8);
  assert.equal(stats.studios, 2);
});
test('routes use orthogonal roads and do not cross other buildings', () => {
  const tiles = Array(SIZE * SIZE).fill('empty');
  tiles[index(1, 1)] = 'studio';
  tiles[index(4, 1)] = 'home';
  tiles[index(2, 1)] = 'road';
  tiles[index(3, 1)] = 'road';
  assert.deepEqual(findRoute(tiles, index(1, 1), index(4, 1)), [12, 13, 14, 15]);
  tiles[index(2, 1)] = 'home';
  assert.equal(findRoute(tiles, 12, 15), null);
});
test('grid edges never wrap to the next row', () => {
  const tiles = Array(121).fill('road');
  assert.equal(findRoute(tiles, 10, 11).length, 12);
});
test('road works disconnect northern homes until a route is repaired', () => {
  const tiles = createChallengeTown();
  assert.equal(townStats(tiles).connected, 4);
  tiles[index(5, 3)] = 'road';
  assert.equal(townStats(tiles).connected, 8);
});
test('an unmodified challenge times out with neighbours still waiting', () => {
  const tiles = createChallengeTown(),
    sim = createSimulation(tiles, true);
  run(sim, tiles, 65);
  assert.equal(sim.status, 'lost');
  assert.ok(sim.delivered < 12);
  assert.equal(sim.elapsed, 60);
});
test('repairing a road lets waiting neighbours finish the challenge', () => {
  const tiles = createChallengeTown(),
    sim = createSimulation(tiles, true);
  run(sim, tiles, 3);
  assert.ok(sim.agents.some((a) => a.blocked));
  tiles[index(5, 3)] = 'road';
  sim.revision++;
  run(sim, tiles, 50);
  assert.equal(sim.status, 'won');
  assert.equal(sim.delivered, 12);
});
test('a removed route is replanned and never followed into a blocked tile', () => {
  const tiles = Array(121).fill('empty');
  tiles[12] = 'studio';
  tiles[15] = 'home';
  tiles[13] = tiles[14] = 'road';
  const sim = createSimulation(tiles);
  advance(sim, tiles, 0.2);
  tiles[13] = 'block';
  sim.revision++;
  run(sim, tiles, 5);
  assert.equal(sim.delivered, 0);
  assert.ok(sim.agents.every((a) => a.cell === 12));
  assert.ok(sim.agents.every((a) => a.blocked));
});
test('small and large timesteps agree before the deadline', () => {
  const tiles = createTown(),
    a = createSimulation(tiles, true),
    b = createSimulation(tiles, true);
  run(a, tiles, 10, 0.05);
  run(b, tiles, 10, 0.2);
  assert.equal(a.delivered, b.delivered);
  for (let i = 0; i < 12; i++) {
    assert.equal(a.agents[i].cell, b.agents[i].cell);
    assert.ok(Math.abs(a.agents[i].progress - b.agents[i].progress) < 1e-7);
  }
});
test('empty maps have no agents and invalid durations change nothing', () => {
  const tiles = Array(121).fill('empty'),
    sim = createSimulation(tiles);
  for (const dt of [NaN, -1, Infinity]) advance(sim, tiles, dt);
  assert.equal(sim.status, 'empty');
  assert.equal(sim.elapsed, 0);
  assert.equal(sim.agents.length, 0);
});
test('city exports round-trip and malformed files are rejected', () => {
  const tiles = createTown();
  assert.deepEqual(parseTown(serializeTown(tiles)), tiles);
  for (const text of [
    'no',
    'null',
    '{}',
    JSON.stringify({ version: 1, size: 11, tiles: Array(121).fill('script') }),
    'x'.repeat(20001),
  ])
    assert.throws(() => parseTown(text));
});
test('camera overlays restore the underlying map and respect mission buildings', () => {
  const base = createTown(),
    before = [...base];
  const result = mergeTokens(
    base,
    [
      { cell: 12, type: 'park' },
      { cell: 13, type: 'block' },
    ],
    new Set([12]),
  );
  assert.equal(result[12], base[12]);
  assert.equal(result[13], 'block');
  assert.deepEqual(base, before);
  assert.deepEqual(mergeTokens(base, []), before);
});
