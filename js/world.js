export const SIZE = 11;
export const TYPES = ['empty', 'road', 'home', 'studio', 'park', 'block', 'water'];
export const LABELS = {
  empty: 'Grass',
  road: 'Road',
  home: 'Home',
  studio: 'Studio',
  park: 'Park',
  block: 'Roadblock',
  water: 'Pond',
};
export const index = (x, y) => y * SIZE + x;
export const position = (id) => ({ x: id % SIZE, y: Math.floor(id / SIZE) });
export function neighbours(id) {
  const { x, y } = position(id);
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ]
    .filter(([a, b]) => a >= 0 && b >= 0 && a < SIZE && b < SIZE)
    .map(([a, b]) => index(a, b));
}
export function createTown() {
  const tiles = Array(SIZE * SIZE).fill('empty');
  for (let y = 1; y < 10; y++)
    for (let x = 1; x < 10; x++) {
      if ([2, 5, 8].includes(x) || [2, 5, 8].includes(y)) tiles[index(x, y)] = 'road';
    }
  for (const [x, y] of [
    [1, 1],
    [3, 1],
    [7, 1],
    [9, 1],
    [1, 9],
    [3, 9],
    [7, 9],
    [9, 9],
  ])
    tiles[index(x, y)] = 'home';
  for (const [x, y] of [
    [4, 4],
    [6, 6],
  ])
    tiles[index(x, y)] = 'studio';
  for (const [x, y] of [
    [3, 3],
    [7, 3],
    [9, 3],
    [1, 4],
    [3, 7],
    [7, 7],
    [9, 7],
    [6, 1],
    [4, 9],
  ])
    tiles[index(x, y)] = 'park';
  for (const [x, y] of [
    [0, 6],
    [1, 6],
    [0, 7],
    [1, 7],
  ])
    tiles[index(x, y)] = 'water';
  return tiles;
}
export function createChallengeTown() {
  const tiles = createTown();
  // Road works split the northern homes from the studios until a route is repaired.
  for (let x = 0; x < SIZE; x++) if (tiles[index(x, 3)] === 'road') tiles[index(x, 3)] = 'block';
  return tiles;
}
export function findRoute(tiles, start, goal) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(goal) ||
    start < 0 ||
    goal < 0 ||
    start >= tiles.length ||
    goal >= tiles.length
  )
    return null;
  if (start === goal) return [start];
  const parent = new Int16Array(tiles.length).fill(-1);
  parent[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const next of neighbours(cell)) {
      if (parent[next] !== -1) continue;
      if (tiles[next] !== 'road' && next !== goal) continue;
      parent[next] = cell;
      if (next === goal) {
        const path = [goal];
        while (path.at(-1) !== start) path.push(parent[path.at(-1)]);
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}
export function townStats(tiles) {
  const homes = [],
    studios = [];
  tiles.forEach((type, id) => {
    if (type === 'home') homes.push(id);
    if (type === 'studio') studios.push(id);
  });
  const connected = homes.filter((home) =>
    studios.some((studio) => findRoute(tiles, studio, home)),
  ).length;
  return {
    homes: homes.length,
    studios: studios.length,
    connected,
    parks: tiles.filter((t) => t === 'park').length,
  };
}
export function createSimulation(tiles, challenge = false) {
  const homes = [],
    studios = [];
  tiles.forEach((type, id) => {
    if (type === 'home') homes.push(id);
    if (type === 'studio') studios.push(id);
  });
  const agents =
    homes.length && studios.length
      ? Array.from({ length: 12 }, (_, id) => ({
          id,
          cell: studios[id % studios.length],
          goal: homes[id % homes.length],
          origin: studios[id % studios.length],
          progress: 0,
          wait: id * 0.4,
          path: null,
          done: false,
          blocked: false,
          revision: -1,
        }))
      : [];
  return {
    agents,
    elapsed: 0,
    delivered: 0,
    challenge,
    status: agents.length ? 'running' : 'empty',
    deadline: 60,
    revision: 0,
  };
}
export function advance(sim, tiles, dt) {
  if (sim.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
  const remaining = sim.challenge ? Math.max(0, sim.deadline - sim.elapsed) : Infinity;
  const step = Math.min(dt, remaining);
  sim.elapsed += step;
  for (const agent of sim.agents) {
    if (agent.done) continue;
    let budget = step;
    if (agent.wait > 0) {
      const delay = Math.min(agent.wait, budget);
      agent.wait -= delay;
      budget -= delay;
    }
    if (!budget) continue;
    if (agent.revision !== sim.revision || !agent.path) {
      agent.path = findRoute(tiles, agent.cell, agent.goal);
      agent.revision = sim.revision;
      agent.progress = 0;
    }
    agent.blocked = !agent.path;
    if (!agent.path) continue;
    let distance = budget * 0.8;
    while (distance > 0 && !agent.done) {
      if (agent.path.length <= 1) {
        agent.done = true;
        sim.delivered++;
        break;
      }
      const travel = Math.min(1 - agent.progress, distance);
      agent.progress += travel;
      distance -= travel;
      if (agent.progress >= 1 - 1e-9) {
        agent.cell = agent.path[1];
        agent.path.shift();
        agent.progress = 0;
      }
      if (agent.path.length === 1) {
        agent.done = true;
        sim.delivered++;
      }
    }
  }
  if (sim.agents.length && sim.delivered === sim.agents.length) sim.status = 'won';
  else if (sim.challenge && sim.elapsed >= sim.deadline) sim.status = 'lost';
}
export function parseTown(text) {
  if (typeof text !== 'string' || text.length > 20000)
    throw new Error('Choose a DeskWorld JSON file under 20 KB.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (
    !data ||
    data.version !== 1 ||
    data.size !== SIZE ||
    !Array.isArray(data.tiles) ||
    data.tiles.length !== SIZE * SIZE ||
    !data.tiles.every((t) => TYPES.includes(t))
  )
    throw new Error('This is not a supported DeskWorld city.');
  return [...data.tiles];
}
export function serializeTown(tiles) {
  return JSON.stringify({ version: 1, size: SIZE, tiles }, null, 2);
}
export function mergeTokens(base, tokens, protectedCells = new Set()) {
  const tiles = [...base];
  for (const token of tokens)
    if (
      Number.isInteger(token.cell) &&
      token.cell >= 0 &&
      token.cell < tiles.length &&
      !protectedCells.has(token.cell)
    )
      tiles[token.cell] = token.type;
  return tiles;
}
