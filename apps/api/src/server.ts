import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerRoutes } from "./routes/index.js";

const app = Fastify({
  logger: { transport: { target: "pino-pretty" } },
  bodyLimit: 15 * 1024 * 1024, // 15MB — room for base64 photos
});

await app.register(cors, { origin: true });
await registerRoutes(app);

const PORT = Number(process.env.PORT ?? 3000);
// 0.0.0.0 so your iPhone on the same Wi-Fi can reach it via your laptop's LAN IP.
app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then((addr) => app.log.info(`Coplate API listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
