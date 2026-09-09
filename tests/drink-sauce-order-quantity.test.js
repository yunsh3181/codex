const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const policy=require(path.join(root,'included-sauce-policy.js'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const catalog=fs.readFileSync(path.join(root,'order-catalog.js'),'utf8');

test('drink ids keep their prices and expose the approved exact volumes',()=>{
 const expected={D001:'500mL',D002:'1.25L',D003:'500mL',D004:'1.25L',D005:'500mL',D006:'1.5L',D007:'500mL',D008:'1.5L'};
 for(const [id,volume] of Object.entries(expected)){
  assert.match(html,new RegExp(`"id": "${id}"[\\s\\S]{0,100}"volume": "${volume.replace('.','\\.')}"`));
  assert.match(catalog,new RegExp(`${id}:'[^']*${volume.replace('.','\\.')}'`));
 }
 assert.match(html,/function drinkDisplayName\(item\)/);
 assert.doesNotMatch(html,/size=t\(item===large\?'ui\.drinkScreen\.large':'ui\.drinkScreen\.small'\)/);
});

test('takeout pizza sauces follow size and multiply by pizza quantity',()=>{
 assert.deepEqual(policy.calculate([{pizzaLeft:'P001',size:'R',qty:1}], 'takeout'),{garlic:1,pickle:1,hotSauce:1,honeyMustard:0,tomato:0,storeFree:[]});
 assert.deepEqual(policy.calculate([{pizzaLeft:'P001',size:'L',qty:2}], 'takeout'),{garlic:2,pickle:2,hotSauce:4,honeyMustard:0,tomato:0,storeFree:[]});
 assert.deepEqual(policy.calculate([{pizzaLeft:'P001',pizzaRight:'P002',mode:'half',size:'F',qty:1}], 'takeout'),{garlic:1,pickle:1,hotSauce:2,honeyMustard:0,tomato:0,storeFree:[]});
 assert.deepEqual(policy.calculate([{pizzaLeft:'P001',size:'F',qty:9}], 'takeout'),{garlic:9,pickle:9,hotSauce:18,honeyMustard:0,tomato:0,storeFree:[]});
});

test('side sauces combine without turning included sauces into paid products',()=>{
 const result=policy.calculate([{pizzaLeft:'P001',size:'L',qty:2,includedSides:{S007:1,S011:1},sides:{S008:2,S012:1},extrasIndependent:true}], 'takeout');
 assert.deepEqual(result,{garlic:5,pickle:2,hotSauce:4,honeyMustard:4,tomato:3,storeFree:[]});
 assert.doesNotMatch(html,/id.:.tomato/i);
 assert.deepEqual(policy.calculate([{sides:{S007:1,S008:1,S011:1,S012:1,S013:1},extrasIndependent:true}], 'takeout'),{garlic:3,pickle:0,hotSauce:0,honeyMustard:2,tomato:3,storeFree:[]});
});

test('dine-in counts garlic, preserves side sauce rules, and marks pickle/hot sauce free',()=>{
 assert.deepEqual(policy.calculate([{pizzaLeft:'P001',size:'F',qty:2,sides:{S013:2},extrasIndependent:true}], 'dinein'),{garlic:4,pickle:0,hotSauce:0,honeyMustard:0,tomato:2,storeFree:['pickle','hotSauce']});
});

test('review contract separates base quantities from independent paid extras',()=>{
 for(const token of ['extrasIndependent:true','function orderFinancialTotals(order)','function additionalProductEntries','reviewExtrasCard','quantity>=9','quantityDelete','deleteOrderWithExtrasBody'])assert.ok(html.includes(token),token);
 assert.match(html,/reviewOrderCard[\s\S]*cartPizzaMetaHtml\(model\.meta\)[\s\S]*reviewMenuRowsHTML\(model\)/);
 assert.match(html,/cartModalOrderCard[\s\S]*cartPizzaMetaHtml\(model\.meta\)[\s\S]*reviewMenuRowsHTML\(model\)/);
 assert.match(html,/extrasIndependent:order\.extrasIndependent===true/);
 assert.match(admin,/scaleWithParent:item\?\.extrasIndependent!==true/);
 assert.match(admin,/item\?\.baseTotal/);
 assert.match(html,/baseTotal:Math\.max\(0,totals\.final-totals\.extras\),extrasTotal:totals\.extras/);
 assert.match(html,/itemCount:items\.reduce\(\(n,x\)=>n\+cartOrderTopLevelQuantity\(x\),0\)/);
 assert.match(html,/reviewExtraName">\$\{row\.name\} <b>× \$\{row\.qty\}<\/b>/);
 assert.match(html,/reviewExtrasTotal/);
 assert.match(html,/copy\.extrasTotal/);
 assert.match(html,/if\(!qty\|\|unit<=0\)return/);
});

test('included-sauce and quantity dialogs have six locale copies and safe modal semantics',()=>{
 for(const locale of ['ko','en','ja','zh','es','vi'])assert.match(html,new RegExp(`(?:^|\\s)${locale}:\\{includedTitle:`));
 for(const token of ['role="dialog" aria-modal="true" aria-labelledby="includedSauceTitle"','role="alertdialog"',"closeIncludedSauceModal('continue')","closeIncludedSauceModal('extras')",'confirmQuantityDelete()'])assert.ok(html.includes(token),token);
 for(const token of ['includedTitleHighlight','includedSauceTitleMarkup(copy)','includedSauceTitleHighlight','extrasTotal'])assert.ok(html.includes(token),token);
});

test('grouped drink rows place volume beside the unchanged quantity controls and isolate price',()=>{
 assert.match(html,/v3DrinkVolume[\s\S]*?v3DrinkMinus[\s\S]*?v3DrinkQuantity[\s\S]*?v3DrinkPlus[\s\S]*?v3DrinkPrice/);
 assert.doesNotMatch(html,/v3DrinkVolume"><strong>\$\{size\}<\/strong><small>/);
});

test('set drink next remains actionable after the additional-drink prompt',()=>{
 assert.match(html,/function continueSetDrink\(\)\{if\(!setDrinkBaseComplete\(\)\)return;if\(state\.setDrinkPrompted\)\{routeAfterDrink\(\);return\}maybePromptSetDrinkExtra\(\)\}/);
 assert.match(html,/function closeIncludedSauceModal\(action\)[\s\S]*action==='extras'[\s\S]*continueAfterDrink\(\)/);
});

test('the real final add-side action cannot bypass the included-sauce dialog',()=>{
 assert.match(html,/if\(type==='side'\)\{state\.finalAddMode=null;requestIncludedSauceModal\(\);return\}/);
 assert.doesNotMatch(html,/state\.finalAddMode=type;\s*state\.step=type==='side'/);
});

test('iPad home-screen icon is a single versioned dedicated asset',()=>{
 const matches=[...html.matchAll(/<link rel="apple-touch-icon"[^>]+href="([^"]+)"/g)];
 assert.equal(matches.length,1);
 assert.equal(matches[0][1],'assets/images/apple-touch-icon-papajohns-v1.png');
 assert.match(html,/<meta name="apple-mobile-web-app-title" content="Papa Johns">/);
 const icon=fs.readFileSync(path.join(root,matches[0][1]));
 assert.equal(icon.subarray(1,4).toString(),'PNG');
 assert.equal(icon.readUInt32BE(16),180);
 assert.equal(icon.readUInt32BE(20),180);
 assert.equal(icon.readUInt8(25),2,'PNG uses truecolor RGB rather than indexed or grayscale data');
 assert.equal((html.match(/order-review-cart-quantity-v10/g)||[]).length,1);
 assert.equal((html.match(/order-review-cart-quantity-v9/g)||[]).length,0);
});
