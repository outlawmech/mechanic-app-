import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeResponsiveSnapshot } from './diagnostics/responsive-snapshot.mjs';

// Diagnostic fixtures verify that the probe distinguishes app underfill from
// a coherent mobile shell at a narrower browser viewport. They do NOT emulate
// browser layout, orientation events, or physical-device acceptance.
function snapshot(width, desktop) {
  const element = (display, extra = {}) => ({ display, width, flexDirection: 'column', paddingLeft: 0, ...extra });
  return {
    clientWidth: width, scrollWidth: width, desktopMedia: desktop,
    root: element('block'),
    elements: {
      shell: element('flex', { flexDirection: desktop ? 'row' : 'column' }),
      sidebar: element(desktop ? 'flex' : 'none', { width: 256 }),
      'mobile-header': element(desktop ? 'none' : 'flex'),
      'mobile-trial': element(desktop ? 'none' : 'block'),
      'bottom-nav': element(desktop ? 'none' : 'block'),
      content: element('flex', { paddingLeft: desktop ? 256 : 0 }),
      main: element('block'),
    },
  };
}

test('viewport probe accepts coherent shell fixtures across repeated breakpoint transitions', () => {
  for (const width of [360, 780, 360, 800, 767, 768, 769, 767, 1024, 1440]) {
    const result = analyzeResponsiveSnapshot(snapshot(width, width >= 768));
    assert.deepEqual(result.problems, []);
    assert.equal(result.mode, width >= 768 ? 'desktop' : 'mobile');
  }
});

test('viewport probe detects half-width app containers independently of the shell mode', () => {
  for (const desktop of [true, false]) {
    const fixture = snapshot(800, desktop);
    fixture.root.width = 400;
    fixture.elements.shell.width = 400;
    assert.deepEqual(analyzeResponsiveSnapshot(fixture).problems, [
      'root-underfills-layout-viewport', 'shell-underfills-layout-viewport',
    ]);
  }
});

test('viewport probe identifies a hybrid shell and horizontal overflow', () => {
  const fixture = snapshot(800, true);
  fixture.elements['mobile-header'].display = 'flex';
  fixture.elements['bottom-nav'].display = 'block';
  fixture.elements.content.paddingLeft = 0;
  fixture.scrollWidth = 1200;
  assert.deepEqual(analyzeResponsiveSnapshot(fixture).problems, [
    'horizontal-document-overflow', 'mobile-header-mode-mismatch',
    'bottom-nav-mode-mismatch', 'content-sidebar-offset-mismatch',
  ]);
});
