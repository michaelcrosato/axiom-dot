import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AxiomRegistry, compileRecipe, expr, hashSeed, planId, seedSample, turnPoint,
  type Axiom, type CompileContext, type Expression, type Frame, type PortDef, type Recipe,
  type SemanticPlan,
} from '../src/procedural.ts';

const origin = { x: 0, y: 0, z: 0 };
const identity: Frame = { ...origin, turn: 0 };
const context: CompileContext = { seed: 42, owner: 'test-owner' };

function port(key: string, overrides: Partial<PortDef> = {}): PortDef {
  return {
    key, type: 'fluid', direction: 'both', protocol: 'water/v1', position: { ...origin },
    facing: { x: 1, y: 0, z: 0 }, capacity: 8, unit: 'litres', ...overrides,
  };
}
function axiom(id = 'test/block', overrides: Partial<Axiom> = {}): Axiom {
  return {
    id, version: 1, label: id,
    parameters: { width: { min: 1, max: 8, default: 2, integer: true }, lift: { min: -2, max: 8, default: 0 } },
    shapes: [{
      key: 'body', center: { x: 0, y: { add: [{ param: 'lift' }, 1] }, z: 0 },
      half: { x: { mul: [{ param: 'width' }, .5] }, y: 1, z: .5 }, material: 'stone',
    }],
    ports: [
      port('in', { direction: 'in', facing: { x: -1, y: 0, z: 0 } }),
      port('out', { direction: 'out' }),
      port('socket', { type: 'attachment', direction: 'in', protocol: 'mount/v1', unit: 'mount', facing: { x: -1, y: 0, z: 0 } }),
    ],
    costs: { stone: 3, labour: 2 }, properties: { structural: true, role: 'block' }, ...overrides,
  };
}
function registry(...extra: Axiom[]): AxiomRegistry {
  const r = new AxiomRegistry()
    .register(axiom())
    .register(axiom('test/wide', { costs: { stone: 8, labour: 4 }, properties: { structural: true, role: 'reservoir' } }))
    .register(axiom('test/bracket', {
      shapes: [], parameters: {}, costs: { metal: 1 }, properties: { role: 'bracket' },
      ports: [port('pin', { type: 'attachment', direction: 'out', protocol: 'mount/v1', unit: 'mount' })],
    }))
    .adapter({ id: 'water-joint', from: 'fluid', to: 'fluid', protocol: 'water/v1', coincident: true, opposed: true, directed: true })
    .adapter({ id: 'water-route', from: 'fluid', to: 'fluid', protocol: 'water/v1', coincident: false, opposed: false, directed: true })
    .adapter({ id: 'mount-joint', from: 'attachment', to: 'attachment', protocol: 'mount/v1', coincident: true, opposed: true, directed: true });
  for (const a of extra) r.register(a);
  return r;
}
function recipe(expression: Expression, overrides: Partial<Recipe> = {}): Recipe {
  return { id: 'test/recipe', version: 1, description: 'Semantic compiler test fixture', expression, limits: { nodes: 128, operations: 10000, depth: 24 }, ...overrides };
}
function compile(expression: Expression, ctx: Partial<CompileContext> = {}, r = registry(), overrides: Partial<Recipe> = {}): SemanticPlan {
  return compileRecipe(r, recipe(expression, overrides), { ...context, ...ctx });
}
function valid(plan: SemanticPlan): void {
  assert.equal(plan.valid, true, JSON.stringify(plan.constraints.filter(c => !c.ok)));
  assert.ok(plan.constraints.every(c => c.ok));
}
function invalid(plan: SemanticPlan, message?: RegExp): void {
  assert.equal(plan.valid, false, 'Invalid input must never produce an accepted plan');
  assert.ok(plan.constraints.some(c => !c.ok));
  if (message) assert.match(plan.constraints.filter(c => !c.ok).map(c => c.message).join('\n'), message);
}
const block = (key: string, params?: Record<string, number>) => expr.instantiate(key, 'test/block', 1, params);
const endpoint = (node: string, p: string) => ({ node, port: p });
const connection = (key: string, from = 'source', to = 'sink', adapter = 'water-joint') => expr.connect(key, endpoint(from, 'out'), endpoint(to, 'in'), adapter);

function semanticFixture(): Expression {
  return expr.group(
    connection('water'),
    expr.attach('bracket-mount', endpoint('bracket', 'pin'), endpoint('source', 'socket'), 'mount-joint'),
    expr.expose('service-port', endpoint('sink', 'out')),
    block('source', { width: 3 }), block('sink'), expr.instantiate('bracket', 'test/bracket'),
    expr.transform({ x: 10, y: 2, z: -4, turn: 1 }, block('turned', { width: 4, lift: .5 })),
    expr.repeat('row', ['north', 'south'], { x: 4, y: 0, z: 0 }, block('unit')),
    expr.choose('layout', 'chamber-role', [
      { key: 'compact', weight: 1, child: block('chamber') },
      { key: 'reservoir', weight: 1, child: expr.instantiate('chamber', 'test/wide', 1, { width: 8 }) },
    ]),
    expr.split('wings', 'x', 20, 2, [
      { key: 'west', weight: 1, child: block('room') },
      { key: 'east', weight: 2, child: block('room') },
    ]),
    expr.require('one-bracket', { kind: 'count', axiom: 'test/bracket', min: 1, max: 1 }),
    expr.require('stone-budget', { kind: 'budget', resource: 'stone', max: 50 }),
    expr.require('no-water-cycles', { kind: 'acyclic', portType: 'fluid' }),
    expr.require('water-reachable', { kind: 'connected', nodes: ['source', 'sink'], portType: 'fluid' }),
  );
}

