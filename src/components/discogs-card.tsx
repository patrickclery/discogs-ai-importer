import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Suspense } from 'react';
import { CallbackUrlField } from '@/components/callback-url-field';
import { CollectionFolderField } from '@/components/collection-folder-field';
import {
  CONNECT_BUTTON_ID,
  ConnectDiscogsButton,
} from '@/components/connect-discogs-button';
import { CornerNumeral } from '@/components/corner-numeral';
import { DiscogsConnectNotice } from '@/components/discogs-connect-notice';
import { DisconnectDiscogsButton } from '@/components/disconnect-discogs-button';
import { MdPrefix } from '@/components/md-prefix';
import { PasteCodeForm } from '@/components/paste-code-form';
import {
  FallbackCountryField,
  PreferredCountryField,
} from '@/components/preferred-country-field';
import { DiscogsCredentials } from '@/components/secret-field';
import { TestDiscogsButton } from '@/components/test-discogs-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
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

function ConnectionBadge({
  connection,
}: {
  connection: DiscogsConnection | null;
}) {
  if (connection?.connected && connection.needsReconnect) {
    return (
      <Badge variant="outline">
        <TriangleAlert aria-hidden="true" className="text-warning" />
        Reconnect needed
      </Badge>
    );
  }
  if (connection?.connected) {
    return (
      <Badge variant="outline">
        <CircleCheck aria-hidden="true" className="text-success" />
        Connected
      </Badge>
    );
  }
  return <Badge variant="outline">Not connected</Badge>;
}

function ConnectedSection({
  username,
  preferredCountry,
  fallbackCountry,
}: {
  username: string;
  preferredCountry: string;
  fallbackCountry: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm break-words">
          {'Connected as '}
          <a
            href={`https://www.discogs.com/user/${encodeURIComponent(username)}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary hover:text-primary-hover underline underline-offset-4"
          >
            {username}
          </a>
        </p>
        <p className="font-prose text-xs text-muted-foreground">
          {
            'Matches appear on the Spines page as each CD is looked up. Large batches take a few minutes, because Discogs allows about one lookup per second.'
          }
        </p>
      </div>
      <CollectionFolderField />
      <PreferredCountryField initialCountry={preferredCountry} />
      <FallbackCountryField
        initialCountry={fallbackCountry}
        preferredCountry={preferredCountry}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TestDiscogsButton />
        <DisconnectDiscogsButton />
      </div>
    </div>
  );
}

/** Discogs stopped accepting the stored sign-in (any signed 401). */
function ReconnectAlert({ credentialsSaved }: { credentialsSaved: boolean }) {
  return (
    <Alert>
      <TriangleAlert aria-hidden="true" className="text-warning" />
      <AlertTitle>Discogs stopped accepting this app</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          {
            "Lookups are paused until you reconnect. This happens if the app's access was removed on discogs.com or the consumer key changed."
          }
        </p>
        <ConnectDiscogsButton
          label="Reconnect Discogs"
          credentialsSaved={credentialsSaved}
        />
      </AlertDescription>
    </Alert>
  );
}

function AccountSection({
  connection,
  preferredCountry,
  fallbackCountry,
}: {
  connection: DiscogsConnection;
  preferredCountry: string;
  fallbackCountry: string;
}) {
  if (connection.connected && connection.username) {
    return (
      <div className="flex flex-col gap-4">
        <ConnectedSection
          username={connection.username}
          preferredCountry={preferredCountry}
          fallbackCountry={fallbackCountry}
        />
        {/* A Reconnect started from the Alert can end on a code too. */}
        {connection.needsReconnect && connection.pendingConnect ? (
          <PasteCodeForm />
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="font-prose text-sm text-muted-foreground">
        {
          'Connecting opens discogs.com so you can approve this app. The app adds a release to your Discogs collection only when you click Add on a match.'
        }
      </p>
      <ConnectDiscogsButton
        id={CONNECT_BUTTON_ID}
        credentialsSaved={connection.credentialsSaved}
      />
      {connection.pendingConnect ? <PasteCodeForm /> : null}
    </div>
  );
}

export function DiscogsCard({
  statuses,
  connection,
  secretsError,
  callbackUrl,
  preferredCountry,
  fallbackCountry,
}: {
  statuses: SecretStatus[] | null;
  connection: DiscogsConnection | null;
  secretsError?: string;
  /** http://{host}/api/discogs/callback for this request (D-03). */
  callbackUrl: string | null;
  /** The bulk-import country in Discogs' spelling (D-14). */
  preferredCountry: string;
  /** The second-tier country in Discogs' spelling (G-06-side-1). */
  fallbackCountry: string;
}) {
  return (
    <Card variant="mini">
      <CornerNumeral value={2} size="md" />
      <CardHeader>
        <CardTitle className="text-base">
          <MdPrefix marker="##" />
          Discogs
        </CardTitle>
        <CardAction>
          <ConnectionBadge connection={connection} />
        </CardAction>
        <CardDescription>
          {
            'Connect your Discogs account so the app can look up each CD on Discogs. The consumer key and secret come from your Discogs app at '
          }
          <a
            href="https://www.discogs.com/settings/developers"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:text-primary-hover underline underline-offset-4"
          >
            discogs.com/settings/developers
          </a>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <Suspense fallback={null}>
          <DiscogsConnectNotice username={connection?.username ?? null} />
        </Suspense>
        {statuses && connection ? (
          <>
            {connection.connected && connection.needsReconnect ? (
              <ReconnectAlert credentialsSaved={connection.credentialsSaved} />
            ) : null}
            <DiscogsCredentials
              statuses={statuses}
              connected={connection.connected}
            />
            {callbackUrl ? <CallbackUrlField url={callbackUrl} /> : null}
            <Separator />
            <AccountSection
              connection={connection}
              preferredCountry={preferredCountry}
              fallbackCountry={fallbackCountry}
            />
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
