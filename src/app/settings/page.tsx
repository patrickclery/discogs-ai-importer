import { connection } from 'next/server';
import { DevJobTrigger } from '@/components/dev-job-trigger';
import { DiscogsCredentials } from '@/components/secret-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { devHooksEnabled } from '@/server/config';
import {
  listSecretStatus,
  type SecretStatus,
  SecretsFileError,
} from '@/server/secrets';

function readStatuses():
  | { ok: true; statuses: SecretStatus[] }
  | { ok: false; reason: string } {
  try {
    return { ok: true, statuses: listSecretStatus() };
  } catch (err) {
    if (err instanceof SecretsFileError) {
      return { ok: false, reason: err.message.slice(0, 160) };
    }
    throw err;
  }
}

export default async function SettingsPage() {
  await connection();
  const showDeveloper = devHooksEnabled();
  const secrets = readStatuses();

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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Discogs app</CardTitle>
            <CardDescription>
              The consumer key and secret for your Discogs app, from{' '}
              <a
                href="https://www.discogs.com/settings/developers"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
                discogs.com/settings/developers
              </a>
              . You'll connect your Discogs account when matching is added.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {secrets.ok ? (
              <DiscogsCredentials statuses={secrets.statuses} />
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  {`Couldn't read secrets.json: ${secrets.reason}. Fix or delete the file, then reload.`}
                </AlertDescription>
              </Alert>
            )}
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
