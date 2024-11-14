import { initializeDatabase } from '../config/createDB';
import { runServer } from './server/run';

(async () => {
  await initializeDatabase();
})();

async function main() {
  console.log('Starting API server...');
  await runServer();
}

main().catch(console.error);
