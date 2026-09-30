# Free demo deployment: Render + Aiven MySQL

Use the Free plan on both services. This deploys the built React app and Express API together on one Render URL. MySQL runs separately on Aiven. A sleeping Render app may take about a minute to wake up.

## 1. Update your project

Copy the deployment update files into the matching locations in your existing project, preserving `server/.env`. Commit and push. Wait for GitHub Actions to pass.

Updated files: `.node-version`, `.github/workflows/ci.yml`, `server/package.json`, `server/src/index.js`, `server/src/db.js`, `server/src/initialize.js`, `server/test/initialize.mjs`, `server/.env.example`, and this guide.

## 2. Create the database

1. Visit https://console.aiven.io/ and sign up.
2. Create a **MySQL** service and explicitly select the **Free** plan. Avoid paid or trial-only plans.
3. Choose an available region near your Render service when possible.
4. Wait for the database to be running.
5. In its Overview / Connection information, keep the host, port, user, password, and database name available privately. Use the database name provided by Aiven, often `defaultdb`.
6. Download its **CA certificate**. Open the downloaded PEM file in a text editor. You will paste its full contents into Render's `DB_SSL_CA` variable.

Do not put the database password or your JWT secret in GitHub or chat.

## 3. Create the web service

1. Visit https://dashboard.render.com/ and sign in.
2. Select **New → Web Service**, connect GitHub, and select `diagnostics-workflow-portal`.
3. Set the following:

| Setting | Value |
| --- | --- |
| Name | `diagnostics-workflow-portal` or an available name |
| Branch | `main` |
| Runtime / Language | Node |
| Root directory | Leave blank |
| Build command | `npm ci --prefix server && npm ci --prefix client && npm run build --prefix client` |
| Start command | `cd server && npm run initialize && npm start` |
| Instance type | **Free** |
| Health check path | `/health` |

4. Set these environment variables before deploying:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `TRUST_PROXY_HOPS` | `1` |
| `DB_HOST` | Your Aiven host |
| `DB_PORT` | Your Aiven port; do not assume 3306 |
| `DB_USER` | Your Aiven username |
| `DB_PASSWORD` | Your Aiven password |
| `DB_NAME` | Your Aiven database name |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | Full CA PEM certificate, including BEGIN/END lines |
| `JWT_SECRET` | A fresh random secret generated privately |

Render supplies `PORT` automatically. Generate a JWT secret locally with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`, then paste it directly into Render. `DB_SSL_CA` supports actual newlines or literal `\n` sequences. Certificate verification remains enabled.

5. Create/deploy the service. The startup initializer creates missing tables, demo accounts, and one sample without deleting existing data. **Do not use `npm run seed` as the start command.**
6. Once Render assigns the public URL, set `CLIENT_ORIGIN` to that exact URL, for example `https://your-service.onrender.com`, with no trailing slash. Save the change and let the service redeploy.

## 4. Verify the demo

1. Open `<your-render-url>/health`; expect `{"status":"ok"}`.
2. Open the public URL and sign in using the demo credentials from README.
3. Register a synthetic sample as staff, start processing, and submit its result.
4. Sign in as reviewer; reject it with a note, then correct/resubmit as staff and approve as reviewer.
5. Check Result history and View timeline.
6. Reopen the service after a restart and confirm your records remain.

The public credentials are intentionally shared for a synthetic portfolio demo. Do not enter real patient records. Render Free has usage limits and sleeps after inactivity; Aiven may power off inactive free services. Keep both plans Free and avoid adding a payment method for this deployment.

## Troubleshooting

- **Unknown database:** use the Aiven-provided database name.
- **Certificate error:** paste the complete CA certificate into `DB_SSL_CA`; keep `DB_SSL=true`.
- **Connection timeout:** check the Aiven service is running and its host/port match the Overview page.
- **React build missing:** leave the Render root directory blank and use the full build command above.
- **Login fails:** inspect startup logs for successful initialization; existing account passwords are preserved.

Sources: https://render.com/docs/free, https://render.com/docs/web-services, https://aiven.io/docs/products/mysql/concepts/mysql-free-tier, https://aiven.io/docs/platform/concepts/tls-ssl-certificates
