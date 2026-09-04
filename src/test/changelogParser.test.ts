import { describe, it, expect } from 'vitest';
import { parseChangelog } from '../utils/changelogParser';

describe('changelogParser', () => {
  it('parses structured markdown release notes', () => {
    const raw = `## \u2728 What's Changed
* Add custom installer by @Toukima
* Fix CurseForge modpack parser by @Toukima

## \uD83D\uDC1B Bug Fixes
* Fix localhost connection error

**Full Changelog**: https://github.com/Aethelis-Projects/Aethel-Launcher/compare/v1.0.0-rc.1...v1.0.0-rc.2`;

    const result = parseChangelog(raw, 'v1.0.0-rc.2');
    expect(result.isEmpty).toBe(false);
    expect(result.compareUrl).toBe('https://github.com/Aethelis-Projects/Aethel-Launcher/compare/v1.0.0-rc.1...v1.0.0-rc.2');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe("\u2728 What's Changed");
    expect(result.sections[0].icon).toBe('\u2728');
    expect(result.sections[0].items).toEqual([
      'Add custom installer by @Toukima',
      'Fix CurseForge modpack parser by @Toukima',
    ]);
    expect(result.sections[1].title).toBe('\uD83D\uDC1B Bug Fixes');
    expect(result.sections[1].icon).toBe('\uD83D\uDC1B');
    expect(result.sections[1].items).toEqual([
      'Fix localhost connection error',
    ]);
  });

  it('handles empty or diff-only raw string by extracting compareUrl and applying fallback features', () => {
    const raw = `**Full Changelog**: https://github.com/Aethelis-Projects/Aethel-Launcher/compare/v1.0.0-rc.1...v1.0.0-rc.2
**Full Changelog**: https://github.com/Aethelis-Projects/Aethel-Launcher/compare/v1.0.0-rc.1...v1.0.0-rc.2`;

    const result = parseChangelog(raw, 'v1.0.0-rc.2');
    expect(result.isEmpty).toBe(false);
    expect(result.compareUrl).toBe('https://github.com/Aethelis-Projects/Aethel-Launcher/compare/v1.0.0-rc.1...v1.0.0-rc.2');
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections[0].items.some((item) => item.includes('инсталлер'))).toBe(true);
  });

  it('handles null or undefined input gracefully', () => {
    const result = parseChangelog(null, 'v1.0.0-rc.2');
    expect(result.isEmpty).toBe(false);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.compareUrl).toContain('releases/tag/v1.0.0-rc.2');
  });
});