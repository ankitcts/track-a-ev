// Run one polling cycle from the CLI:  npm run poll
// Useful for local testing without waiting for the hourly cron.
import { runPoll } from "../src/lib/runPoll";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

runPoll(baseUrl)
  .then((summaries) => {
    console.log(JSON.stringify({ ranAt: new Date().toISOString(), summaries }, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
