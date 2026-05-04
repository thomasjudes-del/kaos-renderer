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
    return "radial-gradient(circle at 20% 20%, #f59e0b 0%, transparent 28%), radial-gradient(circle at 80% 70%, #7c2d12 0%, transparent 32%), linear-gradient(135deg, #020617 0%, #111827 55%, #1e293b 100%)";
  }

  if (t.includes("mobility") || t.includes("robotaxi") || t.includes("car") || t.includes("tesla")) {
    return "radial-gradient(circle at 25% 25%, #38bdf8 0%, transparent 25%), radial-gradient(circle at 80% 70%, #1d4ed8 0%, transparent 35%), linear-gradient(135deg, #020617 0%, #0f172a 55%, #111827 100%)";
  }

  if (t.includes("politic") || t.includes("election") || t.includes("geopolitic")) {
    return "radial-gradient(circle at 30% 20%, #ef4444 0%, transparent 26%), radial-gradient(circle at 75% 75%, #1d4ed8 0%, transparent 32%), linear-gradient(135deg, #020617 0%, #111827 55%, #1f2937 100%)";
  }

  if (t.includes("ai") || t.includes("tech")) {
    return "radial-gradient(circle at 20% 30%, #8b5cf6 0%, transparent 30%), radial-gradient(circle at 80% 60%, #06b6d4 0%, transparent 30%), linear-gradient(135deg, #020617 0%, #111827 60%, #030712 100%)";
  }

  return "radial-gradient(circle at 25% 20%, #dc2626 0%, transparent 28%), radial-gradient(circle at 80% 75%, #334155 0%, transparent 30%), linear-gradient(135deg, #020617 0%, #111827 60%, #030712 100%)";
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
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 1080px;
      height: 1080px;
      font-family: Arial, Helvetica, sans-serif;
      background: #020617;
    }
    .card {
      width: 1080px;
      height: 1080px;
      position: relative;
      overflow: hidden;
      color: white;
      background: ${background};
    }
    .texture {
      position: absolute;
      inset: 0;
      opacity: 0.18;
      background-image:
        linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
      background-size: 54px 54px;
    }
    .overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(2,6,23,0.55), rgba(2,6,23,0.92));
    }
    .content {
      position: absolute;
      inset: 0;
      padding: 72px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .top {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: 0.12em;
      opacity: 0.92;
    }
    .center {
      transform: rotate(-3deg);
      margin-top: 70px;
    }
    .stamp {
      display: inline-block;
      border: 14px solid ${verdictColor};
      color: ${verdictColor};
      padding: 28px 46px;
      font-size: 134px;
      line-height: 0.95;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      box-shadow: 0 0 0 8px rgba(255,255,255,0.07);
      background: rgba(2,6,23,0.58);
    }
    .subject {
      margin-top: 54px;
      font-size: 72px;
      line-height: 1.05;
      font-weight: 900;
      letter-spacing: -0.04em;
      max-width: 900px;
      text-transform: uppercase;
    }
    .bottom {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 40px;
    }
    .deadline {
      font-size: 38px;
      font-weight: 700;
      color: rgba(255,255,255,0.9);
    }
    .brand {
      font-size: 36px;
      font-weight: 900;
      letter-spacing: 0.1em;
      color: rgba(255,255,255,0.55);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="texture"></div>
    <div class="overlay"></div>
    <div class="content">
      <div class="top">KAOS RESOLVED</div>
      <div>
        <div class="center">
          <div class="stamp">${cleanVerdict}</div>
        </div>
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
    defaultViewport: { width: 1080, height: 1080, deviceScaleFactor: 1 }
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    await page.setContent(buildHtml(payload), { waitUntil: "networkidle0" });
    const buffer = await page.screenshot({
      type: "jpeg",
      quality: 92,
      clip: { x: 0, y: 0, width: 1080, height: 1080 }
    });
    return buffer;
  } finally {
    await browser.close();
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "kaos-renderer" });
});

app.post("/render/resolved", async (req, res) => {
  try {
    const buffer = await renderJpg(req.body || {});
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
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
