import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// When integrating under tests/, change only this import to the final src path.
import {townResidents, townResidentPose, townResidentAddress, TOWN_RESIDENT_COUNT,
  TOWN_RESIDENT_KEEPER_ROLES, TOWN_RESIDENT_CYCLE_SECONDS, TOWN_RESIDENT_PHASES,
  TOWN_RESIDENT_CACHE_LIMIT, TOWN_HOUSE_COUNT, townHouseholds, townResidentRoutinePhase, townResidentHouseholdSummary, type TownResident, type TownResidentPlan} from '../src/town-residents.ts';
import {startingTown} from '../src/starting-town.ts';

const center = {x: -176, z: -144};
const plan:TownResidentPlan=startingTown(73129);
const localPose = (resident: TownResident, localSeconds: number) =>
  townResidentPose(resident, localSeconds - resident.phaseOffset, plan);
const distance = (a: {x: number; z: number}, b: {x: number; z: number}) => Math.hypot(a.x - b.x, a.z - b.z);
const visualKey = (resident: TownResident) => JSON.stringify([resident.colors, resident.hat, resident.height]);
const pointKey = (point: {x: number; z: number}) => `${point.x.toFixed(5)}:${point.z.toFixed(5)}`;

test('one hundred additional residents have unique stable IDs, names, and visible combinations', () => {
  const residents = townResidents(73129);
  assert.equal(residents.length, TOWN_RESIDENT_COUNT);
  for (const key of [(r: TownResident) => r.id, (r: TownResident) => r.name, visualKey]) {
    assert.equal(new Set(residents.map(key)).size, 100);
  }
  assert.ok(residents.every((resident, index) => resident.index === index
    && resident.id === `town-resident:73129:${String(index).padStart(3, '0')}`
    && resident.homeIndex >= 0 && resident.homeIndex < TOWN_HOUSE_COUNT
    && resident.workIndex >= 0 && resident.workIndex < 7
    && resident.dialogue.length === 3 && resident.dialogue.every(line => line.length > 20)
    && resident.personality.length > 0 && resident.interest.length > 0
    && resident.height >= 0.91 && resident.height <= 1.09));
  for (let homeIndex = 0; homeIndex < TOWN_HOUSE_COUNT; homeIndex++) {
    const homeResidents = residents.filter(resident => resident.homeIndex === homeIndex);
    assert.equal(homeResidents.length, homeIndex<12?1:homeIndex<24?2:homeIndex<28?3:homeIndex<36?4:5);
    assert.ok(homeResidents.every(resident => resident.address === townResidentAddress(homeIndex)));
  }
  assert.equal(residents[0]!.address, '1 Orchard Row');
  assert.equal(townResidentAddress(19), '20 Lantern Row');
  assert.equal(townResidentAddress(39), '40 Hearth Lane');
});

test('rosters are deterministic and deeply frozen, while a changed seed changes names and appearances', () => {
  const first = townResidents(81);
  assert.equal(first, townResidents(81));
  assert.ok(Object.isFrozen(first));
  for (const resident of first) {
    assert.ok(Object.isFrozen(resident) && Object.isFrozen(resident.colors) && Object.isFrozen(resident.dialogue));
  }
  assert.equal(Reflect.set(first[0]!.colors, 'tunic', 0), false);
  const different = townResidents(82);
  assert.notDeepEqual(first.map(r => r.name), different.map(r => r.name));
  assert.notDeepEqual(first.map(visualKey), different.map(visualKey));
  assert.notDeepEqual(first.map(r => r.phaseOffset), different.map(r => r.phaseOffset));
  assert.deepEqual(first.map(r => r.address), different.map(r => r.address));
});

test('affine name and appearance permutations stay unique across a seed sample', () => {
  for (let seed = 0; seed < 128; seed++) {
    const residents = townResidents(seed * 32771);
    assert.equal(new Set(residents.map(r => r.name)).size, 100, `names for seed ${seed}`);
    assert.equal(new Set(residents.map(visualKey)).size, 100, `visuals for seed ${seed}`);
  }
});

