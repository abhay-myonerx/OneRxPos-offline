import fg from "fast-glob";

/** All page.tsx-derived route paths under a given app/ subtree (route groups stripped). */
export function expectedPaths(globs: string[]): string[] {
  const files = fg.sync(globs, { cwd: process.cwd() });
  const paths = files.map(
    (f) =>
      f
        .replace(/^src\/app/, "")
        .replace(/\/page\.tsx$/, "")
        .replace(/\/\([^/]+\)/g, "") // drop route groups
        .replace(/\[(\.\.\.)?([^\]]+)\]/g, ":$2") // [id] -> :id
        .replace(/^$/, "/") || "/",
  );
  return Array.from(new Set(paths.map((p) => (p === "" ? "/" : p)))).sort();
}
