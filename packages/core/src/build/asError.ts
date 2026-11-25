import { inspect } from "node:util";

/**
 * Normalize thrown values for logging. Bun ResolveMessage / BuildMessage often
 * serialize to empty name/message ("undefined: undefined") under pino.
 */
export const asError = (error: unknown): Error => {
  if (error instanceof Error) {
    const hasMessage =
      typeof error.message === "string" && error.message.length > 0;
    const hasName =
      typeof error.name === "string" &&
      error.name.length > 0 &&
      error.name !== "Error";
    if (hasMessage || (hasName && error.stack)) {
      return error;
    }
    const inspected = inspect(error, { depth: 4, breakLength: 120 });
    const wrapped = new Error(inspected);
    wrapped.name = error.name || "Error";
    wrapped.cause = error;
    if (typeof error.stack === "string" && error.stack.length > 0) {
      wrapped.stack = error.stack;
    }
    return wrapped;
  }

  if (error !== null && typeof error === "object") {
    return new Error(inspect(error, { depth: 4, breakLength: 120 }));
  }

  return new Error(String(error));
};
