import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// WR-02: the Pages workflow keeps write credentials out of the build job and
// pins every action to a commit SHA. Text checks (no YAML dependency).

const WORKFLOW = fs.readFileSync(
  path.join(
    import.meta.dirname,
    '..',
    '..',
    '.github/workflows/demo-pages.yml',
  ),
  'utf8',
);

/** The lines of one top-level job (`  <name>:` up to the next job). */
function job(name: string): string {
  const lines = WORKFLOW.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) throw new Error(`job ${name} missing`);
  let end = start + 1;
  while (end < lines.length && !/^ {2}\S/.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
}

describe('demo-pages workflow', () => {
  it('pins every action to a full commit SHA with a tag comment', () => {
    const uses = [...WORKFLOW.matchAll(/uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThan(0);
    for (const [, ref, rest] of uses) {
      expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(rest).toMatch(/#\s*v\d+/);
    }
  });

  it('gives the build job contents:read only', () => {
    const build = job('build');
    expect(build).toMatch(/permissions:\n\s+contents: read\n/);
    expect(build).not.toMatch(/pages:\s*write|id-token:\s*write/);
    expect(build).toContain('upload-pages-artifact@');
    expect(build).toMatch(/persist-credentials: false/);
  });

  it('keeps pages:write and id-token:write in the deploy job only', () => {
    const deploy = job('deploy');
    expect(deploy).toMatch(/pages: write/);
    expect(deploy).toMatch(/id-token: write/);
    expect(deploy).toContain('deploy-pages@');
    expect(deploy).not.toMatch(/\brun:/);
    const topLevel = WORKFLOW.slice(0, WORKFLOW.indexOf('\njobs:'));
    expect(topLevel).not.toMatch(/pages:\s*write|id-token:\s*write/);
  });

  it('never runs on pull_request', () => {
    expect(WORKFLOW).not.toMatch(/pull_request/);
  });
});
