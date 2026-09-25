# Deployment

Target architecture: **Next.js on Firebase App Hosting → Firebase Authentication → Cloud Functions (asia-south1) → Firestore / Storage → Claude**.

## 1. Project setup (once)
1. Create a Firebase project on the **Blaze** plan. Choose Firestore and Storage locations in India (e.g. `asia-south1`) to match the functions region.
2. **Authentication** → enable Email/Password and Google. Add your App Hosting domain to *Authorized domains*.
3. **Firestore** → create the database in production mode.
4. **Storage** → create the default bucket.
5. **Project settings → Your apps** → register a Web app and note its config.
6. **App Check** → register the web app with reCAPTCHA Enterprise and note the site key.
7. Locally: `firebase login`, then `firebase use --add` and choose the project. Keep `demo-fiispec` for emulators.

## 2. Configuration
- **`apphosting.yaml`:** replace the `your-…` placeholders with the web config and the reCAPTCHA Enterprise site key. They are public identifiers, needed at BUILD and RUNTIME.
- **`functions/.env.<projectId>`:**
  ```
  AI_MODEL=claude-opus-5
  ENFORCE_APP_CHECK=true
  ```
- **AI key (optional; without it FiiSpec runs deterministic-only and says so):**
  ```bash
  firebase functions:secrets:set ANTHROPIC_API_KEY
  ```

## 3. Deploy backend
```bash
npm --prefix functions install
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```
- On first deploy, accept the prompt that grants the Cloud Storage service agent permission to read Firestore. The Storage rules check the analysis record with `firestore.get()`.
- The stale-analysis sweeper uses Cloud Scheduler. The first deploy enables the required APIs.

## 4. Seed the knowledge base
Use Application Default Credentials (`gcloud auth application-default login`) or a service account:
```bash
GCLOUD_PROJECT=<projectId> npm --prefix functions run seed -- --kb-only
```
`--kb-only` never creates demo users; the script refuses to create them outside the emulator. Afterwards, prefer the admin console's **controlled ingestion** for authorised data.

## 5. First administrator
Register through the web app, then:
```bash
GCLOUD_PROJECT=<projectId> npm --prefix functions run grant-admin -- --email you@example.gov.in
```
The user signs out and in again (or the token refreshes) to receive the ADMIN claim.

## 6. Deploy the web app (App Hosting)
```bash
firebase apphosting:backends:create --project <projectId>
```
- Connect the GitHub repository, set root directory `/` and live branch `main`, and choose a region.
- App Hosting builds with `npm run build` on every push and injects the variables from `apphosting.yaml`.
- To build locally first: `npm run build` (all routes compile; `/analysis/[id]` and `/standards/[id]` render on demand).

## 7. Post-deploy checklist
- [ ] Sign up, create an organisation, run the EV charger demo case, and open every results tab.
- [ ] Upload a DOCX tender and confirm the analysis completes.
- [ ] Export PDF and DOCX. Exports are returned through the callable, so no bucket CORS configuration is needed.
- [ ] Confirm App Check enforcement: requests from outside the app fail.
- [ ] Admin console → System health shows counters; Benchmark cases → run (deterministic).
- [ ] Verify key standards in the admin console before relying on "Current (verified)" states.

## Local development (emulators)
See the README. In short: `npm run emulators`, `npm run seed`, `npm run dev`. The Firestore and Storage emulators need Java 11+. A portable JRE placed in `.tools/` is picked up by `scripts/with-java.mjs`, which also raises the functions discovery timeout for slow machines.
