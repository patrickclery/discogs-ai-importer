import { ImageUp } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { getClaudeCliStatus, isClaudeReady } from '@/server/claude/cli';

export default async function UploadPage() {
  await connection();
  const ready = isClaudeReady(await getClaudeCliStatus({ maxAgeMs: 60_000 }));

  return (
    <Empty className="pt-16 pb-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ImageUp className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">
          Upload isn't built yet
        </EmptyTitle>
        <EmptyDescription>
          {ready
            ? 'Shelf photo upload arrives in Phase 2. The Claude CLI is already set up.'
            : "Shelf photo upload arrives in Phase 2. Set up the Claude CLI in Settings now so it's ready."}
        </EmptyDescription>
      </EmptyHeader>
      {ready ? null : (
        <EmptyContent>
          <Button asChild>
            <Link href="/settings">Open Settings</Link>
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
