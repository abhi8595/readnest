/**
 * Native-module stubs for screenshots: WebView renders the REAL reader HTML
 * inline; RevenueCat returns demo offerings; missing native deps throw so
 * components take their real Expo-Go fallback paths (same as on device).
 */
const React = require('react');

function scopeReaderCss(css) {
  // Re-scope document-level selectors to the inline wrapper (fragment parsing
  // drops <html>/<head>/<body>, so :root vars + body padding would be lost).
  return css
    .replace(/:root\b/g, '.wv-scope')
    .replace(/(^|[\s,}])html(?=[\s,{.:#>~*+[\]-]|$)/g, '$1.wv-scope')
    .replace(/(^|[\s,}])body(?=[\s,{.:#>~*+[\]-]|$)/g, '$1.wv-scope');
}

function splitReaderHtml(html) {
  const styles = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) styles.push(m[1]);
  const bodyM = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const content = (bodyM ? bodyM[1] : html).replace(/<script[\s\S]*?<\/script>/gi, '');
  return { css: styles.join('\n'), content };
}

function buildWebView() {
  const WebView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      postMessage: () => undefined,
      injectJavaScript: () => undefined,
      reload: () => undefined,
      goBack: () => undefined,
    }));
    const html = (props.source && props.source.html) || '';
    const bg = (props.style && props.style.backgroundColor) || 'transparent';
    const { css, content } = splitReaderHtml(html);
    return React.createElement('div', {
      style: {
        flex: '1 1 auto', width: '100%', height: '100%',
        overflow: 'auto', background: bg,
      },
    },
      React.createElement('style', null, scopeReaderCss(css)),
      React.createElement('div', {
        className: 'wv-scope',
        dangerouslySetInnerHTML: { __html: content },
      }));
  });
  WebView.displayName = 'ShotWebView';
  return { __esModule: true, default: WebView, WebView };
}

const purchases = {
  __esModule: true,
  default: {
    configure: () => undefined,
    getCustomerInfo: async () => ({ entitlements: { active: {} } }),
    getOfferings: async () => ({
      current: {
        availablePackages: [
          { identifier: '$rc_lifetime', product: { priceString: '$24.99' } },
          { identifier: '$rc_annual', product: { priceString: '$9.99' } },
        ],
      },
    }),
    purchasePackage: async () => ({ customerInfo: { entitlements: { active: {} } } }),
    restorePurchases: async () => ({ entitlements: { active: {} } }),
  },
};

function buildReanimated() {
  const RN = require('react-native');
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, ScrollView: RN.ScrollView },
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: (fn) => (typeof fn === 'function' ? fn() : {}),
    withTiming: (v) => v,
    withSpring: (v) => v,
    withDelay: (_d, v) => v,
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    Easing: { linear: (x) => x },
  };
}

const gestureHandler = {
  GestureHandlerRootView: ({ children }) => children,
  GestureDetector: ({ children }) => children,
  Gesture: { Tap: () => ({}) },
};

module.exports = {
  'react-native-webview': () => buildWebView(),
  'react-native-purchases': purchases,
  'react-native-pdf': 'THROW',
  'react-native-google-mobile-ads': 'THROW',
  'react-native-reanimated': () => buildReanimated(),
  'react-native-gesture-handler': gestureHandler,
};
