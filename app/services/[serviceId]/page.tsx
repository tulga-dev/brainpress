import { ProjectWorkspace } from "@/components/brainpress/project-workspace";

export default async function ServiceWorkspacePage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  return <ProjectWorkspace projectId={serviceId} />;
}
