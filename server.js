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
    .slice(0, 500);
}

function getVerdictColor(verdict) {
  const v = String(verdict || "").toUpperCase();

  if (v === "FULFILLED") return "#16a34a";
  if (v === "PARTLY TRUE") return "#f59e0b";
  if (v === "UNVERIFIABLE") return "#6b7280";

  return "#ef1b2d";
}

function getFallbackBackground(topic) {
  const t = String(topic || "").toLowerCase();

  if (t.includes("crypto") || t.includes("bitcoin") || t.includes("market")) {
    return `
      radial-gradient(circle at 20% 20%, rgba(245,158,11,0.28) 0%, transparent 30%),
      radial-gradient(circle at 88% 70%, rgba(124,45,18,0.35) 0%, transparent 36%),
      linear-gradient(135deg, #020617 0%, #0f172a 55%, #111827 100%)
    `;
  }

  if (t.includes("mobility") || t.includes("robotaxi") || t.includes("car") || t.includes("tesla")) {
    return `
      radial-gradient(circle at 25% 25%, rgba(56,189,248,0.25) 0%, transparent 30%),
      radial-gradient(circle at 82% 68%, rgba(29,78,216,0.34) 0%, transparent 36%),
      linear-gradient(135deg, #020617 0%, #0f172a 55%, #111827 100%)
    `;
  }

  if (t.includes("politic") || t.includes("election") || t.includes("geopolitic")) {
    return `
      radial-gradient(circle at 30% 20%, rgba(239,68,68,0.28) 0%, transparent 30%),
      radial-gradient(circle at 75% 75%, rgba(29,78,216,0.28) 0%, transparent 34%),
      linear-gradient(135deg, #020617 0%, #111827 55%, #1f2937 100%)
    `;
  }

  if (t.includes("ai") || t.includes("tech")) {
    return `
      radial-gradient(circle at 20% 30%, rgba(139,92,246,0.30) 0%, transparent 32%),
      radial-gradient(circle at 80% 60%, rgba(6,182,212,0.25) 0%, transparent 32%),
      linear-gradient(135deg, #020617 0%, #111827 60%, #030712 100%)
    `;
  }

  return `
    radial-gradient(circle at 25% 20%, rgba(220,38,38,0.25) 0%, transparent 32%),
    radial-gradient(circle at 80% 75%, rgba(51,65,85,0.38) 0%, transparent 34%),
    linear-gradient(135deg, #020617 0%, #111827 60%, #030712 100%)
  `;
}

function buildPexelsQuery(payload) {
  const explicit = sanitizeText(payload.background_query || "", "");
  if (explicit) return explicit;

  const topic = String(payload.topic || "").toLowerCase();

  if (topic.includes("economy") || topic.includes("recession") || topic.includes("finance")) {
    return "financial district skyline economy markets recession";
  }

  if (topic.includes("crypto") || topic.includes("bitcoin")) {
    return "bitcoin market chart";
  }

  if (topic.includes("mobility") || topic.includes("robotaxi") || topic.includes("car")) {
    return "autonomous car city road";
  }

  if (topic.includes("politic") || topic.includes("election")) {
    return "election ballot voting";
  }

  if (topic.includes("ai") || topic.includes("technology")) {
    return "artificial intelligence data center";
  }

  return "financial district skyline charts night";
}

async function getPexelsPhotoUrl(payload) {
  const apiKey = process.env.PEXELS_API_KEY;

  if (!apiKey) {
    return {
      used: false,
      reason: "PEXELS_API_KEY is not available in Render environment",
      query: buildPexelsQuery(payload),
      photoUrl: null,
      photoId: null
    };
  }

  const query = buildPexelsQuery(payload);
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", "10");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey
    }
  });

  if (!response.ok) {
    return {
      used: false,
      reason: `Pexels API returned HTTP ${response.status}`,
      query,
      photoUrl: null,
      photoId: null
    };
  }

  const data = await response.json();
  const photos = Array.isArray(data.photos) ? data.photos : [];

  if (photos.length === 0) {
    return {
      used: false,
      reason: "Pexels returned no photos",
      query,
      photoUrl: null,
      photoId: null
    };
  }

  const chosen = photos[0];

  return {
    used: true,
    reason: null,
    query,
    photoUrl: chosen.src && (chosen.src.large2x || chosen.src.large || chosen.src.original),
    photoId: chosen.id
  };
}

