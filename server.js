import express from "express";
import sqlite3 from "sqlite3";
import crypto from "crypto";
import cors from "cors";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());

/* ================= DB ================= */

// ✅ Ensure writable DB location
const DB_PATH = "./news.db";

// Create file if missing (Railway-safe)
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, "");
}

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) console.error("DB ERROR:", err.message);
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      summary TEXT,
      category TEXT,
      hash TEXT UNIQUE,
      createdAt INTEGER
    )
  `);
});

/* ================= HELPERS ================= */

function clean(t = "") {
  return t
    .replace(/<[^>]+>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeHash(t, s) {
  return crypto.createHash("sha1").update(t + s).digest("hex");
}

/* ================= INGEST ================= */

app.post("/api/news/raw", (req, res) => {
  try {
    const { title, summary, category } = req.body;

    if (!title || !summary) {
      return res.json({ skipped: "missing" });
    }

    const t = clean(title);
    const s = clean(summary);

    if (t === s) {
      return res.json({ skipped: "same-as-title" });
    }

    const hash = makeHash(t, s);

    db.run(
      `INSERT OR IGNORE INTO news
       (title, summary, category, hash, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [t, s, category || "State", hash, Date.now()],
      function () {
        if (this.changes === 0) {
          return res.json({ skipped: "duplicate" });
        }
        res.json({ saved: true });
      }
    );
  } catch (e) {
    console.error("INGEST ERROR:", e);
    res.status(500).json({ error: "ingest-failed" });
  }
});

/* ================= FEED ================= */

app.get("/api/feed", (req, res) => {
  db.all(
    `SELECT title, summary, category, createdAt
     FROM news
     ORDER BY id DESC
     LIMIT 100`,
    [],
    (err, rows) => {
      if (err) {
        console.error("FEED ERROR:", err);
        return res.status(500).json([]);
      }
      res.json(rows || []);
    }
  );
});

/* ================= HEALTH ================= */

app.get("/", (_, res) => {
  res.send("OK");
});

/* ================= START ================= */

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Backend running on port", PORT);
});
