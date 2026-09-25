// Screenshot rig entry — analyze the reference beatmap and render the overlay
// without tosu (served by scripts/shotServer.mjs, page = shot.html).
import { analyzeBeatmap } from "../src/integration/analyzer.js";
import { showResult, updateGameState, updateInGameBar, onSettingsUpdate } from "../src/ui/display.js";

const MAP_URLS = [
  "/maps/Camellia%20-%20Fastest%20Crash%20(inteliser)%20%5Bcracked%5D.osu",
  "/maps/I%20UNDERSTAND%20YOU/Camellia%20-%20Fastest%20Crash%20(inteliser)%20%5Bcracked%5D.osu",
];

async function main(): Promise<void> {
  let osuText: string | null = null;
  for (const url of MAP_URLS) {
    const res = await fetch(url);
    if (res.ok) { osuText = await res.text(); break; }
  }
  if (osuText == null) throw new Error("beatmap not found at any known path");

  const result = analyzeBeatmap(osuText);
  showResult(result);
  updateInGameBar(0.42);

  (window as Record<string, unknown>).__shot = {
    play: (progress: number) => {
      updateGameState("play");
      updateInGameBar(progress);
    },
    lobby: () => {
      updateGameState("result");
      updateInGameBar(0.42);
    },
    scores: () => onSettingsUpdate({ panelMode: "Scores" }),
    analysis: () => onSettingsUpdate({ panelMode: "Analysis" }),
  };
  document.body.dataset.shotReady = "1";
}

void main().catch((err) => {
  console.error("[shotDemo]", err);
  const status = document.getElementById("status");
  if (status) status.textContent = `shotDemo error: ${err instanceof Error ? err.message : String(err)}`;
});
