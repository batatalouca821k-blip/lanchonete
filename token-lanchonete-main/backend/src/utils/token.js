export function createToken(sequence) {
  return String(sequence).padStart(3, "0");
}
