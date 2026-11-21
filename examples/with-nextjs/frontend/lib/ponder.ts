import { createClient } from "@ponder/client";

const client = createClient({ url: "http://localhost:42069" });

export { client };
