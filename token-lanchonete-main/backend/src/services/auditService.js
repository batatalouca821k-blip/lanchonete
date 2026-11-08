import { randomUUID } from "node:crypto";
import { query } from "../database.js";

/**
 * Registra uma alteração importante. Deve receber a conexão da transação quando a operação
 * financeira estiver em andamento, para que o log seja confirmado (ou desfeito) junto com ela.
 */
export async function audit(conn, { actor = null, ip = null, action, entity, entityId = null, accountId = null, details = null }) {
  await query(
    `INSERT INTO audit_log (id, actor_id, actor_name, actor_role, action, entity, entity_id, account_id, details, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(), actor?.id ?? null, actor?.name ?? null, actor?.role ?? null, action, entity,
      entityId, accountId, details ? JSON.stringify(details) : null, ip, new Date()
    ],
    conn
  );
}

export function mapAudit(row) {
  let details = null;
  try { details = row.details ? JSON.parse(row.details) : null; } catch { details = null; }
  return {
    id: row.id, actorId: row.actor_id, actorName: row.actor_name, actorRole: row.actor_role,
    action: row.action, entity: row.entity, entityId: row.entity_id, accountId: row.account_id,
    details, ip: row.ip, createdAt: row.created_at
  };
}
