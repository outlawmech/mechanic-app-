import test from 'node:test';
import assert from 'node:assert/strict';
import { getBottomNavigationColumnCount } from '../src/lib/mobileNavigation.ts';

test('bottom navigation allocates one column per visible item, including More', () => {
  assert.equal(getBottomNavigationColumnCount(4), 5); // Solo and Shop
  assert.equal(getBottomNavigationColumnCount(5), 6); // Dealer
});
