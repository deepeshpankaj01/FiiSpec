# Deployment

Target architecture: **Next.js web app + server API on Vercel (Hobby, `bom1`) → Firebase Authentication → Cloud Firestore (asia-south1) → Claude (optional)**. Everything runs on the Firebase **Spark** (free) plan: no Cloud Functions, Cloud Storage or Secret Manager.

## 1. Firebase project (once)
1. Create a Firebase project (Spark plan is enough).
2. **Authentication** → Get started → enable **Email/Password** and **Google**.
3. **Firestore Database** → Create database → **production mode**, location **`asia-south1` (Mumbai)**.
4. **Project settings → Your apps** → register a **Web app** and note its config.
5. **Project settings → Service accounts** → **Generate new private key**. Save it as `.secrets/firebase-admin.json` (git- and Vercel-ignored). The server API and the admin scripts use it.
6. `.firebaserc` maps the alias `production` to the project id (`default` stays `demo-fiispec` for the emulators). Change it if your project id differs.

## 2. Deploy Firestore rules and indexes
Either log in with an account that has access to the project (`firebase login`), or use the service account:
```bash
GOOGLE_APPLICATION_CREDENTIALS=.secrets/firebase-admin.json firebase deploy --only firestore --project production
```

## 3. Seed the knowledge base
```bash
GOOGLE_APPLICATION_CREDENTIALS=.secrets/firebase-admin.json GCLOUD_PROJECT=<projectId> npm run seed:production
```
`--kb-only` never creates demo users; the script refuses to create them outside the emulator. Afterwards, prefer the admin console's **controlled ingestion** for authorised data.

## 4. Deploy to Vercel
Set these in the Vercel project (**Settings → Environment Variables**, Production), or with `vercel env add <NAME> production`:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_USE_EMULATORS` | `false` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `…_API_KEY`, `…_AUTH_DOMAIN`, `…_STORAGE_BUCKET`, `…_APP_ID`, `…_MESSAGING_SENDER_ID` | from the web app config (public identifiers) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | contents of `.secrets/firebase-admin.json` (raw JSON or base64) |
| `CRON_SECRET` | a long random string; Vercel Cron sends it to `/api/cron/sweep` |
| `ANTHROPIC_API_KEY` | optional; without it FiiSpec runs deterministic-only and says so |
| `AI_MODEL` | optional; default `claude-opus-5` |

Then deploy from the repository root:
```bash
vercel link          # once: create or select the Vercel project
vercel --prod
```
- `NEXT_PUBLIC_*` values are inlined at build time: redeploy after changing them.
- `vercel.json` pins the functions to `bom1` (Mumbai, next to Firestore) and schedules the stale-analysis sweep daily (the Hobby limit).
- The API allows 300 s per request (`maxDuration`, the Hobby ceiling). An analysis run stops itself at `PIPELINE_DEADLINE_MS` (250 s, leaving room for reading an uploaded document in the same invocation) and is marked `PROCESSING_TIMEOUT`, so it can be retried.
- Uploads are limited to 4 MB: Vercel caps function request bodies at 4.5 MB.

## 5. Allow the Vercel domain in Firebase Auth
**Authentication → Settings → Authorized domains** → add the production domain (e.g. `fiispec.vercel.app`) and any custom domain. Google sign-in fails on domains that are not listed.

## 6. First administrator
Register through the web app, then:
```bash
GOOGLE_APPLICATION_CREDENTIALS=.secrets/firebase-admin.json GCLOUD_PROJECT=<projectId> npm run grant-admin -- --email you@example.gov.in
```
The user signs out and in again (or the token refreshes) to receive the ADMIN claim.

## 7. App Check (optional, after the first deploy)
1. **App Check** → register the web app with **reCAPTCHA Enterprise**, listing the Vercel domain.
2. Set `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` and redeploy; confirm the app still works.
3. Set `ENFORCE_APP_CHECK=true` and redeploy. The API then rejects requests without a valid `X-Firebase-AppCheck` token.

## 8. Post-deploy checklist
- [ ] Sign up, create an organisation, run the EV charger demo case, and open every results tab.
- [ ] Upload a DOCX tender (under 4 MB) and confirm the analysis completes.
- [ ] Export PDF and DOCX.
- [ ] Admin console → System health shows counters; Benchmark cases → run (deterministic).
- [ ] Vercel → Settings → Cron Jobs lists `/api/cron/sweep`.
- [ ] Verify key standards in the admin console before relying on "Current (verified)" states.

## Spark plan limits
The Firestore free tier (50K reads, 20K writes and 1 GiB per day/total) comfortably covers demos; each analysis costs roughly a few hundred reads and writes, and the knowledge base is cached per server instance for five minutes. Firebase Authentication's free tier covers email/password and Google sign-in.

## Local development (emulators)
See the README. In short: `npm run emulators`, `npm run seed`, `npm run dev`. The Next.js dev server serves the API and, with `NEXT_PUBLIC_USE_EMULATORS=true`, points the Admin SDK at the Auth and Firestore emulators. The Firestore emulator needs Java 11+. A portable JRE placed in `.tools/` is picked up by `scripts/with-java.mjs`.
