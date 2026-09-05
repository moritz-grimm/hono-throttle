# hono-rate-limiter

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

| Option        | Type       | Required | Description                                          |
| ------------- | ---------- | -------- | ---------------------------------------------------- |
| `maxRequests` | `number`   | yes      | Maximum number of requests allowed within the window |
| `windowMs`    | `number`   | yes      | Duration of the sliding window in milliseconds       |
| `whitelist`   | `string[]` | no       | List of IPs that bypass rate limiting                |

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

## Behavior

- IP addresses are resolved from the `X-Forwarded-For` header (first entry) or `X-Real-IP` as a fallback.
- When the limit is exceeded, the middleware returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait.
- Stale entries are automatically cleaned up every 5 minutes.

## License

[MIT](./LICENSE)