test('all ten operators produce a deterministic complete, serializable semantic plan', () => {
  const r = registry(), input = recipe(semanticFixture()), before = JSON.stringify(input);
  for (const seed of [0, 1, 42, 73129, 0xffffffff]) {
    const ctx = { ...context, seed }, plan = compileRecipe(r, input, ctx);
    valid(plan);
    assert.deepEqual(plan, compileRecipe(r, input, ctx));
    assert.deepEqual(plan, JSON.parse(JSON.stringify(plan)), 'Plan contains only JSON data');
    assert.ok(Object.isFrozen(plan));
    assert.ok(Object.isFrozen(plan.nodes));
    assert.ok(Object.isFrozen(plan.nodes[0]!.shapes[0] ?? plan.nodes[0]!.ports[0]));
    assert.throws(() => plan.nodes.push(plan.nodes[0]!));
    assert.equal(plan.framework, 1);
    assert.deepEqual(plan.recipe, { id: 'test/recipe', version: 1 });
    assert.deepEqual(plan.manifest, { 'test/block': 1, 'test/bracket': 1, ...(plan.choices.layout === 'reservoir' ? { 'test/wide': 1 } : {}) });
    assert.equal(plan.seed, seed);
    assert.equal(plan.owner, context.owner);
    assert.equal(plan.nodes.length, 9);
    assert.equal(plan.shapes.length, 8);
    assert.equal(plan.connections.length, 2);
    assert.equal(plan.exposed[0]!.key, 'service-port');
    assert.equal(plan.exposed[0]!.port.nodeId, plan.nodes.find(n => n.key === 'sink')!.id);
    assert.equal(plan.costs.stone, plan.choices.layout === 'reservoir' ? 29 : 24);
    assert.equal(plan.costs.metal, 1);
    assert.equal(new Set(plan.nodes.map(n => n.id)).size, plan.nodes.length);
    assert.equal(new Set(plan.shapes.map(s => s.id)).size, plan.shapes.length);
    assert.ok(plan.operations > plan.nodes.length);
  }
  assert.equal(JSON.stringify(input), before, 'Compiling does not mutate its recipe');
});

test('compilation is independent of previous calls and of unrelated group scheduling', () => {
  const r = registry(), expression = semanticFixture();
  assert.equal(expression.op, 'group');
  const first = compileRecipe(r, recipe(expression), context);
  for (const seed of [99, 0, 0xffffffff]) compileRecipe(r, recipe(semanticFixture()), { seed, owner: 'other-owner' });
  assert.deepEqual(compileRecipe(r, recipe(expression), context), first);
  const reversed = expr.group(...[...expression.children].reverse());
  assert.deepEqual(compileRecipe(r, recipe(reversed), context), first);
  const restored = JSON.parse(JSON.stringify(recipe(expression))) as Recipe;
  assert.deepEqual(compileRecipe(r, restored, context), first);
});

test('named seed samples are independently addressed, bounded, and have no consumption state', () => {
  const sample = () => seedSample(123, 1, 'owner', 'branch/leaf', 'height', 2);
  const expected = sample();
  for (let i = 0; i < 1000; i++) seedSample(i, 9, 'other', `path/${i}`, 'other-purpose', i);
  assert.equal(sample(), expected);
  const domains = [
    expected, seedSample(124, 1, 'owner', 'branch/leaf', 'height', 2),
    seedSample(123, 2, 'owner', 'branch/leaf', 'height', 2),
    seedSample(123, 1, 'other', 'branch/leaf', 'height', 2),
    seedSample(123, 1, 'owner', 'branch/other', 'height', 2),
    seedSample(123, 1, 'owner', 'branch/leaf', 'width', 2),
    seedSample(123, 1, 'owner', 'branch/leaf', 'height', 3),
  ];
  assert.equal(new Set(domains).size, domains.length);
  for (let seed = 0; seed < 1024; seed++) {
    const n = seedSample(seed, 1, 'owner', 'branch/leaf', 'height');
    assert.ok(Number.isFinite(n) && n >= 0 && n < 1);
  }
  assert.equal(hashSeed('named-stream'), hashSeed('named-stream'));
  assert.notEqual(hashSeed('named-stream'), hashSeed('named-stream-2'));
});

