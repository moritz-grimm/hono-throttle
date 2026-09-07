# hono-throttle

A lightweight rate limiter middleware for [Hono](https://hono.dev) using a sliding-window algorithm with an in-memory store.

## Installation

```bash
npm install hono-throttle
```

## Usage

```ts
import { Hono } from "hono";
import { rateLimiter } from "hono-throttle";

const app = new Hono();

app.use(rateLimiter({
    maxRequests: 100,
    windowMs: 60_000, // 1 minute
}));

app.get("/", (c) => c.text("Hello!"));
```

## Options

| Option        | Type                       | Required | Description                                          |
| ------------- | -------------------------- | -------- | ---------------------------------------------------- |
| `maxRequests` | `number`                   | yes      | Maximum number of requests allowed within the window |
| `windowMs`    | `number`                   | yes      | Duration of the sliding window in milliseconds       |
| `whitelist`   | `string[]`                 | no       | List of IPs that bypass rate limiting                |
| `skip`        | `(c: Context) => boolean`  | no       | Predicate that bypasses rate limiting per request    |
| `skipPaths`   | `Array<string \| RegExp>`  | no       | Request paths that bypass rate limiting              |

### Whitelisting

Omit `whitelist` to rate limit every client. When provided, requests from a
listed IP skip the limiter:

```ts
app.use(rateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    whitelist: [ "127.0.0.1", "10.0.0.5" ],
}));
```

### Skipping requests

`skipPaths` exempts individual request paths from the limiter.

```ts
app.use(rateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    skipPaths: [ "/health", "/metrics", /\/metrics\/.*/ ],
}));
```

Here `/health`, `/metrics` and `/metrics/cpu` bypass the limiter, while
`/api/health` does not. Note that a path and everything below it are two
separate entries, and that the trailing slash in `/\/metrics\/.*/` matters:
without it, `/metrics-internal` would be exempt too.

For anything that is not a path, use `skip`. It receives the Hono context and
bypasses the limiter whenever it returns `true`:

```ts
app.use(rateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    skip: (c) => c.req.header("x-api-key") === process.env.INTERNAL_KEY,
}));
```

## Behavior

- IP addresses are resolved from the `X-Forwarded-For` header (first entry) or `X-Real-IP` as a fallback.
- When the limit is exceeded, the middleware returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait.
- `skip` and `skipPaths` are checked first. Matching requests bypass the limiter entirely and do not count towards it.
- Stale entries are automatically cleaned up every 5 minutes.

## License

[MIT](./LICENSE)
