'use client';

import { Eye, EyeOff, Terminal } from 'lucide-react';
import {
  type KeyboardEvent,
  type MouseEvent,
  useActionState,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from 'react';
import { toast } from 'sonner';
import {
  type ActionState,
  clearSecretAction,
  saveDiscogsCredentials,
} from '@/app/settings/actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import type { SecretStatus } from '@/server/secrets';

// SecretField state machine (UI-SPEC). Inputs always start empty: no server
// value or mask ever reaches an input (D-09, Pitfall 8).

type FormErrorSink = (message: string | null) => void;

function noun(status: SecretStatus): string {
  return status.label.toLowerCase();
}

function envDescription(status: SecretStatus): string {
  const base = `Set by the ${status.envName} environment variable, which takes precedence over a saved value.`;
  return status.fileValueExists
    ? `${base} A saved value exists and will be used if the variable is removed.`
    : base;
}

function SourceBadge({ status }: { status: SecretStatus }) {
  if (status.source === 'env') {
    return (
      <Badge variant="outline">
        <Terminal aria-hidden="true" />
        From env
      </Badge>
    );
  }
  if (status.source === 'file') return <Badge variant="secondary">Saved</Badge>;
  return <Badge variant="outline">Not set</Badge>;
}

/** Password input with a show/hide toggle; reveals only what was typed. */
function SecretInput({
  status,
  pending,
  error,
  inputRef,
  onEscape,
}: {
  status: SecretStatus;
  pending: boolean;
  error?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onEscape?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const inputId = `${status.key}-input`;
  const errorId = `${status.key}-error`;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault();
      onEscape();
    }
  }

  return (
    <>
      <div className="relative">
        <Input
          ref={inputRef}
          id={inputId}
          name={status.key}
          type={revealed ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          placeholder={status.label}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onKeyDown={onKeyDown}
          className="pr-10 font-mono"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-0 right-0"
          aria-label={revealed ? 'Hide value' : 'Show value'}
          disabled={pending}
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </>
  );
}

function FieldHeader({ status }: { status: SecretStatus }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <FieldLabel htmlFor={`${status.key}-input`}>{status.label}</FieldLabel>
      <SourceBadge status={status} />
    </div>
  );
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Spinner />
          Saving…
        </>
      ) : (
        'Save credentials'
      )}
    </Button>
  );
}

/** Reacts once to each new action result: toast on success, lift form errors. */
function useSaveResult(
  state: ActionState,
  onFormError: FormErrorSink,
  onSaved: () => void,
) {
  const handled = useRef<ActionState>(null);
  const onResult = useEffectEvent((result: NonNullable<ActionState>) => {
    if (result.ok) {
      onFormError(null);
      toast.success('Discogs credentials saved');
      onSaved();
    } else {
      onFormError(result.formError ?? null);
    }
  });
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    onResult(state);
  }, [state]);
}

