# PIXX ROTA

PIXX ROTA manages shop attendance, employee weekly salaries, adjustments, bonuses, salary payments, ledgers, and operational reports.

## Applications and technology

- `Admin/`: React 19 and Vite web application for administrative, attendance-checking, and salary-distribution workflows.
- `usman/`: Expo Router / React Native mobile application for attendance-operator workflows.
- `backend/`: Node.js, Express 5, and Mongoose REST API backed by MongoDB. Authentication uses JWT and stored user passwords are bcrypt-hashed.

The backend is the security boundary: frontend route hiding does not replace API authentication or role checks.

## Roles and workflow

The roles stored by the API are `ADMIN`, `ATTENDANCE_OPERATOR`, `ATTENDANCE_CHECKER`, and `SALARY_DISTRIBUTOR`.

| Capability | Admin | Attendance operator | Attendance checker | Salary distributor |
| --- | --- | --- | --- | --- |
| Create/update shops and employees | Yes | No | No | No |
| Submit attendance | Yes | Yes | No | No |
| Review/check attendance | Yes | No | Yes | No |
| Generate/finalize salaries and manage adjustments/bonuses | Yes | No | No | No |
| Record salary payments | Yes | No | No | Yes |
| Access payroll reports | Yes | No | No | Payment and ledger reports allowed by API |
| Read audit logs | Yes | No | No | No |

Route-specific permissions are authoritative; some read-only endpoints intentionally permit any authenticated role.

The normal workflow is attendance entry → attendance review → weekly salary generation → adjustments/bonus → finalization → payment → ledger and reports.

## Business rules

The current backend calculation helpers define these rules:

- Weekly periods run Monday through Sunday in the application's UK date convention.
- Admins create employees with a generated employee ID and enter their daily wage; employee records are not permanently assigned to a shop. Select the shop on each non-absent worker's daily attendance record.
- The mobile attendance form initializes shift and time fields from the Admin-configured UK default schedule for the selected date's weekday; selecting a worker's daily shop then applies that shop's weekday schedule when configured.
- Attendance times remain stored and exchanged with the API in 24-hour `HH:mm` format; the mobile app, Admin screens, and attendance WhatsApp/PDF/Excel reports display them in 12-hour AM/PM format.
- Marking a worker absent requires no shop or shift/arrival/leave times; the saved attendance has no shop assignment and stores blank time values.
- Daily shared attendance PDFs group working staff by shop, list absent/off workers separately without shop or time values, and include the saved Usman and Sarfraz signature images. Attendance checkers do not receive wage, deduction, or net-pay fields in the daily review report.
- Attendance stores its daily wage and, when applicable, shop details when created, preserving the values used for historical attendance.
- Lateness up to and including the configured grace period (15 minutes by default) has no deduction. Beyond the grace period, the deduction is based on the full actual lateness.
- Attendance pay is based on the historical daily wage, scheduled hours, actual hours, and lateness calculation.
- Weekly salary is calculated from net attendance pay, allowances, allocated bonus, and deductions. The backend helper is `calculateWeeklySalaryComponents` in `backend/src/utils/calc.js`.
- A monthly bonus is included only when explicitly assigned to a weekly salary; it is not multiplied across all weekly salary records.
- Outstanding salary is final salary less recorded payments. Payments can be installments and must not exceed the outstanding balance.
- Finalized salary records retain a finalization snapshot and are protected from ordinary recalculation/adjustment changes.

## Project layout

```text
Admin/       React/Vite web application
usman/       Expo/React Native mobile application
backend/     Express/Mongoose API, models, controllers, and tests
```

## Local setup

Use a supported Node.js version and install dependencies in each application directory:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Set `MONGO_URI` to a development-only MongoDB database and replace `JWT_SECRET` with a randomly generated secret of at least 32 characters. The payment/ledger transaction flow requires MongoDB transactions, so use a replica-set or sharded MongoDB deployment (including for local development); a standalone MongoDB server is not sufficient. Do not use production data for development or tests.

Run the API from `backend/`:

```powershell
npm start
```

Run the admin app from `Admin/`:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Run the mobile app from `usman/`:

```powershell
npm install
Copy-Item .env.example .env
npx expo start
```

