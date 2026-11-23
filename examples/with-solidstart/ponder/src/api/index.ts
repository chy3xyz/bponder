import { db } from "bponder:api";
import schema from "bponder:schema";
import { Hono } from "hono";
import { client, graphql } from "bponder";

const app = new Hono();

app.use("/sql/*", client({ db, schema }));
app.use("/", graphql({ db, schema }));

export default app;
