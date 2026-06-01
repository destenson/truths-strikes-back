const TRUTH_USERNAME = "realDonaldTrump";
const feedCandidates = [
  `https://truthsocial.com/@${TRUTH_USERNAME}.rss`,
  `https://truthsocial.com/@${TRUTH_USERNAME}/rss`,
];
const feedProxies = [
  (url) => url,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];
const jsonFeedAdapters = [
  (url) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
];
const STAR_COUNT = 350;
const MIN_STAR_SPEED = 0.2;
const STAR_SPEED_RANGE = 1.1;
const MAX_STAR_SIZE = 1.6;
const MAX_TRUTHS_COUNT = 8;

function toParagraph(text) {
  const p = document.createElement("p");
  p.textContent = text.replace(/\s+/g, " ").trim();
  return p;
}

function updateCrawl(lines) {
  const container = document.getElementById("crawl-lines");
  container.innerHTML = "";
  lines.forEach((line) => container.appendChild(toParagraph(line)));
}

async function fetchFeed(url) {
  for (const adapter of jsonFeedAdapters) {
    const adaptedUrl = adapter(url);
    try {
      const adapterResponse = await fetch(adaptedUrl);
      if (!adapterResponse.ok) {
        console.warn(`Feed adapter failed for ${adaptedUrl} with status ${adapterResponse.status}`);
        continue;
      }
      const adapterData = await adapterResponse.json();
      const adapterItems = Array.isArray(adapterData?.items)
        ? adapterData.items.slice(0, MAX_TRUTHS_COUNT)
        : [];
      const adapterTruths = adapterItems
        .map((item) => extractTextFromHtml(getAdapterItemText(item)))
        .filter(Boolean);
      if (adapterTruths.length > 0) {
        return adapterTruths;
      }
    } catch (error) {
      console.warn(`Feed adapter failed for ${adaptedUrl}`, error);
    }
  }

  let response = null;
  for (const proxyUrl of feedProxies) {
    try {
      const candidateResponse = await fetch(proxyUrl(url));
      if (candidateResponse.ok) {
        response = candidateResponse;
        break;
      }
    } catch (error) {
      console.warn(`Feed request failed for ${proxyUrl(url)}`, error);
    }
  }
  if (!response || !response.ok) {
    throw new Error("Feed request failed");
  }
  const xml = await response.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Feed parsing failed");
  }
  return Array.from(doc.querySelectorAll("item > title"))
    .map((node) => node.textContent || "")
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, MAX_TRUTHS_COUNT);
}

function extractTextFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function getAdapterItemText(item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  const description = typeof item.description === "string" ? item.description : "";
  const title = typeof item.title === "string" ? item.title : "";
  return description || title;
}

async function loadTruths() {
  for (const url of feedCandidates) {
    try {
      const truths = await fetchFeed(url);
      if (truths.length > 0) {
        updateCrawl(truths);
        return;
      }
    } catch (error) {
      console.warn(`Could not load feed from ${url}`, error);
    }
  }
  updateCrawl([
    "Unable to load live Truth Social posts right now.",
    "Please try again later to see the latest updates.",
  ]);
}

function drawStars() {
  const canvas = document.getElementById("stars");
  const ctx = canvas.getContext("2d");
  const stars = [];
  let resizeTimer = null;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetStar(star) {
    star.x = Math.random() * window.innerWidth;
    star.y = Math.random() * window.innerHeight;
    star.speed = MIN_STAR_SPEED + Math.random() * STAR_SPEED_RANGE;
    star.size = Math.random() * MAX_STAR_SIZE;
  }

  function init() {
    resize();
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      const star = {};
      resetStar(star);
      stars.push(star);
    }
  }

  function tick() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = "#fff";

    for (const star of stars) {
      star.y += star.speed;
      if (star.y > window.innerHeight) {
        star.y = -star.size;
        star.x = Math.random() * window.innerWidth;
      }
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(init, 100);
  });
  init();
  tick();
}

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.getElementById("stars").style.display = "none";
} else {
  drawStars();
}
loadTruths();
