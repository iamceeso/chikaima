/**
 * The tag protocol agents use to act inside a collaboration run. Plain
 * tags (rather than each vendor's native tool-calling API) work the same
 * across every provider adapter, including small local models, and keep
 * file contents free of JSON escaping.
 */

import type { Permission } from "./capabilities.js";

export type CollabRole = "lead" | "implementer" | "reviewer" | "tester";
export type DecisionPolicy = "majority" | "unanimous" | "precedence";

export const COLLAB_ROLES: readonly CollabRole[] = ["lead", "implementer", "reviewer", "tester"];
export const DECISION_POLICIES: readonly DecisionPolicy[] = ["majority", "unanimous", "precedence"];

export type WorkspaceAction =
  | { type: "list"; path: string }
  | { type: "read"; path: string }
  | { type: "write"; path: string; content: string }
  | { type: "delete"; path: string }
  | { type: "test" }
  | { type: "run"; command: string }
  | { type: "browse"; path: string }
  | { type: "screenshot"; path: string }
  | { type: "deploy" };

export interface AgentTurn {
  actions: WorkspaceAction[];
  message: string | null;
  done: boolean;
  verdict: ReviewVerdict | null;
}

export interface PlanStep {
  assignee: number;
  instruction: string;
}

export interface ReviewVerdict {
  vote: "approve" | "reject" | null;
  comments: string;
}

function attr(attributes: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attributes);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

/** Models often wrap file bodies in a Markdown fence even when told not to; unwrap a body that is entirely one fence. */
function unwrapFence(content: string): string {
  const match = /^\s*```[^\n]*\n([\s\S]*?)\n```\s*$/.exec(content);
  return match ? `${match[1]}\n` : content;
}

function firstTag(text: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(text);
  return match ? match[1]!.trim() : null;
}

export function parseAgentTurn(text: string): AgentTurn {
  const actions: WorkspaceAction[] = [];
  // One pass in document order, so a read that follows a write sees the write.
  const pattern = /<write\s+([^>]*?)>([\s\S]*?)<\/write>|<run>([\s\S]*?)<\/run>|<(test|deploy)\s*\/?>|<(list|read|delete|browse|screenshot)\s+([^>]*?)\/?>/gi;
  for (const match of text.matchAll(pattern)) {
    if (match[1] !== undefined) {
      const path = attr(match[1], "path");
      if (path) actions.push({ type: "write", path, content: unwrapFence(match[2]!.replace(/^\r?\n/, "")) });
    } else if (match[3] !== undefined) {
      const command = match[3].trim();
      if (command) actions.push({ type: "run", command });
    } else if (match[4] !== undefined) {
      actions.push({ type: match[4].toLowerCase() as "test" | "deploy" });
    } else {
      const path = attr(match[6] ?? "", "path");
      const type = match[5]!.toLowerCase() as "list" | "read" | "delete" | "browse" | "screenshot";
      if (path || type === "list") actions.push({ type, path: path ?? (type === "browse" || type === "screenshot" ? "/" : ".") } as WorkspaceAction);
      else if (type === "browse" || type === "screenshot") actions.push({ type, path: "/" });
    }
  }
  const hasVerdict = /<verdict>/i.test(text);
  return {
    actions,
    message: firstTag(text, "message"),
    done: /<done\s*\/?>/i.test(text),
    verdict: hasVerdict ? parseVerdict(text) : null,
  };
}

export function parsePlan(text: string): PlanStep[] {
  const steps: PlanStep[] = [];
  for (const match of text.matchAll(/<step\s+([^>]*?)>([\s\S]*?)<\/step>/gi)) {
    const assignee = Number.parseInt(attr(match[1]!, "assignee") ?? "", 10);
    const instruction = match[2]!.trim();
    if (Number.isInteger(assignee) && instruction) steps.push({ assignee, instruction });
  }
  return steps;
}

export function parseVerdict(text: string): ReviewVerdict {
  const raw = (firstTag(text, "verdict") ?? "").toLowerCase();
  const vote = raw.startsWith("approve") ? "approve" : raw.startsWith("reject") ? "reject" : null;
  return { vote, comments: firstTag(text, "comments") ?? text.replace(/<verdict>[\s\S]*?<\/verdict>/i, "").trim() };
}

export interface MemberLike {
  name: string;
  title: string;
  role: string;
  precedence: number;
  instructions: string;
  scope: string[];
  reportsTo: number | null;
}

function label(member: MemberLike): string {
  return `#${member.precedence} ${member.name}${member.title ? `, ${member.title}` : ""}`;
}

function describeTeam(members: MemberLike[]): string {
  return members
    .map((member) => {
      const boss = member.reportsTo ? members.find((other) => other.precedence === member.reportsTo) : undefined;
      const scope = member.scope.length > 0 ? ` · owns ${member.scope.join(", ")}` : "";
      return `- ${label(member)} (${member.role})${scope}${boss ? ` · reports to #${boss.precedence}` : ""}`;
    })
    .join("\n");
}

