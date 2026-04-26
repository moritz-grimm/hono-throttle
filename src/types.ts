export type RateLimiterOptions = {
    maxRequests: number;
    windowMs: number;
    whitelist: Array<string>;
};
