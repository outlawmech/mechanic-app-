import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@supabase/supabase-js';
import { saveShopProfile } from '../src/lib/shopProfile.ts';

const owner='10000000-0000-0000-0000-000000000001';
const migration=await readFile(new URL('../supabase/migrations/20261004190038_plan_tiers_and_signup_trials.sql',import.meta.url),'utf8');
const guard=migration.slice(migration.indexOf('create or replace function private.guard_shop_entitlement_columns()'),migration.indexOf('-- Return the organization'));
const profile={shop_name:'Updated shop',tagline:'Service',phone:'555-0123',email:'shop@example.test',address:'12 Main St',default_labor_rate:95,default_tax_rate:0,invoice_notes:'Thank you',sales_disclaimer:'Terms\nSecond line',enable_dealership_mode:true};
async function fixture(tier='dealer',status='lifetime', exists=true) {
  const db=new PGlite();
  await db.exec(`create schema auth; create schema private; create role authenticated;
    create table auth.users(id uuid primary key,created_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select '${owner}'::uuid $$;
    create function auth.role() returns text language sql as $$ select 'authenticated'::text $$;
    create table shop_settings(id text primary key,user_id uuid unique,shop_name text,tagline text,phone text,email text,address text,
    default_labor_rate numeric,internal_labor_cost_rate numeric,default_tax_rate numeric,invoice_notes text,sales_disclaimer text,
    logo_url text,zelle_info text,venmo_handle text,cash_app_tag text,custom_pay_link text,enable_dealership_mode boolean,
    dealership_doc_fee numeric,dealership_prep_fee numeric,dealership_freight_fee numeric,updated_at timestamptz,
    plan_tier text default 'solo',subscription_status text default 'trialing',trial_started_at timestamptz,trial_ends_at timestamptz default now()+interval '14 days');
    insert into auth.users values('${owner}','2026-10-01');
    ${exists ? `insert into shop_settings(id,user_id,shop_name,plan_tier,subscription_status,trial_started_at,trial_ends_at)
    values('legacy-settings-id','${owner}','Before','${tier}','${status}','2026-10-01','2026-10-15');` : ''}
    ${guard}
    alter table shop_settings enable row level security;
    create policy owner_read on shop_settings for select to authenticated using (user_id=auth.uid());
    create policy owner_update on shop_settings for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
    create policy owner_insert on shop_settings for insert to authenticated with check(user_id=auth.uid());
    grant usage on schema public,auth to authenticated; grant select,insert,update on shop_settings to authenticated;
    set session authorization authenticated;`);
  const requests=[];
  // Actual supabase-js HTTP request routed to a local PostgreSQL fixture only.
  const client=createClient('https://local-fixture.invalid','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,options)=>{
    const payload=JSON.parse(options.body); requests.push({url:String(url),method:options.method,payload});
    try {
      assert.equal(options.method,'PATCH');
      const target=new URL(url).searchParams.get('user_id'); assert.equal(target,`eq.${owner}`);
      const entries=Object.entries(payload); const values=entries.map(([,v])=>v);
      const sets=entries.map(([k],i)=>`"${k}"=$${i+1}`).join(',');
      const result=await db.query(`update shop_settings set ${sets} where user_id=$${values.length+1} returning user_id`,[...values,owner]);
      if(result.rows.length!==1) return new Response(JSON.stringify({message:'No settings row',code:'PGRST116'}),{status:406});
      return new Response(JSON.stringify(result.rows[0]),{status:200,headers:{'Content-Type':'application/json'}});
    } catch(e) {return new Response(JSON.stringify({message:e.message}),{status:400});}
  }}});
  return {db,client,requests};
}

test('original upsert hits INSERT guard even on an existing Dealer and rolls back all profile changes',async()=>{
  const {db}=await fixture();
  try {
    const before=(await db.query('select * from shop_settings')).rows;
    await assert.rejects(db.query(`insert into shop_settings(id,user_id,shop_name) values('legacy-settings-id',$1,'Rejected') on conflict(id) do update set shop_name=excluded.shop_name`,[owner]),/New organizations may only start/);
    assert.deepEqual((await db.query('select * from shop_settings')).rows,before);
  } finally {await db.close();}
});
for(const [tier,status] of [['solo','trialing'],['shop','active'],['dealer','lifetime']]) {
  test(`existing ${tier}/${status} profile save/reload preserves entitlement and trial exactly`,async()=>{
    const {db,client,requests}=await fixture(tier,status);
    try {
      const before=(await db.query('select * from shop_settings')).rows[0];
      await saveShopProfile(client,owner,{...profile,plan_tier:'solo',subscription_status:'active',trial_started_at:null,trial_ends_at:null});
      const after=(await db.query('select * from shop_settings')).rows[0];
      for(const key of ['id','user_id','plan_tier','subscription_status','trial_started_at','trial_ends_at']) assert.deepEqual(after[key],before[key]);
      for(const key of ['shop_name','phone','email','address','sales_disclaimer']) assert.equal(after[key],profile[key]);
      assert.equal(requests.length,1);
      for(const key of ['id','user_id','plan_tier','subscription_status','trial_started_at','trial_ends_at']) assert.equal(key in requests[0].payload,false);
      await assert.rejects(db.query("update shop_settings set subscription_status='expired'"),/only be changed by OSS activation services/);
    } finally {await db.close();}
  });
}
test('missing existing row fails rather than inserting or restarting onboarding',async()=>{
  const {db,client,requests}=await fixture('dealer','lifetime',false);
  try {
    await assert.rejects(saveShopProfile(client,owner,profile),/No settings row/);
    assert.equal(requests[0].method,'PATCH');
    assert.equal((await db.query('select count(*)::int as n from shop_settings')).rows[0].n,0);
    await assert.rejects(saveShopProfile(client,null,profile),/could not be verified/);
    assert.equal(requests.length,1);
  } finally {await db.close();}
});
test('Settings provider routes ordinary saves through the update-only path',async()=>{
  const source=await readFile(new URL('../src/lib/settings.tsx',import.meta.url),'utf8');
  const save=source.slice(source.indexOf('  async function updateSettings'),source.indexOf('  return (',source.indexOf('  async function updateSettings')));
  assert.match(save,/saveShopProfile\(sb, shopId, updated\)/);
  assert.doesNotMatch(save,/\.upsert\(|\.insert\(/);
});
