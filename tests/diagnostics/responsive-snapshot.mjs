// Local, read-only diagnostic. This module is not imported by the application.
// Run captureResponsiveSnapshot(window, document) in a local browser harness
// before/after rotation, then analyzeResponsiveSnapshot(snapshot).
export function captureResponsiveSnapshot(win, doc) {
  const measure = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = win.getComputedStyle(element);
    return {
      x: rect.x, width: rect.width, height: rect.height,
      display: style.display, flexDirection: style.flexDirection,
      paddingLeft: parseFloat(style.paddingLeft) || 0,
      overflowX: style.overflowX, minWidth: style.minWidth,
      maxWidth: style.maxWidth, transform: style.transform,
    };
  };
  return {
    viewportMeta: doc.querySelector('meta[name="viewport"]')?.content ?? null,
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    clientWidth: doc.documentElement.clientWidth,
    scrollWidth: doc.documentElement.scrollWidth,
    screenWidth: win.screen.width,
    screenHeight: win.screen.height,
    orientation: win.screen.orientation?.type ?? null,
    devicePixelRatio: win.devicePixelRatio,
    visualViewport: win.visualViewport ? {
      width: win.visualViewport.width, height: win.visualViewport.height,
      scale: win.visualViewport.scale, offsetLeft: win.visualViewport.offsetLeft,
    } : null,
    desktopMedia: win.matchMedia('(min-width: 48rem)').matches,
    root: measure(doc.getElementById('root')),
    elements: Object.fromEntries(['shell', 'sidebar', 'mobile-header', 'mobile-trial', 'content', 'main', 'bottom-nav']
      .map((name) => [name, measure(doc.querySelector(`[data-oss-shell="${name}"]`))])),
  };
}

export function analyzeResponsiveSnapshot(snapshot) {
  const problems = [];
  const { elements, clientWidth, desktopMedia } = snapshot;
  for (const [name, element] of [['root', snapshot.root], ['shell', elements.shell]]) {
    if (element && element.width < clientWidth - 2) problems.push(`${name}-underfills-layout-viewport`);
  }
  if (snapshot.scrollWidth > clientWidth + 2) problems.push('horizontal-document-overflow');
  const visible = (name) => elements[name] && elements[name].display !== 'none';
  if (visible('sidebar') !== desktopMedia) problems.push('sidebar-mode-mismatch');
  for (const name of ['mobile-header', 'mobile-trial', 'bottom-nav']) {
    if (visible(name) !== !desktopMedia) problems.push(`${name}-mode-mismatch`);
  }
  if (elements.shell?.flexDirection !== (desktopMedia ? 'row' : 'column')) problems.push('shell-direction-mismatch');
  const expectedOffset = desktopMedia ? elements.sidebar?.width : 0;
  if (Math.abs(elements.content.paddingLeft - expectedOffset) > 2) problems.push('content-sidebar-offset-mismatch');
  return { mode: desktopMedia ? 'desktop' : 'mobile', problems };
}