For a physical phone using Expo Go, replace `localhost` in `usman/.env` with the computer's current Wi-Fi IPv4 address (for example, `http://192.168.1.6:5000/api`). The phone and computer must be on the same network, the backend must be running, and Windows Firewall must allow incoming connections on port 5000. Restart Expo after changing the value with `npx expo start -c`. `EXPO_PUBLIC_*` values are public bundle configuration, never backend secrets.

## Environment variables

Backend variables (template: `backend/.env.example`):

| Variable | Purpose |
| --- | --- |
| `PORT` | API listening port (defaults to 5000). |
| `NODE_ENV` | Set to `production` for deployment. |
| `MONGO_URI` | MongoDB connection string; required in production. |
| `JWT_SECRET` | Private signing secret, at least 32 characters; never put in a frontend. |
| `ADMIN_WEB_URL` | Exact deployed admin origin allowed by CORS. |
| `CORS_ORIGINS` | Optional comma-separated list of additional exact allowed origins. |

Admin uses `VITE_API_URL` (template: `Admin/.env.example`). Mobile uses `EXPO_PUBLIC_API_URL` (template: `usman/.env.example`). Frontend environment values are visible to clients and must not contain credentials or private keys.

The API does not configure Cloudinary or file uploads in the current implementation.

## API overview

All API routes use the `/api` prefix. Except for `POST /auth/login` and `GET /health`, routes require `Authorization: Bearer <JWT>`. The server loads the user's active account and role for each protected request.

| Group | Methods / paths | Access summary |
| --- | --- | --- |
| Health | `GET /health` | Public health response. |
| Authentication/users | `POST /auth/login`, `GET /auth/me`, `GET/POST /auth/users` | Login is public; profile requires a token; user listing/creation is admin-only. |
| Shops/schedules | `/shops`, `/shops/schedules`, `/shops/default-shift` | Authenticated reads; administration changes are admin-only. |
| Employees | `/employees` and `/:id`/`/:id/profile` | Authenticated reads; changes are admin-only. |
| Attendance | `/attendance`, `/attendance/batch`, `/attendance/pending`, `/:id`, `/:id/approve`, `/approve` | Writes are limited to operators/admins; review/approval to checker/admin. |
| Salaries/payments/ledger | `/salaries`, `/salaries/generate`, `/salaries/regenerate`, `/:id`, `/:id/adjustments`, `/adjustments/:adjustmentId`, `/:id/finalize`, `/:id/pay`, `/:id/payments`, `/ledger/employee/:employeeId` | Generation, adjustments, and finalization are admin-only; payment and payment/ledger views allow admin/distributor. |
| Bonuses | `/bonuses` | Authenticated reads; mutations are admin-only. |
| Reports/exports | `/reports/...` | Role permissions are defined per report route; payroll and bonus reports are admin-only, payment/ledger reports also allow distributors, and attendance reports allow checkers/admins (daily report also allows operators). |
| Dashboards | `/dashboard/admin`, `/dashboard/checker`, `/dashboard/distributor` | Admin, checker/admin, and distributor/admin respectively. |
| Audit/settings | `/audit`, `/settings` | Audit log is admin-only; settings are readable when authenticated and writable by admins. |

For exact paths and request/response details, see the route files under `backend/src/routes/`. Export routes return downloadable Excel or PDF files where applicable.

## Weekly rota planning

The Admin-only Weekly Rota Planner is for future planned shifts and stores its rotas, employee availability, and employee/date assignment claims separately from attendance and payroll. Weeks run Sunday through Saturday using date-only keys; assignments require active employees/shops, valid shop opening hours, and confirmed availability. A database unique index enforces no more than one shop assignment per employee per date, including concurrent edits.

Manual rota planning does not require an AI credential. To enable AI text generation, configure `ROTA_AI_API_KEY` only in the backend hosting environment. `ROTA_AI_MODEL` and `ROTA_AI_BASE_URL` may optionally select a compatible chat-completions provider/model. AI output is validated by the backend and saved as a draft; it is never published automatically. Voice entry uses browser speech recognition where available, displays the transcript for administrator review/editing, then submits that confirmed text through the same AI generation flow. If the browser does not support speech recognition, use text entry instead.

Availability and rota updates are independent of attendance, salary, payments, and bonuses. Use a MongoDB replica set or sharded cluster for transaction-backed concurrent assignment updates, as with the existing salary/payment flows.

## Security and operational notes

