import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const owner = '10000000-0000-0000-0000-000000000001';
const buyer = '20000000-0000-0000-0000-000000000001';
const unit = '30000000-0000-0000-0000-000000000001';
const migration = await readFile(new URL('../supabase/migrations/20261005161845_sales_buyers_order_stabilization.sql', import.meta.url), 'utf8');
const cancellationMigration = await readFile(new URL('../supabase/migrations/20261006033314_guard_buyers_order_cancellation.sql', import.meta.url), 'utf8');
const internalMigration = await readFile(new URL('../supabase/migrations/20260928_internal_unit_work.sql', import.meta.url), 'utf8');
const original = await readFile(new URL('../supabase/migrations/20260927_restore_dealership_and_invoice_support.sql', import.meta.url), 'utf8');

async function fixture(apply = true) {
  const db = new PGlite();
  await db.exec(`create schema auth; create schema private;
    create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create table public.shop_members(member_id uuid primary key, shop_id uuid);
    create table public.shop_settings(user_id uuid primary key, shop_name text, email text default 'service@outlawshopsystems.com');
    create table public.customers(id uuid primary key default gen_random_uuid(),user_id uuid,first_name text,last_name text,address text,phone text,email text,notes text);
    create table public.dealership_units(id uuid primary key,user_id uuid,stock_number text,status text);
    create table public.work_orders(id uuid primary key default gen_random_uuid(),user_id uuid,number text,customer_id uuid,unit_id uuid,buyer_order_id uuid,internal_type text,status text,notes text,internal_closed_at timestamptz,created_at timestamptz default now());
    create table public.internal_ro_costs(work_order_id uuid,unit_id uuid,user_id uuid);
    ${original.slice(original.indexOf('create table if not exists public.buyers_orders'), original.indexOf('alter table public.dealership_units enable'))}
    insert into auth.users values('${owner}');
    insert into shop_settings(user_id,shop_name,email) values('${owner}','Pilot Shop','dealer@example.test');
    insert into customers(id,user_id,first_name,last_name,address,phone) values('${buyer}','${owner}','Sam','Buyer','12 Main St','555-1234');
    insert into dealership_units values('${unit}','${owner}','STK-1','available');
    set test.actor='${owner}';`);
  await db.exec(internalMigration.slice(internalMigration.indexOf('create or replace function public.validate_internal_ro()'), internalMigration.indexOf('create or replace function public.guard_internal_items()')));
  if (apply) { await db.exec(migration); await db.exec(cancellationMigration); }
  return db;
}
async function create(db, status='quote') {
  return (await db.query(`insert into buyers_orders(customer_id,unit_id,order_number,status,unit_price,total_price,balance_due,rigging_instructions)
    values($1,$2,'BO-TEST',$3,1234.56,1434.56,1234.56,E'Install accessory\nKeep punctuation: & < >') returning *`, [buyer,unit,status])).rows[0];
}

test('BO draft persists exact instructions, financial values and automatic disclaimer; reopen uses saved row', async () => {
  const db = await fixture();
  try {
    await db.query('update shop_settings set sales_disclaimer=$1', ['First terms\nPunctuation: & < > “quoted”']);
    const saved = await create(db);
    const reopened = (await db.query('select * from buyers_orders where id=$1',[saved.id])).rows[0];
    assert.equal(reopened.sales_disclaimer, 'First terms\nPunctuation: & < > “quoted”');
    assert.equal(reopened.rigging_instructions, 'Install accessory\nKeep punctuation: & < >');
    assert.equal(Number(reopened.unit_price),1234.56);
    assert.equal(reopened.document_identity.buyer_name,'Sam Buyer');
    await db.query("update buyers_orders set sales_disclaimer='Client replacement' where id=$1",[saved.id]);
    assert.equal((await db.query('select sales_disclaimer from buyers_orders')).rows[0].sales_disclaimer,reopened.sales_disclaimer);
    await db.query('update shop_settings set sales_disclaimer=$1, shop_name=$2',['Later terms','Renamed shop']);
    await db.query('update buyers_orders set status=$1 where id=$2',['completed',saved.id]);
    await db.query("update customers set first_name='Changed', address='Changed address'");
    const historical=(await db.query('select * from buyers_orders where id=$1',[saved.id])).rows[0];
    assert.equal(historical.sales_disclaimer,reopened.sales_disclaimer);
    assert.deepEqual(historical.document_identity,reopened.document_identity);
    await assert.rejects(db.query("update buyers_orders set rigging_instructions='Replacement' where id=$1",[saved.id]), /retain their saved transaction data/);
    await assert.rejects(db.query('update buyers_orders set total_price=0 where id=$1',[saved.id]), /retain their saved transaction data/);
  } finally { await db.close(); }
});

