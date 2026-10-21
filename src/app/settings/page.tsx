import { connection } from 'next/server';
import { ClaudeCliCard } from '@/components/claude-cli-card';
import { DevJobTrigger } from '@/components/dev-job-trigger';
import { DiscogsCard } from '@/components/discogs-card';
import { StoragePaths } from '@/components/storage-paths';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getClaudeCliStatus } from '@/server/claude/cli';
import { devHooksEnabled } from '@/server/config';
import {
  type DiscogsConnection,
  getDiscogsConnection,
} from '@/server/discogs/auth';
import {
  listSecretStatus,
  type SecretStatus,
  SecretsFileError,
  secretsFile,
} from '@/server/secrets';
import { getVisionModel } from '@/server/settings';
import { dataRoot } from '@/server/storage/paths';

/** Key statuses and the safe connection DTO, both read from secrets.json. */
function readDiscogs():
  | { ok: true; statuses: SecretStatus[]; connection: DiscogsConnection }
  | { ok: false; reason: string } {
  try {
    return {
      ok: true,
      statuses: listSecretStatus(),
      connection: getDiscogsConnection(),
    };
  } catch (err) {
    if (err instanceof SecretsFileError) {
      return { ok: false, reason: err.message.slice(0, 160) };
    }
    throw err;
  }
}

function secretsPathOrNull(): string | null {
  try {
    return secretsFile();
  } catch (err) {
    if (err instanceof SecretsFileError) return null;
    throw err;
  }
}

export default async function SettingsPage() {
  await connection();
  const showDeveloper = devHooksEnabled();
  const secrets = readDiscogs();
  const claude = await getClaudeCliStatus({ maxAgeMs: 0 });

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Keys are saved to secrets.json on this computer, outside the data
          folder, and are never shown in full again after saving.
        </p>
      </div>
      <div className="mt-8 flex flex-col gap-6">
        <ClaudeCliCard status={claude} model={getVisionModel()} />
        <DiscogsCard
          statuses={secrets.ok ? secrets.statuses : null}
          connection={secrets.ok ? secrets.connection : null}
          secretsError={secrets.ok ? undefined : secrets.reason}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data folder</CardTitle>
            <CardDescription>
              {
                'Everything the app stores lives in this folder. Stop the app before copying it to another computer.'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StoragePaths
              dataDir={dataRoot()}
              secretsPath={secretsPathOrNull()}
            />
          </CardContent>
        </Card>
        {showDeveloper ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Developer</CardTitle>
            </CardHeader>
            <CardContent>
              <DevJobTrigger />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
