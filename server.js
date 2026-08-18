const express = require("express");
const session = require("express-session");
const fetch = require("node-fetch");
const path = require("path");
const app = express();
const dotenv = require("dotenv");
dotenv.config();

const ENVS = ["UNLOCK_URL", "DOORS", "APP_PASSWORD", "SESSION_SECRET", "NODE_ENV"];
for (const env of ENVS) {
  if (!process.env[env]) {
    console.error(`Missing required environment variable: ${env}`);
    process.exit(1);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
      secure: (process.env.NODE_ENV || "").toLowerCase() === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

// --- Auth middleware: blocks everything below unless logged in ---
function requireAuth(req, res, next) {
  if (req.session?.loggedIn) {
    return next();
  }

  // Public login resources
  const publicPaths = [
    "/login",
    "/login.html",
    "/styles.css",
    "/favicon.png",
    "/manifest.json"
  ];

  if (publicPaths.includes(req.path)) {
    return next();
  }

  // Send browser requests to login
  if (req.accepts("html")) {
    return res.redirect("/login.html");
  }

  // API requests get 401 instead of HTML
  return res.status(401).json({
    ok: false,
    error: "Not authenticated"
  });
}

// Login page is public; everything else needs requireAuth
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", (req, res) => {
  console.log("login attempt", req.body);
  const { password } = req.body;
  if (password === process.env.APP_PASSWORD) {
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
const DOORS = (process.env.DOORS || "")
  .split(",")
  .map(name => name.trim())
  .filter(Boolean)
  .reduce((acc, name, index) => {
    acc[index + 1] = name;
    return acc;
  }, {});

async function triggerUnlock(epName) {
  const body = new URLSearchParams({ epName });

  const r = await fetch(process.env.UNLOCK_URL, {
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