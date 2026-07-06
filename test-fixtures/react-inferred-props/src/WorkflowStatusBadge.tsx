export function WorkflowStatusBadge({
  status,
  density = 1,
  metadata: {
    owner: { name = "Unknown" },
    flags: { urgent = false } = {},
    tags = []
  },
  ...badgeProps
}) {
  return (
    <span {...badgeProps} data-status={status} data-urgent={urgent}>
      {name}: {status} ({density}) {tags.length}
    </span>
  );
}
