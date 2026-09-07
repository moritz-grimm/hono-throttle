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

| Option         | Type                       | Required | Description                                          |
| -------------- | -------------------------- | -------- | ---------------------------------------------------- |
| `maxRequests`  | `number`                   | yes      | Maximum number of requests allowed within the window |
| `windowMs`     | `number`                   | yes      | Duration of the sliding window in milliseconds       |
| `whitelist`    | `string[]`                 | no       | List of keys that bypass rate limiting               |
| `skip`         | `(c: Context) => boolean`  | no       | Predicate that bypasses rate limiting per request    |
| `skipPaths`    | `Array<string \| RegExp>`  | no       | Request paths that bypass rate limiting              |
| `keyGenerator` | `(c: Context) => string`   | no       | Resolves the bucket key a request is counted under   |

### Whitelisting

Omit `whitelist` to rate limit every client. When provided, requests whose
bucket key is listed skip the limiter:

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

### Bucket keys

By default a request is counted under the first entry of the `X-Forwarded-For`
header, falling back to `X-Real-IP` and finally to the literal string
`"unknown"`. That default only holds behind a trusted proxy that **sets**
`X-Forwarded-For` rather than passing a client-supplied value through:

- **No proxy in front:** neither header is set, so every client keys to
  `"unknown"` and shares a single counter. One client exhausts the window for
  everyone and the limiter becomes a global request budget instead of a
  per-client limit.
- **A proxy that forwards instead of sets the header:** `X-Forwarded-For` is
  attacker-controlled, so the limit is bypassed by rotating the header per
  request.

`keyGenerator` replaces the key resolution entirely, so you can key on the real
socket address:

```ts
import { getConnInfo } from "@hono/node-server/conninfo"; // or hono/bun/conninfo, hono/deno, ...

app.use(rateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    keyGenerator: (c) => `ip:${getConnInfo(c).remote.address ?? "unknown"}`,
}));
```

Keying per API token is a valid secondary use, but key on the **result of
authentication**, not on the value the client sends.

A key is nothing but the label a counter is filed under. If that label is taken
straight from a request header, the client gets to choose their own label and
three things can go wrong.

**A client can claim a label that is already trusted.** Given this config:

```ts
app.use(rateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    whitelist: [ "127.0.0.1" ],
    keyGenerator: (c) => c.req.header("x-client-id") ?? getConnInfo(c).remote.address,
}));
```

a request carrying `X-Client-Id: 127.0.0.1` produces the key `"127.0.0.1"`,
which is on the whitelist, so that client bypasses the limiter completely. The
whitelist entry was meant for the loopback address, but nothing in the key
distinguishes "the address 127.0.0.1" from "a client that called itself
127.0.0.1".

**A client can claim someone else's label.** Even without a whitelist,
`X-Client-Id: 203.0.113.7` files the attacker's requests under that address's
counter and exhausts it. The actual client at 203.0.113.7 then gets `429`
responses without having sent a single request.

**Every wrong guess gets a fresh counter.** Keying on the raw token header means
an attacker trying one token after another produces a new key every time and
never reaches the limit, so brute force runs unthrottled. Key on the token id
you resolved, and only once authentication has succeeded:

```ts
app.use(rateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
    keyGenerator: (c) => {
        const tokenId = c.get("auth")?.tokenId;
        return tokenId ? `token:${tokenId}` : `ip:${getConnInfo(c).remote.address ?? "unknown"}`;
    },
}));
```

The `ip:` and `token:` prefixes keep both sources in separate namespaces:
`token:127.0.0.1` and `ip:127.0.0.1` are different keys, so a token value can
never land in an address's counter, nor match a whitelist entry meant for one.
`whitelist` is compared against the finished key, so its entries need the same
prefix: `whitelist: [ "ip:127.0.0.1" ]`.

## Behavior

- Bucket keys are resolved from the `X-Forwarded-For` header (first entry) or `X-Real-IP` as a fallback, unless `keyGenerator` is set.
- When the limit is exceeded, the middleware returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait.
- `skip` and `skipPaths` are checked first. Matching requests bypass the limiter entirely and do not count towards it.
- Stale entries are automatically cleaned up every 5 minutes.

## License

[MIT](./LICENSE)
