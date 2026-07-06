import { WorkflowStatusBadge } from "./WorkflowStatusBadge";

export function App() {
  const metadata = {
    owner: { name: "Morgan" },
    flags: { urgent: true },
    tags: ["ready"]
  };

  return (
    <WorkflowStatusBadge
      status="ready"
      density={2}
      metadata={metadata}
      data-testid="workflow-status"
    />
  );
}
