import { createRoot } from "react-dom/client";
import App from "./App";
import { loadCatalog } from "./lib/catalog";
import "./index.css";
const root = createRoot(document.getElementById("root")!);
async function start() {
  try {
    await loadCatalog();
    root.render(<App />);
  } catch {
    root.render(
      <main className="container py-16">
        <h1 className="text-2xl font-bold">Price data unavailable</h1>
        <p className="mt-3">
          The published snapshot could not be loaded or validated. No sample
          prices have been substituted.
        </p>
        <button className="mt-4 underline" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    );
  }
}
void start();

// Keep the mounted dashboard (tabs, filters, replay) while its subscribed data updates.
function refreshPublishedData() {
  if (document.visibilityState === "visible")
    void loadCatalog()
      .then(() => {
        // Recover the initial error screen when data becomes available.
        root.render(<App />);
      })
      .catch(() => {});
}
setInterval(refreshPublishedData, 60_000);
window.addEventListener("focus", refreshPublishedData);
document.addEventListener("visibilitychange", refreshPublishedData);
