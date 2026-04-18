---
title: "When one machine is not enough"
part: 10
---

# When one machine is not enough

Here is a thing that happens a lot.

You have a main media server. A small box, maybe a NAS, maybe
a mini PC. It is on all the time, it has the disks, it serves
your library. It has a modest CPU and no dedicated GPU.

You also have a workstation. That is the machine you sit at
for work. It has a beefy GPU. It is not on all the time. When
it is on, it is usually not doing anything heavy.

And you have a library of movies you want encoded. For every
movie, the media server needs to produce an adaptive-bitrate
ladder. Each variant takes the media server hours, because the
media server has no real video horsepower.

Meanwhile, the workstation is sitting there, and its GPU could
encode that ladder in minutes.

The obvious answer is to route encode work from the media
server to the workstation, and let the media server focus on
the library and the streaming.

That is distributed encoding. This page is about how it works.

## Who this is for

- **Prosumers** with a media server plus a workstation that
  has a better GPU. They want to route encode tasks to the
  workstation and keep the media server lean.
- **Small studios** with multiple machines and large
  libraries. They want to chop encode queues across the fleet.
- **Anyone with idle hardware** they want to contribute to
  encoding their own content.

If you do not have a second machine, you do not need any of
this. The encoder runs everything locally by default.

## Quick start

Both machines need the same signing key. Generate one:

```
openssl rand -base64 32
```

Keep it secret. It is what prevents an attacker from
dispatching jobs into your cluster.

On the coordinator (your main media server), set the signing
key in `appsettings.json`:

```json
{
  "EncoderOptions": {
    "DistributedEncodingSigningKey": "dGhpc2lzYXNoYXJlZGtleXVzZWRmb3JoY..."
  }
}
```

On each worker, set four values:

```json
{
  "EncoderOptions": {
    "DistributedEncodingSigningKey": "dGhpc2lzYXNoYXJlZGtleXVzZWRmb3JoY...",
    "CoordinatorUrl": "https://nomercy.home.arpa:7626",
    "WorkerSelfBaseUrl": "https://workstation.home.arpa:7626",
    "WorkerId": "workstation-01"
  }
}
```

Start both. The worker auto-registers. The coordinator's
workers endpoint now lists it. The next encode uses both
machines.

## Architecture

```
+-------------------------+
|       Coordinator       |   (your main media server)
|                         |
|   RemoteWorkerDispatcher|   picks a worker per task, handles retry
|   WorkerRegistry        |   tracks active workers + health
|   TaskSerializer        |   signs and verifies HMAC payloads
+------------+------------+
             |
             |  HTTPS + HMAC
     +-------+-------+
     |       |       |
     v       v       v
 +--------+ +--------+ +--------+
 |Worker A| |Worker B| |Worker C|
 | (GPU)  | | (CPU)  | | (GPU)  |
 +--------+ +--------+ +--------+
```

At the top sits the coordinator. That is your regular NoMercy
media server. Inside it sit two key components:

- `RemoteWorkerDispatcher` picks a worker per task. It handles
  the retry chain and falls back to local dispatch when no
  remote works out.
- `RemoteWorkerRegistry` tracks active workers. It manages
  health tracking and cooldown eviction.

The coordinator talks to each worker over HTTP with
HMAC-signed payloads. In a typical setup, you might have
Worker A on a workstation, Worker B on a laptop, and Worker C
on a NAS.

Each worker runs the same NoMercy binary, but with the
distribution config pointing at the coordinator. Each worker
has its own local dispatcher that runs ffmpeg jobs.

## How tasks flow

Five steps run in sequence.

**1. User starts an encode on the coordinator.**

**2. Strategy decomposition.** The selected strategy
decomposes the job into an array of `EncodeTask` records. One
task per adaptive-bitrate variant, or one per time range for
a two-pass chunked encode:

```json
{
  "job_id": "job-abc123",
  "tasks": [
    {
      "task_id": "job-abc123-v0",
      "variant_id": "v0-1080p",
      "command": {
        "argv": ["ffmpeg", "-hide_banner", "-y", "-i", "{source}", "..."],
        "env": {}
      },
      "input_path": "/library/movies/source.mkv",
      "output_dir": "/out/job-abc123/v0-1080p/",
      "estimated_cost_units": 120,
      "requires_gpu": true
    },
    {
      "task_id": "job-abc123-v1",
      "variant_id": "v1-720p",
      "estimated_cost_units": 60,
      "requires_gpu": true
    }
  ]
}
```

**3. Dispatch.** The `RemoteWorkerDispatcher` reads the active
workers from the registry (hiding cooled-down ones). The
`WorkerAssigner` load-balances tasks across workers based on
speed multiplier times available slots. Each task is
dispatched to its assigned worker in parallel.

**4. Execute and return.** The worker receives a signed task,
runs it, and returns a signed result:

