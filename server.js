const express = require("express");
const { createCanvas, loadImage } = require("canvas");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

/* ---------------------------
   BASIC ENDPOINTS
--------------------------- */

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "kaos-renderer",
    endpoints: ["/health", "/debug/env", "/render/resolved"],
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "kaos-renderer",
  });
});

app.get("/debug/env", (_req, res) => {
  res.json({
    ok: true,
    renderer: "kaos-renderer",
    pexels_key_available: !!process.env.PEXELS_API_KEY,
    kaos_logo_url_available: !!process.env.KAOS_LOGO_URL,
  });
});

/* ---------------------------
   HELPERS
--------------------------- */

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function wrapText(ctx, text, maxWidth) {
  const words = cleanText(text).split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = ctx.measureText(testLine).width;
    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function fitWrappedText(ctx, text, maxWidth, maxHeight, startSize, minSize, fontFamily, fontStyle = "normal") {
  let size = startSize;

  while (size >= minSize) {
    ctx.font = `${fontStyle} ${size}px ${fontFamily}`;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = size * 1.28;
    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= maxHeight) {
      return { size, lines, lineHeight };
    }
    size -= 2;
  }

  ctx.font = `${fontStyle} ${minSize}px ${fontFamily}`;
  const lines = wrapText(ctx, text, maxWidth);
  return {
    size: minSize,
    lines,
    lineHeight: minSize * 1.28,
  };
}

