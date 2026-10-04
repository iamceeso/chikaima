import type { Autonomy, Permission } from "./capabilities.js";
import type { CollabRole } from "./protocol.js";

export interface TemplateMember {
  title: string;
  role: CollabRole;
  precedence: number;
  instructions: string;
  permissions: Permission[];
  scope: string[];
  reports_to: number | null;
  reviewed_by: number[];
}

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  autonomy: Autonomy;
  decision_policy: "majority" | "unanimous" | "precedence";
  test_command: string | null;
  members: TemplateMember[];
}

/** Starting points for common team shapes. Models are chosen by the admin when the template is applied. */
export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: "solo",
    name: "Solo Developer Team",
    description: "A lead who plans, one coder, and one reviewer. The cheapest useful team.",
    autonomy: "semi",
    decision_policy: "precedence",
    test_command: null,
    members: [
      {
        title: "Lead Engineer",
        role: "lead",
        precedence: 1,
        instructions: "Keep plans small and concrete. Prefer the simplest change that solves the task.",
        permissions: ["review"],
        scope: [],
        reports_to: null,
        reviewed_by: [],
      },
      {
        title: "Coder",
        role: "implementer",
        precedence: 2,
        instructions: "Match the existing code style. Read before you write.",
        permissions: ["edit", "delete", "run_tests"],
        scope: [],
        reports_to: 1,
        reviewed_by: [3],
      },
      {
        title: "Reviewer",
        role: "reviewer",
        precedence: 3,
        instructions: "Reject only for real defects: bugs, missing pieces, or changes outside the step.",
        permissions: ["review", "run_tests"],
        scope: [],
        reports_to: 1,
        reviewed_by: [],
      },
    ],
  },
  {
    id: "fullstack",
    name: "Full Stack Team",
    description: "A lead with frontend and backend engineers, QA, and a code reviewer.",
    autonomy: "semi",
    decision_policy: "majority",
    test_command: "npm test",
    members: [
      {
        title: "Lead Engineer",
        role: "lead",
        precedence: 1,
        instructions: "Plan small, independent steps and give frontend and backend work to the right engineer.",
        permissions: ["review"],
        scope: [],
        reports_to: null,
        reviewed_by: [],
      },
      {
        title: "Backend Engineer",
        role: "implementer",
        precedence: 2,
        instructions: "Own APIs, data and server logic. Validate input and check authorization.",
        permissions: ["edit", "delete", "run_tests"],
        scope: [],
        reports_to: 1,
        reviewed_by: [5, 4],
      },
      {
        title: "Frontend Engineer",
        role: "implementer",
        precedence: 3,
        instructions: "Own the UI. Reuse existing components; check pages in the preview when it is running.",
        permissions: ["edit", "delete", "run_tests", "browser"],
        scope: [],
        reports_to: 1,
        reviewed_by: [5, 4],
      },
      {
        title: "QA Engineer",
        role: "tester",
        precedence: 4,
        instructions: "Write focused tests for each change, run the suite, and reject if anything fails.",
        permissions: ["edit", "run_tests", "review", "browser"],
        scope: ["tests", "test", "__tests__", "**/*.test.*", "**/*.spec.*"],
        reports_to: 1,
        reviewed_by: [],
      },
      {
        title: "Code Reviewer",
        role: "reviewer",
        precedence: 5,
        instructions: "Reject only for real defects: bugs, missing pieces, security issues, or changes outside the step.",
        permissions: ["review", "run_tests"],
        scope: [],
        reports_to: 1,
        reviewed_by: [],
      },
    ],
  },
  {
    id: "saas",
    name: "SaaS Team",
    description: "Frontend and backend engineers with a database owner, QA, and a security reviewer.",
    autonomy: "semi",
    decision_policy: "majority",
    test_command: "npm test",
    members: [
      {
        title: "Lead Engineer",
        role: "lead",
        precedence: 1,
        instructions: "Own the architecture. Split work so frontend, backend and database steps don't overlap files.",
        permissions: ["review"],
        scope: [],
        reports_to: null,
        reviewed_by: [],
      },
      {
        title: "Backend Engineer",
        role: "implementer",
        precedence: 2,
        instructions: "Own APIs and server logic. Validate input and check authorization on every endpoint.",
        permissions: ["edit", "delete", "run_tests"],
        scope: ["src/server", "src/api", "app/api", "lib", "server"],
        reports_to: 1,
        reviewed_by: [5, 6],
      },
      {
        title: "Frontend Engineer",
        role: "implementer",
        precedence: 3,
        instructions: "Own UI. Reuse existing components and keep pages accessible. Check your pages in the preview when it is running.",
        permissions: ["edit", "delete", "run_tests", "browser"],
        scope: ["src/frontend", "src/components", "components", "app", "pages", "public", "styles"],
        reports_to: 1,
        reviewed_by: [1, 6],
      },
      {
        title: "Database Engineer",
        role: "implementer",
        precedence: 4,
        instructions: "Own schema and migrations. Prefer backwards-compatible migrations. Never remove columns without approval. Review indexes for large tables.",
        permissions: ["edit", "run_tests"],
        scope: ["database", "migrations", "prisma", "drizzle", "db"],
        reports_to: 1,
        reviewed_by: [5],
      },
      {
        title: "Security Reviewer",
        role: "reviewer",
        precedence: 5,
        instructions: "Check authentication, authorization, input validation, secrets handling and webhook verification.",
        permissions: ["review", "run_tests"],
        scope: [],
        reports_to: 1,
        reviewed_by: [],
      },
      {
        title: "QA Engineer",
        role: "tester",
        precedence: 6,
        instructions: "Write focused tests for the change, run the suite, and reject if anything fails. Check user-facing changes in the preview.",
        permissions: ["edit", "run_tests", "review", "browser"],
        scope: ["tests", "test", "__tests__", "**/*.test.*", "**/*.spec.*"],
        reports_to: 1,
        reviewed_by: [],
      },
    ],
  },
  {
    id: "laravel",
    name: "Laravel Team",
    description: "A Laravel architect with backend and Vue/React agents, PHPUnit tests and a security review.",
    autonomy: "semi",
    decision_policy: "majority",
    test_command: "php artisan test",
    members: [
      {
        title: "Laravel Architect",
        role: "lead",
        precedence: 1,
        instructions: "Follow Laravel conventions: Form Requests for validation, Policies for authorization, Eloquent relationships over raw queries.",
        permissions: ["review"],
        scope: [],
        reports_to: null,
        reviewed_by: [],
      },
      {
        title: "Backend Agent",
        role: "implementer",
        precedence: 2,
        instructions: "Own controllers, models, routes and migrations. Keep controllers thin.",
        permissions: ["edit", "delete", "run_tests"],
        scope: ["app", "routes", "database", "config"],
        reports_to: 1,
        reviewed_by: [4, 5],
      },
      {
        title: "Vue/React Agent",
        role: "implementer",
        precedence: 3,
        instructions: "Own the frontend in resources/. Use the project's existing component patterns.",
        permissions: ["edit", "delete", "run_tests", "browser"],
        scope: ["resources"],
        reports_to: 1,
        reviewed_by: [1, 5],
      },
      {
        title: "Security Reviewer",
        role: "reviewer",
        precedence: 4,
        instructions: "Check mass assignment, authorization policies, CSRF, validation and query safety.",
        permissions: ["review", "run_tests"],
        scope: [],
        reports_to: 1,
        reviewed_by: [],
      },
      {
        title: "PHPUnit Agent",
        role: "tester",
        precedence: 5,
        instructions: "Write feature and unit tests with PHPUnit for the change, run them, and reject on failure.",
        permissions: ["edit", "run_tests", "review", "browser"],
        scope: ["tests"],
        reports_to: 1,
        reviewed_by: [],
      },
    ],
  },
];