test('one open BO per unit: duplicate inserts rejected, same deal editable, cancel releases, sold blocks new deal', async () => {
  const db=await fixture();
  try {
    const first=await create(db);
    await assert.rejects(create(db),/open Buyer’s Order|duplicate key/);
    await db.query('update buyers_orders set notes=$1 where id=$2',['Reopened draft',first.id]);
    await db.query("update buyers_orders set status='canceled' where id=$1",[first.id]);
    const second=await create(db,'pending');
    assert.notEqual(second.id,first.id);
    await db.query("update buyers_orders set status='completed' where id=$1",[second.id]);
    // Protect the gap before the existing client-side sold-unit update finishes.
    await assert.rejects(create(db),/already sold/);
    await db.query("update dealership_units set status='sold'");
    await assert.rejects(create(db),/already sold/);
  } finally {await db.close();}
});

test('signed draft freezes printed data while still allowing completion and sold workflow', async () => {
  const db=await fixture();
  try {
    const deal=await create(db,'pending');
    await db.query("update buyers_orders set signature_url='data:image/png;base64,fixture',signed_by_name='Sam Buyer',signed_at=now() where id=$1",[deal.id]);
    const signed=(await db.query('select * from buyers_orders')).rows[0];
    await assert.rejects(db.query("update buyers_orders set unit_price=0 where id=$1",[deal.id]), /retain their saved transaction data/);
    await db.query("update buyers_orders set status='completed' where id=$1",[deal.id]);
    const completed=(await db.query('select * from buyers_orders')).rows[0];
    assert.equal(completed.signature_url,signed.signature_url);
    assert.equal(completed.signed_at.getTime(),signed.signed_at.getTime());
    await assert.rejects(db.query("update buyers_orders set status='quote' where id=$1",[deal.id]), /retain their completed status/);
  } finally {await db.close();}
});

test('rigging dispatch returns existing WO and instructions are a one-time copy', async () => {
  const db=await fixture();
  try {
    const deal=await create(db);
    const dispatch=async()=> (await db.query('select dispatch_unit_rigging($1) as id',[deal.id])).rows[0].id;
    const ids=await Promise.all([dispatch(),dispatch(),dispatch()]);
    assert.equal(new Set(ids).size,1);
    assert.equal((await db.query('select count(*)::int as count from work_orders')).rows[0].count,1);
    const wo=(await db.query('select * from work_orders')).rows[0];
    assert.ok(wo.notes.endsWith(deal.rigging_instructions));
    await db.query("update buyers_orders set rigging_instructions='Later BO edit' where id=$1",[deal.id]);
    assert.equal((await db.query('select notes from work_orders')).rows[0].notes,wo.notes);
    await db.query("update work_orders set notes='Tech edited WO'");
    assert.equal((await db.query('select rigging_instructions from buyers_orders')).rows[0].rigging_instructions,'Later BO edit');
    assert.equal(await dispatch(),wo.id);
    await db.exec("set test.actor='10000000-0000-0000-0000-000000000002'");
    await assert.rejects(dispatch(),/Save a deal linked/);
  } finally {await db.close();}
});

test('staff-created orders inherit the owning dealership disclaimer and unit reservation', async () => {
  const db=await fixture();
  try {
    const staff='10000000-0000-0000-0000-000000000002';
    const architecture=await readFile(new URL('../supabase/migrations/20260928_shop_staff_accounts.sql',import.meta.url),'utf8');
    const ownerFunction=architecture.split('create or replace function private.assign_shop_owner()')[1].split('end $$;')[0];
    await db.exec(`create or replace function private.assign_shop_owner()${ownerFunction}end $$;
      create trigger assign_shop_owner_before_insert before insert on buyers_orders for each row execute function private.assign_shop_owner();
      insert into auth.users values('${staff}'); insert into shop_members values('${staff}','${owner}');
      update shop_settings set sales_disclaimer='Owner-configured dealership wording'; set test.actor='${staff}';`);
    const deal=await create(db);
    assert.equal(deal.user_id,owner);assert.equal(deal.sales_disclaimer,'Owner-configured dealership wording');
    await db.exec(`set test.actor='${owner}'`);
    await assert.rejects(create(db),/open Buyer’s Order|duplicate key/);
  } finally {await db.close();}
});