function ClearControl({
  status,
  label,
  disabled,
  connected,
  onPendingChange,
  onFormError,
}: {
  status: SecretStatus;
  label: string;
  disabled: boolean;
  connected: boolean;
  onPendingChange: (pending: boolean) => void;
  onFormError: FormErrorSink;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  function confirm(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await clearSecretAction(status.key);
      setOpen(false);
      if (res.ok) {
        onFormError(null);
        toast.success(`Discogs ${noun(status)} cleared`);
      } else {
        onFormError(res.formError);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        {pending ? (
          <>
            <Spinner />
            Clearing…
          </>
        ) : (
          label
        )}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`Clear saved Discogs ${noun(status)}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {`The value is removed from secrets.json. Discogs matching can't run until you add it again.${connected ? ' This also disconnects your Discogs account.' : ''}`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep value</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? (
              <>
                <Spinner />
                Clearing…
              </>
            ) : (
              'Clear value'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * One secret with its own badge, state and actions. Pass `shared` to render
 * only the label row and input inside a parent form (both-unset Discogs case).
 */
export function SecretField({
  status,
  shared,
  connected = false,
  onFormError = () => {},
}: {
  status: SecretStatus;
  shared?: { pending: boolean; error?: string };
  connected?: boolean;
  onFormError?: FormErrorSink;
}) {
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [state, formAction, pending] = useActionState(
    saveDiscogsCredentials,
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<'input' | 'replace' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const showInput = status.source === null || editing;

  useEffect(() => {
    if (focusTarget.current === 'input' && showInput) {
      inputRef.current?.focus();
      focusTarget.current = null;
    } else if (focusTarget.current === 'replace' && !showInput) {
      replaceRef.current?.focus();
      focusTarget.current = null;
    }
  });

  useSaveResult(state, onFormError, () => {
    formRef.current?.reset();
    if (editing) {
      focusTarget.current = 'replace';
      setEditing(false);
    }
  });

  if (shared) {
    return (
      <Field data-invalid={shared.error ? true : undefined}>
        <FieldHeader status={status} />
        <SecretInput
          status={status}
          pending={shared.pending}
          error={shared.error}
        />
      </Field>
    );
  }

  const fieldError =
    state && !state.ok ? state.fieldErrors?.[status.key] : undefined;
  const busy = pending || clearing;

  function startReplace() {
    focusTarget.current = 'input';
    setEditing(true);
  }

  function cancelReplace() {
    focusTarget.current = 'replace';
    setEditing(false);
  }

  return (
    <Field data-invalid={showInput && fieldError ? true : undefined}>
      <FieldHeader status={status} />
      {showInput ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-3">
          <SecretInput
            status={status}
            pending={pending}
            error={fieldError}
            inputRef={inputRef}
            onEscape={editing ? cancelReplace : undefined}
          />
          {status.source === 'env' ? (
            <FieldDescription>{envDescription(status)}</FieldDescription>
          ) : null}
          {connected ? (
            <FieldDescription>
              Saving a different value disconnects your Discogs account. Connect
              again afterwards.
            </FieldDescription>
          ) : null}
          <div className="flex gap-2">
            <SaveButton pending={pending} />
            {editing ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={cancelReplace}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <>
          <div className="rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">
            {status.masked}
          </div>
          {status.source === 'env' ? (
            <FieldDescription>{envDescription(status)}</FieldDescription>
          ) : null}
          <div className="flex gap-2">
            <Button
              ref={replaceRef}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={startReplace}
            >
              {status.source === 'env' ? 'Replace' : 'Replace value'}
            </Button>
            {status.fileValueExists ? (
              <ClearControl
                status={status}
                label={status.source === 'env' ? 'Clear' : 'Clear value'}
                disabled={busy}
                connected={connected}
                onPendingChange={setClearing}
                onFormError={onFormError}
              />
            ) : null}
          </div>
        </>
      )}
    </Field>
  );
}

/** Both Discogs fields unset: one form, one shared "Save credentials". */
function SharedCredentialsForm({
  statuses,
  onFormError,
}: {
  statuses: SecretStatus[];
  onFormError: FormErrorSink;
}) {
  const [state, formAction, pending] = useActionState(
    saveDiscogsCredentials,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useSaveResult(state, onFormError, () => formRef.current?.reset());
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-6">
      {statuses.map((status, i) => (
        <div key={status.key} className="flex flex-col gap-6">
          {i > 0 ? <Separator /> : null}
          <SecretField
            status={status}
            shared={{ pending, error: errors?.[status.key] }}
          />
        </div>
      ))}
      <div>
        <SaveButton pending={pending} />
      </div>
    </form>
  );
}

export function DiscogsCredentials({
  statuses,
  connected = false,
}: {
  statuses: SecretStatus[];
  /** While connected, the Clear confirm says it also disconnects (A4). */
  connected?: boolean;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const bothUnset = statuses.every((s) => s.source === null);

  return (
    <div className="flex flex-col gap-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      {bothUnset ? (
        <SharedCredentialsForm statuses={statuses} onFormError={setFormError} />
      ) : (
        statuses.map((status, i) => (
          <div key={status.key} className="flex flex-col gap-6">
            {i > 0 ? <Separator /> : null}
            <SecretField
              status={status}
              connected={connected}
              onFormError={setFormError}
            />
          </div>
        ))
      )}
    </div>
  );
}
