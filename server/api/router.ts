export type RouteHandler = (request: unknown) => Promise<unknown> | unknown;

export interface RouteDefinition {
  method: "GET" | "POST";
  path: string;
  handler: RouteHandler;
}

export class ApiRouter {
  private routes: RouteDefinition[] = [];

  register(route: RouteDefinition): void {
    this.routes.push(route);
  }

  getRoutes(): RouteDefinition[] {
    return this.routes;
  }
}
