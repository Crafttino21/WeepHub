(function () {
  let enabled = false;
  try {
    const stored = localStorage.getItem("settings");
    if (stored) {
      const parsed = JSON.parse(stored);
      enabled = Boolean(parsed?.debug?.serverTimeOverlay);
    }
  } catch (_) {
    enabled = false;
  }

  if (!enabled) return;

  const overlay = document.createElement("div");
  overlay.id = "server-time-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "6px";
  overlay.style.right = "8px";
  overlay.style.padding = "6px 10px";
  overlay.style.borderRadius = "10px";
  overlay.style.background = "rgba(10, 12, 16, 0.72)";
  overlay.style.border = "1px solid rgba(124, 231, 255, 0.3)";
  overlay.style.color = "#dfe6f4";
  overlay.style.fontFamily = "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  overlay.style.fontSize = "12px";
  overlay.style.boxShadow = "0 6px 20px rgba(0,0,0,0.35)";
  overlay.style.zIndex = "9999";
  overlay.style.pointerEvents = "none";
  overlay.textContent = "Loading server time...";
  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(overlay);
  });

  async function refresh() {
    try {
      const res = await fetch("/api/time", { credentials: "include" });
      const data = await res.json();
      const date = data?.iso ? new Date(data.iso) : data?.now ? new Date(data.now) : new Date();
      overlay.textContent = date.toLocaleTimeString();
    } catch (_) {
      overlay.textContent = new Date().toLocaleTimeString();
    }
  }

  refresh();
  setInterval(refresh, 1000);
})();
