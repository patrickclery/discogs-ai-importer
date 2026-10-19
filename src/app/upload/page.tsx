import { ImageUp } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export default function UploadPage() {
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
          Shelf photo upload arrives in Phase 2. Set up the Claude CLI in
          Settings now so it's ready.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/settings">Open Settings</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
