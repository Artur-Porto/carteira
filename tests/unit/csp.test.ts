// The CSP allows styles only from the app's own files (vite.config.ts). Inline styles would be
// blocked on the device, so the code must never write them.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sources(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
}

describe('content security policy', () => {
  it('finds no inline style in the app', () => {
    const offenders = sources('src').filter(file => /\bstyle=\{|\.style\.|setAttribute\(\s*['"]style['"]|<style/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
