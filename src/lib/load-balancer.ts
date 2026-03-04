type RouteLoad = {
  inFlight: number;
  rejected: number;
  lastSeenAt: number;
};

const routeLoadMap = new Map<string, RouteLoad>();
const ROUTE_TTL_MS = 15 * 60_000;

function getRouteLoad(routeKey: string): RouteLoad {
  const existing = routeLoadMap.get(routeKey);
  if (existing) {
    existing.lastSeenAt = Date.now();
    return existing;
  }

  const initial: RouteLoad = { inFlight: 0, rejected: 0, lastSeenAt: Date.now() };
  routeLoadMap.set(routeKey, initial);
  return initial;
}

function pruneIdleRoutes() {
  if (routeLoadMap.size <= 100) return;

  const now = Date.now();
  for (const [key, value] of routeLoadMap.entries()) {
    if (value.inFlight === 0 && now - value.lastSeenAt > ROUTE_TTL_MS) {
      routeLoadMap.delete(key);
    }
  }
}

export function acquireLoadSlot(routeKey: string, maxConcurrent: number) {
  pruneIdleRoutes();
  const routeLoad = getRouteLoad(routeKey);

  if (routeLoad.inFlight >= maxConcurrent) {
    routeLoad.rejected += 1;
    routeLoad.lastSeenAt = Date.now();
    return { acquired: false as const };
  }

  routeLoad.inFlight += 1;

  let released = false;
  return {
    acquired: true as const,
    release: () => {
      if (released) return;
      released = true;
      routeLoad.inFlight = Math.max(0, routeLoad.inFlight - 1);
      routeLoad.lastSeenAt = Date.now();
    },
  };
}

export function getLoadBalancerStats() {
  const routes = Array.from(routeLoadMap.entries()).map(([route, load]) => ({
    route,
    inFlight: load.inFlight,
    rejected: load.rejected,
    lastSeenAt: new Date(load.lastSeenAt).toISOString(),
  }));

  const totalInFlight = routes.reduce((sum, item) => sum + item.inFlight, 0);
  const totalRejected = routes.reduce((sum, item) => sum + item.rejected, 0);

  return {
    totalInFlight,
    totalRejected,
    routes,
  };
}
