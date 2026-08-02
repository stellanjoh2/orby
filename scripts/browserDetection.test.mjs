import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectIosAppleWebKitBrowser,
  detectSupportedOrbyBrowser,
  getUnsupportedBrowserLabel,
  isOrbyMobilePath,
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
const iosSafariUa =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
/** X / Twitter-style WKWebView — AppleWebKit present, Safari token often omitted. */
const iosInAppWebKitUa =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const appleVendor = 'Apple Computer, Inc.';

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

test('detectSupportedOrbyBrowser allows iOS in-app WebKit only when opted in', () => {
  assert.equal(detectSupportedOrbyBrowser(iosInAppWebKitUa, appleVendor), false);
  assert.equal(
    detectSupportedOrbyBrowser(iosInAppWebKitUa, appleVendor, {
      allowIosInAppWebKit: true,
    }),
    true,
  );
  assert.equal(
    detectSupportedOrbyBrowser(iosSafariUa, appleVendor, {
      allowIosInAppWebKit: true,
    }),
    true,
  );
});

test('detectIosAppleWebKitBrowser accepts Safari and bare WKWebView', () => {
  assert.equal(detectIosAppleWebKitBrowser(iosSafariUa, appleVendor), true);
  assert.equal(detectIosAppleWebKitBrowser(iosInAppWebKitUa, appleVendor), true);
  assert.equal(detectIosAppleWebKitBrowser(chromeUa, 'Google Inc.'), false);
  assert.equal(detectIosAppleWebKitBrowser(iosInAppWebKitUa, ''), false);
});

test('isOrbyMobilePath matches /mobile routes', () => {
  assert.equal(isOrbyMobilePath('/mobile'), true);
  assert.equal(isOrbyMobilePath('/mobile/'), true);
  assert.equal(isOrbyMobilePath('/mobile/app'), true);
  assert.equal(isOrbyMobilePath('/mobile/app/'), true);
  assert.equal(isOrbyMobilePath('/mobile/learn'), true);
  assert.equal(isOrbyMobilePath('/'), false);
  assert.equal(isOrbyMobilePath('/about'), false);
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
