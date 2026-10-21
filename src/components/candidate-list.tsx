import { CandidateRow } from '@/components/candidate-row';
import { type CandidateDto, INLINE_CANDIDATES } from '@/lib/discogs-types';

/**
 * A spine's candidates in D-10 order (the server already ordered and
 * deduped them): the first INLINE_CANDIDATES rows inline. Plan 03-09 adds
 * "Show all {n}" for the rest.
 */
export function CandidateList({
  candidates,
}: {
  candidates: readonly CandidateDto[];
}) {
  if (candidates.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y">
      {candidates.slice(0, INLINE_CANDIDATES).map((c) => (
        <CandidateRow key={c.id} candidate={c} />
      ))}
    </ul>
  );
}
