import { effectivePermissions } from "./capabilities.js";
import type { TeamWithMembers } from "./collabService.js";
import type { CollabApprovalRow, CollabMessageRow, CollabRunRow } from "./repository.js";

export function toTeamResponse({ team, members }: TeamWithMembers) {
  return {
    id: team.id,
    name: team.name,
    folder: team.folder,
    decision_policy: team.decisionPolicy,
    max_revisions: team.maxRevisions,
    autonomy: team.autonomy,
    test_command: team.testCommand,
    max_model_calls: team.maxModelCalls,
    members: members.map((member) => ({
      id: member.id,
      model_id: member.modelId,
      name: member.name,
      title: member.title,
      role: member.role,
      instructions: member.instructions,
      precedence: member.precedence,
      scope: member.scope,
      /** Effective permissions: the stored list, or the role's defaults when none were set. */
      permissions: Array.from(effectivePermissions(member.role, member.permissions)),
      reports_to: member.reportsTo,
      reviewed_by: member.reviewedBy,
    })),
    created_at: team.createdAt,
    updated_at: team.updatedAt,
  };
}

export function toRunResponse(run: CollabRunRow) {
  return {
    id: run.id,
    team_id: run.teamId,
    task: run.task,
    status: run.status,
    result: run.result as Record<string, unknown>,
    error_message: run.errorMessage,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    created_at: run.createdAt,
  };
}

export type CollabMessageResponse = ReturnType<typeof toMessageResponse>;

export function toMessageResponse(message: CollabMessageRow) {
  return {
    id: message.id,
    run_id: message.runId,
    member_id: message.memberId,
    kind: message.kind,
    content: message.content,
    data: message.data as Record<string, unknown>,
    created_at: message.createdAt,
  };
}

export function toApprovalResponse(approval: CollabApprovalRow) {
  return {
    id: approval.id,
    run_id: approval.runId,
    member_id: approval.memberId,
    kind: approval.kind,
    summary: approval.summary,
    payload: approval.payload as Record<string, unknown>,
    status: approval.status,
    note: approval.note,
    created_at: approval.createdAt,
    resolved_at: approval.resolvedAt,
  };
}
