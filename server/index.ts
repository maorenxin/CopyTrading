import { startVaultTradesStream } from "./jobs/vault-trades-ws";
import { log } from "./services/logger";

startVaultTradesStream().catch((error) => {
  log("error", "vault websocket start failed", { message: (error as Error).message });
});
