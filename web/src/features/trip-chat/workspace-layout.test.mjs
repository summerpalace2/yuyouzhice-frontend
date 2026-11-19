import test from 'node:test';
import assert from 'node:assert/strict';
import { changeDestination } from './workspace-layout.js';

test('applied change links to the replacement ID, or the surviving day for a deletion', () => {
  const state = { sessionId:'s1', trip:{version:3, days:[{day:2, stops:[{id:'new-stop'}]}]} };
  const changes = [{key:'old-stop',action:'REMOVED',before:{day:2,index:0}}];
  const card = {status:'approved', plannerSessionId:'s1', args:{stopChanges:changes},
    receipt:{data:{applied:true,currentVersion:3,sessionId:'s1'}}};
  assert.deepEqual(changeDestination(card, state), {day:2});
  changes.push({key:'new-stop',action:'ADDED',after:{day:2,index:0}});
  assert.deepEqual(changeDestination(card, state), {day:2,id:'new-stop'});
  assert.equal(changeDestination({...card,status:'cancelled'}, state), null);
  assert.equal(changeDestination(card, {...state,sessionId:'s2'}), null);
  assert.equal(changeDestination(card, {...state,trip:{...state.trip,version:4}}), null);
});
