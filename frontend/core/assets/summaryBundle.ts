import type { LLMService } from "../chat/llmService.js";

export interface SummaryBundle {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  chapters: string[];
}

const MAX_LLM_SOURCE_CHARS = 12_000;

function parseBullets(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").trim());
}

export function fallbackSummaryBundle(resourceType: string, assetName: string, content: string): SummaryBundle {
  const excerpt = content.split(/\s+/).filter(Boolean).join(" ").slice(0, 280);
  const summary = excerpt
    ? `${assetName} contains extracted ${resourceType} content. ${excerpt}`
    : `${assetName} was processed as a ${resourceType}, but no text could be extracted.`;
  return { summary, keyPoints: [summary], actionItems: [], chapters: [] };
}

/**
 * Shared summary/key-points/action-items/chapters generation, used by both
 * the job pipeline (core/jobs/processResource.ts) and the on-demand
 * re-summarize path (core/assets/assetService.ts) — the Python backend
 * duplicates this logic once in workers/tasks.py and once in
 * services/transcript_service.py; this consolidates it to one place.
 */
export async function generateSummaryBundle(llm: LLMService, userId: string, resourceType: string, assetName: string, content: string): Promise<SummaryBundle> {
  const fallback = fallbackSummaryBundle(resourceType, assetName, content);
  if (!content.trim()) return fallback;

  try {
    const { model, provider } = llm.resolveModelAndProvider(userId, null);
    const excerpt = content.slice(0, MAX_LLM_SOURCE_CHARS);
    const header = `Resource: ${assetName}\nType: ${resourceType}\n\nSource:\n${excerpt}`;

    const summary = (
      await llm.generateReply(provider, model, [
        { role: "system", content: "Summarize the provided source in 2-4 concise sentences. Be factual and specific." },
        { role: "user", content: header },
      ])
    ).trim();

    const keyPoints = parseBullets(
      await llm.generateReply(provider, model, [
        { role: "system", content: "Extract 3 to 5 key points from the source. Return one bullet per line starting with '- '." },
        { role: "user", content: header },
      ]),
    );

    let actionItems: string[] = [];
    let chapters: string[] = [];
    if (resourceType === "audio" || resourceType === "video") {
      actionItems = parseBullets(
        await llm.generateReply(provider, model, [
          {
            role: "system",
            content: "Extract explicit action items from the source. Return one bullet per line. If there are none, return 'No action items.'",
          },
          { role: "user", content: header },
        ]),
      );
    }
    if (resourceType === "video") {
      chapters = parseBullets(
        await llm.generateReply(provider, model, [
          { role: "system", content: "Create 3 to 6 short chapter headings for the source. Return one bullet per line." },
          { role: "user", content: header },
        ]),
      );
    }

    return {
      summary: summary || fallback.summary,
      keyPoints: keyPoints.length > 0 ? keyPoints : fallback.keyPoints,
      actionItems: actionItems.length > 0 ? actionItems : fallback.actionItems,
      chapters: chapters.length > 0 ? chapters : fallback.chapters,
    };
  } catch {
    return fallback;
  }
}
