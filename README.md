# Diagnostics Workflow Portal

An educational diagnostics workflow using synthetic records. Staff register samples, move them through processing, and enter results. Reviewers approve or reject submitted results. Only approved results appear in result history. No real patient data should be entered.

## Run locally

Prerequisites: Node.js 20+, Docker with Compose.

1. `docker compose up -d db`
2. `cd server && cp .env.example .env && npm install && npm run seed && npm run dev`
3. In a second terminal: `cd client && npm install && npm run dev`
4. Open `http://localhost:5173`.

In a third terminal, run `cd server && npm run test:e2e` to exercise the complete API workflow. The server must already be running. The test creates one synthetic sample with a unique code; it does not delete existing records. It checks role restrictions, rejection and correction, approval, approved-only search, and audit event order, actors, notes, and access. A passing test prints `PASS`.

## Update an existing installation

Stop the backend and frontend with Ctrl+C, then copy the updated `client/src`, `server/src/index.js`, `server/test/workflow.mjs`, and README into your existing project. Preserve your `server/.env`. No new dependencies or database migration are needed. Start both apps again using `npm run dev` in their respective folders. Do not run `npm run seed` when updating: it deletes existing demo records.

## Sample audit timeline

Click **View timeline** beneath a sample code in either Sample queue or Result history. Staff and reviewers can read the same timeline. It shows successful workflow actions from earliest to latest, including the actor's email and role, the timestamp in your browser's local timezone, and any review note. Rejected-result notes remain visible after correction and approval. There is no API to edit timeline entries.

Seeded samples from the initial version may have no recorded events. New workflow actions are recorded normally; no historical events are fabricated. Run the extended end-to-end test and view its synthetic sample for a complete six-event timeline.

Demo accounts created by the seed script (change passwords before any deployment):

| Role | Email | Password |
| --- | --- | --- |
| Staff | staff@example.test | StaffDemo123! |
| Reviewer | reviewer@example.test | ReviewerDemo123! |

The API runs at `http://localhost:4000`. The Vite development server proxies `/api` to it. Start the seed only against a disposable local database: it resets demo users and samples.

## Workflow

`registered → in_progress → result_entered → approved` or `rejected`. A rejected result can be corrected by staff and resubmitted. Result history includes approved results only. Search supports sample code and test name. The sample code is a synthetic identifier; no names, dates of birth, or clinical records are stored.

## API

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | Obtain bearer token |
| GET | `/api/samples?q=&status=` | Staff, reviewer | List/search work queue |
| GET | `/api/samples/:id/audit` | Staff, reviewer | Read sample activity, actors, and review notes |
| POST | `/api/samples` | Staff | Register sample |
| PATCH | `/api/samples/:id/status` | Staff | Start processing |
| POST | `/api/samples/:id/result` | Staff | Enter or correct result |
| POST | `/api/samples/:id/review` | Reviewer | Approve or reject |
| GET | `/api/results?q=` | Staff, reviewer | Search approved result history |

The server validates inputs and uses parameterized SQL. Status transitions and review writes run in transactions with row locks. JWT auth, hashed passwords, rate limiting, and role checks are included. This is a portfolio MVP, not a validated laboratory information system: a real deployment would additionally need organization-specific access policy, immutable audit retention, regulatory review, backup and recovery, secure secret management, and clinical validation.

## Project layout

`server/src` contains the API, schema and seed; `client/src` contains the React app. Environment values live in `server/.env` and are not committed.

## Free public demo

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Render Free + Aiven Free MySQL setup. Production serves `client/dist` through Express and requires verified database TLS. `/health` returns 200 when MySQL is reachable or 503 otherwise. `npm run initialize` creates missing demo records without deleting existing data; `npm run test:initialize` verifies preservation and repeatability. Use initialization on deployment startup, never the resetting seed command.
