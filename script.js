// Posts are pre-fetched server-side by .github/workflows/update-messages.yml and
// committed to messages.json, so this read is same-origin — no CORS, no reliance
// on a third-party request succeeding at page load.
const MESSAGES_PATH = "./messages.json";
const STAR_COUNT = 350;
// Stars travel along the view axis (depth) toward the camera, so they radiate
// outward from the center vanishing point — motion parallel to the view rather
// than drifting across the screen plane.
const STAR_NEAR_DEPTH = 0.2; // closest a star gets before it's recycled
const STAR_FAR_DEPTH = 4.0; // spawn depth, near the vanishing point
const STAR_SPEED = 0.01; // depth units travelled per frame
const MAX_STAR_SIZE = 2.4; // size at the near plane; shrinks with distance

function syncViewportUnit() {
  // iOS Safari's dynamic browser chrome makes vh unreliable for long-running
  // transforms; pin layout math to the current innerHeight instead.
  const unit = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--app-vh", `${unit}px`);
}

function applyIosSafariFallback() {
  const ua = navigator.userAgent;
  const isIOS = /iP(ad|hone|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/i.test(ua);
  const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  if (isIOS && isWebKit && !isOtherIOSBrowser) {
    document.documentElement.classList.add("ios-safari");
  }
}

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
  let centerX = 0;
  let centerY = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = window.innerWidth / 2;
    centerY = window.innerHeight / 2;
  }

  function resetStar(star, depth) {
    // World x/y are normalized to [-1, 1]; the perspective divide by depth maps
    // them onto the screen, so a fresh far star sits near the center.
    star.x = Math.random() * 2 - 1;
    star.y = Math.random() * 2 - 1;
    star.z = depth;
  }

  function init() {
    resize();
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      const star = {};
      // Distribute initial depths across the field so they don't pulse in waves.
      resetStar(star, STAR_NEAR_DEPTH + Math.random() * (STAR_FAR_DEPTH - STAR_NEAR_DEPTH));
      stars.push(star);
    }
  }

  function tick() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = "#fff";

    for (const star of stars) {
      star.z -= STAR_SPEED;
      if (star.z <= STAR_NEAR_DEPTH) {
        resetStar(star, STAR_FAR_DEPTH);
      }
      const scale = 1 / star.z;
      const screenX = centerX + star.x * centerX * scale;
      const screenY = centerY + star.y * centerY * scale;
      if (screenX < 0 || screenX > window.innerWidth || screenY < 0 || screenY > window.innerHeight) {
        continue;
      }
      const size = (MAX_STAR_SIZE * STAR_NEAR_DEPTH) / star.z;
      ctx.beginPath();
      ctx.arc(screenX, screenY, Math.max(size, 0.2), 0, Math.PI * 2);
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
  applyIosSafariFallback();
  syncViewportUnit();
  window.addEventListener("resize", syncViewportUnit);
  window.addEventListener("orientationchange", syncViewportUnit);
  drawStars();
}
loadMessages();
