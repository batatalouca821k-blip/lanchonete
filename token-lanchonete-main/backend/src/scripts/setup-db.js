// Aplica migrações PostgreSQL e prepara os dados iniciais.
import { closePool, runMigrations } from "../database.js";
import { bootstrapData } from "../services/bootstrapService.js";

try {
  await runMigrations(message => console.log(message));
  await bootstrapData({ log: message => console.log(message) });
  console.log("Banco PostgreSQL pronto.");
} catch (error) {
  console.error("Falha ao preparar o banco:", error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
