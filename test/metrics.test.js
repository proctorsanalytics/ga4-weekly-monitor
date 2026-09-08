import test from 'node:test';
import assert from 'node:assert/strict';
import { percentageChange, shouldAlert } from '../src/metrics.js';

test('calculates positive and negative percentage changes', () => {
  assert.equal(percentageChange(120, 100), 20);
  assert.equal(percentageChange(80, 100), -20);
});

test('handles a previous value of zero safely', () => {
  assert.equal(percentageChange(0, 0), 0);
  assert.equal(percentageChange(5, 0), Infinity);
});

test('alerts only when absolute change is strictly greater than threshold', () => {
  assert.equal(shouldAlert({ activeUsers: { percentage: 10 } }, 10), false);
  assert.equal(shouldAlert({ activeUsers: { percentage: -10.01 } }, 10), true);
  assert.equal(shouldAlert({ activeUsers: { percentage: 1 }, screenPageViews: { percentage: 2 } }, 10), false);
});