test('migration preserves existing records, adds blank terms, and fails atomically for pre-existing conflicts', async () => {
  const db=await fixture(false);
  try {
    await db.query(`insert into buyers_orders(customer_id,unit_id,order_number,status) values($1,$2,'OLD-1','quote'),($1,$2,'OLD-2','pending')`,[buyer,unit]);
    await assert.rejects(db.exec(migration),/could not create unique index|duplicate key/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as count from buyers_orders')).rows[0].count,2);
    assert.equal((await db.query("select count(*)::int as count from information_schema.columns where table_name='buyers_orders' and column_name='sales_disclaimer'")).rows[0].count,0);
    await db.query("update buyers_orders set status='canceled' where order_number='OLD-2'");
    await db.exec(migration);
    const rows=(await db.query('select * from buyers_orders')).rows;
    assert.equal(rows.length,2);
    assert.ok(rows.every(row=>row.sales_disclaimer==='' && row.rigging_instructions==='' && row.document_identity===null));
    assert.equal((await db.query('select email from shop_settings')).rows[0].email,'dealer@example.test');
    assert.match((await db.query("select column_default from information_schema.columns where table_name='shop_settings' and column_name='email'")).rows[0].column_default,/outlawshopsystems@gmail.com/);
  } finally {await db.close();}
});


test('cancellation is blocked repeatedly for open/in-progress internal work without changing any relationship', async () => {
  const db=await fixture();
  try {
    const deal=await create(db);
    await db.query('select dispatch_unit_rigging($1)',[deal.id]);
    const before=(await db.query('select * from buyers_orders')).rows;
    const woBefore=(await db.query('select * from work_orders')).rows;
    const unitBefore=(await db.query('select * from dealership_units')).rows;
    for(let i=0;i<3;i++) await assert.rejects(db.query("update buyers_orders set status='canceled',unit_id=null where id=$1",[deal.id]),/open rigging Work Order/);
    assert.deepEqual((await db.query('select * from buyers_orders')).rows,before);
    assert.deepEqual((await db.query('select * from work_orders')).rows,woBefore);
    assert.deepEqual((await db.query('select * from dealership_units')).rows,unitBefore);
    await db.query("update work_orders set status='in_progress'");
    await assert.rejects(db.query("update buyers_orders set status='canceled' where id=$1",[deal.id]),/open rigging Work Order/);
    await db.query("update work_orders set status='completed'");
    await assert.rejects(db.query("update buyers_orders set status='canceled',unit_id=null where id=$1",[deal.id]),/existing unit relationship/);
    await db.query("update buyers_orders set status='canceled' where id=$1",[deal.id]);
    assert.equal((await db.query('select unit_id,status from buyers_orders')).rows[0].unit_id,unit);
    await assert.rejects(db.query("update work_orders set status='open'"),/cannot start or reopen/);
  } finally {await db.close();}
});

test('direct inserts and dispatch cannot bypass cancellation; completed sale remains valid with open rigging work',async()=>{
  const db=await fixture();
  try {
    const deal=await create(db);
    await db.query("update buyers_orders set status='canceled' where id=$1",[deal.id]);
    await assert.rejects(db.query('select dispatch_unit_rigging($1)',[deal.id]),/cannot start or reopen/);
    await assert.rejects(db.query("insert into work_orders(user_id,unit_id,buyer_order_id,internal_type,status) values($1,$2,$3,'rigging','open')",[owner,unit,deal.id]),/cannot start or reopen/);
    assert.equal((await db.query('select count(*)::int as n from work_orders')).rows[0].n,0);
    const second=await create(db,'pending');
    await db.query('select dispatch_unit_rigging($1)',[second.id]);
    await db.query("update buyers_orders set status='completed' where id=$1",[second.id]);
    await db.query("update dealership_units set status='sold'");
    assert.equal((await db.query('select status from buyers_orders where id=$1',[second.id])).rows[0].status,'completed');
    assert.equal((await db.query('select status from work_orders')).rows[0].status,'open');
  } finally {await db.close();}
});

test('legacy canceled deal can restore its retained WO unit without changing status or work',async()=>{
  const db=await fixture(false);
  try {
    await db.exec(migration);
    const deal=await create(db);
    await db.query('select dispatch_unit_rigging($1)',[deal.id]);
    await db.query("update buyers_orders set status='canceled',unit_id=null where id=$1",[deal.id]);
    await db.exec(cancellationMigration);
    await assert.rejects(db.query("update work_orders set notes='Blocked before repair'"),/Rigging deal must match this unit and account/);
    const woBefore=(await db.query('select * from work_orders')).rows;
    await db.query('update buyers_orders set unit_id=$1 where id=$2',[unit,deal.id]);
    assert.equal((await db.query('select status from buyers_orders')).rows[0].status,'canceled');
    assert.deepEqual((await db.query('select * from work_orders')).rows,woBefore);
    await db.query("update work_orders set status='in_progress'");
    await db.query("update work_orders set status='completed'");
  } finally {await db.close();}
});

test('client guard precedes payload/save lock; server locks parent for concurrent dispatch/reopen',async()=>{
 const source=await readFile(new URL('../src/pages/BuyersOrderDetail.tsx',import.meta.url),'utf8');
 assert.match(source,/riggingOrders.some\(\(wo\) => wo.status === 'open' \|\| wo.status === 'in_progress'\)/);
 assert.ok(source.indexOf("if (status === 'canceled' && existingOrder?.status") < source.indexOf('savingRef.current = true;'));
 assert.match(source,/\.not\('internal_type', 'is', null\)/);
 assert.match(cancellationMigration,/select status into v_status.*for update/);
});
