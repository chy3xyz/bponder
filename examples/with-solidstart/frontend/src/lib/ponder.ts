import { createClient } from "bponder-client";

const client = createClient({
  url: import.meta.env.VITE_PONDER_URL ?? "http://localhost:42069",
});

export { client };
