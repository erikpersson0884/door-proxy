# Door Controller Web App

<img src="/public/favicon.png" width=150 />

A small self-hosted web app to remotely trigger door unlocks through a property
management portal, without needing to be connected to the building's home network.

Built as a single Node/Express service: it serves a simple button-based web UI
and, when a button is pressed, makes the same authenticated request the
portal's own website would make routed through your home network's internet
connection so the portal's IP-based access check passes.

## How it works

```
Browser (anywhere) 
|
▼
Door-app container (on your home server)
│
▼
Portal's unlock endpoint (sees your home IP)
```

- The container runs on a home server, so
  outbound requests it makes naturally exit through your home internet
  connection.
- The web UI is fully dynamic: doors are read from a single environment
  variable, so adding/removing/renaming a door doesn't require touching code.
- No secrets or door-specific values are hardcoded — everything portal- and property-specific lives in environment variables.
- The app is protected by a single shared password. Anyone accessing the
  page must log in first; the door-control page itself is never served to
  a logged-out visitor.

## Project structure

```
door-controller/
├── Dockerfile
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── login.html
    ├── styles.css
    └── app.js
```

## Environment variables

| Variable      | Required | Example                                                   | Description |
|---------------|----------|-------------------------------------------------------------|--------------|
| `UNLOCK_URL`  | Yes      | `https://portal.example.com/DoorControl/PerformUnlock`      | The exact endpoint the portal's own site POSTs to when unlocking a door. (SGS for example uses https://hemma.sgs.se/DoorControl/PerformUnlock) |
| `DOORS`       | Yes      | `Front Gate,Back Entrance,Garage`                            | Comma-separated list of door names, **in the exact format the portal expects** (this is sent as the `epName` form field). Order matters — first entry becomes door id `1`, second becomes `2`, and so on. |
| `APP_PASSWORD`    | Yes      | `a-strong-shared-password`                                | The password required to log in and see the door-control page. Shared by anyone you give it to — there are no separate per-user accounts. |
| `SESSION_SECRET`  | Yes      | output of `openssl rand -hex 32`                          | Used internally to sign the session cookie so it can't be forged. Not the same as `APP_PASSWORD` — generate a long random value and keep it secret. |
| `NODE_ENV`        | Recommended in production | `production`                                    | When set to `production`, session cookies are marked `secure`, so they are only ever sent over HTTPS. Leave unset for local HTTP testing, but always set this in your real deployment. |

### Finding the correct values for your portal

These values are portal-specific and must be captured from the real site,
not guessed:

1. Open the portal's door-control page in your browser.
2. Open DevTools → Network tab, and keep it open.
3. Click the button that unlocks a given door.
4. Find the resulting POST request in the Network tab (usually named after
   the unlock action) and inspect its request payload/body.
5. Copy the exact field value used to identify that door (e.g. an `epName`
   parameter), preserving accented characters exactly.
6. Repeat for each door, and use the values as your `DOORS` list, in
   whatever order you want them to appear as buttons.
7. Copy the request's destination URL — that's your `UNLOCK_URL`.

## Deployment (Docker / Portainer)

### `docker-compose.yml`

```yaml
services:
  door-app:
    image: ghcr.io/<your-github-username>/door-app:latest
    container_name: door_app
    environment:
      - NODE_ENV=production
      - UNLOCK_URL=${UNLOCK_URL}
      - DOORS=${DOORS}
      - APP_PASSWORD=${APP_PASSWORD}
      - SESSION_SECRET=${SESSION_SECRET}
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik"
      - "traefik.http.routers.doorapp.rule=Host(`doorcontroller-example.yourdomain.com`)"
      - "traefik.http.routers.doorapp.entrypoints=traefik"
      - "traefik.http.services.doorapp.loadbalancer.server.port=3000"
    networks:
      - traefik
    restart: unless-stopped

networks:
  web:
    external: true
```

### `.env`

```
UNLOCK_URL=https://portal.example.com/DoorControl/PerformUnlock
DOORS=Front Gate,Back Entrance,Garage
APP_PASSWORD=a-strong-shared-password
SESSION_SECRET=a-long-random-string-from-openssl-rand
```

### Steps

1. Deploy this stack in Portainer (Stacks → Add stack), setting all four
   environment variables above, plus `NODE_ENV=production`.
