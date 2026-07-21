const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const tablet = fs.readFileSync('styles/device-tablet.css', 'utf8');

test('legacy intermediate queries remain because they also own phone, landscape, seat, or home geometry', () => {
  for (const query of [
    '@media(max-width:800px)', '@media(max-width:900px)',
    '@media(max-width:1000px)', '@media(max-width:760px)',
    '@media(max-width:700px)', '@media(max-width:650px)',
  ]) assert.ok(html.includes(query), query);
  for (const protectedSelector of [
    '.partyGrid,.areaGrid,.tableGrid', '.heroChoiceGrid,.darkBenefitGrid,.darkSetGrid',
    '.crustTextGrid,.setCrustGrid', '.languageGrid', '.multiCartButtons',
  ]) assert.ok(html.includes(protectedSelector) || html.replace(/\s+/g, '').includes(protectedSelector), protectedSelector);
});

test('state, seat, display-control, and phone declarations stay in the legacy layer', () => {
  for (const selector of [
    '.card.active', '.optionBtn.active', '.paymentCard.active', '.tableCard.selected',
    '.next:disabled', '.areaCard.disabled', '.hidden', '.progress .on', '.progress .done',
  ]) assert.ok(html.includes(selector), selector);
  assert.match(html, /@media\(max-width:560px\)/);
});

test('device tablet layer supplies every reviewed geometry family without claiming behavior', () => {
  for (const selector of [
    '.head', '.progress', '.stage', '.grid', '.card', '.optionBtn', '.qty',
    '.selectionFooter', '.cartbar', '.backdrop', '.modal', '.paymentGrid', '.done',
  ]) assert.ok(tablet.includes(selector), selector);
  for (const state of ['.active {', '.selected {', '.hidden {', '.open {', '.show {']) {
    assert.ok(!tablet.includes(state), state);
  }
});
