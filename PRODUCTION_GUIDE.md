# Production Deployment & Environment Guide — Delivery Express

This document outlines the required production environment variables, security configurations, and deployment strategies to run Delivery Express safely in production.

---

## 1. Backend Environment Variables (`backend/.env`)

Ensure the following variables are set in your backend hosting platform (e.g. Render, Railway, Heroku, AWS, DigitalOcean):

| Variable | Description | Standard / Production Recommendation |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase / Managed DB) | `postgresql://<user>:<password>@<host>:5432/<dbname>?sslmode=require` |
| `JWT_SECRET` | Secret key used to sign JSON Web Tokens | A high-entropy random string (at least 64 hex characters or 32 bytes base64) |
| `PORT` | Node server binding port | `5000` (or injected automatically by hosting platform like `$PORT`) |
| `FRONTEND_URL` | Allowed origin for Web CORS and Socket.io | `https://your-production-web-app.domain.com` (Use exact domain, NO `*` wildcard) |
| `MOBILE_ORIGIN` | Allowed origin / deep link scheme for Mobile client | `app://delivery-express` or trusted Expo domain |
| `NODE_ENV` | Environment mode | `production` |

---

## 2. Frontend Web Environment Variables (`frontend/.env.production`)

Create `.env.production` inside the `frontend` folder for production Vite builds:

```env
VITE_API_URL=https://api.yourdomain.com/api
```

*Note: For Vite apps, environment variables must start with `VITE_`.*

---

## 3. Mobile App Environment Variables (`mobile/.env`)

For Expo production builds (`eas build`), configure the following in `app.json` or `.env`:

```env
EXPO_PUBLIC_API_URL=https://api.yourdomain.com/api
```

---

## 4. Production Security Checklist & Hardening Steps

- [x] **CORS Origin Restricting**: Strict whitelist of origins in `backend/server.js` using `FRONTEND_URL` instead of wildcard `*`.
- [x] **PostgreSQL Connection Pool**: Managed connection timeout, graceful pool error handling, and SSL enforcement.
- [x] **Authentication & Passwords**: Passwords salted & hashed with `bcryptjs`. JWT tokens signed with mandatory `JWT_SECRET`.
- [x] **API Rate Limiting**: `authLimiter` applied to `/api/auth/login` and `/api/auth/register` (max 10 attempts per 15 min window).
- [x] **Global Error Handling**: Unhandled exceptions and promise rejections caught without exposing internal stack traces to clients.
- [x] **HTTPS / TLS Enforcement**: All HTTP endpoints and WebSocket server (`wss://`) must run behind reverse proxy (e.g. Nginx, Cloudflare, AWS ALB) enforcing HTTPS.

---

## 5. Deployment Instructions

### A. Backend Deployment (Docker / Node Service)
```bash
cd backend
npm install --production
npm start
```

### B. Frontend Web Deployment (Vite / Static Web Hosting)
```bash
cd frontend
npm install
npm run build
# Deploy contents of frontend/dist to Cloudflare Pages, Vercel, Netlify, or Nginx
```

### C. Mobile App Build (Expo EAS)
```bash
cd mobile
npx eas-cli build --platform all
```
