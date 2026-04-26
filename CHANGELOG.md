# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-26

### Added

- `rateLimiter` middleware for [Hono](https://hono.dev) with a sliding-window algorithm
- Configurable `maxRequests` and `windowMs` options
- IP detection via `X-Forwarded-For` and `X-Real-IP` headers
- `Retry-After` response header (in seconds) on `429 Too Many Requests` responses
- `whitelist` option to bypass rate limiting for specific IPs
- Automatic cleanup of stale in-memory entries every 5 minutes
