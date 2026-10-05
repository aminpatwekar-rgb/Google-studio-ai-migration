import * as startRuntime from "@tanstack/react-start";
import { createStart, createMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

type CsrfFactory = (opts: { filter?: (ctx: { handlerType?: string }) => boolean }) => unknown;

const createCsrf = (startRuntime as Record<string, unknown>)["createCsrfMiddleware"] as
  CsrfFactory | undefined;

const csrfMiddleware =
  typeof createCsrf === "function"
    ? createCsrf({ filter: (ctx) => ctx.handlerType === "serverFn" })
    : undefined;

const requestMiddleware = [errorMiddleware, csrfMiddleware].filter(Boolean) as never[];

export const startInstance = createStart(() => ({
  functionMiddleware: [],
  requestMiddleware,
}));
