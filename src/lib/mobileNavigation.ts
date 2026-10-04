export function getBottomNavigationColumnCount(primaryTabCount: number): number {
  return primaryTabCount + 1; // the final column is the always-visible More action
}