```json
{
  "task_id": "job-abc123-v0",
  "status": "success",
  "output_files": [
    { "path": "v0-1080p/playlist.m3u8", "size_bytes": 1204 },
    { "path": "v0-1080p/seg_00000.ts", "size_bytes": 3812480 }
  ],
  "encode_stats": {
    "duration_seconds": 43.2,
    "avg_fps": 320,
    "output_bitrate_kbps": 4820
  }
}
```

**5. Assemble.** The coordinator assembles results and runs
the Finalize stage locally. That means stitching playlists,
writing master manifests, and linking subtitle sidecars.

## Security model

### HMAC-signed payloads

Every coordinator-to-worker call, and every worker-to-coordinator
call that carries task data, is signed with the shared key
using HMAC-SHA256. The signature covers the HTTP method, the
path, the timestamp, and the full request body:

```
string_to_sign = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + sha256(BODY)
signature = base64(hmac_sha256(shared_key, string_to_sign))
```

The headers carry the signature and timestamp:

```
POST /api/v1/worker/tasks HTTP/1.1
X-NoMercy-Timestamp: 1728345678
X-NoMercy-Signature: VvQ8Hm7fZc...base64...=
Content-Type: application/json

{ ...task JSON... }
```

An attacker who intercepts the traffic can read payloads but
cannot modify them. The signature will not verify.

### Five-minute replay window

Every signed payload carries a UTC timestamp. Requests older
than five minutes are rejected. That stops someone from
capturing a signed task and replaying it days later.

### Library-allowlisted source fetches

When a worker pulls source files from the coordinator, the
coordinator checks the requested path against the `video_files`
table. Only paths that correspond to known library files get
served. A leaked signing key does not turn the coordinator
into a general-purpose file-read oracle.

### HTTPS required for non-loopback

The register endpoint rejects non-HTTPS worker URLs unless the
target is a loopback address. Local development can use plain
HTTP on `127.0.0.1`. Deployments across a network must use
TLS.

### Progress payloads are unauthenticated

The progress-push endpoint accepts anonymous POSTs. The
rationale is that progress bodies contain no secrets. Spoofing
just moves a fake progress bar. Real task dispatch and source
fetch still require HMAC.

## Self-registration

The `WorkerSelfRegistrationService` is a hosted background
service that runs on workers.

On boot, it POSTs to the coordinator's register endpoint:

```
POST /api/v1/distribution/workers/register
Content-Type: application/json
X-NoMercy-Timestamp: ...
X-NoMercy-Signature: ...

{
  "worker_id": "workstation-01",
  "base_url": "https://workstation.home.arpa:7626",
  "cpu_cores": 16,
  "available_cpu_threads": 28,
  "available_gpu_slots": 12,
  "gpus": [
    { "vendor": "nvidia", "model": "RTX 4080", "memory_mb": 16384, "driver": "551.23" }
  ],
  "version": "1.12.4"
}
```

Every heartbeat interval (default 20 seconds), it POSTs to
`/api/v1/distribution/workers/{worker_id}/heartbeat` with a
fresh budget so the coordinator sees current load.

On clean shutdown, it DELETEs to unregister.

**Failure handling.**

- Initial registration fails → the service logs a warning and
  retries on the heartbeat loop. The process does not crash.
- Heartbeat returns 404 → the coordinator does not know us.
  Assume coordinator restart or late eviction after outage.
  Re-register.
- Coordinator unreachable → heartbeats fail silently. The
  coordinator's stale eviction removes us after 60 seconds.
  When the connection restores, auto re-register on the next
  attempt.

If no config is set, the service exits cleanly. Standalone
installs have the service registered, but it does nothing.

## Health tracking

Every task's outcome is reported back to the registry. Three
consecutive failures put a worker into a cooldown (a couple
minutes by default). Any success clears the counter.
Re-registration clears the cooldown explicitly. Cooldowns
auto-expire.

During cooldown, `GetActiveWorkers` hides the worker. The
dispatcher skips it. But `GetAllWorkersWithHealth` still
returns it, with the cooldown status:

```
GET /api/v1/distribution/workers
→ [
  {
    "worker_id": "workstation-01",
    "status": "active",
    "available_cpu_threads": 26,
    "available_gpu_slots": 11,
    "consecutive_failures": 0,
    "cooldown_until_utc": null
  },
  {
    "worker_id": "laptop-02",
    "status": "cooldown",
    "available_cpu_threads": 0,
    "available_gpu_slots": 0,
    "consecutive_failures": 3,
    "cooldown_until_utc": "2026-04-17T12:05:00Z"
  }
]
```

The dashboard can show, for example: "Worker B, cooldown, 3
failures, back at 12:05."

## Retry chain

The dispatcher tries a small number of remote workers per task
before falling back to local.

