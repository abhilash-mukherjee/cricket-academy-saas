import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

type AuthRouteHandler = ReturnType<typeof toNextJsHandler>;

let handler: AuthRouteHandler | undefined;

function getHandler(): AuthRouteHandler {
  if (!handler) {
    handler = toNextJsHandler(getAuth());
  }

  return handler;
}

export async function GET(request: Request) {
  return getHandler().GET(request);
}

export async function POST(request: Request) {
  return getHandler().POST(request);
}
