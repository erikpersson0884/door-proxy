const express = require("express");
const fetch = require("node-fetch");
const app = express();

// Map door IDs to their SGS entry point names
const DOORS = {
  1: process.env.SGS_EP_NAME_1,
  2: process.env.SGS_EP_NAME_2,
};

async function triggerUnlock(epName) {
    const body = new URLSearchParams({ epName });

    const r = await fetch(process.env.SGS_UNLOCK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
        },
        body: body.toString(),
        redirect: "manual",
    });

    const location = r.headers.get("location") || "";
    const success = r.status === 302 && location.includes("IsError=False");

    return { ok: success, status: r.status, location };
  }

  function resolveDoor(doorId, res) {
      const epName = DOORS[doorId];
      if (!epName) {
          res.status(400).json({ ok: false, error: `unknown door id: ${doorId}` });
          return null;
      }
      return epName;
}

// POST /unlock/:doorId  (header-based auth)
app.post("/unlock/:doorId", async (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.PROXY_AUTH_TOKEN}`) {
        return res.status(401).json({ error: "unauthorized" });
    }
    const epName = resolveDoor(req.params.doorId, res);
    if (!epName) return;
    try {
        res.json(await triggerUnlock(epName));
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /unlock/:doorId?token=...  (browser-URL convenience)
app.get("/unlock/:doorId", async (req, res) => {
    if (req.query.token !== process.env.PROXY_AUTH_TOKEN) {
        return res.status(401).json({ error: "unauthorized" });
    }
    const epName = resolveDoor(req.params.doorId, res);
    if (!epName) return;
    try {
        res.json(await triggerUnlock(epName));
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.listen(3000, () => console.log("door-proxy listening on :3000"));