```
Task T -> Worker A  (initial pick by slots * speed)
  |-- success -> return
  `-- fail    -> Worker B  (next best)
                   |-- success -> return
                   `-- fail    -> local dispatcher (always succeeds if source is valid)
```

The retry only runs for this task. Other tasks continue on
their original workers in parallel. A single bad GPU does not
stall the whole job.

## File transfer

When coordinator and workers share storage (shared NAS, SMB
mount, NFS), workers see the task's input path on their own
filesystem. There is zero network transfer for source files.
The common case.

When they do not share storage — cloud worker, remote co-op
machine across the open internet — the `HttpSourceFetcher`
kicks in. Seven steps run.

**1. Worker receives signed task.** Checks whether the input
path exists locally.

**2. Build signed download URL** if the file is missing:

```
GET /api/v1/worker/source?path=<urlencoded>&ts=<unix>&sig=<hmac>
```

The signature is an HMAC over `path|ts` using the shared key.

**3. Coordinator verifies** the signature, the timestamp, and
that the path is in the library allowlist. Streams the file
with range requests enabled:

```
HTTP/1.1 200 OK
Content-Length: 47284104
Accept-Ranges: bytes
Content-Type: application/octet-stream
```

**4. Worker writes to cache** at
`{cache_dir}/remote-sources/{task_id}.{ext}`. The file is
streamed straight to disk, with no memory load.

**5. Worker rewrites task command arguments.** Swaps the
original path for the cached path.

**6. The encode runs.**

**7. Finally block runs.** `IsourceFetcher.ReleaseAsync`
deletes the cached file.

Retries reuse the cached file. Downloading a 4K source once
per attempt would be wasteful.

Shared-storage installs swap the `HttpSourceFetcher` for a
`NullSourceFetcher` in dependency injection. It just returns
the original path unchanged. No code changes needed. It is
config-driven.

## Live progress

While a task runs, the worker posts progress snapshots to the
coordinator every couple seconds:

```
POST /api/v1/distribution/workers/{worker_id}/tasks/{task_id}/progress
Content-Type: application/json

{
  "percent_complete": 42.3,
  "current_fps": 318,
  "current_speed": 2.18,
  "current_stage": "video_encode",
  "elapsed_seconds": 38,
  "estimated_remaining_seconds": 52,
  "current_time_seconds": 1842.5,
  "duration_seconds": 4362.0,
  "bitrate_kbps": 4810
}
```

The coordinator caches the latest snapshot per task. The
dashboard reads via a GET to the progress endpoint.

It is fire-and-forget on the worker side. ffmpeg's progress
thread never blocks on a slow coordinator. Failed pushes are
logged and swallowed. Progress is best-effort. The encode's
success does not depend on it.

It is throttled to one POST per couple seconds per task.
ffmpeg emits more often, but the UI does not need more
granularity.

## Scaling hints

The `WorkerAssigner` load-balances by `speed_multiplier *
available_slots`. Workers with more CPU plus GPU capacity get
more work. Heavy Quality Variant tasks schedule onto fast
workers first. Lighter Time Chunk tasks fill the remainder.

The speed-index per encoder, GPU, and resolution combination
drives the speed multiplier. A worker with a higher-throughput
AV1 encoder wins AV1 tasks, even if it has fewer CPU cores.

The cooldown window is tunable. Too short causes thrashing in
and out of cooldown. Too long means failed workers stay
benched after they recover.

## What is not in this milestone

**No mutual TLS.** HMAC-signed payloads are the full security
story. Works on trusted LAN plus HTTPS to the coordinator.
Deployments across the open internet should add a VPN, or a
TLS client-certificate layer, externally.

**No exponential backoff on retries.** First worker fails.
Second worker tries immediately. If all remotes are flaky, the
retry chain exhausts in seconds. The max remote attempts is
tunable.

**Source fetch is not resumable across worker restarts.** A
worker crash mid-download discards the partial file. The next
attempt re-downloads from scratch. HTTP range requests are
enabled on the server, so a fancier client could resume. The
current one streams straight to disk without checkpoint state.

**Strategies do not auto-distribute yet.** The dispatcher
infrastructure is wired end to end. But existing single-machine
strategies still run whole jobs locally. They do not yet
decompose into Encode Task arrays plus dispatch. That is the
final integration step needed to make distribution active for
the built-in strategies. Plugin strategies can wire themselves
up today.

## Test coverage

The distribution layer has extensive test coverage across its
components — the dispatcher, the task serializer, the HTTP
worker, the registry, the self-registration service, the
source fetcher, and the progress store each have their own
suite, focused on round-trip signing, tamper detection, retry
behaviour, stale eviction, health tracking, and cache reuse.

A full end-to-end test runs a simulated cluster through a real
encode, and a mismatched-signing-key test verifies that the
coordinator falls back to local dispatch when workers reject
signed payloads.
