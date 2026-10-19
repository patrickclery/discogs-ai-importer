import { Label } from '@/components/ui/label';

/** Read-only Data folder card body: absolute data and secrets paths. */
export function StoragePaths({
  dataDir,
  secretsPath,
}: {
  dataDir: string;
  secretsPath: string | null;
}) {
  const rows = [
    { id: 'storage-data-dir', label: 'Data folder', value: dataDir },
    {
      id: 'storage-secrets-file',
      label: 'Secrets file',
      value:
        secretsPath ?? 'Not available (SECRETS_FILE must be outside DATA_DIR)',
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-col gap-2">
          <Label>{row.label}</Label>
          <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
            {row.value}
          </div>
        </div>
      ))}
    </div>
  );
}