test('strong roster caching is LRU and bounded to four seeds', () => {
  assert.equal(TOWN_RESIDENT_CACHE_LIMIT, 4);
  const oldest = townResidents(40001);
  const second = townResidents(40002);
  townResidents(40003); townResidents(40004);
  assert.equal(townResidents(40001), oldest, 'a hit refreshes recency');
  townResidents(40005);
  assert.equal(townResidents(40001), oldest, 'recently used roster remains cached');
  const regenerated = townResidents(40002);
  assert.notEqual(regenerated, second, 'least recently used roster was evicted');
  assert.deepEqual(regenerated, second, 'eviction never changes the deterministic data');
});

test('all seven business keepers visit their assigned shop and have a complete daily routine', () => {
  const residents = townResidents(73129);
  assert.equal(residents.filter(r => r.keeper).length, 7);
  for (let i = 0; i < 7; i++) {
    const resident = residents[i]!;
    assert.equal(resident.role, TOWN_RESIDENT_KEEPER_ROLES[i]);
    assert.equal(resident.workIndex, i);
    const work=resident.routine[2]!,initial=localPose(resident,(work.start+work.end)/2);
    assert.ok(distance(initial, plan.shops[i]!.entry) < 3.5, 'keeper works inside the shop interaction radius');
    assert.equal(initial.activity, 'keeping shop');
    assert.equal(initial.moving, false);
    for(const phase of resident.routine){const pose=localPose(resident,(phase.start+phase.end)/2);
      assert.equal(pose.activity,phase.activity);assert.equal(pose.moving,phase.moving);}
    assert.ok(distance(initial,localPose(resident,20))>5,'keeper really returns home');
    assert.ok(resident.dialogue[2].includes('counter stays available'));
  }
});

test('walkers visit every phase of a bounded, staggered cyclic routine', () => {
  assert.equal(TOWN_RESIDENT_CYCLE_SECONDS, 480);
  assert.equal(TOWN_RESIDENT_PHASES.length, 6);
  assert.equal(TOWN_RESIDENT_PHASES[0]!.start, 0);
  assert.equal(TOWN_RESIDENT_PHASES.at(-1)!.end, 480);
  assert.ok(Object.isFrozen(TOWN_RESIDENT_PHASES));
  const walkers = townResidents(99);
  assert.equal(new Set(walkers.map(r => r.phaseOffset)).size, 100);
  assert.ok(new Set(walkers.map(r=>JSON.stringify(r.routine.map(p=>[p.start,p.end])))).size>90);
  for (const resident of walkers) {
    assert.ok(resident.phaseOffset >= 0 && resident.phaseOffset < 480);
    for (let i = 0; i < resident.routine.length; i++) {
      const phase = resident.routine[i]!;
      if (i > 0) assert.equal(phase.start, resident.routine[i - 1]!.end);
      assert.ok(phase.end > phase.start);
      const at = localPose(resident, (phase.start + phase.end) / 2);
      assert.equal(at.activity, phase.activity);
      assert.equal(at.moving, phase.moving);
    }
  }
});

test('every phase transition and the day wrap are position-continuous', () => {
  for (const resident of townResidents(678)) {
    for (const boundary of [...resident.routine.map(p=>p.start),480]) {
      const left = localPose(resident, boundary - 1e-7);
      const at = localPose(resident, boundary);
      const right = localPose(resident, boundary + 1e-7);
      assert.ok(distance(left, at) < 5e-7, `${resident.id} left boundary ${boundary}`);
      assert.ok(distance(at, right) < 5e-7, `${resident.id} right boundary ${boundary}`);
    }
  }
});

test('one full population cycle remains finite, on open street bands, and below 2.2 m/s', () => {
  for (const resident of townResidents(98765)) {
    let previous = townResidentPose(resident, 0, plan);
    for (let time = 0.5; time <= 480; time += 0.5) {
      const pose = townResidentPose(resident, time, plan);
      const x = pose.x - center.x, z = pose.z - center.z;
      assert.ok([pose.x, pose.z, pose.facing].every(Number.isFinite));
      assert.ok(Math.abs(x) <= 49 && Math.abs(z) <= 45.300001);
      assert.ok(Math.abs(z) <= 2.600001 || Math.abs(Math.abs(z) - 24) <= 1.300001
        || Math.abs(Math.abs(z) - 44) <= 1.300001
        || (z >= -0.620001 && Math.abs(x) <= 0.620001) || Math.abs(Math.abs(x) - 48) <= 0.980001,
        `left street bands: ${resident.id} at ${time}`);
      assert.ok(distance(previous, pose) <= 1.100001, `jump or excess speed: ${resident.id} at ${time}`);
      previous = pose;
    }
  }
});

