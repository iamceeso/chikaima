export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobType = "audio_transcription" | "video_analysis" | "document_analysis";

export const RESOURCE_TYPE_BY_JOB_TYPE: Record<JobType, string> = {
  audio_transcription: "audio",
  video_analysis: "video",
  document_analysis: "document",
};
