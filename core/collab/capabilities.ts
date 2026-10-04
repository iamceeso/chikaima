/**
 * What an agent may do and when a human must sign off. Roles are not just
 * prompt labels: permissions and scope are enforced on every action, and
 * the team's autonomy level decides which actions pause for approval.
 */

export type Permission = "edit" | "delete" | "run_tests" | "run_commands" | "review" | "browser" | "deploy";
export type Autonomy = "supervised" | "semi" | "autonomous";
export type ApprovalKind = "command" | "delete" | "sensitive_file" | "step" | "merge" | "deploy";

export const PERMISSIONS: readonly Permission[] = ["edit", "delete", "run_tests", "run_commands", "review", "browser", "deploy"];
export const AUTONOMY_LEVELS: readonly Autonomy[] = ["supervised", "semi", "autonomous"];

export const DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  lead: ["review"],
  implementer: ["edit", "delete", "run_tests"],
  reviewer: ["review", "run_tests"],
  tester: ["edit", "run_tests", "review", "browser"],
};

/** A member's stored permissions, or its role's defaults when none were set. */
export function effectivePermissions(role: string, stored: string[]): Set<Permission> {
  const list = stored.length > 0 ? stored : (DEFAULT_PERMISSIONS[role] ?? []);
  return new Set(list.filter((value): value is Permission => (PERMISSIONS as readonly string[]).includes(value)));
}

function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index]!;
    if (char === "*") {
      if (glob[index + 1] === "*") {
        // "**/" matches zero or more whole directories; a trailing "**" matches anything below.
        const slash = glob[index + 2] === "/";
        pattern += slash ? "(?:.*/)?" : ".*";
        index += slash ? 2 : 1;
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

/** Whether a folder-relative path is inside an agent's scope. A plain entry ("src/api") covers that path and everything below it. */
export function inScope(scope: string[], path: string): boolean {
  if (scope.length === 0) return true;
  return scope.some((entry) => {
    const cleaned = entry.trim().replace(/^\.?\/+/, "").replace(/\/+$/, "");
    if (!cleaned || cleaned === "**") return true;
    if (!/[*?]/.test(cleaned)) return path === cleaned || path.startsWith(`${cleaned}/`);
    return globToRegExp(cleaned).test(path) || globToRegExp(`${cleaned}/**`).test(path);
  });
}

/**
 * Commands that touch dependencies, databases, version control, the network,
 * infrastructure or the wider filesystem: the categories that always need a
 * human under semi-autonomy.
 */
const RISKY_COMMAND =
  /\b(npm|pnpm|yarn|bun|pip3?|poetry|composer|gem|cargo|go|brew|apt(-get)?|apk)\s+(install|i|add|remove|uninstall|update|upgrade|require|get)\b|migrat|\b(rm|rmdir|mv|chmod|chown|dd|mkfs)\s|\bgit\s+(push|merge|reset|rebase|checkout|clean|commit)\b|\b(deploy|publish|release)\b|\b(curl|wget|ssh|scp|rsync|nc)\b|\b(sudo|su|docker|kubectl|terraform|helm|aws|gcloud|az)\b|>\s*\/|\bsecret/i;

/** Files whose edit always needs a human under semi-autonomy: secrets and database migrations. */
const SENSITIVE_PATH = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*)$|(^|\/)(migrations?|db\/migrate)\//i;

export function isRiskyCommand(command: string): boolean {
  return RISKY_COMMAND.test(command);
}

export function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATH.test(path);
}

/** Whether an action needs a human decision at this autonomy level. Deploys always do. */
export function needsApproval(
  autonomy: Autonomy,
  action: { kind: "command"; command: string } | { kind: "delete"; path: string } | { kind: "write"; path: string } | { kind: "step" } | { kind: "merge" } | { kind: "deploy" },
): boolean {
  if (action.kind === "deploy") return true;
  if (autonomy === "autonomous") return false;
  switch (action.kind) {
    case "command":
      return autonomy === "supervised" || isRiskyCommand(action.command);
    case "delete":
      return autonomy === "supervised";
    case "write":
      return isSensitivePath(action.path);
    case "step":
      return autonomy === "supervised";
    case "merge":
      return true;
  }
}