2. Point a DNS record (e.g. via Cloudflare) at your home server's public IP,
   matching the `Host()` rule in the Traefik label.
3. Visit `https://door.yourdomain.com` — you'll be redirected to a login
   page first. After entering the correct password, you'll land on the
   door-control page, and buttons are generated automatically from `DOORS`.
4. The login session lasts 7 days per browser before you need to log in
   again.

## CI/CD — building the image

A GitHub Actions workflow builds and publishes a multi-architecture image
(amd64 + arm64, so it runs on both regular servers and a Raspberry Pi) to the
GitHub Container Registry on every push to `main`.

`.github/workflows/docker-publish.yml`:

```yaml
name: Build and Publish Docker Image

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
```

After the first push, make the package public under your GitHub profile →
**Packages** → package settings, so Portainer can pull it without
authentication.

## Authentication

The app sits behind a simple password gate:

1. A visitor loads any page → if they have no valid session, they're
   redirected to `/login.html`.
2. They submit the password → the frontend POSTs it as JSON to `/login`.
3. The server compares it to `APP_PASSWORD`. On a match, it marks the
   session as logged in and returns `{ ok: true }`; the frontend then
   redirects to `/`.
4. From then on, the browser automatically sends its session cookie with
   every request, so the door-control page and its API routes (`/doors`,
   `/trigger/:doorId`) stay accessible without re-entering the password,
   for up to 7 days.
5. Visiting `/logout` (POST) destroys the session, requiring a fresh login.

No password or session data is stored in the browser beyond the signed
session cookie itself — there's no `localStorage` usage and no plaintext
password kept anywhere client-side after submission.

## API reference (internal)

| Route              | Method | Description |
|---------------------|--------|--------------|
| `/login.html`       | GET    | Serves the login page. Publicly accessible — this is the only page a logged-out visitor can reach. |
| `/login`            | POST   | Accepts `{ "password": "..." }` as JSON. If it matches `APP_PASSWORD`, starts a session and returns `{ ok: true }`; otherwise returns `401` with `{ ok: false, error }`. |
| `/logout`           | POST   | Destroys the current session, logging the user out. |
| `/`                 | GET    | Serves the web UI. Requires an active session — logged-out visitors are redirected to `/login.html`. |
| `/doors`            | GET    | Returns the parsed door list as JSON: `[{ "id": "1", "name": "Front Gate" }, ...]`. Used by the frontend to build buttons dynamically. Requires an active session. |
| `/trigger/:doorId`  | POST   | Triggers the unlock request for the given door id. Returns `{ ok, status, location }`. Requires an active session. |

## Security notes

- This app is designed to be reachable from the public internet so it works
  away from home. Access is gated by a single shared password
  (`APP_PASSWORD`) — anyone without it is redirected to the login page and
  cannot reach the door-control page or trigger an unlock.
- The login session is stored as a signed, `httpOnly` cookie, so it can't be
  read or forged from client-side JavaScript. In production
  (`NODE_ENV=production`), the cookie is also marked `secure`, meaning it is
  only ever sent over HTTPS.
- This is a **single shared password**, not per-user accounts — anyone you
  give the password to can open every door listed in `DOORS`. There is no
  audit trail of who unlocked what.
- The login endpoint currently has **no rate limiting or lockout**, so it is
  vulnerable to unlimited password-guessing attempts. For a page that
  controls physical building access, consider adding one of the following if
  this stays running long-term:
  - A basic in-memory or Redis-backed rate limiter (e.g.
    `express-rate-limit`) on `/login`.
  - **IP allowlisting** in Traefik if requests will only ever come from a
    known set of source IPs.
  - Putting the app behind **Cloudflare Access** or similar for a second,
    independent authentication layer in front of this one.
- No portal credentials or session cookies for the underlying property
  portal are stored by this app — the outbound request to the portal relies
  entirely on the portal's own IP-based access check, not a login on their
  side. The password/session described above only protects *this* app, not
  the portal itself.

## Known limitations

- Assumes the portal's access control is IP-based with no login required
  (true for at least one property management system this was built against —
  confirm this holds for your own portal before relying on it).
- Button colors alternate between two styles (`btn-open` / `btn-close`) as
  defined in `styles.css`; add more style classes there if you have more than
  two doors and want distinct colors per button.

# Author
- [@erikpersson0884](https://github.com/erikpersson0884) - Original author and maintainer