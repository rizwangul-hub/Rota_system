# Rota System Admin

Rota System is the React/Vite workforce management dashboard.

## Run locally

1. Install dependencies with `npm install`.
2. Set `VITE_API_URL` to the existing backend API URL when it differs from the production default.
3. Start the app with `npm run dev` and open the local URL printed by Vite.

## Install Rota System on Windows

The dashboard can be installed as a Progressive Web App (PWA) in a supported browser. It uses the browser's official installation prompt when available. In Chrome or Edge, select **Install Rota System** in the browser menu if the in-page install prompt is unavailable.

The deployed Admin website must be served over HTTPS for installation. Open the same deployed website address used for the existing dashboard; the project does not define a separate public frontend URL. Do not use the backend API address ending in `/api` as the website address.

The PWA manifest and branded icons are served from `public/manifest.webmanifest` and `public/icons/`. No service worker is installed: the dashboard needs an online backend, and caching authenticated application pages could serve stale data or interfere with session handling.

## Build and deploy

- Build the production website with `npm run build`.
- The built files are written to `dist/`.
- Deploy through the existing Vercel project and its configured environment variables. After deployment, open the deployed HTTPS site and install it from Chrome or Edge.

This project provides browser-based PWA installation, not a Windows `.exe` installer.
