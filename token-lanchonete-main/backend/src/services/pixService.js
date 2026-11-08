import { PIX_CITY, PIX_KEY, PIX_MERCHANT_NAME } from "../config.js";

function field(id, value) {
  const text = String(value);
  return `${id}${String(text.length).padStart(2, "0")}${text}`;
}

function crc16(payload) {
  let crc = 0xffff;
  for (const character of payload) {
    crc ^= character.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const ascii = (value, max) => String(value).normalize("NFD").replace(/[^\x20-\x7E]/g, "").toUpperCase().slice(0, max);

/**
 * Pix "copia e cola" estático (BR Code) com valor definido e identificador (txid) da cobrança.
 * Atenção: o Pix estático NÃO avisa o sistema quando é pago; a confirmação é feita por um administrador
 * (ou pelo provedor online, quando configurado).
 */
export function createStaticPixPayload(amountCents, txid = "***") {
  const merchantAccount = field("00", "BR.GOV.BCB.PIX") + field("01", PIX_KEY);
  const additionalData = field("05", String(txid).replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***");
  const payload = [
    field("00", "01"), field("26", merchantAccount), field("52", "0000"),
    field("53", "986"), field("54", (amountCents / 100).toFixed(2)), field("58", "BR"),
    field("59", ascii(PIX_MERCHANT_NAME, 25)), field("60", ascii(PIX_CITY, 15)), field("62", additionalData)
  ].join("");
  return `${payload}6304${crc16(`${payload}6304`)}`;
}
