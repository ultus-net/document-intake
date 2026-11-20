const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const LABEL = /^(?:buyer|customer|sender|from)\s*:\s*(.+)$/i;

export function readIdentity(text: string): Record<string, string> {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  let email = "";
  let emailLine = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const found = EMAIL.exec(lines[index] ?? "");
    if (found !== null) {
      email = found[0];
      emailLine = index;
      break;
    }
  }
  if (email === "") return {};

  const identity: Record<string, string> = { email };
  const labelled = LABEL.exec(lines[emailLine] ?? "");
  if (labelled !== null) {
    const name = labelled[1]?.replace(/[<[(].*$/, "").trim() ?? "";
    if (name !== "") identity.company = name;
    return identity;
  }

  for (let index = emailLine - 1; index >= 0; index -= 1) {
    const candidate = (lines[index] ?? "").replace(EMAIL, "").trim();
    if (candidate === "" || /^\d/.test(candidate) || /\d{2,}/.test(candidate)) continue;
    identity.company = candidate;
    break;
  }
  return identity;
}
