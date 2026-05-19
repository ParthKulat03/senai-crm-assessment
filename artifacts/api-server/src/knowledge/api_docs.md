# API Documentation
## Authentication
All requests require Bearer token: Authorization: Bearer YOUR_API_KEY
v2 API requires separate v2-scoped key. v1 keys do NOT work on v2 endpoints.

## Rate Limits
- Starter: 100 req/min
- Standard: 1000 req/min
- Professional: 5000 req/min
- Enterprise: 10000 req/min (negotiable)

## v1 Deprecation
API v1 is deprecated and will be sunset December 31 2023. All integrations must migrate to v2. v1 endpoints return HTTP 410 after sunset.

## v2 Breaking Changes from v1
1. New auth: v2 requires X-API-Key-V2 header in addition to Bearer token
2. Paginated responses: all list endpoints return { data: [], pagination: { page, per_page, total } }
3. Webhook signatures: v2 uses HMAC-SHA256 in X-Webhook-Signature header
4. Error format changed: v2 uses { error_code, message, details }

## Common Errors
- 403 on /v2/events: You are using a v1 API key. Generate a v2 key in the dashboard settings.
- 429 Too Many Requests: Rate limit exceeded. Retry after X-RateLimit-Reset header timestamp.
- 422 Unprocessable Entity: Invalid payload schema.
