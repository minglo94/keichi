import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationFor } from '../src/lib/after-school/preparation';
test('Monday prepares Friday 16:00, other weekdays prepare previous day 16:00',()=>{
 assert.equal(preparationFor('2026-10-26').toISOString(),'2026-10-23T08:00:00.000Z');
 assert.equal(preparationFor('2026-10-27').toISOString(),'2026-10-26T08:00:00.000Z');
});
import { preparationTarget } from '../src/lib/after-school/preparation';
test('16:00 switches to next school weekday and weekends catch up Monday',()=>{
 for(const [time,date] of [['2026-10-23T15:59:59+08:00','2026-10-23'],['2026-10-23T16:00:00+08:00','2026-10-26'],['2026-10-24T10:00:00+08:00','2026-10-26'],['2026-10-25T10:00:00+08:00','2026-10-26'],['2026-10-26T15:59:59+08:00','2026-10-26'],['2026-10-26T16:00:00+08:00','2026-10-27'],['2026-12-31T16:00:00+08:00','2027-01-01']])assert.equal(preparationTarget(new Date(time)),date);
});
