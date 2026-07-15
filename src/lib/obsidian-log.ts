import { execFile } from "child_process"
import path from "path"

/**
 * Best-effort append of an audit note to the local Obsidian vault via
 * scripts/save_to_obsidian.js.
 *
 * SECURITY: uses execFile with an argument array — NOT a shell string — so
 * title/content are passed as literal argv entries. Shell metacharacters in
 * user input (quotes, ;, |, $(), backticks) are inert and cannot inject
 * commands. Fire-and-forget: failures are swallowed so logging never blocks
 * or breaks the request, and never surfaces script paths to the client.
 */
export function logToObsidian(title: string, content: string): void {
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "save_to_obsidian.js")
    execFile("node", [scriptPath, title, content], (error) => {
      if (error) console.error(`obsidian-log failed: ${error.message}`)
    })
  } catch (err) {
    console.error("obsidian-log threw:", err)
  }
}
