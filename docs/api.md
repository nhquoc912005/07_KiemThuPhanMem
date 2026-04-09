# API notes

Base URL: `http://localhost:<APP_PORT>/api/v1`

## Auth

- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

## Dispatcher (cần role Điều phối)

- `GET /tickets`
- `GET /vehicles`
- `GET /drivers`
- `GET /customers`
- `GET /reports/summary`

## Routes

- `GET /routes`
- `GET /routes/:id`
- `POST /routes`
- `PUT /routes/:id`
- `PATCH /routes/:routeId/stops/:stopId/status`
- `POST /routes/:id/incident`

