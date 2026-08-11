# Performance Benchmarks

The benchmark suite measures completed work. It does not use enqueue speed as delivery throughput.

## Scope

The suite contains three groups:

| Group | Measurement |
|---|---|
| Completed synchronous delivery | The logger serializes an entry and writes it to a synchronous no-op stream. |
| neo.logger hot paths | The suite measures filtering, safe JSON formatting, and text formatting separately. |
| Completed asynchronous delivery | The suite sends 100 entries and waits for `flush()`. It includes a no-batch file baseline. |

The file benchmark includes formatting, queue handling, secure file opening, writing, closing, and `flush()`.

## Interpretation limits

The no-op stream group measures CPU work with no destination latency. It does not measure disk, network, or process-exit durability.

Do not use these results to estimate cloud cost or production capacity. Run an application benchmark with the target workload and destination.

## Run the suite

Run these commands:

```bash
lpm install
lpm run bench
```

Run the suite on idle hardware. Use the same Node.js version for the baseline and candidate commits.

Record these values with any published result:

- The package commit
- The package version
- The Node.js version
- The operating system and processor
- The complete benchmark command
- The raw benchmark output

The repository does not store fixed throughput claims. Results change with the runtime, hardware, package versions, and benchmark workload.