function buildHtml(payload, pexels) {
  const verdict = sanitizeText(payload.verdict, "FAILED").toUpperCase();
  const forecasterName = sanitizeText(payload.forecaster_name || payload.short_subject, "Jamie Dimon");
  const forecasterContext = sanitizeText(payload.forecaster_context, "JPMorgan CEO");
  const predictionQuote = sanitizeText(
    payload.prediction_quote || payload.quote,
    "These are very, very serious things which I think are likely to put the U.S. in some kind of recession six to nine months from now."
  );
  const predictionDate = sanitizeText(payload.prediction_date || payload.deadline, "Oct 10, 2022");
  const topic = sanitizeText(payload.topic, "");
  const verdictColor = getVerdictColor(verdict);

  const logoUrl = sanitizeText(payload.logo_url || process.env.KAOS_LOGO_URL || "", "");

  const backgroundCss = pexels && pexels.used && pexels.photoUrl
    ? `url("${pexels.photoUrl}")`
    : getFallbackBackground(topic);

  const backgroundExtraCss = pexels && pexels.used && pexels.photoUrl
    ? `
      background-image: ${backgroundCss};
      background-size: cover;
      background-position: center;
    `
    : `
      background: ${backgroundCss};
    `;

  const logoHtml = logoUrl
    ? `<img class="logo" src="${logoUrl}" alt="KAOS logo" />`
    : "";

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * {
      box-sizing: border-box;
    }

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
      color: #f8fafc;
      ${backgroundExtraCss}
    }

    .photoOverlay {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(2,6,23,0.90) 0%, rgba(2,6,23,0.74) 48%, rgba(2,6,23,0.86) 100%),
        linear-gradient(180deg, rgba(2,6,23,0.40) 0%, rgba(2,6,23,0.92) 100%);
      backdrop-filter: blur(1.2px);
    }

    .softTexture {
      position: absolute;
      inset: 0;
      opacity: 0.18;
      background:
        radial-gradient(circle at 18% 18%, rgba(148,163,184,0.18) 0%, transparent 28%),
        radial-gradient(circle at 82% 24%, rgba(239,27,45,0.10) 0%, transparent 30%),
        radial-gradient(circle at 72% 82%, rgba(15,23,42,0.72) 0%, transparent 42%);
    }

    .content {
      position: absolute;
      inset: 0;
      padding: 80px 84px 76px 84px;
    }

    .label {
      position: absolute;
      top: 76px;
      left: 84px;
      padding: 14px 30px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 14px;
      background: rgba(2,6,23,0.60);
      font-size: 35px;
      line-height: 1;
      font-weight: 850;
      letter-spacing: 0.01em;
      color: #f8fafc;
      z-index: 5;
      text-shadow: 0 2px 12px rgba(0,0,0,0.45);
    }

    .stamp {
      position: absolute;
      top: 72px;
      right: 58px;
      z-index: 20;
      transform: rotate(-6deg);
      border: 10px solid #ff9aaa;
      color: #ffffff;
      background: ${verdictColor};
      padding: 28px 56px;
      border-radius: 18px;
      font-size: ${verdict.length > 10 ? "66px" : "82px"};
      line-height: 0.92;
      font-weight: 950;
      letter-spacing: 0.035em;
      text-transform: uppercase;
      box-shadow:
        0 20px 55px rgba(0,0,0,0.45),
        inset 0 0 0 4px rgba(255,255,255,0.25);
    }

    .stamp::after {
      content: "";
      position: absolute;
      inset: 14px;
      border: 4px dashed rgba(255,255,255,0.55);
      border-radius: 12px;
      pointer-events: none;
    }

    .identity {
      position: absolute;
      top: 240px;
      left: 96px;
      right: 350px;
      z-index: 4;
    }

    .name {
      font-size: 66px;
      line-height: 1.02;
      font-weight: 850;
      letter-spacing: -0.035em;
      color: #f8fafc;
      text-shadow: 0 4px 22px rgba(0,0,0,0.70);
    }

    .role {
      margin-top: 14px;
      font-size: 34px;
      line-height: 1.1;
      font-weight: 500;
      color: rgba(248,250,252,0.82);
      text-shadow: 0 4px 18px rgba(0,0,0,0.62);
    }

    .quoteBox {
      position: absolute;
      left: 96px;
      right: 260px;
      top: 410px;
      min-height: 345px;
      max-height: 410px;
      padding: 34px 38px 78px 38px;
      z-index: 4;
      border-radius: 24px;
      background: rgba(0,0,0,0.58);
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow:
        0 24px 70px rgba(0,0,0,0.35),
        inset 0 0 0 1px rgba(255,255,255,0.03);
      overflow: hidden;
    }

    .quote {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-style: italic;
      font-weight: 700;
      font-size: ${predictionQuote.length > 190 ? "34px" : predictionQuote.length > 135 ? "40px" : "46px"};
      line-height: 1.18;
      color: #ffffff;
      letter-spacing: -0.012em;
      text-shadow: 0 3px 16px rgba(0,0,0,0.80);
    }

    .date {
      position: absolute;
      right: 38px;
      bottom: 28px;
      font-size: 26px;
      font-weight: 800;
      color: rgba(255,255,255,0.88);
      text-shadow: 0 3px 16px rgba(0,0,0,0.80);
      z-index: 6;
    }

    .logoWrap {
      position: absolute;
      right: 86px;
      bottom: 78px;
      width: 132px;
      height: 132px;
      border-radius: 50%;
      overflow: hidden;
      z-index: 8;
      opacity: 0.82;
      box-shadow: 0 12px 36px rgba(0,0,0,0.55);
      background: rgba(0,0,0,0.25);
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
      right: 92px;
      bottom: 88px;
      z-index: 8;
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.35);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="photoOverlay"></div>
    <div class="softTexture"></div>

    <div class="content">
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

      ${logoUrl ? `<div class="logoWrap">${logoHtml}</div>` : `<div class="brandFallback">KAOS</div>`}
    </div>
  </div>
</body>
</html>`;
}

async function renderJpg(payload) {
  const pexels = await getPexelsPhotoUrl(payload);

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
      clip: {
        x: 0,
        y: 0,
        width: 1080,
        height: 1080
      }
    });

    return {
      buffer: Buffer.from(screenshot),
      pexels
    };
  } finally {
    await browser.close();
  }
}

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
      pexels_background_attempted: true,
      pexels_background_used: Boolean(result.pexels && result.pexels.used),
      pexels_query: result.pexels ? result.pexels.query : null,
      pexels_photo_id: result.pexels ? result.pexels.photoId : null,
      pexels_photo_url: result.pexels ? result.pexels.photoUrl : null,
      pexels_reason: result.pexels ? result.pexels.reason : null
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
