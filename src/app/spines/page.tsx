import { Rows3 } from 'lucide-react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export default function SpinesPage() {
  return (
    <Empty className="pt-16 pb-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Rows3 className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">No spines yet</EmptyTitle>
        <EmptyDescription>
          Spines appear here after you upload shelf photos.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
