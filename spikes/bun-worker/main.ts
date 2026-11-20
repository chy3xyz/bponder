const EVENT_COUNT = 1_000;
const PAYLOAD_PROBE_BYTES = 16 * 1024 * 1024;

type StructuredPayload = {
  timestamp: Date;
  bytes: Uint8Array;
  labels: Map<string, number>;
  nested: {
    active: boolean;
    values: number[];
  };
};

type FakeEvent = {
  id: string;
  ordinal: number;
  payload: StructuredPayload;
};

type WorkerReply =
  | { type: "pong"; requestId: number; worker: "bun" }
  | {
      type: "batchResult";
      requestId: number;
      results: Array<{
        id: string;
        ordinal: number;
        checksum: number;
        payload: StructuredPayload;
      }>;
    };

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
};

const worker = new Worker(new URL("./worker.ts", import.meta.url).href);
let nextRequestId = 0;

const request = (message: object) =>
  new Promise<WorkerReply>((resolve, reject) => {
    const requestId = ++nextRequestId;

    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.requestId === requestId) resolve(event.data);
    };
    worker.onerror = (event) => {
      reject(event.error ?? new Error(event.message));
    };
    worker.postMessage({ ...message, requestId });
  });

try {
  const pong = await request({ type: "ping" });
  assert(pong.type === "pong", "ping must receive pong");
  assert(pong.worker === "bun", "pong must identify the Bun worker");

  const events: FakeEvent[] = Array.from(
    { length: EVENT_COUNT },
    (_, ordinal) => ({
      id: `event-${ordinal.toString().padStart(4, "0")}`,
      ordinal,
      payload: {
        timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, ordinal)),
        bytes: new Uint8Array([ordinal % 251, (ordinal + 1) % 251]),
        labels: new Map([
          ["ordinal", ordinal],
          ["parity", ordinal % 2],
        ]),
        nested: { active: ordinal % 2 === 0, values: [ordinal, ordinal + 1] },
      },
    }),
  );

  const batch = await request({ type: "batch", events });
  assert(batch.type === "batchResult", "batch must receive batchResult");
  assert(
    batch.results.length === EVENT_COUNT,
    "worker must return every event",
  );

  for (let ordinal = 0; ordinal < EVENT_COUNT; ordinal++) {
    const result = batch.results[ordinal];
    const source = events[ordinal];
    assert(
      result !== undefined && source !== undefined,
      `result ${ordinal} must exist`,
    );
    assert(
      result.ordinal === ordinal,
      `result ${ordinal} must preserve ordering`,
    );
    assert(result.id === source.id, `result ${ordinal} must preserve its id`);
    assert(
      result.payload.timestamp instanceof Date &&
        result.payload.timestamp.getTime() ===
          source.payload.timestamp.getTime(),
      `result ${ordinal} must preserve Date`,
    );
    assert(
      result.payload.bytes instanceof Uint8Array,
      `result ${ordinal} must preserve Uint8Array`,
    );
    assert(
      result.payload.labels instanceof Map,
      `result ${ordinal} must preserve Map`,
    );
    assert(
      result.payload.labels.get("ordinal") === ordinal,
      `result ${ordinal} must preserve Map entries`,
    );
    assert(
      result.checksum === source.payload.bytes[0] + source.payload.bytes[1],
      `result ${ordinal} must contain the worker checksum`,
    );
  }

  const largeBytes = new Uint8Array(PAYLOAD_PROBE_BYTES);
  largeBytes[0] = 17;
  largeBytes[largeBytes.length - 1] = 29;
  const payloadProbe = await request({
    type: "batch",
    events: [
      {
        id: "payload-probe",
        ordinal: 0,
        payload: {
          timestamp: new Date(0),
          bytes: largeBytes,
          labels: new Map([["bytes", PAYLOAD_PROBE_BYTES]]),
          nested: { active: true, values: [PAYLOAD_PROBE_BYTES] },
        },
      },
    ],
  });

  assert(
    payloadProbe.type === "batchResult",
    "payload probe must receive batchResult",
  );
  const returnedProbe = payloadProbe.results[0];
  assert(returnedProbe !== undefined, "payload probe result must exist");
  assert(
    returnedProbe.payload.bytes.length === PAYLOAD_PROBE_BYTES,
    "16 MiB payload must survive",
  );
  assert(
    returnedProbe.payload.bytes[0] === 17,
    "payload first byte must survive",
  );
  assert(
    returnedProbe.payload.bytes.at(-1) === 29,
    "payload last byte must survive",
  );
  assert(
    largeBytes.byteLength === PAYLOAD_PROBE_BYTES,
    "postMessage must clone rather than detach the source buffer",
  );

  console.log(
    `[PASS] Bun.Worker ping/batch: ${EVENT_COUNT} ordered events; structured clone and 16 MiB payload verified`,
  );
} finally {
  worker.terminate();
}
