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

type WorkerRequest =
  | { type: "ping"; requestId: number }
  | { type: "batch"; requestId: number; events: FakeEvent[] };

declare const self: Worker;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "ping") {
    self.postMessage({
      type: "pong",
      requestId: message.requestId,
      worker: "bun",
    });
    return;
  }

  const results = message.events.map(({ id, ordinal, payload }) => ({
    id,
    ordinal,
    checksum: payload.bytes.reduce((sum, byte) => sum + byte, 0),
    payload,
  }));

  self.postMessage({
    type: "batchResult",
    requestId: message.requestId,
    results,
  });
};
