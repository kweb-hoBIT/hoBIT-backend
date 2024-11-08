import { runServer } from "./server/run";
import { createTable } from "../config/createTable";

async function main() {
  await createTable();

  console.log("Starting API server...");
  await runServer();
}

main().catch(console.error);
