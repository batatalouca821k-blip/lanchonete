import { PORT } from "./config.js";
import { closePool, runMigrations } from "./database.js";
import { createApp } from "./app.js";
import { bootstrapData } from "./services/bootstrapService.js";

try {
  await runMigrations(message => console.log(message));
  await bootstrapData({ log: message => console.log(message) });
} catch (error) {
  console.error(`Não foi possível conectar/preparar o PostgreSQL: ${error.message}`);
  const cause = error.cause;
  if (cause) {
    console.error("Detalhes do PostgreSQL:", JSON.stringify({
      code: cause.code,
      severity: cause.severity,
      message: cause.message,
      detail: cause.detail,
      hint: cause.hint,
      schema: cause.schema,
      table: cause.table,
      routine: cause.routine
    }));
  }
  console.error("Confira DATABASE_URL ou DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME em backend/.env.");
  await closePool().catch(() => {});
  process.exit(1);
}

const server = createApp().listen(PORT, () => {
  console.log(`API disponível em http://localhost:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => closePool().finally(() => process.exit(0))));
}
