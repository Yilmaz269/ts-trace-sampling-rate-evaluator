import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTraceId, lowerBound, shouldSample } from '../src/index.js';

test('parseTraceId parses lowercase hex', () => {
  assert.equal(parseTraceId('0000000000000000'), 0n);
  assert.equal(parseTraceId('ffffffffffffffff'), 18446744073709551615n);
  assert.equal(parseTraceId('0000000000000001'), 1n);
});

test('parseTraceId parses uppercase hex', () => {
  assert.equal(parseTraceId('ABCDEF0123456789'), 12379813738877118345n);
});

test('parseTraceId rejects wrong length', () => {
  assert.throws(() => parseTraceId('abc'), RangeError);
  assert.throws(() => parseTraceId('00000000000000000'), RangeError);
  assert.throws(() => parseTraceId(''), RangeError);
});

test('parseTraceId rejects non-hex characters', () => {
  assert.throws(() => parseTraceId('gggggggggggggggg'), RangeError);
  assert.throws(() => parseTraceId('000000000000000g'), RangeError);
});

test('parseTraceId rejects non-string input', () => {
  assert.throws(() => parseTraceId(123), TypeError);
  assert.throws(() => parseTraceId(null), TypeError);
  assert.throws(() => parseTraceId(undefined), TypeError);
});

test('lowerBound returns 0 for rate 0', () => {
  assert.equal(lowerBound(0), 0n);
});

test('lowerBound returns 2^64 for rate 1', () => {
  assert.equal(lowerBound(1), 1n << 64n);
});

test('lowerBound floors the scaled rate', () => {
  // 0.5 * 2^64 = 2^63 exactly.
  assert.equal(lowerBound(0.5), 1n << 63n);
  // 0.25 * 2^64 = 2^62 exactly.
  assert.equal(lowerBound(0.25), 1n << 62n);
});

test('lowerBound rejects out-of-range rates', () => {
  assert.throws(() => lowerBound(-0.1), RangeError);
  assert.throws(() => lowerBound(1.1), RangeError);
  assert.throws(() => lowerBound(NaN), RangeError);
  assert.throws(() => lowerBound(Infinity), RangeError);
});

test('lowerBound rejects non-number input', () => {
  assert.throws(() => lowerBound('0.5'), TypeError);
  assert.throws(() => lowerBound(null), TypeError);
});

test('shouldSample samples the lowest trace IDs for a partial rate', () => {
  // At 0.5 the bound is 2^63, so IDs below 0x8000000000000000 are sampled.
  assert.equal(shouldSample('0000000000000000', 0.5), true);
  assert.equal(shouldSample('7fffffffffffffff', 0.5), true);
  assert.equal(shouldSample('8000000000000000', 0.5), false);
  assert.equal(shouldSample('ffffffffffffffff', 0.5), false);
});

test('shouldSample returns false for every ID at rate 0', () => {
  assert.equal(shouldSample('0000000000000000', 0), false);
  assert.equal(shouldSample('ffffffffffffffff', 0), false);
});

test('shouldSample returns true for every ID at rate 1', () => {
  assert.equal(shouldSample('0000000000000000', 1), true);
  assert.equal(shouldSample('ffffffffffffffff', 1), true);
});

test('shouldSample is deterministic', () => {
  const id = '0123456789abcdef';
  const first = shouldSample(id, 0.3);
  for (let i = 0; i < 100; i++) {
    assert.equal(shouldSample(id, 0.3), first);
  }
});

test('shouldSample accepts uppercase trace IDs', () => {
  assert.equal(shouldSample('0000000000000000', 0.5), true);
  assert.equal(shouldSample('FFFFFFFFFFFFFFFF', 0.5), false);
});

test('shouldSample propagates parse and range errors', () => {
  assert.throws(() => shouldSample('not-a-trace-id', 0.5), RangeError);
  assert.throws(() => shouldSample('0000000000000000', 2), RangeError);
});