test('many seeds change semantic content, shape dimensions, resource costs, and node counts', () => {
  const choose = expr.choose('plan', 'room-function', [
    { key: 'small', weight: 1, child: block('room', { width: 1 }) },
    { key: 'large', weight: 1, child: expr.instantiate('room', 'test/wide', 1, { width: 8 }) },
    { key: 'paired', weight: 1, child: expr.repeat('rooms', ['a', 'b'], { x: 4, y: 0, z: 0 }, block('room')) },
  ]);
  const signatures = new Set<string>(), choices = new Set<string>();
  const r = registry();
  for (let seed = 0; seed < 256; seed++) {
    const plan = compile(choose, { seed }, r); valid(plan);
    choices.add(plan.choices.plan!);
    signatures.add(JSON.stringify({
      nodes: plan.nodes.map(n => ({ axiom: n.axiom, params: n.params, properties: n.properties })),
      geometry: plan.shapes.map(s => ({ center: s.center, half: s.half })), costs: plan.costs,
    }));
  }
  assert.deepEqual([...choices].sort(), ['large', 'paired', 'small']);
  assert.equal(signatures.size, 3, 'Signatures exclude seed-bearing IDs and metadata');
});

test('choice option ordering and unrelated branches do not alter existing choices or IDs', () => {
  const options = [
    { key: 'a', weight: 1, child: block('room') },
    { key: 'b', weight: 3, child: expr.instantiate('room', 'test/wide') },
  ];
  const existing = [block('source'), block('sink'), connection('link'), expr.choose('wing', 'role', options)];
  for (let seed = 0; seed < 64; seed++) {
    const before = compile(expr.group(...existing), { seed });
    const reordered = compile(expr.group(...existing.slice(0, 3), expr.choose('wing', 'role', [...options].reverse())), { seed });
    assert.deepEqual(before, reordered);
    const after = compile(expr.group(
      expr.choose('unrelated', 'new-purpose', [{ key: 'extra', weight: 1, child: block('room') }]),
      ...[...existing].reverse(), block('another'),
    ), { seed });
    valid(after);
    assert.equal(after.choices.wing, before.choices.wing);
    for (const node of before.nodes) assert.deepEqual(after.nodes.find(n => n.key === node.key), node);
    for (const shape of before.shapes) assert.deepEqual(after.shapes.find(s => s.id === shape.id), shape);
    assert.deepEqual(after.connections, before.connections);
  }
  const id = planId(42, 1, 'test-owner', 'wing/a/room');
  assert.notEqual(id, planId(42, 2, 'test-owner', 'wing/a/room'));
  assert.notEqual(id, planId(43, 1, 'test-owner', 'wing/a/room'));
  assert.notEqual(id, planId(42, 1, 'other-owner', 'wing/a/room'));
});

test('parameter arithmetic and composed quarter-turns correctly transform shapes and port frames', () => {
  const plan = compile(expr.transform({ x: 10, y: 3, z: 20, turn: 1 },
    expr.transform({ x: 2, y: 1, z: -4, turn: 2 }, block('rotated', { width: 6, lift: .5 }))));
  valid(plan);
  const node = plan.nodes[0]!;
  assert.deepEqual(node.frame, { x: 14, y: 4, z: 22, turn: 3 });
  assert.deepEqual(node.params, { width: 6, lift: .5 });
  assert.deepEqual(node.shapes[0]!.center, { x: 14, y: 5.5, z: 22 });
  assert.deepEqual(node.shapes[0]!.half, { x: .5, y: 1, z: 3 });
  assert.deepEqual(node.ports.find(p => p.key === 'out')!.position, { x: 14, y: 4, z: 22 });
  assert.deepEqual(node.ports.find(p => p.key === 'out')!.facing, { x: 0, y: 0, z: -1 });
  assert.deepEqual(turnPoint({ x: 2, y: 3, z: 5 }, 1), { x: -5, y: 3, z: 2 });
});

test('repeat slots give stable semantic addresses and split allocates weighted centers with gaps', () => {
  const before = compile(expr.repeat('row', ['alpha', 'beta'], { x: 3, y: 1, z: 0 }, block('unit')));
  const after = compile(expr.repeat('row', ['new', 'alpha', 'beta'], { x: 3, y: 1, z: 0 }, block('unit')));
  valid(before); valid(after);
  assert.deepEqual(before.nodes.map(n => n.key), ['row/alpha/unit', 'row/beta/unit']);
  assert.deepEqual(before.nodes.map(n => n.frame), [identity, { x: 3, y: 1, z: 0, turn: 0 }]);
  for (const node of before.nodes) assert.equal(after.nodes.find(n => n.key === node.key)!.id, node.id);
  for (const axis of ['x', 'z'] as const) {
    const plan = compile(expr.split('lots', axis, 20, 2, [
      { key: 'small', weight: 1, child: block('unit') }, { key: 'large', weight: 2, child: block('unit') },
    ]));
    valid(plan);
    assert.equal(plan.nodes.find(n => n.key === 'lots/small/unit')!.frame[axis], -7);
    assert.equal(plan.nodes.find(n => n.key === 'lots/large/unit')!.frame[axis], 4);
  }
  const scoped = compile(expr.repeat('pair', ['first', 'second'], { x: 4, y: 0, z: 0 },
    expr.group(connection('join'), block('source'), block('sink'), expr.expose('output', endpoint('sink', 'out')))));
  valid(scoped);
  assert.deepEqual(scoped.connections.map(c => c.key), ['pair/first/join', 'pair/second/join']);
  assert.deepEqual(scoped.exposed.map(e => e.key), ['pair/first/output', 'pair/second/output']);
});

