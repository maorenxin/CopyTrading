import { createServer } from "http";
import { buildApiRouter } from "./index";
import { log } from "../services/logger";

interface RouteMatch {
  params: Record<string, string>;
}

function matchRoute(method: string, pathname: string, routePath: string): RouteMatch | null {
  if (!routePath.startsWith("/")) return null;
  const routeParts = routePath.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (routeParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < routeParts.length; i += 1) {
    const routePart = routeParts[i];
    const pathPart = pathParts[i];
    if (routePart.startsWith(":")) {
      params[routePart.slice(1)] = decodeURIComponent(pathPart);
      continue;
    }
    if (routePart !== pathPart) return null;
  }

  return { params };
}

async function readJsonBody(req: import("http").IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      const text = Buffer.concat(chunks).toString("utf-8");
      if (!text) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export function startApiServer(): void {
  const router = buildApiRouter();
  const routes = router.getRoutes();
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);

  const server = createServer(async (req, res) => {
    if (!req.url || !req.method) {
      res.statusCode = 400;
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    const route = routes.find((candidate) => {
      if (candidate.method !== method) return false;
      return Boolean(matchRoute(method, pathname, candidate.path));
    });

    if (!route) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const match = matchRoute(method, pathname, route.path);
    if (!match) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    try {
      const body = method === "POST" ? await readJsonBody(req) : undefined;
      const request = {
        params: match.params,
        query: Object.fromEntries(url.searchParams.entries()),
        body,
        headers: req.headers,
      };
      const result = await route.handler(request);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result ?? {}));
    } catch (error) {
      log("error", "api handler failed", { message: (error as Error).message, path: route.path });
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "internal_error" }));
    }
  });

  server.listen(port, () => {
    log("info", "api server listening", { port });
  });
}

if (require.main === module) {
  startApiServer();
}
