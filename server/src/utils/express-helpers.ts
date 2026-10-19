/**
 * Helpers to safely extract values from Express 5 request params/query.
 * Express 5 types query values as string | ParsedQs | (string | ParsedQs)[] | undefined
 * and params as string | string[]. These helpers narrow to simple types.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryValue = any; // Express query value - string | ParsedQs | array | undefined

export const str = (value: QueryValue): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value);
};

export const strOrUndefined = (value: QueryValue): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  return undefined;
};

export const numOrUndefined = (value: QueryValue): number | undefined => {
  const s = strOrUndefined(value);
  if (s === undefined) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
};