async function fetchBufferFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset: ${url} (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildPexelsQuery(topic, shortSubject, quote) {
  const t = `${cleanText(topic)} ${cleanText(shortSubject)} ${cleanText(quote)}`.toLowerCase();

  if (t.includes("recession") || t.includes("economy") || t.includes("gdp") || t.includes("market") || t.includes("inflation")) {
    return "financial district skyline charts night";
  }
  if (t.includes("bitcoin") || t.includes("crypto")) {
    return "crypto trading screen finance technology";
  }
  if (t.includes("tesla") || t.includes("robotaxi") || t.includes("autonomous") || t.includes("cars")) {
    return "futuristic city autonomous car night";
  }
  if (t.includes("election") || t.includes("president") || t.includes("vote") || t.includes("politics")) {
    return "government building city night news";
  }
  if (t.includes("ai") || t.includes("artificial intelligence") || t.includes("white-collar")) {
    return "artificial intelligence office technology";
  }

  return "technology business future concept";
}

async function fetchPexelsPhoto(query) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return {
      used: false,
      query,
      photoId: null,
      photoUrl: null,
      imageUrl: null,
      error: "PEXELS_API_KEY missing",
    };
  }

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=square`;

  const response = await fetch(url, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      used: false,
      query,
      photoId: null,
      photoUrl: null,
      imageUrl: null,
      error: `Pexels API error ${response.status}: ${body}`,
    };
  }

  const data = await response.json();
  const photo = data.photos && data.photos[0];

  if (!photo) {
    return {
      used: false,
      query,
      photoId: null,
      photoUrl: null,
      imageUrl: null,
      error: "No Pexels photo found",
    };
  }

  return {
    used: true,
    query,
    photoId: photo.id ? String(photo.id) : null,
    photoUrl: photo.url || null,
    imageUrl:
      (photo.src && (photo.src.large2x || photo.src.large || photo.src.original)) || null,
    error: null,
  };
}

async function loadPexelsBackground(query) {
  const meta = await fetchPexelsPhoto(query);

  if (!meta.used || !meta.imageUrl) {
    return {
      ...meta,
      image: null,
    };
  }

  try {
    const buffer = await fetchBufferFromUrl(meta.imageUrl);
    const image = await loadImage(buffer);
    return {
      ...meta,
      image,
    };
  } catch (error) {
    return {
      used: false,
      query,
      photoId: meta.photoId,
      photoUrl: meta.photoUrl,
      imageUrl: meta.imageUrl,
      image: null,
      error: `Failed to load Pexels image: ${error.message}`,
    };
  }
}

async function loadKaosLogo() {
  const logoUrl = process.env.KAOS_LOGO_URL;
  if (!logoUrl) {
    return {
      used: false,
      url: null,
      image: null,
      error: "KAOS_LOGO_URL missing",
    };
  }

  try {
    const buffer = await fetchBufferFromUrl(logoUrl);
    const image = await loadImage(buffer);
    return {
      used: true,
      url: logoUrl,
      image,
      error: null,
    };
  } catch (error) {
    return {
      used: false,
      url: logoUrl,
      image: null,
      error: `Failed to load logo: ${error.message}`,
    };
  }
}

function drawBackground(ctx, canvas, bgImage, topic) {
  if (bgImage) {
    const imgRatio = bgImage.width / bgImage.height;
    const canvasRatio = canvas.width / canvas.height;

    let drawWidth;
    let drawHeight;
    let dx;
    let dy;

    if (imgRatio > canvasRatio) {
      drawHeight = canvas.height;
      drawWidth = drawHeight * imgRatio;
      dx = (canvas.width - drawWidth) / 2;
      dy = 0;
    } else {
      drawWidth = canvas.width;
      drawHeight = drawWidth / imgRatio;
      dx = 0;
      dy = (canvas.height - drawHeight) / 2;
    }

    ctx.drawImage(bgImage, dx, dy, drawWidth, drawHeight);

    // Overlay for readability
    const overlay = ctx.createLinearGradient(0, 0, 0, canvas.height);
    overlay.addColorStop(0, "rgba(8, 14, 28, 0.48)");
    overlay.addColorStop(0.55, "rgba(8, 14, 28, 0.62)");
    overlay.addColorStop(1, "rgba(8, 14, 28, 0.78)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const t = cleanText(topic).toLowerCase();

    let g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);

    if (t.includes("recession") || t.includes("economy") || t.includes("market")) {
      g.addColorStop(0, "#0b1630");
      g.addColorStop(0.5, "#16355f");
      g.addColorStop(1, "#09111f");
    } else if (t.includes("bitcoin") || t.includes("crypto")) {
      g.addColorStop(0, "#17142c");
      g.addColorStop(0.5, "#24306b");
      g.addColorStop(1, "#0f1322");
    } else if (t.includes("tesla") || t.includes("robotaxi") || t.includes("autonomous")) {
      g.addColorStop(0, "#071420");
      g.addColorStop(0.5, "#0b3c5d");
      g.addColorStop(1, "#081018");
    } else {
      g.addColorStop(0, "#0c1833");
      g.addColorStop(0.5, "#1b406b");
      g.addColorStop(1, "#081018");
    }

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // subtle abstract grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }
}

function drawStamp(ctx, verdict) {
  const isFailed = cleanText(verdict).toUpperCase() === "FAILED";
  const stampText = isFailed ? "FAILED" : "FULFILLED";
  const stampColor = isFailed ? "#ff2b2b" : "#18c964";

  ctx.save();
  ctx.translate(930, 155);
  ctx.rotate(-0.12);

  ctx.strokeStyle = stampColor;
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(-165, -58, 330, 116, 24);
  ctx.fill();
  ctx.stroke();

  ctx.font = "bold 54px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = stampColor;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 14;
  ctx.fillText(stampText, 0, 0);

  ctx.restore();
}

function drawLogoBadge(ctx, logoImage) {
  if (!logoImage) return;

  const size = 92;
  const x = 1200 - 60 - size;
  const y = 1200 - 60 - size;

  ctx.save();

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.globalAlpha = 0.95;
  ctx.drawImage(logoImage, x, y, size, size);

  ctx.restore();

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.stroke();
}

function drawResolvedCard(payload, backgroundMeta, logoMeta) {
  const canvas = createCanvas(1200, 1200);
  const ctx = canvas.getContext("2d");

  const verdict = cleanText(payload.verdict).toUpperCase();
  const shortSubject = cleanText(payload.short_subject);
  const deadline = cleanText(payload.deadline);
  const topic = cleanText(payload.topic);
  const quote = cleanText(payload.quote || payload.prediction || shortSubject);
  const speakerName = cleanText(payload.speaker_name || payload.forecaster || "");
  const speakerTitle = cleanText(payload.speaker_title || payload.forecaster_title || "");
  const predictionDate = cleanText(
    payload.prediction_date ||
      payload.said_date ||
      payload.date ||
      payload.prediction_made_on ||
      ""
  );

  drawBackground(ctx, canvas, backgroundMeta.image, topic);

  const textColor = "#ffffff";
  const accentColor = "rgba(255,255,255,0.78)";

  // Top label
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "bold 34px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("KAOS RESOLVED", 70, 80);

  // Stamp
  drawStamp(ctx, verdict);

  // Subject
  ctx.fillStyle = accentColor;
  ctx.font = "bold 30px Arial";
  ctx.fillText(shortSubject, 70, 170);

  // Speaker line
  const speakerLine = speakerTitle
    ? `${speakerName} — ${speakerTitle}`
    : speakerName;

  if (speakerLine) {
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "bold 34px Arial";
    ctx.fillText(speakerLine, 70, 260);
  }

  // Quote
  const quoteTop = speakerLine ? 320 : 260;
  const quoteWidth = 900;
  const quoteHeight = 410;

  const quoteFit = fitWrappedText(
    ctx,
    `“${quote}”`,
    quoteWidth,
    quoteHeight,
    52,
    30,
    "Georgia",
    "italic"
  );

  ctx.fillStyle = textColor;
  ctx.font = `italic ${quoteFit.size}px Georgia`;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;

  let y = quoteTop;
  for (const line of quoteFit.lines) {
    ctx.fillText(line, 70, y);
    y += quoteFit.lineHeight;
  }

  // Date under quote, aligned right
  if (predictionDate) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "right";
    ctx.fillText(predictionDate, 70 + quoteWidth, y + 20);
  }

  // Bottom info
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "bold 30px Arial";
  ctx.fillText("Resolved against deadline:", 70, 1030);

  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.font = "28px Arial";
  ctx.fillText(deadline, 70, 1072);

  // Logo bottom-right
  drawLogoBadge(ctx, logoMeta.image);

  return canvas.toBuffer("image/jpeg", {
    quality: 0.9,
    progressive: true,
    chromaSubsampling: true,
  });
}

/* ---------------------------
   MAIN RENDER ENDPOINT
--------------------------- */

app.post("/render/resolved", async (req, res) => {
  try {
    const payload = req.body || {};

    const required = ["verdict", "short_subject", "deadline", "topic"];
    const missing = required.filter((field) => !cleanText(payload[field]));

    if (missing.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Missing one or more required fields: ${missing.join(", ")}`,
      });
    }

    const pexelsQuery = buildPexelsQuery(
      payload.topic,
      payload.short_subject,
      payload.quote || payload.prediction || payload.short_subject
    );

    const [backgroundMeta, logoMeta] = await Promise.all([
      loadPexelsBackground(pexelsQuery),
      loadKaosLogo(),
    ]);

    const jpegBuffer = drawResolvedCard(payload, backgroundMeta, logoMeta);

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Length", jpegBuffer.length);

    // Observability headers
    res.setHeader("X-KAOS-Pexels-Used", String(!!backgroundMeta.used));
    res.setHeader("X-KAOS-Pexels-Photo-Id", backgroundMeta.photoId || "");
    res.setHeader("X-KAOS-Pexels-Photo-Url", backgroundMeta.photoUrl || "");
    res.setHeader("X-KAOS-Pexels-Query", backgroundMeta.query || "");
    res.setHeader("X-KAOS-Logo-Used", String(!!logoMeta.used));
    res.setHeader("X-KAOS-Logo-Url", logoMeta.url || "");

    return res.status(200).send(jpegBuffer);
  } catch (error) {
    console.error("Render error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Unknown renderer error",
    });
  }
});

/* ---------------------------
   START
--------------------------- */

app.listen(PORT, () => {
  console.log(`KAOS renderer listening on port ${PORT}`);
});
