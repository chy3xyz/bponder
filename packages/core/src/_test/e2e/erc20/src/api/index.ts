import { db } from "bponder:api";
import schema from "bponder:schema";
import { Hono } from "hono";
import { client } from "@/index.js";

const app = new Hono();

app.get("/hello", (c) => c.text("hono-ok"));

app.use("/sql/*", client({ db, schema }));

export default app;
