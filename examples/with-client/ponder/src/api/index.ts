import { db } from "bponder:api";
import schema from "bponder:schema";
import { Hono } from "hono";
import { client } from "bponder";

const app = new Hono();

app.use("/sql/*", client({ db, schema }));

export default app;
