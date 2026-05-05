const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

function sanitizeText(value, fallback = "") {
  return String(value || fallback)
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 80);
}

function getVerdictColor(verdict) {
  const v = String(verdict || "").toUpperCase();

  if (v === "FULFILLED") return "#16a34a";
  if (v === "PARTLY TRUE") return "#f59e0b";
  if (v === "UNVERIFIABLE") return "#6b7280";

  return "#dc2626";
}

function getTopicGradient(topic) {
  const t = String(topic || "").toLowerCase();

  if (t.includes("crypto") || t.includes("bitcoin") || t.includes("market")) {
    return `
      radial-gradient(circle at 20% 20%, rgba(245,158,11,0.55) 0%, transparent 28%),
      radial-gradient(circle at 80% 70%, rgba(124,45,18,0.60) 0%, transparent 32%),
      linear-gradient(135deg, #020617 0%, #111827 55%, #1e293b 100%)
    `;
  }

  if (t.includes("mobility") || t.includes("robotaxi") || t.includes("car") || t.includes("tesla")) {
    return `
      radial-gradient(circle at 25% 25%, rgba(56,189,248,0.42) 0%, transparent 25%),
      radial-gradient(circle at 80% 70%, rgba(29,78,216,0.55) 0%, transparent 35%),
      linear-gradient(135deg, #020617 0%, #0f172a 55%, #111827 100%)
    `;
  }

  if (t.includes("politic") || t.includes("election") || t.includes("geopolitic")) {
    return `
      radial-gradient(circle at 30% 20%, rgba(239,68,68,0.48) 0%, transparent 26%),
      radial-gradient(circle at 75% 75%, rgba(29,78,216,0.48) 0%, transparent 32%),
      linear-gradient(135deg, #020617 0%, #111827 55%, #1f2937 100%)
    `;
  }

  if (t.includes("ai") || t.includes("tech")) {
    return `
      radial-gradient(circle at 20% 30%, rgba(139,92,246,0.55) 0%, transparent 30%),
      radial-gradient(circle at 80% 60%, rgba(6,182,212,0.48) 0%, transparent 30%),
      linear-gradient(135deg, #020617 0%, #111827 60%, #030712 100%)
    `;
  }

  return `
    radial-gradient(circle at 25% 20%, rgba(220,38,38,0.52) 0%, transparent 28%),
    radial-gradient(circle at 80% 75%, rgba(51,65,85,0.55) 0%, transparent 30%),
    linear-gradient(135deg, #020617 0%, #111827 60%, #030712 100%)
  `;
}

function buildHtml({ verdict, short_subject, deadline, topic }) {
  const cleanVerdict = sanitizeText(verdict, "FAILED").toUpperCase();
  const cleanSubject = sanitizeText(short_subject, "Prediction").toUpperCase();
  const cleanDeadline = sanitizeText(deadline, "Unknown deadline");
  const verdictColor = getVerdictColor(cleanVerdict);
  const background = getTopicGradient(topic || cleanSubject);

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
      color: #ffffff;
      background: ${background};
    }

    .texture {
      position: absolute;
      inset: 0;
      opacity: 0.12;
      background-image:
        linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
      background-size: 54px 54px;
    }

    .overlay {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(2,6,23,0.35), rgba(2,6,23,0.94)),
        radial-gradient(circle at 50% 45%, rgba(255,255,255,0.10), transparent 45%);
    }

    .content {
      position: absolute;
      inset: 0;
      padding: 74px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .top {
      font-size: 40px;
      font-weight: 800;
      letter-spacing: 0.13em;
      opacity: 0.94;
    }

    .middle {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      margin-top: 48px;
      margin-bottom: 40px;
    }

    .stamp {
      display: inline-block;
      transform: rotate(-3deg);
      border: 14px solid ${verdictColor};
      color: ${verdictColor};
      padding: 28px 46px;
      font-size: ${cleanVerdict.length > 10 ? "94px" : "132px"};
      line-height: 0.95;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      box-shadow:
        0 0 0 8px rgba(255,255,255,0.07),
        0 24px 90px rgba(0,0,0,0.45);
      background: rgba(2,6,23,0.62);
      max-width: 930px;
      word-break: keep-all;
    }

    .subject {
      margin-top: 58px;
      font-size: ${cleanSubject.length > 18 ? "56px" : "70px"};
      line-height: 1.05;
      font-weight: 900;
      letter-spacing: -0.045em;
      max-width: 920px;
      text-transform: uppercase;
      text-shadow: 0 8px 40px rgba(0,0,0,0.55);
    }

    .bottom {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 36px;
    }

    .deadline {
      font-size: 36px;
      line-height: 1.1;
      font-weight: 700;
      color: rgba(255,255,255,0.92);
      max-width: 760px;
    }

    .brand {
      font-size: 34px;
      font-weight: 900;
      letter-spacing: 0.12em;
      color: rgba(255,255,255,0.54);
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="texture"></div>
    <div class="overlay"></div>

    <div class="content">
      <div class="top">KAOS RESOLVED</div>

      <div class="middle">
        <div class="stamp">${cleanVerdict}</div>
        <div class="subject">${cleanSubject}</div>
      </div>

      <div class="bottom">
        <div class="deadline">Deadline: ${cleanDeadline}</div>
        <div class="brand">KAOS</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function renderJpg(payload) {
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

    await page.setContent(buildHtml(payload), {
      waitUntil: "networkidle0"
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

    return Buffer.from(screenshot);
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

app.post("/render/resolved/debug", async (req, res) => {
  try {
    const buffer = await renderJpg(req.body || {});
    const magic = Buffer.from(buffer).subarray(0, 3).toString("hex").toUpperCase();

    res.json({
      ok: true,
      isBuffer: Buffer.isBuffer(buffer),
      byteLength: buffer.length,
      magic,
      validJpeg: magic === "FFD8FF"
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
    const buffer = await renderJpg(req.body || {});

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
