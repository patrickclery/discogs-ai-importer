import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { PhotoStatusList } from '@/components/photo-status-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getClaudeCliStatus, isClaudeReady } from '@/server/claude/cli';
import { listPhotos } from '@/server/scan/queries';

export default async function UploadPage() {
  await connection();
  const cliReady = isClaudeReady(
    await getClaudeCliStatus({ maxAgeMs: 60_000 }),
  );
  const photos = listPhotos();

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
        <PhotoStatusList initialPhotos={photos} />
      </div>
    </div>
  );
}
