import fs from "node:fs";
import path from "node:path";

/**
 * Get candidate paths for a view file
 */
export function viewCandidates(name: string): string[] {
  return [
    path.resolve(__dirname, "..", "views", name),
    path.resolve(
      process.cwd(),
      "node_modules",
      "@attaryz",
      "fastify-devtools",
      "dist",
      "views",
      name,
    ),
  ];
}

/**
 * Load a view file from possible locations
 */
export async function loadView(name: string): Promise<string> {
  const candidates = viewCandidates(name);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return await fs.promises.readFile(p, "utf8");
      }
    } catch {}
  }
  throw new Error(`DevTools view not found: ${name}`);
}

/**
 * Render a template with variable substitution
 */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}
