# Rove Trip OS

Motorcycle trip planner with two-wheeler routing, in-app navigation, weather-aware timing, route safety stops, budgets, group expenses, journals, and destination photography.

## Run locally

```powershell
npm install
npm run dev -- --force
```

Without Firebase environment values the app remains usable in clearly labelled local demo mode.

## Connect Firebase

1. Create a Firebase project and register a Web app.
2. In Firebase Authentication, enable the **Email/Password** provider.
3. Create a Firebase Realtime Database, Cloud Firestore database, and Cloud Storage bucket.
4. Copy `.env.example` to `.env.local` and replace every placeholder with the web configuration from Firebase Project settings.
5. Install the Firebase CLI, sign in, select your project, and deploy the included owner-only rules:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only database,firestore:rules,storage
```

6. Restart Vite after changing environment values:

```powershell
npm run dev -- --force
```

When configured with `VITE_FIREBASE_DATABASE_URL`, Firebase Authentication manages email/password accounts, Realtime Database stores saved trips, groups, expenses, settings, and ride history, and Cloud Storage stores journal photos. Firestore remains the fallback document store when no Realtime Database URL is supplied and stores matching metadata for each photo.

## Place photography

Named destinations and attractions request coordinate-matched photos from Wikipedia/Wikimedia. Restaurants and stays first use photos explicitly linked in OpenStreetMap, then require a Wikimedia filename match for the venue name and destination; a nearby photo is accepted only within 2 km and only when its filename matches the business. Cards show the image distance and source, while places without a trustworthy match retain bundled category artwork. OpenStreetMap remains the source for location and amenity data.
