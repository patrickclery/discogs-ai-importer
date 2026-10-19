import { connection } from 'next/server';
import { DevJobTrigger } from '@/components/dev-job-trigger';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { devHooksEnabled } from '@/server/config';

export default async function SettingsPage() {
  await connection();
  const showDeveloper = devHooksEnabled();

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
