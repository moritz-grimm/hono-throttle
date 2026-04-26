import { type MiddlewareHandler } from "hono";
import type { RateLimiterOptions } from "./types.js";

export function rateLimiter({ maxRequests, windowMs, whitelist }: RateLimiterOptions): MiddlewareHandler {
    const store = new Map<string, number[]>(); // Map<ip, request timestamp>

    // Cleanup stale entries every 5 minutes
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ ip, timestamps ] of store) {
            const recent = timestamps.filter((timestamp) => now - timestamp < windowMs);
            if (recent.length === 0) {
                store.delete(ip);
            } else {
                store.set(ip, recent);
            }
        }
    }, 5 * 60 * 1000); // 5 minutes

    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    return async(c, next) => {
        const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
        if (whitelist.includes(ip)) return next();
        const now = Date.now();
        const timestamps = store.get(ip);

        if (!timestamps) {
            store.set(ip, [ now ]);
            return next();
        }

        const recent = timestamps.filter((t) => now - t < windowMs);

        if (recent.length >= maxRequests) {
            const retryAfterMs = windowMs - (now - (recent[0]));
            return c.json(
                { error: "Too many requests. Please try again later." },
                429,
                { "Retry-After": Math.ceil(retryAfterMs / 1000).toString() },
            );
        }

        recent.push(now);
        store.set(ip, recent);
        return next();
    };
}
