import type { CollabAutonomy, CollabDecisionPolicy, CollabPermission, CollabRole, CollabRunStatus } from "@/types";

export const ROLE_HINTS: Record<CollabRole, string> = {
  lead: "Plans and delegates the work, reviews changes, and reports back to you.",
  implementer: "Changes files in its scope.",
  reviewer: "Approves or rejects changes with comments; never edits.",
  tester: "Writes tests for each change, runs them, and fails the change if they break.",
};

export const DEFAULT_PERMISSIONS: Record<CollabRole, CollabPermission[]> = {
  lead: ["review"],
  implementer: ["edit", "delete", "run_tests"],
  reviewer: ["review", "run_tests"],
  tester: ["edit", "run_tests", "review"],
};

export const PERMISSION_LABELS: Record<CollabPermission, string> = {
  edit: "Edit files",
  delete: "Delete files",
  run_tests: "Run tests",
  run_commands: "Run commands",
  review: "Review",
};

export const POLICY_HINTS: Record<CollabDecisionPolicy, string> = {
  majority: "Most votes win; ties go to the highest-ranked reviewer.",
  unanimous: "Every reviewer must approve.",
  precedence: "The highest-ranked reviewer decides.",
};

export const AUTONOMY_LABELS: Record<CollabAutonomy, { label: string; hint: string }> = {
  supervised: { label: "Supervised", hint: "You approve every finished step and every command." },
  semi: {
    label: "Semi-autonomous",
    hint: "Agents edit, test and fix on their own. You approve installs, migrations, secrets, git, network and deploy commands.",
  },
  autonomous: { label: "Autonomous", hint: "Agents act within their permissions without asking. Best for throwaway folders." },
};

export const ACTIVE_STATUSES: CollabRunStatus[] = ["queued", "running", "awaiting_approval", "cancelling"];

export const selectClass =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
