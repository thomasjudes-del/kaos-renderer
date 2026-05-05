const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

function sanitizeText(value, fallback = "") {
  return String(value || fallback)
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 700);
}

function getVerdictColor(verdict) {
  const v = String(verdict || "").toUpperCase();
  if (v === "FULFILLED") return "#16a34a";
  if (v === "PARTLY TRUE") return "#f59e0b";
  if (v === "UNVERIFIABLE") return "#6b7280";
  return "#ff1f2d";
}

function buildPexelsQuery(payload) {
  const explicit = sanitizeText(payload.background_query || "", "");
  if (explicit) return explicit;

  const text = [
    payload.topic,
    payload.short_subject,
    payload.forecaster_name,
    payload.prediction_quote,
    payload.quote
  ].join(" ").toLowerCase();

  if (text.includes("recession") || text.includes("economy") || text.includes("market") || text.includes("inflation")) {
    return "financial district skyline economy markets recession";
  }
  if (text.includes("bitcoin") || text.includes("crypto")) {
    return "crypto trading screen finance technology";
  }
  if (text.includes("tesla") || text.includes("robotaxi") || text.includes("autonomous") || text.includes("car")) {
    return "autonomous car city road night";
  }
  if (text.includes("election") || text.includes("politic") || text.includes("vote")) {
    return "election ballot voting";
  }
  if (text.includes("ai") || text.includes("artificial intelligence") || text.includes("technology")) {
    return "artificial intelligence data center";
  }

  return "business future technology night";
}

async function fetchPexelsPhoto(payload) {
  const apiKey = process.env.PEXELS_API_KEY;
  const query = buildPexelsQuery(payload);

  if (!apiKey) {
    return {
      used: false,
      query,
      photoId: null,
      photoUrl: null,
      imageUrl: null,
      reason: "PEXELS_API_KEY missing"
    };
  }

  try {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("per_page", "10");

    const response = await fetch(url.toString(), {
      headers: { Authorization: apiKey }
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        used: false,
        query,
        photoId: null,
        photoUrl: null,
        imageUrl: null,
        reason: `Pexels API returned HTTP ${response.status}: ${body.slice(0, 180)}`
      };
    }

    const data = await response.json();
    const photos = Array.isArray(data.photos) ? data.photos : [];

    if (photos.length === 0) {
      return {
        used: false,
        query,
        photoId: null,
        photoUrl: null,
        imageUrl: null,
        reason: "Pexels returned no photos"
      };
    }

    const chosen = photos[0];

    return {
      used: true,
      query,
      photoId: chosen.id ? String(chosen.id) : null,
      photoUrl: chosen.url || null,
      imageUrl: chosen.src && (chosen.src.large2x || chosen.src.large || chosen.original),
      reason: null
    };
  } catch (error) {
    return {
      used: false,
      query,
      photoId: null,
      photoUrl: null,
      imageUrl: null,
      reason: error.message || "Pexels fetch failed"
    };
  }
}

function buildFallbackBackground(topic) {
  const t = String(topic || "").toLowerCase();

  if (t.includes("crypto") || t.includes("bitcoin")) {
    return `
      radial-gradient(circle at 20% 20%, rgba(245,158,11,0.35) 0%, transparent 32%),
      radial-gradient(circle at 80% 70%, rgba(124,45,18,0.42) 0%, transparent 38%),
      linear-gradient(135deg, #020617 0%, #0f172a 55%, #111827 100%)
    `;
  }

  if (t.includes("robotaxi") || t.includes("mobility") || t.includes("tesla") || t.includes("car")) {
    return `
      radial-gradient(circle at 25% 25%, rgba(56,189,248,0.28) 0%, transparent 30%),
      radial-gradient(circle at 82% 70%, rgba(29,78,216,0.36) 0%, transparent 38%),
      linear-gradient(135deg, #020617 0%, #0f172a 55%, #111827 100%)
    `;
  }

  if (t.includes("politic") || t.includes("election")) {
    return `
      radial-gradient(circle at 30% 20%, rgba(239,68,68,0.30) 0%, transparent 32%),
      radial-gradient(circle at 75% 75%, rgba(29,78,216,0.30) 0%, transparent 36%),
      linear-gradient(135deg, #020617 0%, #111827 55%, #1f2937 100%)
    `;
  }

  return `
    radial-gradient(circle at 25% 20%, rgba(220,38,38,0.25) 0%, transparent 32%),
    radial-gradient(circle at 80% 75%, rgba(51,65,85,0.38) 0%, transparent 34%),
    linear-gradient(135deg, #020617 0%, #111827 60%, #030712 100%)
  `;
}

