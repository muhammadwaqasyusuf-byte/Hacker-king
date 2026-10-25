# Deploying FR-KING AURA with MongoDB

## Architecture

- **Frontend:** Vite, React, and Tailwind CSS, built into `dist`.
- **API:** Express, exposed through the Vercel function in `api/index.ts`.
- **Database:** MongoDB Atlas. License keys, app configuration, and signals are stored in MongoDB; there is no JSON-file, Firebase, or Supabase database fallback.

## Configure MongoDB Atlas

1. Create a MongoDB Atlas cluster and a database user.
2. Add your Vercel deployment's outbound access policy in Atlas Network Access. For development, allow your development machine's IP.
3. Copy the Atlas connection string and replace its username, password, and cluster placeholders.
4. Keep the connection string private. Never put it in browser code or commit it to Git.

## Local development

Create `.env.local` in the repository root (it is ignored by Git) with:

```dotenv
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=frking
ADMIN_PASSWORD=<a-strong-private-password>
API_KEY=<optional-private-master-key>
ALLOW_MASTER_KEY_BYPASS=false
```

The server loads `.env.local` before initializing database configuration. Start the app with `npm run dev`; verify MongoDB using `/api/health`, which reports whether the connection is live.

## Deploy to Vercel

1. Import this repository into Vercel.
2. Set the build command to `npm run build` and the output directory to `dist`.
3. Add `MONGODB_URI`, `MONGODB_DB_NAME`, and a private `ADMIN_PASSWORD` in Vercel's environment variables. Set `API_KEY` only if you need a master key. Set `ALLOW_MASTER_KEY_BYPASS=true` only when that bypass is intended.
4. Deploy and open `https://<your-project>.vercel.app/api/health`. A successful response includes `"database":{"provider":"mongodb","connected":true}`.

The MongoDB URI is server-only and is never returned by the API. Database connection or write failures are returned as errors; the app does not silently fall back to local files.

## Existing data

This version no longer reads the previous local JSON, Firebase, or Supabase stores. Export or migrate any records you need into the MongoDB `licenses`, `signals`, and `config` collections before retiring those data sources.
