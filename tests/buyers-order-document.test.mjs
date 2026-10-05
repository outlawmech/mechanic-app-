import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildBuyersOrderHtml } from '../src/lib/buyersOrderDocument.ts';
import { printStandaloneHtml } from '../src/lib/printer.ts';
import { num, round2 } from '../src/lib/format.ts';

const order={ order_number:'BO-5673', status:'quote', customer:{first_name:'Live',last_name:'Changed'},
  document_identity:{shop_name:'Saved Shop',buyer_name:'Saved Buyer',buyer_address:'12 Main',buyer_phone:'555-1234',stock_number:'STK-5'},
  unit_year:2026,unit_make:'Unit',unit_model:'Model',unit_vin:'VIN-1',unit_color:'Black',
  unit_price:1000,freight_fee:0,prep_fee:0,doc_fee:0,accessories_total:0,trade_in_allowance:0,trade_in_payoff:0,
  tax_rate:0,tax_amount:0,title_reg_fee:0,rebate_amount:0,down_payment:0,total_price:1000,balance_due:1000,
  rigging_instructions:'Install <accessory> & check\nSecond line', sales_disclaimer:'First terms\n“Quoted” punctuation & text',notes:'' };
test('BO prints saved identities, complete financial rows and ordered optional sections with escaped multiline text',()=>{
  const html=buildBuyersOrderHtml(order,{shop_name:'Changed Shop'});
  assert.match(html,/Buyer’s Order #BO-5673/);
  assert.match(html,/Saved Shop/);
  assert.doesNotMatch(html,/Changed Shop|Live Changed|Status:|>quote</);
  assert.equal((html.split('<table class="prices">')[1].split('</table>')[0].match(/<tr(?: class="total")?><td>/g)||[]).length,13);
  assert.match(html,/Freight \/ destination<\/td><td>\$0\.00/);
  assert.match(html,/Install &lt;accessory&gt; &amp; check\nSecond line/);
  assert.ok(html.indexOf('Balance due / financed</td>') < html.indexOf('<h2>Accessories / Rigging Instructions'));
  assert.ok(html.indexOf('<h2>Accessories / Rigging Instructions') < html.indexOf('<h2>Sales Disclaimer'));
  assert.ok(html.indexOf('<h2>Sales Disclaimer') < html.indexOf('<div class="signatures">'));
});
test('blank optional text omits sections; Letter natural flow keeps signatures together',()=>{
  const html=buildBuyersOrderHtml({...order,rigging_instructions:' ',sales_disclaimer:''},{shop_name:'Shop'});
  assert.doesNotMatch(html,/<h2>Accessories \/ Rigging Instructions|<h2>Sales Disclaimer/);
  assert.match(html,/size: letter portrait/);
  assert.match(html,/\.signatures[^}]+break-inside: avoid/);
  assert.match(html,/table-header-group/);
  assert.match(html,/counter\(page\)/);
  assert.doesNotMatch(html,/overflow:\s*hidden|max-height|transform:\s*scale/);
});
test('very long instructions and disclaimer are preserved in full',()=>{
  const instructions=Array.from({length:100},(_,i)=>`Instruction ${i}: complete setup.`).join('\n');
  const disclaimer=Array.from({length:100},(_,i)=>`Term ${i}: dealership supplied language.`).join('\n');
  const html=buildBuyersOrderHtml({...order,rigging_instructions:instructions,sales_disclaimer:disclaimer},{shop_name:'Shop'});
  assert.ok(html.includes(instructions));assert.ok(html.includes(disclaimer));
});
test('native and browser handoffs receive the same complete long BO HTML',()=>{
  const html=buildBuyersOrderHtml({...order,rigging_instructions:'Install accessory\n'.repeat(100),sales_disclaimer:'Complete dealership term & punctuation.\n'.repeat(100)},{shop_name:'Shop'});
  const previousWindow=globalThis.window,previousDocument=globalThis.document,previousTimeout=globalThis.setTimeout;
  let nativeHtml,webHtml,webPrints=0,removed=0;
  try {
    globalThis.window={AndroidNativePrinter:{printInvoiceHtml:(content)=>{nativeHtml=content;}}};
    printStandaloneHtml(html,'BO-5673');
    globalThis.window={};
    globalThis.document={createElement:()=>({style:{},contentWindow:{document:{open(){},write(content){webHtml=content;},close(){}},focus(){},print(){webPrints++;}}}),body:{appendChild(){},removeChild(){removed++;}}};
    globalThis.setTimeout=(callback)=>{callback();return 0;};
    printStandaloneHtml(html,'BO-5673');
    assert.equal(nativeHtml,html);assert.equal(webHtml,html);assert.equal(webPrints,1);assert.equal(removed,1);
  } finally {
    globalThis.window=previousWindow;globalThis.document=previousDocument;globalThis.setTimeout=previousTimeout;
  }
});
test('BO uses the existing native/web print handoff and existing list; scoped settings and support copy are wired',async()=>{
  const bo=await readFile(new URL('../src/pages/BuyersOrderDetail.tsx',import.meta.url),'utf8');
  const printer=await readFile(new URL('../src/lib/printer.ts',import.meta.url),'utf8');
  assert.match(bo,/printStandaloneHtml\(buildBuyersOrderHtml\(existingOrder/);
  assert.doesNotMatch(bo,/window\.print\(\)/);
  assert.match(printer,/AndroidNativePrinter\.printInvoiceHtml\(cleanHtml, safeName\)/);
  assert.match(bo,/rigging_instructions: riggingInstructions/);
  assert.match(bo,/setRiggingInstructions\(existingOrder\.rigging_instructions/);
  assert.match(bo,/if \(dispatchingRef\.current\) return/);
  assert.match(bo,/riggingOrders\[0\]/);
  const sales=await readFile(new URL('../src/pages/Sales.tsx',import.meta.url),'utf8');
  assert.match(sales,/role="tablist"/);assert.match(sales,/aria-selected=\{activeTab === 'deals'\}/);
  assert.match(sales,/view'\) === 'deals'/);
  const settings=await readFile(new URL('../src/lib/settings.tsx',import.meta.url),'utf8');
  assert.match(settings,/sales_disclaimer: updated\.sales_disclaimer/);
  const help=await readFile(new URL('../src/pages/Help.tsx',import.meta.url),'utf8');
  assert.match(help,/mailto:outlawshopsystems@gmail\.com/);
  assert.doesNotMatch(help+settings,/service@outlawshopsystems\.com/);
});

test('existing desking calculation retains accessory, trade, payoff, tax, rebate, fee and deposit behavior',async()=>{
  const source=await readFile(new URL('../src/pages/BuyersOrderDetail.tsx',import.meta.url),'utf8');
  const body=source.split('const calculations = useMemo(() => {')[1].split('\n  }, [')[0];
  const calculate=new Function('unitPrice','freightFee','prepFee','docFee','accessoriesTotal','tradeInAllowance','tradeInPayoff','rebateAmount','titleRegFee','taxRate','downPayment','num','round2',body);
  assert.deepEqual(calculate('10000','350','250','199','500','2000','800','300','50','6','1000',num,round2),{
    taxableSubtotal:9100,calculatedTax:546,totalPrice:10395,balanceDue:9395,
  });
});