test('all home, work, and square dwell stations are distinct and clear of the trunk', () => {
  const residents = townResidents(73129);
  for (const phaseIndex of [0,2,4]) {
    const poses = residents.map(resident => {const phase=resident.routine[phaseIndex]!;return localPose(resident,(phase.start+phase.end)/2);});
    assert.equal(new Set(poses.map(pointKey)).size, residents.length);
    assert.ok(poses.every(pose => Math.abs(pose.x - center.x) > 1.2));
    for (let a = 0; a < poses.length; a++) {
      for (let b = a + 1; b < poses.length; b++) assert.ok(distance(poses[a]!, poses[b]!) >= 0.59999);
    }
  }
});

test('absolute-time queries are order independent, periodic, and robust to invalid elapsed time', () => {
  const resident = townResidents(12345)[52]!;
  const expected = townResidentPose(resident, 123.25, plan);
  for (const time of [0, 479, 111111, 123.25, -1000, 0.01]) townResidentPose(resident, time, plan);
  assert.deepEqual(townResidentPose(resident, 123.25, plan), expected);
  for (const time of [-4000, -480, -1, 0, 123.25, 478.99, 6000]) {
    assert.ok(distance(townResidentPose(resident, time, plan), townResidentPose(resident, time + 480, plan)) < 1e-9);
  }
  for (const time of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(townResidentPose(resident, time, plan), townResidentPose(resident, 0, plan));
  }
  for (const time of [1e12, 1e100, Number.MAX_VALUE]) {
    const pose = townResidentPose(resident, time, plan);
    assert.ok([pose.x, pose.z, pose.facing].every(Number.isFinite));
  }
});

test('invalid seeds, addresses, and layout contracts fail explicitly', () => {
  for (const seed of [NaN, Infinity, -1, 1.2, 0x100000000]) assert.throws(() => townResidents(seed), RangeError);
  for (const index of [-1, 40, 0.5, NaN]) assert.throws(() => townResidentAddress(index), RangeError);
  const resident = townResidents(0)[10]!;
  assert.throws(() => townResidentPose(resident, 0, {...plan, homes: []}), RangeError);
  assert.throws(() => townResidentPose(resident, 0, {...plan, center: {x: NaN, z: 0}}), RangeError);
  assert.throws(() => townResidentPose(resident, 0, {...plan, shops: plan.shops.map(shop => ({entry: {...shop.entry, z: 200}}))}), RangeError);
});

test('actual town walls and lamps clear every sampled route by the player body margin', () => {
  const actualPlan = startingTown(73129);
  const obstacles = actualPlan.boxes.filter(box => box.solid
    && box.center.y - box.half.y < 8.2 && box.center.y + box.half.y > 6.05);
  for (const resident of townResidents(73129)) {
    for (let tick = 0; tick <= 1920; tick++) {
      const pose = townResidentPose(resident, tick / 4, actualPlan);
      for (const box of obstacles) {
        assert.ok(!(Math.abs(pose.x - box.center.x) < box.half.x + 0.6
          && Math.abs(pose.z - box.center.z) < box.half.z + 0.6),
        `${resident.id} intersects ${box.id} at ${tick / 4} seconds`);
      }
    }
  }
});


