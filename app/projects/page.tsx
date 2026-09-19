import { auth } from "@/auth";
import { listProjects } from "@/lib/db/project-queries";
import ProjectsDashboard from "@/components/projects-dashboard";

export default async function ProjectsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <p className="text-muted-foreground">Please sign in to view your projects.</p>
      </main>
    );
  }

  const rows = await listProjects(session.user.id);
  const projects = rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    instructions: p.instructions,
    isSystem: p.isSystem,
    updatedAt: p.updatedAt.toISOString(),
  }));

  return <ProjectsDashboard initialProjects={projects} />;
}
