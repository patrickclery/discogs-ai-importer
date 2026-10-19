import { TriangleAlert } from 'lucide-react';
import { ModelSelect } from '@/components/model-select';
import { TestClaudeButton } from '@/components/test-claude-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldDescription, FieldTitle } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { type ClaudeCliStatus, isClaudeReady } from '@/server/claude/cli';
import { VISION_MODELS } from '@/server/settings';

// Claude CLI card (D-10, D-18). Server component; receives only the
// sanitized status (no email, org or env values).

const WARNING_BADGE = 'border-warning text-warning';

function StatusRow({
  label,
  badge,
  detail,
  description,
}: {
  label: string;
  badge: React.ReactNode;
  detail?: string | null;
  description?: string;
}) {
  return (
    <Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldTitle>{label}</FieldTitle>
        <div className="flex min-w-0 items-center gap-2">
          {badge}
          {detail ? (
            <span className="truncate font-mono text-xs text-muted-foreground">
              {detail}
            </span>
          ) : null}
        </div>
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function CliRow({ status }: { status: ClaudeCliStatus }) {
  if (!status.installed) {
    return (
      <StatusRow
        label="Claude Code CLI"
        badge={<Badge variant="outline">Not installed</Badge>}
        description={
          'Install Claude Code so the claude command works in the terminal that starts this app, then reload this page.'
        }
      />
    );
  }
  return (
    <StatusRow
      label="Claude Code CLI"
      badge={<Badge variant="secondary">Installed</Badge>}
      detail={status.version}
    />
  );
}

function LoginRow({ auth }: { auth: ClaudeCliStatus['auth'] }) {
  switch (auth.state) {
    case 'subscription':
      return (
        <StatusRow
          label="Login"
          badge={<Badge variant="secondary">Subscription</Badge>}
          detail={auth.subscriptionType}
        />
      );
    case 'other':
      return (
        <StatusRow
          label="Login"
          badge={
            <Badge variant="outline" className={WARNING_BADGE}>
              API billing
            </Badge>
          }
          description={`The CLI is signed in with ${auth.authMethod ?? 'another method'}, so vision calls may be billed to the API instead of your subscription. Run claude auth login and choose your Claude account.`}
        />
      );
    case 'logged-out':
      return (
        <StatusRow
          label="Login"
          badge={<Badge variant="outline">Not logged in</Badge>}
          description="Run claude auth login in a terminal, then reload this page."
        />
      );
    default:
      return (
        <StatusRow
          label="Login"
          badge={<Badge variant="outline">Unknown</Badge>}
          description={`Couldn't read the CLI's login status: ${auth.reason ?? 'unknown error'}.`}
        />
      );
  }
}

export function ClaudeCliCard({
  status,
  model,
}: {
  status: ClaudeCliStatus;
  model: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Claude CLI</CardTitle>
        <CardDescription>
          {
            'Vision runs through your Claude subscription by starting the Claude Code CLI on this computer. No API key is needed.'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status.apiKeyInEnv ? (
          <Alert className="border-warning/50 text-warning">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>
              {`${status.apiBillingEnv.join(', ')} ${status.apiBillingEnv.length > 1 ? 'are' : 'is'} set`}
            </AlertTitle>
            <AlertDescription>
              {
                'Set where the app runs. The app removes these before starting claude so vision uses your subscription, but other tools on this computer may still bill the API.'
              }
            </AlertDescription>
          </Alert>
        ) : null}
        <CliRow status={status} />
        {status.installed ? <LoginRow auth={status.auth} /> : null}
        <Separator />
        <ModelSelect value={model} models={VISION_MODELS} />
      </CardContent>
      <CardFooter>
        <TestClaudeButton ready={isClaudeReady(status)} />
      </CardFooter>
    </Card>
  );
}
