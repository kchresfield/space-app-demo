export function maskPhone(phone) {
  const value = String(phone || "");
  if (!value || value.length <= 4) return value;
  return `${"X".repeat(value.length - 4)}${value.slice(-4)}`;
}

export function normalizePhoneAddress(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/^(sms|voice|whatsapp|rcs):/i, "");
}

export function comparableAddress(value) {
  return normalizePhoneAddress(value).replace(/[^0-9]/g, "");
}

export function sameAddress(left, right) {
  const leftComparable = comparableAddress(left);
  const rightComparable = comparableAddress(right);
  return Boolean(leftComparable && rightComparable && leftComparable === rightComparable);
}
