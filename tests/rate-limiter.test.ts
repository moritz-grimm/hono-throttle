import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";
import { rateLimiter } from "../src/rate-limiter.js";

const app = new Hono();
app.use(rateLimiter({ maxRequests: 3, windowMs: 60_000, whitelist: [] }));
app.get("/", (c) => c.text("ok"));

describe("rateLimiter", () => {
    test("returns 429 when limit is exceeded", async() => {
        const headers = { "x-forwarded-for": "1.2.3.4" };

        for (let i = 0; i < 10; i++) {
            await app.request("/", {
                headers: headers,
            });
        }

        const blocked = await app.request("/api/waitlist", {
            headers: headers,
        });

        expect(blocked.status).toBe(429);
        expect(blocked.headers.get("Retry-After")).not.toBeNull();
    });

    test("returns 200 after window resets", async() => {
        vi.useFakeTimers();

        try {
            const headers = {
                "x-forwarded-for": "5.6.7.8",
            };

            for (let i = 0; i < 10; i++) {
                await app.request("/", {
                    headers: headers,
                });
            }

            const blocked = await app.request("/", {
                headers: headers,
            });
            expect(blocked.status).toBe(429);
            expect(blocked.headers.get("Retry-After")).not.toBeNull();

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
        const res = await app.request("/", {
            headers: { "x-forwarded-for": "9.10.11.12" },
        });

        expect(res.status).toBe(200);
    });
});