function identity(member: MemberLike, members: MemberLike[]): string {
  return [
    `You are ${member.name}${member.title ? `, the ${member.title}` : ""}, on a team of AI agents working in one shared project folder. A human supervises the team.`,
    `Precedence ranks who has the final say when the team disagrees; #1 outranks #2, and so on. You are #${member.precedence}.`,
    `The team:\n${describeTeam(members)}`,
    member.scope.length > 0 ? `You may only change files under: ${member.scope.join(", ")}. Edits elsewhere are refused.` : "",
    member.instructions ? `Your instructions from the admin:\n${member.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface ToolOptions {
  testCommand: string | null;
  commandsEnabled: boolean;
  previewRunning: boolean;
  screenshots: boolean;
  deployCommand: string | null;
}

/** The action tags this agent is allowed to use, given its permissions and what the server allows. */
function toolList(permissions: Set<Permission>, options: ToolOptions): string {
  const lines = ['<list path="."/>                   list a directory (recursive)', '<read path="src/app.ts"/>          read a file'];
  if (permissions.has("edit")) lines.push('<write path="src/app.ts">…</write>  create or replace a file with its full new content (no Markdown fences)');
  if (permissions.has("delete")) lines.push('<delete path="old.txt"/>           delete a file');
  if (permissions.has("run_tests") && options.testCommand && options.commandsEnabled) lines.push(`<test/>                            run the project's tests (${options.testCommand})`);
  if (permissions.has("run_commands") && options.commandsEnabled) lines.push("<run>npm run lint</run>             run a shell command in the folder (risky commands may wait for human approval)");
  if (permissions.has("browser") && options.previewRunning) {
    lines.push('<browse path="/pricing"/>          load a page of the running app preview and read its text');
    if (options.screenshots) lines.push('<screenshot path="/pricing"/>      capture a screenshot of a preview page (you will see the image)');
  }
  if (permissions.has("deploy") && options.deployCommand && options.commandsEnabled) lines.push(`<deploy/>                          deploy the project (${options.deployCommand}); always waits for human approval`);
  return lines.join("\n");
}

export function leadPlanPrompt(lead: MemberLike, members: MemberLike[], task: string, tree: string): string {
  const implementers = members.filter((member) => member.role === "implementer");
  return [
    identity(lead, members),
    `You are the lead. Break the task into a short ordered list of steps and assign each to the implementer who owns that area (${implementers.map(label).join("; ")}).`,
    "Each step must be self-contained: the implementer sees only your instruction, the task, and the folder. Respect each implementer's file scope. Reviewers and testers check every step before it is kept.",
    'Reply with one tag per step, in order, and nothing else:\n<step assignee="2">What to change, in which files, and how to tell it is done.</step>',
    `Task:\n${task}`,
    `Folder contents:\n${tree}`,
  ].join("\n\n");
}

export function implementerPrompt(
  member: MemberLike,
  members: MemberLike[],
  permissions: Set<Permission>,
  options: ToolOptions,
  task: string,
  instruction: string,
  tree: string,
): string {
  return [
    identity(member, members),
    "You work on the shared folder directly. Use these tags; paths are relative to the folder:",
    `${toolList(permissions, options)}\n<message>…</message>              a short note to your reviewers explaining what you did\n<done/>                            you have finished this step`,
    "Read a file before rewriting it. Results of each action come back in the next message. When the step is complete, reply with a <message> and <done/>.",
    `Overall task:\n${task}`,
    `Your step:\n${instruction}`,
    `Folder contents:\n${tree}`,
  ].join("\n\n");
}

export function reviewerPrompt(
  member: MemberLike,
  members: MemberLike[],
  permissions: Set<Permission>,
  options: ToolOptions,
  task: string,
  instruction: string,
  author: MemberLike,
  note: string | null,
  diff: string,
): string {
  const tester = member.role === "tester";
  return [
    identity(member, members),
    tester
      ? `${label(author)} has made the change below. As tester, write or update focused tests for it inside your scope, run the tests, and judge whether the change works.`
      : `${label(author)} has made the change below. Check it is correct, complete, safe, and does only what the step asks. Do not rewrite it yourself.`,
    `You may inspect the folder first:\n${toolList(permissions, options)}`,
    "When you have decided, reply with exactly:\n<verdict>approve</verdict> or <verdict>reject</verdict>\n<comments>Specific reasons. If rejecting, say exactly what must change.</comments>",
    `Overall task:\n${task}`,
    `Step:\n${instruction}`,
    note ? `${author.name}'s note:\n${note}` : "",
    `Change:\n${diff}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function leadSummaryPrompt(lead: MemberLike, members: MemberLike[], task: string, outcomes: string): string {
  return [
    identity(lead, members),
    "The run is finished. Write a short report for the human supervisor: what was done, what was rejected and why, and anything that still needs a human decision.",
    `Task:\n${task}`,
    `Step outcomes:\n${outcomes}`,
  ].join("\n\n");
}
