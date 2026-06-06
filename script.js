// Posts are pre-fetched server-side by .github/workflows/update-messages.yml and
// committed to messages.json, so this read is same-origin — no CORS, no reliance
// on a third-party request succeeding at page load.
const MESSAGES_PATH = "./messages.json";
const STAR_COUNT = 350;
const MIN_STAR_SPEED = 0.2;
const STAR_SPEED_RANGE = 1.1;
const MAX_STAR_SIZE = 1.6;

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

async function loadMessages() {
  try {
    // Cache-bust so the GitHub Pages CDN doesn't serve a stale copy after the
    // workflow commits an update.
    const response = await fetch(`${MESSAGES_PATH}?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    const data = await response.json();
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const messages = posts
      .map((post) => (post.text || "").trim())
      .filter(Boolean);
    if (messages.length > 0) {
      updateCrawl(messages);
      return;
    }
  } catch (error) {
    console.warn("Could not load messages.json", error);
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
loadMessages();
