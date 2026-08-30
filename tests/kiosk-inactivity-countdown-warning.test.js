'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('countdown warning is kiosk-only, accessible, and sized for 1080x1920',()=>{
 assert.match(html,/<div id="modal"><\/div><div id="inactivityWarningHost"><\/div>/);
 assert.match(html,/html\[data-layout="kiosk21"\] \.inactivityWarningBackdrop/);
 assert.match(html,/class="inactivityWarningDialog" role="dialog" aria-modal="true" aria-labelledby="inactivity-warning-title"/);
 assert.match(html,/class="inactivityCountdown" aria-live="polite" aria-atomic="true"/);
 assert.match(html,/\.inactivityCountdownNumber\{[^}]*width:2ch[^}]*font-size:128px/);
 assert.match(html,/\.inactivityWarningActions button\{[^}]*min-height:96px/);
 assert.match(html,/function isKioskInactivityLayout\(\)\{return document\.documentElement\.dataset\?\.layout==='kiosk21'\}/);
});

test('warning host is isolated from the existing order modal host',()=>{
 assert.match(html,/const host=document\.getElementById\('inactivityWarningHost'\)/);
 assert.doesNotMatch(html,/getElementById\('modal'\)[^\n]*inactivityWarningBackdrop/);
 assert.doesNotMatch(html,/getElementById\('modal'\)[^\n]*inactivityWarningView/);
});

test('deadline controller derives every value from real remaining time and rejects stale work',()=>{
 assert.match(html,/const SEAT_IDLE_MS=30000/);
 assert.match(html,/const ORDER_IDLE_WARNING_MS=10000/);
 assert.match(html,/orderIdleDeadline=orderIdleNow\(\)\+SEAT_IDLE_MS/);
 assert.match(html,/const seconds=Math\.ceil\(remaining\/1000\)/);
 assert.match(html,/if\(generation!==orderIdleGeneration\)return/);
 assert.match(html,/orderIdleLastNow=Math\.max\(orderIdleLastNow,now\)/);
 assert.doesNotMatch(html,/orderIdleSeconds\s*-=|orderIdleSeconds--/);
});

test('warning interaction is explicit and background activity cannot extend the deadline',()=>{
 assert.match(html,/if\(orderIdleWarningOpen\)\{[\s\S]*?event\.key==='Escape'[\s\S]*?event\.key==='Tab'[\s\S]*?return/);
 assert.match(html,/function continueOrderAfterIdleWarning\(\)\{[^}]*closeOrderIdleWarning\(true\);armOrderIdleTimer\(\)/);
 assert.match(html,/function returnHomeFromIdleWarning\(\)\{[^}]*expireOrderIdle\(orderIdleGeneration,true\)/);
 assert.match(html,/if\(event&&event\.isTrusted===false\)return/);
});

test('all six locale files provide complete inactivity copy',()=>{
 for(const locale of ['ko','en','ja','zh','vi','es']){
  const key='order-review-cart-quantity-v1';
  assert.match(html,new RegExp(`<script src="i18n/${locale}\\.js\\?v=${key}"><\\/script>`),locale);
  const source=fs.readFileSync(path.join(root,'i18n',`${locale}.js`),'utf8');
  assert.match(source,/inactivity:\{title:[\s\S]*?body:[\s\S]*?guide:[\s\S]*?continue:[\s\S]*?home:[\s\S]*?seconds:/,locale);
 }
 assert.equal((html.match(/i18n\/(?:ko|en|ja|zh|vi|es)\.js\?v=/g)||[]).length,6);
});

test('safe PR 181 release path and protected seat conditions remain canonical',()=>{
 assert.match(html,/if\(heldSeats\.length\)await releaseSeats\(heldSeats\)/);
 assert.match(html,/await endCustomerSessionToStart\(\)/);
 assert.match(html,/saved\.status==='held'&&saved\.heldBy===seatClientId&&!saved\.orderId/);
 assert.match(html,/function isIdleResetProtected\(\)\{return mobileOrderSubmitting\|\|seatOrderCommitStarted\|\|Boolean\(state\.firebaseOrderId\)\}/);
});
