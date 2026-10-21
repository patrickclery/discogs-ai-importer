import {
  CONNECT_BUTTON_ID,
  ConnectDiscogsButton,
} from '@/components/connect-discogs-button';
import { DiscogsCredentials } from '@/components/secret-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { DiscogsConnection } from '@/server/discogs/auth';
import type { SecretStatus } from '@/server/secrets';

// Settings "Discogs" card (DISC-01, D-01, D-02; UI-SPEC). Server component.
// It is rendered from the consumer-key statuses and getDiscogsConnection()
// only: a username and booleans. No token or secret ever reaches it (D-02).

function AccountSection({ connection }: { connection: DiscogsConnection }) {
  if (connection.connected && connection.username) {
    return (
      <p className="text-sm">
        {'Connected as '}
        <span className="font-medium">{connection.username}</span>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {
          'Connecting opens discogs.com so you can approve this app. The app only reads from Discogs for now. Nothing is added to your collection.'
        }
      </p>
      <ConnectDiscogsButton
        id={CONNECT_BUTTON_ID}
        credentialsSaved={connection.credentialsSaved}
      />
    </div>
  );
}

export function DiscogsCard({
  statuses,
  connection,
  secretsError,
}: {
  statuses: SecretStatus[] | null;
  connection: DiscogsConnection | null;
  secretsError?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Discogs</CardTitle>
        <CardDescription>
          {
            'Connect your Discogs account so the app can look up each CD on Discogs. The consumer key and secret come from your Discogs app at '
          }
          <a
            href="https://www.discogs.com/settings/developers"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            discogs.com/settings/developers
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {statuses && connection ? (
          <>
            <DiscogsCredentials statuses={statuses} />
            <Separator />
            <AccountSection connection={connection} />
          </>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>
              {`Couldn't read secrets.json: ${secretsError ?? 'unknown error'}. Fix or delete the file, then reload.`}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
