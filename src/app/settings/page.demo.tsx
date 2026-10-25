'use client';

import { ClaudeCliCard } from '@/components/claude-cli-card';
import { DiscogsCard } from '@/components/discogs-card';
import { StoragePaths } from '@/components/storage-paths';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useDemoSnapshot } from '@/demo/hooks';
import type { DemoAccount, DemoState } from '@/demo/store';
import type { ClaudeCliStatus } from '@/lib/claude-types';
import type { DiscogsConnection } from '@/server/discogs/auth';
import type { SecretKey, SecretStatus } from '@/server/secrets';
import SettingsLoading from './loading';

// Demo /settings (D-12, D-02): the real cards fed from the demo account in
// page memory. The Claude CLI is always ready, Discogs starts "Connected as
// demo-user", and every control (Test, Connect, Disconnect, paste code,
// credentials, folder, model) goes through the demo routes or the aliased
// settings actions, then re-renders from useDemoSnapshot. Credentials exist
// here only as masked tails (T-05-33). Rendered after mount only (RESEARCH
// Pitfall 4); DiscogsCard already wraps DiscogsConnectNotice in Suspense.

/** What the real local app shows: the callback the owner registers. */
const CALLBACK_URL = 'http://127.0.0.1:3001/api/discogs/callback';
const DATA_DIR = '~/discogs-ai-importer/data';
const SECRETS_PATH = '~/discogs-ai-importer/secrets.json';

const SECRETS: Array<{
  key: SecretKey;
  label: string;
  envName: string;
  tail: 'consumerKeyTail' | 'consumerSecretTail';
}> = [
  {
    key: 'discogsConsumerKey',
    label: 'Consumer key',
    envName: 'DISCOGS_CONSUMER_KEY',
    tail: 'consumerKeyTail',
  },
  {
    key: 'discogsConsumerSecret',
    label: 'Consumer secret',
    envName: 'DISCOGS_CONSUMER_SECRET',
    tail: 'consumerSecretTail',
  },
];

function claudeStatus(checkedAt: number): ClaudeCliStatus {
  return {
    installed: true,
    version: '2.3.1 (Claude Code)',
    auth: {
      state: 'subscription',
      authMethod: 'claude.ai',
      subscriptionType: 'max',
      reason: null,
    },
    apiKeyInEnv: false,
    apiBillingEnv: [],
    checkedAt,
  };
}

function secretStatuses(account: DemoAccount): SecretStatus[] {
  return SECRETS.map(({ key, label, envName, tail }) => {
    const masked = account[tail];
    return {
      key,
      label,
      envName,
      configured: masked !== null,
      source: masked !== null ? 'file' : null,
      masked,
      fileValueExists: masked !== null,
    };
  });
}

function connectionOf(account: DemoAccount): DiscogsConnection {
  return {
    connected: account.connected,
    username: account.connected ? account.username : null,
    needsReconnect: account.connected && account.needsReconnect,
    // Connect reloads the demo (connected again), so a disconnected visitor
    // can also reconnect in place by pasting any code.
    pendingConnect: account.pendingConnectAt !== null || !account.connected,
    credentialsSaved:
      account.consumerKeyTail !== null && account.consumerSecretTail !== null,
  };
}

type SettingsView = {
  claude: ClaudeCliStatus;
  model: string;
  statuses: SecretStatus[];
  connection: DiscogsConnection;
  preferredCountry: string;
  fallbackCountry: string;
};

function select(state: DemoState, now: number): SettingsView {
  const { account } = state;
  return {
    claude: claudeStatus(now),
    model: account.model,
    statuses: secretStatuses(account),
    connection: connectionOf(account),
    preferredCountry: account.preferredCountry,
    fallbackCountry: account.fallbackCountry,
  };
}

export default function DemoSettingsPage() {
  const view = useDemoSnapshot(select);
  if (!view) return <SettingsLoading />;

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
        <ClaudeCliCard status={view.claude} model={view.model} />
        <DiscogsCard
          statuses={view.statuses}
          connection={view.connection}
          callbackUrl={CALLBACK_URL}
          preferredCountry={view.preferredCountry}
          fallbackCountry={view.fallbackCountry}
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
            <StoragePaths dataDir={DATA_DIR} secretsPath={SECRETS_PATH} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