- Production requires a configured MongoDB URI, a non-placeholder JWT secret of at least 32 characters, and at least one configured browser origin (`ADMIN_WEB_URL` or `CORS_ORIGINS`).
- Payment, salary-balance, and ledger writes are committed together in a MongoDB transaction; deploy on a replica set or sharded cluster.
- CORS origins are exact matches. Requests without an `Origin` header are allowed for native clients and command-line tools; this is not a substitute for bearer-token authorization.
- API JSON bodies are limited to 1 MB. Error responses avoid returning internal exception details in production; server diagnostics are written to the backend process log.
- Admin currently stores its bearer token in browser `localStorage`. This exposes the token to script running in that origin; deploy only with appropriate XSS protections and HTTPS. Mobile uses `expo-secure-store` on native platforms and a web storage fallback when running on web.
- No database backup or automated restore configuration is included. Before deployment, configure and test scheduled MongoDB backups and a restore procedure using your hosting provider's supported tooling. Back up deployment secrets through a separate secure secret-management process.
- Use TLS for all deployed web and API traffic. Do not put real secrets into `.env.example`, source control, client bundles, or logs.
- If any earlier environment template or frontend bundle contained live credentials, treat them as exposed and rotate them before deployment.

## Deployment checklist

The repository is a monorepo. Connect it to GitHub, then create two Vercel projects from that same repository:

1. **Backend API:** Set the Vercel project Root Directory to `backend`. Vercel detects the Express app exported from `src/index.js`; the local listener is in `src/server.js` and is not started by the serverless deployment. The API keeps its `/api/...` routes.
2. Provision a production MongoDB database on a replica set or sharded cluster, and verify backups/restoration before accepting production writes. Configure Atlas network access for the deployed backend without exposing the database to the public internet unnecessarily.
3. In the backend Vercel project's Production Environment Variables, set `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, and `ADMIN_WEB_URL` to the exact HTTPS origin of the Admin site (for example, `https://your-admin.vercel.app`, without a path or trailing slash). You may use `CORS_ORIGINS` for a comma-separated list of exact additional origins. Use a unique random JWT secret of at least 32 characters; never use the value from `.env.example`. Configure preview origins separately if preview deployments need browser access.
4. **Admin site:** Create a second Vercel project from the same GitHub repository and set its Root Directory to `Admin`. `Admin/vercel.json` configures the Vite build, `dist` output, and SPA route fallback. Set `VITE_API_URL` in the Vercel project's Production Environment Variables to the backend's HTTPS URL ending in `/api` (for example, `https://your-api.vercel.app/api`). This value is public frontend configuration, not a secret; the production build fails if it is missing or not HTTPS. If using Vercel Preview deployments, also set `VITE_API_URL` for the Preview environment and allow the corresponding Admin preview origin(s) through the backend's `CORS_ORIGINS`.
5. Configure the mobile release build with the HTTPS `EXPO_PUBLIC_API_URL` ending in `/api` in the EAS environment used for that build. Do not put this setting or any credentials in tracked files, and do not publish automatically from this repository.
6. Run the non-destructive checks below against the release candidate. Do not run the legacy DB-mutating suites against production. Perform controlled, read-only smoke tests of `/api/health` and authenticated Admin flows after deployment. No deployment URL or production credentials are stored in this repository.

Keep local `.env` files untracked. The root `.gitignore` excludes local environment files, dependency folders, build output, logs, and native signing credentials while allowing the `.env.example` templates. Configure Vercel and EAS variables through their dashboards/CLI secret stores, not by editing those templates.

## Tests and builds

Backend business-logic test (no database connection):

```powershell
cd backend
npm test
npm run test:phase10
```

Additional Phase 1–9 scripts under `backend/src/tests/` include live database/API fixtures and may create, update, or delete test records. Inspect each suite and use only an isolated, disposable test database before running it; never point them at production.

The legacy `npm run seed` script deletes collections before inserting sample records. It is gated against production and requires all of `ALLOW_DESTRUCTIVE_SEED=true`, an exact `SEED_TARGET_DATABASE` match with the database name in `MONGO_URI`, and a private `SEED_USER_PASSWORD` of at least 12 characters. Use it only with a disposable database; never run it against production or historical data.

Admin production build and lint:

```powershell
cd Admin
npm run build
npm run lint
```

Mobile TypeScript validation and lint:

```powershell
cd usman
npx tsc --noEmit
npm run lint
```

Keep production configuration and deployment credentials outside the applications' public source.
#   R o t a _ s y s t e m  
 