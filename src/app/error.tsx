'use client';

import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export default function ErrorPage({
  error,
  reset,
  retry,
}: {
  error: unknown;
  reset: () => void;
  retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Empty className="pt-16 pb-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">
          This page didn't load
        </EmptyTitle>
        <EmptyDescription>
          Something went wrong on the server. Try again, and if it keeps
          failing, check the terminal running the app for details.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {/* retry() (Next >= 16.3) re-fetches the server segment; reset() only re-renders. */}
        <Button type="button" onClick={() => (retry ? retry() : reset())}>
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  );
}
