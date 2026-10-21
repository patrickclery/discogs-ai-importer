import { describe, expect, it } from 'vitest';
import { MASTER_REFUSAL, parseDiscogsRef } from './discogs-ref';

// D-15, RESEARCH Pattern 7 and Pitfall 5: every pasted form of a release or
// master reference is read the same way, on the client and the server.

describe('parseDiscogsRef', () => {
  it.each([
    '1820636',
    ' 1820636 ',
    '[r1820636]',
    'r1820636',
    'R1820636',
    'https://www.discogs.com/release/1820636-Nirvana-Nevermind',
    'https://www.discogs.com/fr/release/1820636',
    'https://www.discogs.com/Nirvana-Nevermind/release/1820636',
    'https://www.discogs.com/sell/release/1820636',
    'discogs.com/release/1820636',
    'www.discogs.com/release/1820636-Nirvana-Nevermind',
    'http://discogs.com/release/1820636?ev=rr',
  ])('%j is release 1820636', (input) => {
    expect(parseDiscogsRef(input)).toEqual({ kind: 'release', id: 1820636 });
  });

  it.each([
    '[m13814]',
    'm13814',
    'https://www.discogs.com/master/13814-Nirvana-Nevermind',
    'discogs.com/master/13814',
  ])('%j is master 13814', (input) => {
    expect(parseDiscogsRef(input)).toEqual({ kind: 'master', id: 13814 });
  });

  it.each([
    'https://example.com/release/1',
    'https://discogs.com.evil.example/release/1',
    'Nirvana Nevermind',
    '0',
    '12345678901',
    '[r1820636',
    'r0',
    'https://www.discogs.com/artist/125246-Nirvana',
    'https://www.discogs.com/release/',
    'javascript:alert(1)',
  ])('%j is text', (input) => {
    expect(parseDiscogsRef(input)).toEqual({ kind: 'text', q: input.trim() });
  });

  it('keeps the trimmed text as the query', () => {
    expect(parseDiscogsRef('  Nirvana  Nevermind ')).toEqual({
      kind: 'text',
      q: 'Nirvana  Nevermind',
    });
  });

  it('a 10-digit number is still a release', () => {
    expect(parseDiscogsRef('9999999999')).toEqual({
      kind: 'release',
      id: 9999999999,
    });
  });

  it('never throws on a malformed link', () => {
    expect(parseDiscogsRef('https://[::1')).toEqual({
      kind: 'text',
      q: 'https://[::1',
    });
  });

  it('carries the master refusal copy', () => {
    expect(MASTER_REFUSAL).toBe(
      "That's a master, not a release — pick a specific version",
    );
  });
});
