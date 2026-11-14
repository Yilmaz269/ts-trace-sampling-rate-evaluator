# ts-trace-sampling-rate-evaluator

Decides whether a 64-bit trace ID should be sampled, deterministically, by comparing it against the lower bound of a sampling window.

## Usage

```js
import { shouldSample, parseTraceId, lowerBound } from 'ts-trace-sampling-rate-evaluator';

// 50% of the trace ID space, i.e. IDs below 0x8000000000000000.
shouldSample('0000000000000000', 0.5); // true
shouldSample('ffffffffffffffff', 0.5); // false

// The threshold itself is public so callers can reason about it directly.
lowerBound(0.5); // 9223372036854775808n
parseTraceId('0000000000000001'); // 1n
```

The package is ESM-only and has no dependencies.

## Why this exists

Trace sampling is usually described as a probability, but in a distributed system you cannot roll a die per request and still have every service agree. The standard trick is to make the decision a pure function of the trace ID: pick a threshold, and sample every ID below it. That gives you the same answer everywhere, survives retries, and needs no shared state.

The trade-off is that the sampled set is the lowest IDs rather than a hash of them. For uniformly random trace IDs this is identical in distribution to hashing, and it avoids a hash step entirely. If your trace IDs are structured — for example, a timestamp in the high bits — the low-ID window becomes a time window instead of a uniform sample. That is a real limitation, and it is why the threshold is exposed: you can inspect it and decide whether this scheme fits your ID generator.

## The awkward edge

Rates are floating-point numbers, and `rate * 2^64` is not exact for most rates. The implementation floors that product, so the effective rate is the largest multiple of `2^-64` that does not exceed the requested rate. At `0.5` and `0.25` the result is exact; at `0.1` it is slightly conservative. This is deliberate: a deterministic, slightly-low threshold is preferable to a threshold that depends on the order of floating-point operations.

Rate `0` returns an empty window (`lowerBound(0) === 0n`) and rate `1` returns the full window (`lowerBound(1) === 2n ** 64n`). Both are exact, not approximations.

## API

- `parseTraceId(hex: string): bigint` — parse a 16-character hex trace ID. Throws `TypeError` for non-strings and `RangeError` for wrong length or non-hex characters.
- `lowerBound(rate: number): bigint` — inclusive lower bound of the sampling window in `[0, 2^64]`. Throws `TypeError` for non-numbers and `RangeError` for `NaN`, infinities, or values outside `[0, 1]`.
- `shouldSample(traceId: string, rate: number): boolean` — true when `parseTraceId(traceId) < lowerBound(rate)`.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

