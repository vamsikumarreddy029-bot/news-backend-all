export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (url.pathname === "/run") {
      ctx.waitUntil(run(env));
      return new Response("OK");
    }

    return new Response("Ankusham News Engine OK");
  },

  // ✅ REQUIRED for CRON
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  }
};

/* ================= SOURCES ================= */

const SOURCES = [
  "https://www.tv9telugu.com/feed",
  "https://ntvtelugu.com/feed",
  "https://www.sakshi.com/rss",
  "https://www.eenadu.net/rss",
  "https://www.andhrajyothy.com/rss",
  "https://news.google.com/rss/search?q=Andhra+Pradesh&hl=te&gl=IN&ceid=IN:te",
  "https://news.google.com/rss/search?q=India+cricket&hl=en&gl=IN&ceid=IN:en"
];

/* ================= RUN ================= */

async function run(env) {
  for (const src of SOURCES) {
    let items = [];

    try {
      items = await fetchRSS(src);
    } catch {
      continue;
    }

    for (const it of items.slice(0, 5)) {
      if (!it.title || !isAllowed(it.title)) continue;

      const summary = await generateSummary(it.title, env);
      if (!summary) continue;

      const payload = {
        title: clean(it.title),
        summary,
        category: detectCategory(it.title)
      };

      await save(payload, env);
    }
  }
}

/* ================= FILTER ================= */

function isAllowed(t) {
  const x = t.toLowerCase();

  return !(
    /vastu|share|stock|profit|investment/.test(x) ||
    /movie|cinema|actor|actress|heroine|gossip/.test(x) ||
    /football|messi|fifa/.test(x) ||
    /bihar|nitish|trump|russia|ukraine/.test(x)
  );
}

/* ================= CATEGORY ================= */

function detectCategory(t) {
  const x = t.toLowerCase();

  if (/chandrababu|jagan|ysrcp|tdp|minister|cm/.test(x)) {
    return "Political";
  }

  if (/cricket|ipl|odi|t20|test|bcci|icc|vs/.test(x)) {
    return "Cricket";
  }

  return "State";
}

/* ================= SUMMARY (STRICT) ================= */

async function generateSummary(title, env) {
  try {
    const r = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "mixtral-8x7b-32768",
          temperature: 0.2,
          messages: [
            {
              role: "user",
              content: `
Way2News-style Telugu summary.
Exactly 5 short lines (no numbering).
Each line must fit mobile width.
Must include: Where, When, Who, What happened, Conclusion.
No repetition.
Do NOT copy title.
No generic sentences.

Title: "${title}"
`
            }
          ]
        })
      }
    );

    const j = await r.json();
    const text = clean(j.choices?.[0]?.message?.content || "");

    // ❌ HARD REJECT generic summaries
    if (
      text.length < 80 ||
      text.includes("ఆంధ్రప్రదేశ్‌లో వెలుగులోకి") ||
      text.includes("సంబంధిత అధికారులు") ||
      text === clean(title)
    ) {
      return null;
    }

    return text;
  } catch {
    return null;
  }
}

/* ================= RSS ================= */

async function fetchRSS(url) {
  const xml = await (await fetch(url)).text();

  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(i => ({
      title: extract(i[1], "title")
    }))
    .filter(i => i.title);
}

function extract(x, t) {
  const m = x.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, "i"));
  return m ? clean(m[1]) : "";
}

function clean(t = "") {
  return t
    .replace(/<[^>]+>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ================= SAVE ================= */

async function save(doc, env) {
  await fetch(`${env.RAILWAY_BACKEND_URL}/api/news/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc)
  });
}
