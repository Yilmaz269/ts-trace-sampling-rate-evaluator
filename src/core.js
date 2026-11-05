const HEX64_RE = /^[0-9a-fA-F]{16}$/;

/**
 * Parses a 64-bit trace ID from a 16-character hexadecimal string into a BigInt.
 *
 * We use BigInt rather than Number because JavaScript numbers are IEEE-754 doubles
 * and cannot represent all 64-bit integers exactly. Trace IDs are opaque identifiers
 * and must be compared as exact integers.
 *
 * @param {string} hex - 16 hexadecimal characters (case-insensitive).
 * @returns {bigint} The trace ID as a non-negative BigInt.
 * @throws {TypeError} If hex is not a string.
 * @throws {RangeError} If hex is not exactly 16 hex digits.
 */
export function parseTraceId(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('trace ID must be a string');
  }
  if (!HEX64_RE.test(hex)) {
    throw new RangeError('trace ID must be exactly 16 hexadecimal characters');
  }
  return BigInt('0x' + hex);
}

/**
 * Computes the inclusive lower bound of the sampling window for a given rate.
 *
 * The trace ID space is [0, 2^64 - 1]. A sampling rate r in [0, 1] selects the
 * lowest floor(r * 2^64) trace IDs. This function returns the smallest trace ID
 * that is sampled: 0 when r == 0 (empty window), and 2^64 when r == 1 (full window).
 *
 * The result is a BigInt so callers can compare it against parsed trace IDs without
 * losing precision. Using BigInt also keeps the threshold exact at the boundaries
 * where a floating-point multiplication would round.
 *
 * @param {number} rate - Sampling rate in [0, 1].
 * @returns {bigint} Inclusive lower bound in [0, 2^64].
 * @throws {TypeError} If rate is not a number.
 * @throws {RangeError} If rate is NaN, infinite, or outside [0, 1].
 */
export function lowerBound(rate) {
  if (typeof rate !== 'number') {
    throw new TypeError('sampling rate must be a number');
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError('sampling rate must be a finite number in [0, 1]');
  }
  if (rate === 0) {
    return 0n;
  }
  if (rate === 1) {
    return 1n << 64n;
  }
  // Multiply in floating point, then floor. This is exact for the common
  // power-of-two rates and deterministic for all rates because IEEE-754
  // multiplication and Math.floor are specified operations.
  const scaled = Math.floor(rate * 18446744073709551616); // 2^64 as a Number
  return BigInt(scaled);
}

/**
 * Decides whether a trace ID falls inside the sampling window for a rate.
 *
 * The decision is deterministic: the same (traceId, rate) pair always yields the
 * same boolean. This is the property that makes trace sampling reproducible across
 * services and retries without sharing state.
 *
 * @param {string} traceId - 16-character hexadecimal trace ID.
 * @param {number} rate - Sampling rate in [0, 1].
 * @returns {boolean} True if the trace is sampled.
 * @throws {TypeError|RangeError} As documented by parseTraceId and lowerBound.
 */
export function shouldSample(traceId, rate) {
  const id = parseTraceId(traceId);
  const bound = lowerBound(rate);
  return id < bound;
}
