import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getSyncDiagnostics,sanitizeSyncError} from '../src/lib/syncDiagnostics.ts';
const root=new URL('../',import.meta.url);
const entries=[{id:'off_1',createdAt:1700000000000,table:'customers',type:'insert',description:'Create Customer PRIVATE NAME',retryCount:2,lastError:'duplicate key value violates unique constraint "customers_pkey" (23505) DETAIL Key(email)=(private@example.test)',payload:{email:'private@example.test',access_token:'secret-token'}},{id:'off_2',createdAt:1700000001000,table:'vehicles',type:'update',description:'PRIVATE VIN',matchField:'id',matchValue:'PRIVATE-ID',retryCount:3,lastError:'permission denied (42501) Authorization: Bearer secret-token https://backend.test/?refresh_token=secret'}];
const load=(source,require)=>{const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require,console,window:new EventTarget(),navigator:{onLine:true},CustomEvent:class extends Event{constructor(t,o){super(t);this.detail=o.detail}},localStorage:{},setTimeout(){throw Error('Unexpected timer')}});return exports};
test('projection is accurate, safe and leaves legacy entries byte-for-byte unchanged',()=>{
 const before=JSON.stringify(entries);const view=getSyncDiagnostics(entries);
 assert.equal(view.length,2);assert.equal(view[0].description,'Create customer');assert.equal(view[1].operation,'Update');assert.equal(view[0].table,'customers');assert.equal(view[0].queuedAt,'2023-11-14T22:13:20.000Z');assert.equal(view[1].retries,3);
 assert.match(view[0].lastError,/23505.*customers_pkey/);assert.match(view[1].lastError,/42501/);
 assert.doesNotMatch(JSON.stringify(view),/PRIVATE|private@example|secret|payload|matchValue|off_1/);
 assert.equal(JSON.stringify(entries),before);
});
test('errors expose only recognized categories/codes and allowlisted constraints',()=>{
 for(const value of ['password=hunter2 email=private@example.test', 'Bearer eyJhbGci.signature secret', 'https://host/?access_token=secret', 'DETAIL: {"name":"PRIVATE"}', 'duplicate key violates constraint "customers_private_name_key"']) {
  assert.doesNotMatch(sanitizeSyncError(value),/hunter2|private@example|eyJhbGci|secret|PRIVATE|customers_private_name_key/);
 }
 assert.match(sanitizeSyncError('HTTP 401 JWT expired token=secret'),/Authentication.*HTTP: 401/);
 assert.match(sanitizeSyncError('invalid input syntax for type uuid: "PRIVATE" (22P02)'),/invalid format.*22P02/);
 assert.match(sanitizeSyncError('Failed to fetch'),/Network request failed/);
 assert.equal(sanitizeSyncError(null),'No error recorded.');
});
test('viewer reads actual existing account queue without writes, sync, timers or private rendering',()=>{
 const source=readFileSync(new URL('src/lib/offlineSync.ts',root),'utf8');const store=new Map([['outlaw_offline_queue_owner',JSON.stringify(entries)]]);let writes=0,requests=0;
 const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='react'?React:{supabase:{from(){requests++;throw Error('Unexpected sync')}}},window:new EventTarget(),navigator:{onLine:true},CustomEvent:class extends Event{constructor(t,o){super(t);this.detail=o.detail}},localStorage:{getItem:k=>store.get(k)||null,setItem(){writes++;throw Error('Unexpected write')},removeItem(){writes++;throw Error('Unexpected delete')}},setTimeout(){throw Error('Unexpected retry timer')},console});
 exports.setOfflineQueueOwner('owner');const before=store.get('outlaw_offline_queue_owner');
 const componentSource=readFileSync(new URL('src/components/SyncDiagnostics.tsx',root),'utf8');
 const component=load(componentSource,n=>n==='react'?React:n==='react/jsx-runtime'?requireRuntime():n.includes('offlineSync')?exports:n.includes('syncDiagnostics')?{getSyncDiagnostics}: {Card:({children})=>React.createElement('div',null,children)}).default;
 const html=renderToStaticMarkup(React.createElement(component));
 const effects=[];
 const hooks={useState:init=>[init(),()=>{}],useEffect:fn=>effects.push(fn)};
 const mounted=load(componentSource,n=>n==='react'?hooks:n==='react/jsx-runtime'?requireRuntime():n.includes('offlineSync')?exports:n.includes('syncDiagnostics')?{getSyncDiagnostics}: {Card:({children})=>React.createElement('div',null,children)}).default;
 mounted();effects.forEach(fn=>fn());
 assert.match(html,/2 pending changes/);assert.match(html,/Customer.*Create/);assert.match(html,/23505/);
 assert.doesNotMatch(html,/PRIVATE|private@example|secret-token|<button|Clear Queue|Delete Item|Retry Sync/);
 assert.equal(writes,0);assert.equal(requests,0);assert.equal(store.get('outlaw_offline_queue_owner'),before);
 assert.doesNotMatch(componentSource,/processOfflineSyncQueue|syncNow|clearOfflineQueue|useNetworkStatus/);
 assert.match(source,/const QUEUE_KEY = 'outlaw_offline_queue'/);
});
import * as runtime from 'react/jsx-runtime';
function requireRuntime(){return runtime;}
test('unknown or malformed fields do not leak arbitrary values or crash',()=>{
 const views=getSyncDiagnostics([null,{table:'secret@example.test',type:'token',createdAt:Infinity,retryCount:-1,description:'private'}]);
 assert.equal(views[1].table,'Unknown table');assert.equal(views[1].queuedAt,'Unknown');assert.equal(views[1].retries,0);assert.doesNotMatch(JSON.stringify(views),/secret@example|token|private/);
});
