import test from 'node:test';
import assert from 'node:assert/strict';
import {handleProfileAction} from './profile-action-handler.js';

function fixture(value) {
  const editor={value},counter={textContent:''};
  globalThis.document={querySelector:selector=>selector==='#prepend-prompt-editor'?editor:selector==='#prepend-prompt-count'?counter:null};
  globalThis.window={confirm:()=>true};
  const state={profile:{profilePrependPrompt:'自动画像包含人文历史',userCustomizedPrompt:'酒店希望安静'},useMemoriesInPlan:true};
  const calls=[];
  const context={state,request:async(path,options)=>{calls.push(JSON.parse(options.body));return {prependPrompt:'自动画像包含人文历史',userCustomizedPrompt:value,manualPromptNeedsReview:false};},toast:()=>{},refreshProfileMemoryInDOM:()=>true,refreshProfileSlotsInDOM:()=>true,refreshProfileInDOM:()=>{},markPageDataFresh:()=>{}};
  return {context,calls,state,editor,counter};
}
test('saving empty notes clears only manual text and keeps server-generated profile',async()=>{
  const f=fixture('');
  await handleProfileAction({...f.context,action:'save-prepend-prompt'});
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].prependPrompt,'');
  assert.equal(f.state.profile.userCustomizedPrompt,'');
  assert.equal(f.state.profile.profilePrependPrompt,'自动画像包含人文历史');
});
test('regeneration editor consumes manual notes, not the combined generated profile',async()=>{
  const f=fixture('酒店希望安静');
  await handleProfileAction({...f.context,action:'resynthesize-prepend-prompt'});
  assert.equal(f.calls[0].action,'resynthesize');
  assert.equal(f.editor.value,'酒店希望安静');
  assert.equal(f.counter.textContent,String('酒店希望安静'.length));
  assert.equal(f.state.profile.userCustomizedPrompt,'酒店希望安静');
});
