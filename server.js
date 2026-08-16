const express = require("express");
const fetch = require("node-fetch");
const app = express();

async function triggerUnlock() {
  const body = new URLSearchParams({ epName: process.env.SGS_EP_NAME });

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

// Existing POST endpoint (header-based auth)
app.post("/unlock", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.PROXY_AUTH_TOKEN}`) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    res.json(await triggerUnlock());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// New GET endpoint (token in query string, for browser-URL convenience)
app.get("/unlock", async (req, res) => {
  if (req.query.token !== process.env.PROXY_AUTH_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  try {
    res.json(await triggerUnlock());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(3000, () => console.log("door-proxy listening on :3000"));