test('node, operation, and recursion budgets terminate expansion without accepting partial plans', () => {
  const repeated = expr.repeat('row', Array.from({ length: 64 }, (_, i) => `s${i}`), { ...origin }, block('unit'));
  const nodes = compile(repeated, {}, registry(), { limits: { nodes: 3, operations: 10000, depth: 20 } });
  invalid(nodes, /Node budget/); assert.ok(nodes.nodes.length <= 3);
  const operations = compile(repeated, {}, registry(), { limits: { nodes: 128, operations: 15, depth: 20 } });
  invalid(operations, /Operation budget/); assert.ok(operations.operations <= 16);
  let nested = block('leaf');
  for (let i = 0; i < 30; i++) nested = expr.group(nested);
  const depth = compile(nested, {}, registry(), { limits: { nodes: 128, operations: 10000, depth: 4 } });
  invalid(depth, /depth/i); assert.equal(depth.nodes.length, 0); assert.ok(depth.operations <= 6);
  const exact = compile(block('one'));
  valid(compile(block('one'), {}, registry(), { limits: { nodes: 1, operations: exact.operations, depth: 1 } }));
  invalid(compile(block('one'), {}, registry(), { limits: { nodes: 0, operations: 100, depth: 1 } }), /Node budget/);
});

test('all collection expansion limits, duplicate keys, and impossible split clearances are rejected', () => {
  const bad: Expression[] = [
    expr.group(...Array.from({ length: 513 }, (_, i) => block(`n${i}`))),
    expr.repeat('row', Array.from({ length: 65 }, (_, i) => `s${i}`), origin, block('unit')),
    expr.repeat('row', ['same', 'same'], origin, block('unit')),
    expr.choose('role', 'purpose', []),
    expr.choose('role', 'purpose', Array.from({ length: 33 }, (_, i) => ({ key: `v${i}`, weight: 1, child: block('unit') }))),
    expr.choose('role', 'purpose', [{ key: 'same', weight: 1, child: block('a') }, { key: 'same', weight: 1, child: block('b') }]),
    expr.choose('role', 'purpose', [{ key: 'zero', weight: 0, child: block('a') }]),
    expr.split('lots', 'x', 2, 2, [{ key: 'a', weight: 1, child: block('a') }, { key: 'b', weight: 1, child: block('b') }]),
    expr.split('lots', 'x', 20, 0, []),
    expr.split('lots', 'z', 20, 0, Array.from({ length: 33 }, (_, i) => ({ key: `v${i}`, weight: 1, child: block('unit') }))),
    expr.group(block('same'), block('same')),
  ];
  for (const expression of bad) invalid(compile(expression));
});

test('unknown axioms, versions, parameters, adapters, and mixed axiom versions fail closed', () => {
  invalid(compile(expr.instantiate('unit', 'missing/axiom')), /Unknown axiom/);
  invalid(compile(expr.instantiate('unit', 'test/block', 999)), /Unknown axiom/);
  invalid(compile(block('unit', { code: 1 })), /Unknown parameter/);
  for (const width of [0, 9, 1.5, NaN, Infinity]) invalid(compile(block('unit', { width })), /bounds|finite|JSON/i);
  valid(compile(block('min', { width: 1, lift: -2 })));
  valid(compile(block('max', { width: 8, lift: 8 })));
  invalid(compile(expr.group(block('source'), block('sink'), connection('join', 'source', 'sink', 'unknown'))), /Unknown.*adapter/i);
  const r = registry(axiom('test/block', { version: 2 }));
  invalid(compile(expr.group(block('old'), expr.instantiate('new', 'test/block', 2)), {}, r), /Mixed axiom versions/);
  assert.throws(() => r.register(axiom()), /Duplicate axiom/);
});

