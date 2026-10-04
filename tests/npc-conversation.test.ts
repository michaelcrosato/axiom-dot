import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONVERSATION_TOPICS, CONVERSATION_TONES, CONVERSATION_MEMORY_MAX_BYTES,
  createConversationMemory,validConversationMemory,parseConversationMemory,serializeConversationMemory,
  townConversationProfile,namedConversationProfile,openConversation,chooseConversation,
  conversationView,backConversation,
} from '../src/npc-conversation.ts';
import {townResidents,townResidentRoutinePhase} from '../src/town-residents.ts';
const clone=value=>JSON.parse(JSON.stringify(value));
const make=(seed=42,index=0)=>{const roster=townResidents(seed),profile=townConversationProfile(roster[index],roster),context={seed,elapsed:0},memory=createConversationMemory(seed);return {roster,profile,context,...openConversation(profile,context,memory)};};
const choose=(base,id)=>({...base,...chooseConversation(base.profile,base.context,base.session,base.memory,id)});
const view=base=>conversationView(base.profile,base.context,base.session,base.memory);

test('all 100 residents have eight complete, concise subjects with two follow-ups and four distinct reactions',()=>{
  for(const seed of [0,42,0xffffffff]){
    const allLines=new Set();
    for(let i=0;i<100;i++){
      const initial=make(seed,i),opening=view(initial);
      assert.equal(opening.choices.length,8);
      assert.ok(opening.line.includes(initial.profile.name));
      assert.equal(initial.profile.homeName,initial.roster[i].address);
      assert.equal(initial.profile.age,initial.roster[i].age);
      assert.ok(initial.roster[i].backstory.includes(initial.profile.ambition));
      assert.equal(initial.profile.history,`I ${initial.roster[i].backstory.slice(`${initial.profile.name}, ${initial.profile.age}, `.length).split('. ')[0]}.`);
      const identitySnapshot=JSON.stringify(initial.roster);
      for(const topic of CONVERSATION_TOPICS){
        const active=choose(initial,`topic:${topic}`),main=view(active);
        assert.equal(main.choices.length,6);
        assert.equal(main.choices.filter(c=>c.kind==='followup').length,2);
        assert.equal(main.choices.filter(c=>c.kind==='reaction').length,4);
        allLines.add(main.line);
        for(const state of [active,choose(active,`followup:${topic}:detail`),choose(active,`followup:${topic}:reflection`)]){
          assert.ok(view(state).line.length>20);
          assert.ok(view(state).line.length<=240);
          assert.ok(!/\b(?:AI|language model|trust score|reputation points)\b/i.test(view(state).line));
          const responses=CONVERSATION_TONES.map(t=>view(choose(state,`reaction:${topic}:${t}`)).line);
          assert.equal(new Set(responses).size,4,`${seed}/${i}/${topic} distinguish reactions`);
          for(const line of responses)assert.ok(line.length<=240);
        }
        for(const choice of main.choices){assert.ok(choice.text.split(' ').length>=5);assert.ok(/[.!?]$/.test(choice.text));}
        assert.equal(validConversationMemory(active.memory,seed),true);
      }
      assert.equal(JSON.stringify(initial.roster),identitySnapshot);
    }
    assert.ok(allLines.size>400,`meaningful factual resident diversity: ${allLines.size}`);
  }
});

test('household facts keep every source relative and adult relation; singles stay single',()=>{
  for(let index=0;index<100;index++){
    const base=make(4321,index),resident=base.roster[index],home=view(choose(base,'topic:home')).line;
    assert.ok(home.includes(resident.address));
    for(const relation of resident.relationships){const actual=base.roster.find(r=>r.id===relation.residentId);assert.ok(base.profile.relationships.some(r=>r.name===actual.name&&r.kind===relation.kind));assert.ok(home.includes(actual.name),`${resident.name}: ${home} lacks ${actual.name}`);}
    if(resident.householdKind==='single')assert.match(home,/on my own/);
    if(resident.householdKind==='family')assert.match(home,/adult/);
  }
});

