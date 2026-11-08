import { APP_TIMEZONE, APP_UTC_OFFSET } from "../config.js";
import { HttpError } from "./http.js";

const DAY = 24 * 3600 * 1000;

function parseDay(value, label) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new HttpError(400, `Data inválida em "${label}". Use o formato AAAA-MM-DD.`);
  const date = new Date(`${value}T00:00:00${APP_UTC_OFFSET}`);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Data inválida em "${label}".`);
  return date;
}

/** Converte "de/até" (dias, inclusivos, no fuso da lanchonete) em um intervalo [start, end) em UTC. */
export function dateRange(from, to) {
  const start = parseDay(from, "de");
  const endDay = parseDay(to, "até");
  const end = endDay ? new Date(endDay.getTime() + DAY) : null;
  if (start && end && start >= end) throw new HttpError(400, "A data inicial deve ser anterior à final.");
  return { start, end };
}

export function dayKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
}

export const escapeLike = value => String(value).replace(/[\\%_]/g, character => `\\${character}`);
