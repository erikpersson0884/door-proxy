const express = require("express");
const session = require("express-session");
const fetch = require("node-fetch");
const fs = require("node:fs");
const path = require("path");
const app = express();

const environment = process.env;
const ENVS = ["UNLOCK_URL", "DOORS", "APP_PASSWORD", "SESSION_SECRET", "NODE_ENV"];
for (const env of ENVS) {
  // Try to load environment from file
  const fileEnv = env + "_FILE";
  const path = environment[fileEnv];
  if (path) {
    try {
      const secret = fs.readFileSync(path);
      environment[env] = secret;
    } catch (err) {
      console.error(err)
      console.error(`Failed to read file for environment ${fileEnv}`);
      process.exit(1);
    }
  }

  if (!environment[env]) {
    console.error(`Missing required environment variable: ${env}`);
    process.exit(1);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1);

app.use(session({
  secret: environment.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
      secure: (environment.NODE_ENV || "").toLowerCase() === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

// --- Auth middleware: blocks everything below unless logged in ---
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path === "/login" || req.path === "/login.html" || req.path==="/styles.css") return next();
  return res.redirect("/login.html");
}

// Login page is public; everything else needs requireAuth
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", (req, res) => {
  console.log("login attempt", req.body);
  const { password } = req.body;
  if (password === environment.APP_PASSWORD) {
    req.session.loggedIn = true;
    console.log("login success");
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: "Wrong password" });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.use(requireAuth);
app.use(express.static(path.join(__dirname, "public")));

// Parse DOORS="Name One,Name Two" into { 1: "Name One", 2: "Name Two", ... }
const DOORS = (environment.DOORS || "")
  .split(",")
  .map(name => name.trim())
  .filter(Boolean)
  .reduce((acc, name, index) => {
    acc[index + 1] = name;
    return acc;
  }, {});

async function triggerUnlock(epName) {
  const body = new URLSearchParams({ epName });

  const r = await fetch(environment.UNLOCK_URL, {
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

app.get("/doors", (req, res) => {
  const list = Object.entries(DOORS).map(([id, name]) => ({ id, name }));
  res.json(list);
});

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