test('memory records an exchange, recalls its actual subject/tone, and cannot be ground into scores',()=>{
  const base=make(),active=choose(choose(base,'topic:interests'),'reaction:interests:skeptical');
  const saved=serializeConversationMemory(active.memory),decoded=parseConversationMemory(saved,42);
  assert.deepEqual(decoded,active.memory);
  const again={...base,...openConversation(base.profile,base.context,decoded)};
  assert.match(view(again).line,/Last time, you pushed back/);
  assert.ok(view(again).line.includes(base.profile.interest));
  assert.equal(again.session.returning,true);
  let repeated=active;
  for(let i=0;i<300;i++)repeated=choose(repeated,'reaction:interests:skeptical');
  assert.equal(serializeConversationMemory(repeated.memory),saved);
  assert.equal(repeated.memory.residents[0].topics.length,1);
  assert.equal(Object.keys(repeated.memory.residents[0]).sort().join(','),'lastBeat,lastTone,lastTopic,residentId,topics');
  assert.equal(choose(active,'topics').memory,active.memory);
  assert.equal(choose(active,'leave').memory,active.memory);
});

test('navigation, stale choices and leaving are bounded no-op-safe operations',()=>{
  const base=make(),work=choose(base,'topic:work'),detail=choose(work,'followup:work:detail');
  assert.equal(detail.session.beat,'detail');
  const repeatedDetail=choose(detail,'followup:work:detail');
  assert.deepEqual(view(repeatedDetail),view(detail));
  assert.equal(repeatedDetail.memory,detail.memory);
  assert.equal(choose(work,'followup:past:detail').session,work.session);
  assert.equal(choose(work,'topic:past').session,work.session);
  assert.equal(choose(work,'reaction:work:angry').session,work.session);
  assert.equal(choose(base,'followup:day:detail').session,base.session);
  const menu={...work,session:backConversation(work.session)};
  assert.equal(view(menu).choices.length,8);
  assert.equal(menu.session.menuShifted,true);
  assert.ok(!view(menu).line.includes(base.profile.name));
  assert.ok(!/Good to see you|Last time|I am on|We talked about/.test(view(menu).line));
  assert.equal(menu.memory,work.memory);
  const gone=choose(work,'leave');
  assert.equal(view(gone).choices.length,0);assert.equal(gone.session.gone,true);
  assert.equal(choose(gone,'topics').session,gone.session);
  assert.equal(choose(gone,'reaction:work:playful').session,gone.session);
  assert.equal(backConversation(gone.session),gone.session);
});

test('strict local-memory validation rejects extra, malformed, versioned, cross-seed and oversized data',()=>{
  const good=choose(make(),'topic:day').memory;
  const malformed=[];
  for(const mutation of [
    x=>x.version=2,x=>x.seed=43,x=>x.reward=10,x=>x.residents.push(clone(x.residents[0])),
    x=>x.residents[0].residentId='town-resident:43:000',x=>x.residents[0].residentId='town-resident:42:100',
    x=>x.residents[0].residentId='causal:1:42/agent/elsewhere/carrier',
    x=>x.residents[0].topics=['day',,],x=>x.residents[0].topics=['day','day'],x=>x.residents[0].topics=['unknown'],
    x=>x.residents[0].lastTopic='home',x=>x.residents[0].lastTone='hostile',
    x=>x.residents[0].lastBeat='unknown',x=>x.residents[0].lastTopic=null,
    x=>x.residents[0].memory='fabricated past',x=>x.residents[0].trust=5,
    x=>x.residents[0].topics=new Array(9).fill('day'),x=>x.residents=Array.from({length:107},()=>clone(x.residents[0])),
  ]){const altered=clone(good);mutation(altered);malformed.push(altered);}
  for(const value of [null,[],1,'text',NaN,...malformed]){
    assert.equal(validConversationMemory(value,42),false);
    assert.deepEqual(parseConversationMemory(JSON.stringify(value),42),createConversationMemory(42));
  }
  assert.deepEqual(parseConversationMemory('{bad',42),createConversationMemory(42));
  assert.deepEqual(parseConversationMemory(' '.repeat(CONVERSATION_MEMORY_MAX_BYTES+1),42),createConversationMemory(42));
  assert.equal(validConversationMemory({...good,[Symbol('hidden')]:1},42),false);
  assert.equal(validConversationMemory(Object.assign(Object.create({extra:true}),clone(good)),42),false);
  assert.throws(()=>createConversationMemory(-1));assert.throws(()=>createConversationMemory(1.5));
  assert.throws(()=>serializeConversationMemory({...good,reward:1}));
});

