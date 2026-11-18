import { notFound } from "next/navigation";
import { WorkspaceClient } from "@/components/workspace/WorkspaceClient";
import { providerInfo } from "@/lib/ai/provider";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { listAiRequests } from "@/lib/repo/ai";
import { requireAppAccess } from "@/lib/repo/apps";
import { listActivity, listRecords } from "@/lib/repo/records";
import { listMembers } from "@/lib/repo/workspaces";
import { interfaceHistory, loadInterface } from "@/lib/interface/service";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const user = await requireUser();
  const { appId } = await params;

  let access: ReturnType<typeof requireAppAccess>;
  try {
    access = requireAppAccess(appId, user.id);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  }

  const { document, pages } = loadInterface(access, user.id);
  const tasks = listRecords(access.app.id, "task");
  const notes = listRecords(access.app.id, "note");
  const activity = listActivity(access.app.id, 12);
  const history = interfaceHistory(access, user.id).slice(0, 30);
  const members = listMembers(access.workspace.id);
  const provider = providerInfo();

  // Recorded so the assistant panel can show recent prompts in future revisions
  // of this screen without another round trip.
  void listAiRequests(access.app.id, user.id, 5);

  return (
    <WorkspaceClient
      user={{ id: user.id, name: user.name, email: user.email }}
      app={{
        id: access.app.id,
        name: access.app.name,
        description: access.app.description,
      }}
      workspace={{ id: access.workspace.id, name: access.workspace.name }}
      role={access.role}
      canEdit={access.canEdit}
      canManage={access.canManage}
      pages={pages}
      initialDocument={document}
      initialTasks={tasks}
      initialNotes={notes}
      activity={activity}
      initialHistory={history}
      members={members}
      ai={{ provider: provider.provider, model: provider.model, kind: provider.kind }}
    />
  );
}