test('invalid compiler identities, limits, frames, and numeric expression trees are rejected', () => {
  for (const ctx of [{ seed: -1 }, { seed: 1.2 }, { seed: 0x100000000 }, { owner: '../owner' }, { owner: '' }]) invalid(compile(block('unit'), ctx));
  for (const overrides of [
    { id: '../recipe' }, { version: 0 }, { version: 1.5 },
    ...[{ nodes: -1, operations: 20, depth: 2 }, { nodes: 513, operations: 20, depth: 2 },
      { nodes: 2, operations: 50001, depth: 2 }, { nodes: 2, operations: 0, depth: 2 },
      { nodes: 2, operations: 20, depth: 0 }, { nodes: 2, operations: 20, depth: 33 }].map(limits => ({ limits })),
  ]) invalid(compile(block('unit'), {}, registry(), overrides));
  invalid(compile(expr.transform({ ...identity, turn: 4 } as unknown as Frame, block('unit'))));
  invalid(compile(expr.transform({ ...identity, x: Infinity }, block('unit'))));
  const badShapes = [
    { ...axiom().shapes[0]!, half: { x: 0, y: 1, z: 1 } },
    { ...axiom().shapes[0]!, center: { x: { param: 'missing' }, y: 0, z: 0 } },
    { ...axiom().shapes[0]!, center: { x: { mul: [1e6, 1e6] }, y: 0, z: 0 } },
    { ...axiom().shapes[0]!, center: { x: { add: Array(17).fill(1) }, y: 0, z: 0 } },
  ];
  for (const shape of badShapes) {
    const r = registry(axiom('test/bad-shape', { shapes: [shape] }));
    invalid(compile(expr.instantiate('bad', 'test/bad-shape'), {}, r));
  }
});

