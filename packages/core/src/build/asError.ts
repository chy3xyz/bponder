import { inspect } from "node:util";

const isPlainBuiltinError = (error: Error) => {
  const ctor = error.constructor;
  return (
    ctor === Error ||
    ctor === TypeError ||
    ctor === RangeError ||
    ctor === SyntaxError ||
    ctor === URIError ||
    ctor === EvalError ||
    ctor === ReferenceError
  );
};

/**
 * Normalize thrown values for logging.
 *
 * Bun `ResolveMessage` / `BuildMessage` are `instanceof Error` but their
 * `stack` getter (and pino's error serializer) can throw
 * `Error: [unable to serialize, circular reference is too complex to analyze]`,
 * which previously swallowed the real module-not-found reason behind
 * `Build failed stage=native`.
 */
export const asError = (error: unknown): Error => {
  if (error instanceof Error) {
    const hasMessage =
      typeof error.message === "string" && error.message.length > 0;

    if (isPlainBuiltinError(error) && hasMessage) {
      return error;
    }

    let message: string;
    if (hasMessage) {
      message = error.message;
    } else {
      try {
        message = inspect(error, { depth: 4, breakLength: 120 }).trim();
      } catch {
        message = "";
      }
      if (message.length === 0) {
        const stackLine =
          typeof error.stack === "string"
            ? error.stack
                .split("\n")
                .map((line) => line.trim())
                .find((line) => line.length > 0)
            : undefined;
        message =
          stackLine && stackLine.length > 0 ? stackLine : "Unknown error";
      }
    }

    const wrapped = new Error(message);
    wrapped.name =
      typeof error.name === "string" && error.name.length > 0
        ? error.name
        : "Error";
    wrapped.cause = error;

    // Copy stack as a plain string before Bun's getter can fail later in pino.
    try {
      const stack = error.stack;
      if (typeof stack === "string" && stack.length > 0) {
        wrapped.stack = stack;
      }
    } catch {
      wrapped.stack = `${wrapped.name}: ${wrapped.message}`;
    }

    return wrapped;
  }

  if (error !== null && typeof error === "object") {
    try {
      return new Error(inspect(error, { depth: 4, breakLength: 120 }));
    } catch {
      return new Error(String(error));
    }
  }

  return new Error(String(error));
};
