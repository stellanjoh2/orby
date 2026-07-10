import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectSupportedOrbyBrowser,
  getUnsupportedBrowserLabel,
} from './browserDetection.js';

const chromeUa =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const braveUa =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const safariUa =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
const firefoxUa =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
const edgeUa =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

test('detectSupportedOrbyBrowser allows Chrome, Brave, and Safari', () => {
  assert.equal(detectSupportedOrbyBrowser(chromeUa, 'Google Inc.'), true);
  assert.equal(detectSupportedOrbyBrowser(braveUa, 'Google Inc.'), true);
  assert.equal(
    detectSupportedOrbyBrowser(safariUa, 'Apple Computer, Inc.'),
    true,
  );
});

test('detectSupportedOrbyBrowser blocks Firefox and Edge', () => {
  assert.equal(detectSupportedOrbyBrowser(firefoxUa, ''), false);
  assert.equal(detectSupportedOrbyBrowser(edgeUa, ''), false);
});

test('getUnsupportedBrowserLabel names Firefox', () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: firefoxUa },
  });
  assert.equal(getUnsupportedBrowserLabel(), 'Firefox');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: original,
  });
});
