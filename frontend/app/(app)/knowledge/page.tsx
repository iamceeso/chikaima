import { Database, FileText, FolderKanban, Sparkles } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";

const knowledgeAreas = [
  {
    title: "Shared uploads",
    detail: "Documents, transcripts, and media references that every chat in the workspace can reuse.",
    icon: FileText,
  },
  {
    title: "Workspace memory",
    detail: "Persistent notes, definitions, and reusable context that should outlive any single conversation.",
    icon: Database,
  },
  {
    title: "Team context",
    detail: "Provider-level knowledge and shared project guidance accessible across multiple chats.",
    icon: FolderKanban,
  },
];

export default function KnowledgePage() {
  return (
    <>
      <Topbar
        title="Workspace knowledge"
        description="Manage the uploads and shared context that should be available across conversations."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {knowledgeAreas.map((area) => {
          const Icon = area.icon;
          return (
            <Card key={area.title} className="rounded-[1.5rem]">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background-secondary text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">{area.title}</h2>
              <p className="mt-2 text-sm leading-7 text-foreground-muted">{area.detail}</p>
            </Card>
          );
        })}
      </div>
      <Card className="mt-4 rounded-[1.5rem]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">How this works</h2>
            <p className="mt-1 text-sm leading-7 text-foreground-muted">
              A workspace can keep universal uploads and shared knowledge, while each chat can also own its own
              records and attached context independently.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
