import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { UploadView } from '@/components/upload-view';
import { getClaudeCliStatus, isClaudeReady } from '@/server/claude/cli';
import { listPhotos } from '@/server/scan/queries';
import { getDensityThresholds } from '@/server/settings';

export default async function UploadPage() {
  await connection();
  const cliReady = isClaudeReady(
    await getClaudeCliStatus({ maxAgeMs: 60_000 }),
  );
  const photos = listPhotos();
  const { maxSpines } = getDensityThresholds();

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">Upload</h1>
        <p className="text-sm text-muted-foreground">
          Drop photos of your CD shelves. Each photo is read by Claude once, and
          every spine is cropped so you can check what it read.
        </p>
      </div>
      <div className="flex flex-col gap-6">
        {cliReady ? null : (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>The Claude CLI isn't ready</AlertTitle>
            <AlertDescription>
              <p>
                Photos are read by the Claude CLI on this computer. Install it
                and log in from Settings, then come back to upload.
              </p>
              <Button asChild className="mt-2">
                <Link href="/settings">Open Settings</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <UploadView
          initialPhotos={photos}
          cliReady={cliReady}
          densityMaxSpines={maxSpines}
        />
      </div>
    </div>
  );
}