function buildHtml(payload, pexels) {
  const verdict = sanitizeText(payload.verdict, "FAILED").toUpperCase();

  const forecasterName = sanitizeText(
    payload.forecaster_name || payload.speaker_name || payload.short_subject,
    "Jamie Dimon"
  );

  const forecasterContext = sanitizeText(
    payload.forecaster_context || payload.speaker_title || payload.forecaster_title,
    "JPMorgan CEO"
  );

  const predictionQuote = sanitizeText(
    payload.prediction_quote || payload.quote || payload.prediction || payload.short_subject,
    "These are very, very serious things which I think are likely to put the U.S. in some kind of recession six to nine months from now."
  );

  const predictionDate = sanitizeText(
    payload.prediction_date || payload.said_date || payload.date || payload.deadline,
    "Oct 10, 2022"
  );

  const topic = sanitizeText(payload.topic, "");
  const verdictColor = getVerdictColor(verdict);
  const logoUrl = sanitizeText(payload.logo_url || process.env.KAOS_LOGO_URL || "", "");

  const hasPexels = Boolean(pexels && pexels.used && pexels.imageUrl);
  const backgroundCss = hasPexels
    ? `background-image: url("${pexels.imageUrl}"); background-size: cover; background-position: center;`
    : `background: ${buildFallbackBackground(topic)};`;

  const logoHtml = logoUrl
    ? `<img class="logo" src="${logoUrl}" alt="KAOS logo" />`
    : `<div class="brandFallback">KAOS</div>`;

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 1080px;
      height: 1080px;
      overflow: hidden;
      font-family: Arial, Helvetica, sans-serif;
      background: #020617;
    }

    .card {
      width: 1080px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      color: #ffffff;
      ${backgroundCss}
    }

    .overlay {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(2,6,23,0.90) 0%, rgba(2,6,23,0.72) 48%, rgba(2,6,23,0.86) 100%),
        linear-gradient(180deg, rgba(2,6,23,0.30) 0%, rgba(2,6,23,0.92) 100%);
      backdrop-filter: blur(1px);
    }

    .texture {
      position: absolute;
      inset: 0;
      opacity: 0.16;
      background:
        radial-gradient(circle at 18% 18%, rgba(148,163,184,0.16) 0%, transparent 28%),
        radial-gradient(circle at 86% 18%, rgba(255,31,45,0.16) 0%, transparent 30%),
        radial-gradient(circle at 70% 86%, rgba(15,23,42,0.72) 0%, transparent 44%);
    }

    .label {
      position: absolute;
      top: 74px;
      left: 80px;
      z-index: 5;
      padding: 14px 28px;
      border-radius: 14px;
      background: rgba(2,6,23,0.56);
      border: 1px solid rgba(255,255,255,0.12);
      font-size: 34px;
      line-height: 1;
      font-weight: 850;
      color: #f8fafc;
      text-shadow: 0 2px 12px rgba(0,0,0,0.50);
    }

    .stamp {
      position: absolute;
      top: 66px;
      right: 54px;
      z-index: 50;
      transform: rotate(-7deg);
      border: 10px solid rgba(255,255,255,0.82);
      color: #ffffff;
      background: ${verdictColor};
      padding: 30px 58px;
      border-radius: 18px;
      font-size: ${verdict.length > 10 ? "64px" : "84px"};
      line-height: 0.92;
      font-weight: 950;
      letter-spacing: 0.035em;
      text-transform: uppercase;
      box-shadow:
        0 24px 68px rgba(0,0,0,0.55),
        inset 0 0 0 4px rgba(255,255,255,0.24);
    }

    .stamp::after {
      content: "";
      position: absolute;
      inset: 14px;
      border: 4px dashed rgba(255,255,255,0.58);
      border-radius: 11px;
      pointer-events: none;
    }

    .identity {
      position: absolute;
      top: 230px;
      left: 88px;
      right: 360px;
      z-index: 6;
    }

    .name {
      font-size: 68px;
      line-height: 1.02;
      font-weight: 900;
      letter-spacing: -0.04em;
      color: #ffffff;
      text-shadow: 0 4px 28px rgba(0,0,0,0.76);
    }

    .role {
      margin-top: 12px;
      font-size: 34px;
      line-height: 1.1;
      font-weight: 500;
      color: rgba(255,255,255,0.84);
      text-shadow: 0 4px 22px rgba(0,0,0,0.68);
    }

    .quoteBox {
      position: absolute;
      left: 88px;
      right: 245px;
      top: 405px;
      min-height: 350px;
      max-height: 425px;
      z-index: 6;
      padding: 36px 40px 80px 40px;
      border-radius: 24px;
      background: rgba(0,0,0,0.54);
      border: 1px solid rgba(255,255,255,0.10);
      overflow: hidden;
      box-shadow:
        0 24px 72px rgba(0,0,0,0.38),
        inset 0 0 0 1px rgba(255,255,255,0.03);
    }

    .quote {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-style: italic;
      font-weight: 700;
      font-size: ${predictionQuote.length > 220 ? "30px" : predictionQuote.length > 170 ? "34px" : predictionQuote.length > 120 ? "40px" : "46px"};
      line-height: 1.18;
      color: #ffffff;
      letter-spacing: -0.014em;
      text-shadow: 0 3px 18px rgba(0,0,0,0.80);
    }

    .date {
      position: absolute;
      right: 38px;
      bottom: 28px;
      font-size: 27px;
      font-weight: 850;
      color: rgba(255,255,255,0.90);
      text-shadow: 0 3px 18px rgba(0,0,0,0.80);
      z-index: 7;
    }

    .logoWrap {
      position: absolute;
      right: 82px;
      bottom: 72px;
      width: 138px;
      height: 138px;
      border-radius: 50%;
      overflow: hidden;
      z-index: 8;
      opacity: 0.92;
      box-shadow: 0 14px 42px rgba(0,0,0,0.56);
      background: rgba(0,0,0,0.24);
      border: 2px solid rgba(255,255,255,0.42);
    }

    .logo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      border-radius: 50%;
    }

    .brandFallback {
      position: absolute;
      right: 90px;
      bottom: 90px;
      z-index: 8;
      font-size: 30px;
      font-weight: 900;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.40);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="overlay"></div>
    <div class="texture"></div>

    <div class="label">KAOS RESOLVED</div>
    <div class="stamp">${verdict}</div>

    <div class="identity">
      <div class="name">${forecasterName}</div>
      <div class="role">— ${forecasterContext}</div>
    </div>

    <div class="quoteBox">
      <p class="quote">“${predictionQuote}”</p>
      <div class="date">${predictionDate}</div>
    </div>

    <div class="logoWrap">${logoHtml}</div>
  </div>
