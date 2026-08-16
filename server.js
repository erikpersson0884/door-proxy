const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const app = express();

app.use(express.static(path.join(__dirname, "public")));

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

// Called by the button in the browser — no token needed here,
// since the browser only ever talks to this server, never to SGS directly
app.post("/trigger/:doorId", async (req, res) => {
  const epName = DOORS[req.params.doorId];
  if (!epName) {
    return res.status(400).json({ ok: false, error: `unknown door id: ${req.params.doorId}` });
  }
  try {
    res.json(await triggerUnlock(epName));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(3000, () => console.log("door-app listening on :3000"));
