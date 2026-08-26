/**
 * Extension inventory enumeration for the Pi trajectory plugin.
 *
 * Scans ~/.pi/agent/extensions/ for installed pi extensions and returns
 * their name and version. This is a best-effort filesystem scan — the pi SDK
 * does not expose a programmatic way to enumerate installed extensions.
 *
 * Symlinked extensions are resolved and still counted as extensions.
 * On any error, returns an empty array so session_start never fails.
 */

import { readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

export interface ExtensionInfo {
	name: string;
	version: string;
}

const MAX_EXTENSIONS = 128;

/**
 * List installed pi extensions from ~/.pi/agent/extensions/.
 * Returns an array of {name, version} objects. Best-effort: returns [] on error.
 */
export async function listInstalledExtensions(): Promise<ExtensionInfo[]> {
	try {
		const home = process.env.HOME || process.env.USERPROFILE || "";
		if (!home) return [];

		const extensionsDir = join(home, ".pi", "agent", "extensions");
		const entries = await readdir(extensionsDir, { withFileTypes: true });

		const results: ExtensionInfo[] = [];
		const seen = new Set<string>();

		for (const entry of entries) {
			if (results.length >= MAX_EXTENSIONS) break;

			// Skip hidden directories and node_modules
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

			// Only directories and symlinks are extensions
			if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

			try {
				// Resolve symlinks — symlinked extensions are still extensions
				const resolvedPath = await realpath(join(extensionsDir, entry.name));

				// Deduplicate by resolved path
				if (seen.has(resolvedPath)) continue;
				seen.add(resolvedPath);

				// Try to read package.json for name + version
				let name = entry.name;
				let version = "unknown";

				try {
					const pkgRaw = await readFile(join(resolvedPath, "package.json"), "utf-8");
					const pkg = JSON.parse(pkgRaw);
					if (typeof pkg.name === "string" && pkg.name.trim()) {
						name = pkg.name.trim();
					}
					if (typeof pkg.version === "string" && pkg.version.trim()) {
						version = pkg.version.trim();
					}
				} catch {
					// No package.json or parse error — use directory name + "unknown"
				}

				results.push({ name, version });
			} catch {
				// realpath or other error — skip this entry
				continue;
			}
		}

		return results;
	} catch {
		// Any error (dir doesn't exist, permission denied, etc.) — return empty
		return [];
	}
}