</body>
</html>`;
}

async function renderJpg(payload) {
  const pexels = await fetchPexelsPhoto(payload);

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    defaultViewport: {
      width: 1080,
      height: 1080,
      deviceScaleFactor: 1
    }
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: 1080,
      height: 1080,
      deviceScaleFactor: 1
    });

    await page.setContent(buildHtml(payload, pexels), {
      waitUntil: "networkidle0",
      timeout: 30000
    });

    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: 92,
      clip: { x: 0, y: 0, width: 1080, height: 1080 }
    });

    return {
      buffer: Buffer.from(screenshot),
      pexels,
      logoUsed: Boolean(process.env.KAOS_LOGO_URL)
    };
  } finally {
    await browser.close();
  }
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "kaos-renderer",
    endpoints: ["/health", "/debug/env", "/render/resolved", "/render/resolved/debug"]
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "kaos-renderer"
  });
});

app.get("/debug/env", (req, res) => {
  res.json({
    ok: true,
    renderer: "kaos-renderer",
    pexels_key_available: Boolean(process.env.PEXELS_API_KEY),
    kaos_logo_url_available: Boolean(process.env.KAOS_LOGO_URL)
  });
});

app.post("/render/resolved/debug", async (req, res) => {
  try {
    const result = await renderJpg(req.body || {});
    const buffer = result.buffer;
    const magic = buffer.subarray(0, 3).toString("hex").toUpperCase();

    res.json({
      ok: true,
      isBuffer: Buffer.isBuffer(buffer),
      byteLength: buffer.length,
      magic,
      validJpeg: magic === "FFD8FF",
      pexels_used: Boolean(result.pexels && result.pexels.used),
      pexels_query: result.pexels ? result.pexels.query : null,
      pexels_photo_id: result.pexels ? result.pexels.photoId : null,
      pexels_photo_url: result.pexels ? result.pexels.photoUrl : null,
      pexels_reason: result.pexels ? result.pexels.reason : null,
      logo_used: result.logoUsed,
      logo_url: process.env.KAOS_LOGO_URL || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error.message || "Debug render failed"
    });
  }
});

app.post("/render/resolved", async (req, res) => {
  try {
    const result = await renderJpg(req.body || {});
    const buffer = result.buffer;

    if (!Buffer.isBuffer(buffer)) {
      throw new Error("Renderer did not return a Node Buffer");
    }

    const magic = buffer.subarray(0, 3).toString("hex").toUpperCase();

    if (magic !== "FFD8FF") {
      throw new Error(`Invalid JPEG magic bytes: ${magic}`);
    }

    res.status(200);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", "inline; filename=\"kaos-card.jpg\"");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", buffer.length);

    res.setHeader("X-KAOS-Pexels-Used", String(Boolean(result.pexels && result.pexels.used)));
    res.setHeader("X-KAOS-Pexels-Query", result.pexels ? result.pexels.query || "" : "");
    res.setHeader("X-KAOS-Pexels-Photo-Id", result.pexels ? result.pexels.photoId || "" : "");
    res.setHeader("X-KAOS-Pexels-Photo-Url", result.pexels ? result.pexels.photoUrl || "" : "");
    res.setHeader("X-KAOS-Logo-Used", String(result.logoUsed));
    res.setHeader("X-KAOS-Logo-Url", process.env.KAOS_LOGO_URL || "");

    res.end(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error.message || "Render failed"
    });
  }
});

app.listen(PORT, () => {
  console.log(`KAOS renderer listening on ${PORT}`);
});
