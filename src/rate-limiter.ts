import { type Context, type MiddlewareHandler } from "hono";
import type { RateLimiterOptions } from "./types.js";

function defaultKeyGenerator(c: Context): string {
    return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
}

export function rateLimiter({ maxRequests, windowMs, whitelist, skip, skipPaths, keyGenerator = defaultKeyGenerator }: RateLimiterOptions): MiddlewareHandler {
    const store = new Map<string, number[]>(); // Map<key, request timestamps>

    const skipPatterns = skipPaths?.map((p) => typeof p === "string"
        ? p
        : new RegExp(`^(?:${p.source})$`, p.flags.replace(/[gy]/g, "")));

    // Cleanup stale entries every 5 minutes
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [ key, timestamps ] of store) {
            const recent = timestamps.filter((timestamp) => now - timestamp < windowMs);
            if (recent.length === 0) {
                store.delete(key);
            } else {
                store.set(key, recent);
            }
        }
    }, 5 * 60 * 1000); // 5 minutes

    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    return async(c, next) => {
        const path = c.req.path;
        if (skip?.(c) || skipPatterns?.some((p) => typeof p === "string" ? p === path : p.test(path))) return next();

        const key = keyGenerator(c);
        if (whitelist?.includes(key)) return next();
        const now = Date.now();
        const timestamps = store.get(key);

        if (!timestamps) {
            store.set(key, [ now ]);
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
        store.set(key, recent);
        return next();
    };
}