test('each seed/resident keeps independent memory; all residents fit within the size budget',()=>{
  const seed=7123,roster=townResidents(seed);let memory=createConversationMemory(seed);
  for(const resident of roster){const profile=townConversationProfile(resident,roster),context={seed,elapsed:0};let current=openConversation(profile,context,memory);for(const topic of CONVERSATION_TOPICS){current={...current,session:backConversation(current.session)};current=chooseConversation(profile,context,current.session,current.memory,`topic:${topic}`);current=chooseConversation(profile,context,current.session,current.memory,`reaction:${topic}:supportive`);}memory=current.memory;}
  for(const place of ['mossbank','highmeadow'])for(const role of ['caretaker','carrier','builder']){const p=namedConversationProfile({id:`causal:1:${seed}/agent/${place}/${role}`,name:`${place} ${role}`,role,homeName:place}),c={seed,elapsed:0};memory=openConversation(p,c,memory).memory;}
  assert.equal(memory.residents.length,106);assert.equal(validConversationMemory(memory,seed),true);
  assert.ok(serializeConversationMemory(memory).length<CONVERSATION_MEMORY_MAX_BYTES);
  const independent=make(seed,0);assert.equal(view(independent).remembered,null);
  assert.deepEqual(parseConversationMemory(serializeConversationMemory(memory),seed+1),createConversationMemory(seed+1));
});

test('time/routine context matches the canonical resident phase, without wall clock or world writes',()=>{
  const base=make(36,1);
  for(const elapsed of [-900,0,70,200,395,481,1000,NaN,Infinity]){
    const context={seed:36,elapsed},phase=townResidentRoutinePhase(base.roster[1],elapsed),fresh={...base,context};
    const day=view(choose(fresh,'topic:day'));
    const explicit={...fresh,context:{...context,activity:phase.activity}};
    assert.equal(day.line,view(choose(explicit,'topic:day')).line);
    assert.ok(day.line.length<=240);
  }
  const zero={...base,context:{seed:36,elapsed:0}},later={...base,context:{seed:36,elapsed:250}};
  assert.notEqual(view(choose(zero,'topic:day')).line,view(choose(later,'topic:day')).line);
});

test('named causal profiles preserve actual plan facts and never create household biographies',()=>{
  for(const role of ['caretaker','carrier','builder']){
    const facts={id:`causal:1:42/agent/mossbank/${role}`,name:'Mira',role,homeName:'Mossbank',workplaceName:'Mossbank workshop 1'};
    const profile=namedConversationProfile(facts),context={seed:42,elapsed:0,status:'Waiting: required route threatened'};
    const base={profile,context,...openConversation(profile,context,createConversationMemory(42))};
    assert.equal(profile.name,'Mira');assert.equal(profile.role,role);assert.equal(profile.homeName,'Mossbank');
    assert.equal(profile.relationships.length,0);assert.equal(profile.age,null);
    assert.match(view(choose(base,'topic:home')).line,/Mossbank/);
    assert.match(view(choose(base,'topic:day')).line,/route is not safe/);
    assert.ok(!/grew up|partner|children|parent|apprentice/.test(profile.history));
    assert.equal(view(base).choices.length,8);
  }
});

test('public transitions are immutable and deterministic and reject mismatched session scope',()=>{
  const base=make(),snapshot=JSON.stringify(base);
  assert.ok(Object.isFrozen(base.profile));assert.ok(Object.isFrozen(base.memory));assert.ok(Object.isFrozen(base.session));
  assert.deepEqual(choose(base,'topic:past'),choose(base,'topic:past'));
  assert.equal(JSON.stringify(base),snapshot);
  const other=make(42,1);
  assert.throws(()=>conversationView(other.profile,base.context,base.session,base.memory));
  assert.throws(()=>openConversation(base.profile,{seed:43,elapsed:0},createConversationMemory(43)));
});
