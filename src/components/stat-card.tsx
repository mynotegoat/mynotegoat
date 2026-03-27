export function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="panel-card p-4">
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-[var(--text-main)]">{value}</p>
    </div>
  );
}