test('households are complete, reciprocal, adult and assigned to one actual house each',()=>{
  for(const seed of [0,81,73129,0xffffffff]){
    const residents=townResidents(seed),households=townHouseholds(seed),plan=startingTown(seed);
    assert.equal(households.length,TOWN_HOUSE_COUNT);assert.equal(plan.homes.length,TOWN_HOUSE_COUNT);
    assert.deepEqual(['single','couple','family'].map(kind=>households.filter(h=>h.kind===kind).length),[12,12,16]);
    assert.deepEqual([3,4,5].map(size=>households.filter(h=>h.memberIds.length===size).length),[4,8,4]);
    assert.equal(residents.filter(r=>r.householdKind==='family'&&r.householdRole==='parent'&&!r.relationships.some(p=>p.kind==='partner')).length,4);
    assert.equal(new Set(households.flatMap(h=>h.memberIds)).size,100);
    assert.equal(households.flatMap(h=>h.memberIds).length,100);
    for(const house of households){
      assert.equal(house.address,plan.homes[house.homeIndex]!.name);assert.ok(Object.isFrozen(house)&&Object.isFrozen(house.memberIds));
      for(const id of house.memberIds){const r=residents.find(r=>r.id===id)!;assert.equal(r.householdId,house.id);assert.equal(r.homeIndex,house.homeIndex);
        assert.equal(r.householdKind,house.kind);assert.ok(r.age>=24&&r.age<=68);
        assert.deepEqual([...r.housemateIds].sort(),house.memberIds.filter(id=>id!==r.id).sort());
        assert.equal(r.relationships.length,r.housemateIds.length);assert.equal(new Set(r.relationships.map(p=>p.residentId)).size,r.relationships.length);
        assert.ok(Object.isFrozen(r.relationships)&&Object.isFrozen(r.housemateIds)&&Object.isFrozen(r.routine));
        assert.ok(r.backstory.includes(r.name)&&r.backstory.includes(r.address)&&r.backstory.includes(r.role)&&r.backstory.includes(r.interest));
        assert.ok(townResidentHouseholdSummary(r,residents).includes(r.address));
        for(const relationship of r.relationships){const other=residents.find(r=>r.id===relationship.residentId)!;
          assert.equal(other.householdId,r.householdId);assert.ok(r.backstory.includes(other.name));
          const inverse=relationship.kind==='parent'?'adult child':relationship.kind==='adult child'?'parent':relationship.kind;
          assert.equal(other.relationships.find(p=>p.residentId===r.id)?.kind,inverse);
          if(relationship.kind==='parent')assert.ok(other.age-r.age>=18);
          assert.ok(Object.isFrozen(relationship));
        }
      }
    }
    assert.equal(new Set(residents.map(r=>r.backstory)).size,100);
  }
});

test('existing names, IDs, occupations and visible appearance stay byte-stable for legacy seeds',()=>{
  const snapshots=new Map([[0,'8da7dc172d83cf16e7d54af975640ea7db100a65edb6389a89d3a9d33597cb3a'],[73129,'26bb8aab344a96f52843320eeecfb53917b0a9690a36ba7f6f9d26f596574605'],[0xffffffff,'6307e3ea151090b606638e7b9a1e81fd855800ceb52d1e6a87047cac6dab1250']]);
  for(const[seed,expected]of snapshots){const snapshot=townResidents(seed).map(r=>({id:r.id,name:r.name,role:r.role,workIndex:r.workIndex,colors:r.colors,height:r.height,hat:r.hat,appearance:r.appearance}));
    assert.equal(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),expected);}
});

test('actual routine descriptions and individualized timing drive every posed activity',()=>{
  for(const seed of [0,73129,0xffffffff])for(const resident of townResidents(seed)){
    assert.equal(resident.routine[0]!.start,0);assert.equal(resident.routine.at(-1)!.end,480);
    for(const phase of resident.routine){assert.ok(phase.end>phase.start);assert.ok(phase.description.length>35);
      const elapsed=(phase.start+phase.end)/2-resident.phaseOffset;
      assert.equal(townResidentRoutinePhase(resident,elapsed),phase);
      const pose=townResidentPose(resident,elapsed,startingTown(seed));assert.equal(pose.activity,phase.activity);assert.equal(pose.moving,phase.moving);
      if(phase.moving)assert.ok(pose.speed!>0&&pose.speed!<=2.2);
    }
    if(!['lamplighter','innkeeper','baker','cook'].includes(resident.role))assert.ok(resident.phaseOffset<6||resident.phaseOffset>=474,'ordinary household stays near the shared day');
  }
});


test('personalized routes retain a bounded walking speed across 128 deterministic schedules',()=>{
  for(let seed=0;seed<128;seed++)for(const resident of townResidents(seed))for(const phase of resident.routine.filter(p=>p.moving)){
    const pose=townResidentPose(resident,(phase.start+phase.end)/2-resident.phaseOffset,startingTown(seed));
    assert.ok(pose.speed!>0&&pose.speed!<2.2,`${seed}/${resident.index}/${phase.activity}: ${pose.speed}`);
  }
});
