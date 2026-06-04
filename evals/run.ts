import "dotenv/config";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePlate } from "../apps/api/src/lib/vision.js";
import type { Macros } from "@coplate/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

/**
 * Eval design notes
 * -----------------
 * Each fixture is a food photo + a ground-truth macro label (hand-measured or
 * from packaging). We run the full pipeline and score predicted vs. actual.
 *
 * We report Mean Absolute Percentage Error (MAPE) per macro and an
 * "within-tolerance" hit rate (calories within +/-20%), because for a fitness
 * app being roughly right consistently matters more than nailing any single
 * number. This is the kind of metric you put on a slide and defend in an
 * interview: it ties the technical measure to the product goal.
 */

interface Fixture {
  image: string; // filename in fixtures/
  media_type: "image/jpeg" | "image/png" | "image/webp";
  truth: Macros;
}

interface ScoredResult {
  image: string;
  predicted: Macros;
  truth: Macros;
  caloriePctError: number;
  withinTolerance: boolean;
  latency_ms: number;
  retries: number;
}

const CALORIE_TOLERANCE = 0.2;

function pctError(predicted: number, truth: number): number {
  if (truth === 0) return predicted === 0 ? 0 : 1;
  return Math.abs(predicted - truth) / truth;
}

function mape(results: ScoredResult[], key: keyof Macros): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + pctError(r.predicted[key], r.truth[key]), 0);
  return (sum / results.length) * 100;
}

async function run() {
  const manifestPath = join(FIXTURES_DIR, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(
      `No fixtures found.\n\n` +
        `Create ${manifestPath} as a JSON array of fixtures and drop the\n` +
        `corresponding images into ${FIXTURES_DIR}. See evals/README.md.`
    );
    process.exit(1);
  }

  const fixtures: Fixture[] = JSON.parse(readFileSync(manifestPath, "utf-8"));
  console.log(`Running eval over ${fixtures.length} fixtures...\n`);

  const results: ScoredResult[] = [];
  for (const fx of fixtures) {
    const imgPath = join(FIXTURES_DIR, fx.image);
    if (!existsSync(imgPath)) {
      console.warn(`  skip: ${fx.image} (file missing)`);
      continue;
    }
    const b64 = readFileSync(imgPath).toString("base64");
    const res = await analyzePlate(b64, fx.media_type);
    const ce = pctError(res.analysis.total.calories, fx.truth.calories);
    const scored: ScoredResult = {
      image: fx.image,
      predicted: res.analysis.total,
      truth: fx.truth,
      caloriePctError: ce,
      withinTolerance: ce <= CALORIE_TOLERANCE,
      latency_ms: res.meta.latency_ms,
      retries: res.meta.retries,
    };
    results.push(scored);
    console.log(
      `  ${fx.image}: pred ${Math.round(res.analysis.total.calories)} kcal / truth ${fx.truth.calories} kcal ` +
        `(${(ce * 100).toFixed(0)}% err)${scored.withinTolerance ? " ✓" : " ✗"}`
    );
  }

  if (results.length === 0) {
    console.error("\nNo fixtures scored.");
    process.exit(1);
  }

  const hitRate = (results.filter((r) => r.withinTolerance).length / results.length) * 100;
  const avgLatency = results.reduce((a, r) => a + r.latency_ms, 0) / results.length;
  const totalRetries = results.reduce((a, r) => a + r.retries, 0);

  console.log("\n========== EVAL SUMMARY ==========");
  console.log(`Fixtures scored:        ${results.length}`);
  console.log(`Calorie hit rate (±20%): ${hitRate.toFixed(1)}%`);
  console.log(`MAPE calories:          ${mape(results, "calories").toFixed(1)}%`);
  console.log(`MAPE protein:           ${mape(results, "protein_g").toFixed(1)}%`);
  console.log(`MAPE carbs:             ${mape(results, "carbs_g").toFixed(1)}%`);
  console.log(`MAPE fat:               ${mape(results, "fat_g").toFixed(1)}%`);
  console.log(`Avg latency:            ${avgLatency.toFixed(0)} ms`);
  console.log(`Total validation retries: ${totalRetries}`);
  console.log("==================================");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
