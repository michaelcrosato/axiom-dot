import assert from 'node:assert/strict';
import {createRegionalState,enableStartingTown,type State} from '../../src/world.ts';
import {assignTownWorkshopWorker} from '../../src/town-life.ts';
import {DEFAULT_WORKSHOP_DRAFT} from '../../src/workshop-authoring.ts';
import {WORKSHOP_BOARD,WORKSHOP_PARCEL,type WorkshopConstructionCommand} from '../../src/workshop-construction.ts';
export const seed=73129;
export function readyWorkshop(){const s=enableStartingTown(createRegionalState(seed));return {...s,player:{...s.player,...WORKSHOP_BOARD}};}
export function buildCommand(s:State):WorkshopConstructionCommand {const worker=s.townLife!.residents.find(r=>assignTownWorkshopWorker(s.townLife!,r.id));assert(worker);return {kind:'build',expectedRevision:0,parcelId:WORKSHOP_PARCEL.id,parameters:{...DEFAULT_WORKSHOP_DRAFT},workerId:worker.id};}