test('hostile JSON is data only: unknown operators and executable-looking payloads are rejected', () => {
  const global = globalThis as typeof globalThis & { __axiomExecuted?: boolean };
  delete global.__axiomExecuted;
  const payloads = [
    '{"op":"eval","source":"globalThis.__axiomExecuted = true"}',
    '{"op":"instantiate","key":"unit","axiom":"test/block","version":1,"params":{"width":"(()=>{globalThis.__axiomExecuted=true;return 2})()"}}',
    '{"op":"constructor","prototype":{"polluted":true}}',
    '{"op":"group","children":[null]}',
    '{"op":"repeat","key":"r","slots":["x"],"step":null,"child":{}}',
    '{"op":"require","key":"rule","rule":{"kind":"execute","source":"globalThis.__axiomExecuted=true"}}',
    '"globalThis.__axiomExecuted = true"', 'null', '42', '[]',
  ];
  for (const payload of payloads) {
    const parsed = JSON.parse(payload) as Expression;
    assert.doesNotThrow(() => invalid(compile(parsed)), payload);
  }
  assert.equal(global.__axiomExecuted, undefined);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

function joinedWithPortOverrides(from: Partial<PortDef>, to: Partial<PortDef>): SemanticPlan {
  const r = registry(
    axiom('test/source', { ports: [port('out', { direction: 'out', ...from })] }),
    axiom('test/sink', { ports: [port('in', { direction: 'in', facing: { x: -1, y: 0, z: 0 }, ...to })] }),
  );
  return compile(expr.group(expr.instantiate('source', 'test/source'), expr.instantiate('sink', 'test/sink'), connection('join')), {}, r);
}

test('connections reject incompatible type, direction, protocol, units, capacity, and mating frames', () => {
  valid(joinedWithPortOverrides({}, {}));
  const bad: [Partial<PortDef>, Partial<PortDef>][] = [
    [{ direction: 'in' }, {}], [{}, { direction: 'out' }],
    [{ type: 'work' }, {}], [{}, { type: 'spatial' }],
    [{ protocol: 'steam/v1' }, {}], [{}, { protocol: 'water/v2' }],
    [{ unit: 'gallons' }, {}], [{ capacity: 0 }, {}], [{}, { capacity: 0 }],
    [{ position: { x: .01, y: 0, z: 0 } }, {}],
    [{}, { facing: { x: 1, y: 0, z: 0 } }],
  ];
  for (const [from, to] of bad) {
    const plan = joinedWithPortOverrides(from, to);
    invalid(plan); assert.equal(plan.connections.length, 0);
  }
});

test('port occupancy, duplicate links, self links, unknown endpoints, and attachment type are enforced', () => {
  const occupied = compile(expr.group(block('source'), block('sink'), block('other'), connection('first'), connection('second', 'source', 'other')));
  invalid(occupied, /occupancy/); assert.equal(occupied.connections.length, 1);
  invalid(compile(expr.group(block('source'), connection('self', 'source', 'source'))));
  invalid(compile(expr.group(block('source'), block('sink'), connection('same'), connection('same'))), /Duplicate connection/);
  invalid(compile(expr.group(block('source'), connection('missing'))), /Unknown endpoint/);
  invalid(compile(expr.group(block('source'), block('sink'), expr.connect('missing-port', endpoint('source', 'missing'), endpoint('sink', 'in'), 'water-joint'))), /Unknown endpoint/);
  invalid(compile(expr.group(block('source'), block('sink'), expr.attach('not-mount', endpoint('source', 'out'), endpoint('sink', 'in'), 'water-joint'))));
  invalid(compile(expr.group(block('source'), expr.expose('port', endpoint('missing', 'out')))), /Unknown endpoint/);
  invalid(compile(expr.group(block('source'), expr.expose('port', endpoint('source', 'out')), expr.expose('port', endpoint('source', 'out')))), /Duplicate exposed/);
});

test('required ports need a connection and exposed service ports retain their typed contract', () => {
  const r = registry(axiom('test/required', { ports: [port('out', { direction: 'out', required: true })] }));
  invalid(compile(expr.instantiate('source', 'test/required'), {}, r), /Required port/);
  const plan = compile(expr.group(expr.instantiate('source', 'test/required'), block('sink'), connection('join'), expr.expose('service', endpoint('sink', 'out'))), {}, r);
  valid(plan);
  assert.equal(plan.exposed[0]!.port.type, 'fluid');
  assert.equal(plan.exposed[0]!.port.protocol, 'water/v1');
  assert.equal(plan.exposed[0]!.port.direction, 'out');
  assert.equal(plan.exposed[0]!.port.capacity, 8);
});

test('directed cycle and undirected reachability requirements examine the accepted port graph', () => {
  const chain = [block('a'), block('b'), block('c'), connection('ab', 'a', 'b', 'water-route'), connection('bc', 'b', 'c', 'water-route')];
  const requirements = [
    expr.require('dag', { kind: 'acyclic', portType: 'fluid' }),
    expr.require('reachable', { kind: 'connected', nodes: ['c', 'a'], portType: 'fluid' }),
  ];
  valid(compile(expr.group(...chain, ...requirements)));
  const cycle = compile(expr.group(...chain, connection('ca', 'c', 'a', 'water-route'), ...requirements));
  invalid(cycle, /acyclic/); assert.equal(cycle.connections.length, 3);
  assert.equal(cycle.constraints.find(c => c.key === 'reachable')!.ok, true);
  invalid(compile(expr.group(...chain, block('isolated'), expr.require('reachable', { kind: 'connected', nodes: ['a', 'isolated'], portType: 'fluid' }))), /reachable/);
  invalid(compile(expr.group(...chain, expr.require('reachable', { kind: 'connected', nodes: ['a', 'missing'], portType: 'fluid' }))), /reachable/);
  invalid(compile(expr.group(...chain, expr.require('reachable', { kind: 'connected', nodes: ['a', 'c'], portType: 'attachment' }))), /reachable/);
  invalid(compile(expr.require('empty', { kind: 'connected', nodes: [], portType: 'fluid' })), /reachable/);
});

test('count, recipe resource budgets, and context budgets enforce exact aggregate costs', () => {
  const elements = [block('a'), block('b'), expr.instantiate('bracket', 'test/bracket')];
  const plan = compile(expr.group(...elements,
    expr.require('two', { kind: 'count', axiom: 'test/block', min: 2, max: 2 }),
    expr.require('stone', { kind: 'budget', resource: 'stone', max: 6 }),
  ), { maxCost: { stone: 6, labour: 4, metal: 1, water: 0 } });
  valid(plan); assert.deepEqual(plan.costs, { stone: 6, labour: 4, metal: 1 });
  invalid(compile(expr.group(...elements, expr.require('over', { kind: 'budget', resource: 'stone', max: 5 }))));
  invalid(compile(expr.group(...elements), { maxCost: { stone: 5 } }));
  invalid(compile(expr.group(...elements), { maxCost: { stone: -1 } }));
  invalid(compile(expr.group(...elements, expr.require('count', { kind: 'count', axiom: 'test/block', min: 0, max: 1 }))));
  invalid(compile(expr.group(...elements, expr.require('count', { kind: 'count', axiom: 'test/wide', min: 1, max: 1 }))));
});

test('reserved infrastructure clearance and lot bounds use transformed solid shape footprints', () => {
  const bounds = { key: 'lot', x: 0, z: 0, hx: 1, hz: .5 };
  valid(compile(block('fit'), { bounds }));
  invalid(compile(block('wide', { width: 3 }), { bounds }), /bounds/);
  const obstacle = { key: 'road', x: 2, z: 0, hx: 1, hz: 1 };
  valid(compile(block('touch'), { reservations: [obstacle] }));
  invalid(compile(block('overlap'), { reservations: [{ ...obstacle, x: 1.9 }] }), /infrastructure/);
  invalid(compile(block('margin'), { reservations: [{ ...obstacle, clearance: .1 }] }), /infrastructure/);
  const moved = expr.transform({ x: 10, y: 0, z: 10, turn: 1 }, block('rotated', { width: 6 }));
  valid(compile(moved, { bounds: { key: 'lot', x: 10, z: 10, hx: .5, hz: 3 } }));
  invalid(compile(moved, { reservations: [{ key: 'road', x: 10, z: 12, hx: .5, hz: .5 }] }));
  const decoration = axiom('test/decoration', { shapes: axiom().shapes.map(s => ({ ...s, solid: false })) });
  valid(compile(expr.instantiate('visual', 'test/decoration'), { bounds: { ...bounds, hx: .1 }, reservations: [{ key: 'road', x: 0, z: 0, hx: 1, hz: 1 }] }, registry(decoration)));
});

// These helpers deliberately cross the type boundary: imported JSON has no TypeScript guarantees.
function rejectDefinition(definition: unknown): void {
  let r: AxiomRegistry;
  try { r = registry(definition as Axiom); } catch { return; }
  invalid(compile(expr.instantiate('bad', (definition as Axiom).id), {}, r));
}

test('registry snapshots data without executing accessors, toJSON, functions, or custom prototypes', () => {
  let executed = 0;
  const withGetter = axiom('test/getter');
  Object.defineProperty(withGetter, 'label', { enumerable: true, get() { executed++; return 'executed'; } });
  assert.throws(() => registry(withGetter));
  assert.equal(executed, 0, 'Reading a hostile accessor executes untrusted code');
  const withIdentityGetter = axiom('test/identity-getter');
  Object.defineProperty(withIdentityGetter, 'id', { enumerable: true, get() { executed++; return 'test/identity-getter'; } });
  assert.throws(() => registry(withIdentityGetter));
  assert.equal(executed, 0, 'Registry must validate descriptors before reading identity fields');
  const withToJSON = Object.assign(axiom('test/to-json'), { toJSON() { executed++; return axiom('test/to-json'); } });
  assert.throws(() => registry(withToJSON));
  assert.equal(executed, 0, 'Cloning must not call user-supplied toJSON');
  const withFunction = axiom('test/function', { properties: { callback: (() => { executed++; }) as unknown as string } });
  assert.throws(() => registry(withFunction));
  const custom = Object.assign(Object.create({ inherited: true }), axiom('test/prototype')) as Axiom;
  assert.throws(() => registry(custom));
  const input = axiom('test/snapshot');
  const r = registry(input);
  (input.costs as Record<string, number>).stone = 999;
  (input.properties as Record<string, string>).role = 'mutated';
  assert.equal(r.get('test/snapshot', 1).costs.stone, 3);
  assert.equal(r.get('test/snapshot', 1).properties.role, 'block');
  assert.ok(Object.isFrozen(r.get('test/snapshot', 1)));
  assert.ok(Object.isFrozen(r.get('test/snapshot', 1).shapes));
});

test('malformed catalog parameters, shape contracts, ports, and negative costs fail closed', () => {
  const definitions = [
    axiom('test/bad-range', { parameters: { width: { min: 4, max: 2, default: 3 } } }),
    axiom('test/bad-default', { parameters: { width: { min: 1, max: 2, default: 3 } } }),
    axiom('test/duplicate-shape', { shapes: [axiom().shapes[0]!, axiom().shapes[0]!] }),
    axiom('test/duplicate-port', { ports: [port('same'), port('same')] }),
    axiom('test/negative-cost', { costs: { stone: -1 } }),
    axiom('test/port-type', { ports: [port('in', { type: 'execute' as PortDef['type'] })] }),
    axiom('test/port-direction', { ports: [port('in', { direction: 'sideways' as PortDef['direction'] })] }),
    axiom('test/port-frame', { ports: [port('in', { facing: { x: 0, y: 0, z: 0 } })] }),
    axiom('test/port-capacity', { ports: [port('in', { capacity: -1 })] }),
  ];
  for (const definition of definitions) rejectDefinition(definition);
});

test('malformed requirements cannot turn string coercion or non-finite values into passing constraints', () => {
  const rules = [
    { kind: 'count', axiom: 'test/block', min: '0', max: '100' },
    { kind: 'count', axiom: 'test/block', min: -.5, max: 10 },
    { kind: 'count', axiom: 'test/block', min: 0, max: 1.5 },
    { kind: 'count', axiom: 'test/block', min: 2, max: 1 },
    { kind: 'budget', resource: 'stone', max: '100' },
    { kind: 'budget', resource: 'stone', max: Infinity },
    { kind: 'acyclic', portType: 'missing' },
    { kind: 'connected', nodes: 'source', portType: 'fluid' },
  ];
  for (const rule of rules) invalid(compile(expr.group(block('source'), { op: 'require', key: 'rule', rule } as Expression)));
});

test('malformed reservation extents, clearance, centers, and max-cost values are rejected', () => {
  const reservation = { key: 'road', x: 100, z: 100, hx: 1, hz: 1 };
  for (const change of [{ hx: -1 }, { hz: -1 }, { clearance: -1 }, { x: NaN }, { z: Infinity }]) {
    invalid(compile(block('source'), { reservations: [{ ...reservation, ...change }] }));
  }
  invalid(compile(block('source'), { bounds: { key: 'lot', x: 0, z: 0, hx: Infinity, hz: 100 } }));
  invalid(compile(block('source'), { maxCost: { stone: '100' as unknown as number } }));
});

test('deep numeric trees terminate and recipe objects cannot execute getters during compilation', () => {
  let numeric: unknown = 1;
  for (let i = 0; i < 32; i++) numeric = { add: [numeric] };
  rejectDefinition(axiom('test/deep-numeric', { shapes: [{ ...axiom().shapes[0]!, center: { x: numeric as number, y: 0, z: 0 } }] }));
  let executed = 0;
  const expression = block('source');
  Object.defineProperty(expression, 'op', { enumerable: true, get() { executed++; return 'instantiate'; } });
  assert.doesNotThrow(() => invalid(compile(expression)));
  assert.equal(executed, 0);
});

test('JSON prototype keys are rejected without mutating any global object prototype', () => {
  const parsed = JSON.parse('{"op":"instantiate","key":"unit","axiom":"test/block","version":1,"params":{"__proto__":{"axiomPolluted":true},"width":2}}') as Expression;
  invalid(compile(parsed));
  assert.equal(({} as { axiomPolluted?: boolean }).axiomPolluted, undefined);
  const definition = JSON.parse(JSON.stringify(axiom('test/prototype-json')));
  definition.properties = JSON.parse('{"__proto__":{"axiomPolluted":true}}');
  rejectDefinition(definition);
  assert.equal(({} as { axiomPolluted?: boolean }).axiomPolluted, undefined);
});


test('invalid top-level imported recipes and contexts return a bounded rejected plan', () => {
  const r = registry();
  for (const input of [null, 42, [], {}, { id: 'bad', expression: null }]) {
    assert.doesNotThrow(() => invalid(compileRecipe(r, input as Recipe, context)));
  }
  for (const input of [null, 42, [], {}]) {
    assert.doesNotThrow(() => invalid(compileRecipe(r, recipe(block('unit')), input as CompileContext)));
  }
  let executed = 0;
  const input = recipe(block('unit'));
  Object.defineProperty(input, 'id', { enumerable: true, get() { executed++; return 'test/getter'; } });
  assert.doesNotThrow(() => invalid(compileRecipe(r, input, context)));
  assert.equal(executed, 0, 'Recipe identity is data, never executable code');
});

test('fractional resource aggregation and budget decisions are independent of group traversal order', () => {
  const r = registry(...[.1, .2, .3].map((cost, i) => axiom(`test/fraction-${i}`, {
    shapes: [], ports: [], parameters: {}, costs: { stone: cost }, properties: {},
  })));
  const children = [0, 1, 2].map(i => expr.instantiate(`n${i}`, `test/fraction-${i}`));
  const forward = compile(expr.group(...children), { maxCost: { stone: .6 } }, r);
  const reverse = compile(expr.group(...[...children].reverse()), { maxCost: { stone: .6 } }, r);
  assert.deepEqual(forward, reverse, 'Resource ledgers and budget outcomes must not depend on traversal order');
  valid(forward);
  assert.ok(Math.abs(forward.costs.stone! - .6) < 1e-12);
});

test('64-shape axioms repeated 64 times reject oversized output deterministically without throwing', () => {
  const r = registry(axiom('test/many-shapes', {
    parameters: {}, ports: [], costs: {}, properties: {},
    shapes: Array.from({ length: 64 }, (_, i) => ({
      key: `box-${i}`, center: { x: i * 2, y: 1, z: 0 },
      half: { x: .5, y: 1, z: .5 }, material: 'stone',
    })),
  }));
  const expression = expr.repeat('instances', Array.from({ length: 64 }, (_, i) => `slot-${i}`),
    { x: 0, y: 0, z: 4 }, expr.instantiate('body', 'test/many-shapes'));
  const input = recipe(expression, { limits: { nodes: 64, operations: 50000, depth: 8 } });
  let plan!: SemanticPlan;
  assert.doesNotThrow(() => { plan = compileRecipe(r, input, context); });
  invalid(plan, /output budget|JSON data budget/i);
  assert.ok(plan.shapes.length <= 1024, 'A rejected plan must not retain all 4096 expanded shapes');
  assert.ok(plan.nodes.length <= 64);
  assert.ok(plan.operations <= input.limits.operations + 1);
  assert.deepEqual(plan, compileRecipe(r, input, context));
  assert.deepEqual(plan, JSON.parse(JSON.stringify(plan)));
  assert.ok(Object.isFrozen(plan));
});

test('512 reservations across many ordinary shapes are charged to operation and constraint-output budgets', () => {
  const r = registry();
  const expression = expr.repeat('row', Array.from({ length: 32 }, (_, i) => `slot-${i}`),
    { x: 4, y: 0, z: 0 }, block('body'));
  const reservations = Array.from({ length: 512 }, (_, i) => ({
    key: `reserved-${i}`, x: 10000 + i * 4, z: 10000, hx: 1, hz: 1,
  }));
  for (const operations of [1000, 50000]) {
    const input = recipe(expression, { limits: { nodes: 64, operations, depth: 8 } });
    const baseline = compileRecipe(r, input, context);
    valid(baseline);
    let plan!: SemanticPlan;
    assert.doesNotThrow(() => { plan = compileRecipe(r, input, { ...context, reservations }); });
    invalid(plan, /Operation budget|Constraint output budget|JSON data budget/i);
    assert.ok(plan.operations > baseline.operations, 'Spatial checks must consume the same operation budget as expansion');
    assert.ok(plan.operations <= operations + 1);
    assert.ok(plan.constraints.length <= 4097, 'At most 4096 checks and one terminal failure are retained');
    assert.ok(plan.constraints.some(c => c.ok), 'The limit is reached during reservation checking, after successful expansion');
    assert.deepEqual(plan, compileRecipe(r, input, { ...context, reservations }));
    assert.deepEqual(plan, JSON.parse(JSON.stringify(plan)));
  }
});
