# Door Controller Web App

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

## Project structure

```
door-controller/
├── Dockerfile
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Environment variables

| Variable      | Required | Example                                                   | Description |
|---------------|----------|-------------------------------------------------------------|--------------|
| `UNLOCK_URL`  | Yes      | `https://portal.example.com/DoorControl/PerformUnlock`      | The exact endpoint the portal's own site POSTs to when unlocking a door. (SGS for example uses https://hemma.sgs.se/DoorControl/PerformUnlock) |
| `DOORS`       | Yes      | `Front Gate,Back Entrance,Garage`                            | Comma-separated list of door names, **in the exact format the portal expects** (this is sent as the `epName` form field). Order matters — first entry becomes door id `1`, second becomes `2`, and so on. |

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
      - UNLOCK_URL=${UNLOCK_URL}
      - DOORS=${DOORS}
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
```

### Steps

1. Deploy this stack in Portainer (Stacks → Add stack), setting the two
   environment variables above.
2. Point a DNS record (e.g. via Cloudflare) at your home server's public IP,
   matching the `Host()` rule in the Traefik label.
3. Visit `https://door.yourdomain.com` — buttons are generated automatically
   from `DOORS`.

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

## API reference (internal)

| Route              | Method | Description |
|---------------------|--------|--------------|
| `/`                 | GET    | Serves the web UI. |
| `/doors`            | GET    | Returns the parsed door list as JSON: `[{ "id": "1", "name": "Front Gate" }, ...]`. Used by the frontend to build buttons dynamically. |
| `/trigger/:doorId`  | POST   | Triggers the unlock request for the given door id. Returns `{ ok, status, location }`. |

## Security notes

- This app is designed to be reachable from the public internet so it works
  away from home — that also means anyone who reaches the URL can trigger a
  door unlock, since there is currently no authentication layer.
- Recommended hardening, not yet implemented here:
  - **HTTP Basic Auth** at the Traefik layer (a couple of extra labels, no
    code change) so a login prompt gates access to the whole app.
  - **IP allowlisting** in Traefik if requests will only ever come from a
    known set of source IPs (e.g. a backend server, not end-user browsers
    directly).
  - Consider whether this should sit behind Cloudflare Access or similar for
    an additional authentication layer, since it's a page that controls
    physical building access.
- No portal credentials or session cookies are stored by this app — it
  relies entirely on the portal's IP-based access check, not a login.

## Known limitations

- Assumes the portal's access control is IP-based with no login required
  (true for at least one property management system this was built against —
  confirm this holds for your own portal before relying on it).
- Button colors alternate between two styles (`btn-open` / `btn-close`) as
  defined in `styles.css`; add more style classes there if you have more than
  two doors and want distinct colors per button.
