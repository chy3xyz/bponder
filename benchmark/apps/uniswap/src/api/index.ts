import { db } from "bponder:api";
import schema from "bponder:schema";
import { Hono } from "hono";
import { graphql } from "bponder";

const app = new Hono();

app.use("/", graphql({ db, schema }));

export default app;
