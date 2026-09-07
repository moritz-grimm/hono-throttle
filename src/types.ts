import type { Context } from "hono";

export type RateLimiterOptions = {
    maxRequests: number;
    windowMs: number;
    whitelist?: Array<string>;
    skip?: (c: Context) => boolean;
    skipPaths?: Array<string | RegExp>;
    keyGenerator?: (c: Context) => string;
};
