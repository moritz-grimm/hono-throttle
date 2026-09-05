import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";
import { rateLimiter } from "../src/rate-limiter.js";
import type { RateLimiterOptions } from "../src/types.js";

function createApp(options?: Partial<RateLimiterOptions>): Hono {
    const app = new Hono();
    app.use(rateLimiter({ maxRequests: 3, windowMs: 60_000, ...options }));
    app.get("/", (c) => c.text("ok"));
    return app;
}

const headers = { "x-forwarded-for": "1.2.3.4" };

describe("rateLimiter", () => {
    test("returns 429 when limit is exceeded", async() => {
        const app = createApp();

        for (let i = 0; i < 10; i++) {
            await app.request("/", {
                headers: headers,
            });
        }

        const res = await app.request("/", {
            headers: headers,
        });

        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).not.toBeNull();
    });

    test("returns 200 after window resets", async() => {
        const app = createApp();
        vi.useFakeTimers();

        try {
            for (let i = 0; i < 10; i++) {
                await app.request("/", {
                    headers: headers,
                });
            }

            const res = await app.request("/", {
                headers: headers,
            });
            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).not.toBeNull();

            vi.advanceTimersByTime(15 * 60 * 1000 + 1); // 15 minutes

            const allowed = await app.request("/", {
                headers: headers,
            });
            expect(allowed.status).toBe(200);
        } finally {
            vi.useRealTimers();
        }
    });

    test("returns 200 within limit", async() => {
        const app = createApp();
        const res = await app.request("/", {
            headers: headers,
        });

        expect(res.status).toBe(200);
    });

    test("returns 200 on whitelisted IP after limit is exceeded", async() => {
        const app = createApp({ whitelist: [ "1.2.3.4" ] });

        for (let i = 0; i < 10; i++) {
            await app.request("/", {
                headers: headers,
            });
        }

        const res = await app.request("/", {
            headers: headers,
        });

        expect(res.status).toBe(200);
        expect(res.headers.get("Retry-After")).toBeNull();
    });

    test("returns 429 on non-whitelisted IP after limit is exceeded", async() => {
        const app = createApp({ whitelist: [ "192.168.1.1" ] });

        for (let i = 0; i < 10; i++) {
            await app.request("/", {
                headers: headers,
            });
        }

        const res = await app.request("/", {
            headers: headers,
        });

        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).not.toBeNull();
    });

    test("returns 200 if the IP appears later in the x-forwarded-for chain", async() => {
        const app = createApp();

        for (let i = 0; i < 10; i++) {
            await app.request("/", {
                headers: headers,
            });
        }

        const res = await app.request("/", {
            headers: { "x-forwarded-for": "5.6.7.8, 1.2.3.4" },
        });

        expect(res.status).toBe(200);
    });

    test("returns 429 on same first IP in different x-forwarded-for chains", async() => {
        const app = createApp();

        for (let i = 0; i < 10; i++) {
            await app.request("/", {
                headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
            });
        }

        const res = await app.request("/", {
            headers: { "x-forwarded-for": "1.2.3.4, 172.16.0.9" },
        });

        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).not.toBeNull();
    });

    test("returns 200 on a different x-real-ip once the first one is limited", async() => {
        const app = createApp();

        for (let i = 0; i < 10; i++) {
            await app.request("/", {
                headers: { "x-real-ip": "1.2.3.4" },
            });
        }

        const blocked = await app.request("/", {
            headers: { "x-real-ip": "1.2.3.4" },
        });

        expect(blocked.status).toBe(429);
        expect(blocked.headers.get("Retry-After")).not.toBeNull();

        const allowed = await app.request("/", {
            headers: { "x-real-ip": "5.6.7.8" },
        });

        expect(allowed.status).toBe(200);
    });
});
