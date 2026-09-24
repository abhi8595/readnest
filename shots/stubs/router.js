/**
 * expo-router stub for screenshots. The Tabs component renders the REAL tab
 * bar: it reads the real <Tabs.Screen name/options> elements declared in
 * app/(tabs)/_layout.tsx (real titles, real tabBarIcon fns, real colors)
 * and shows the injected active screen above it.
 */
const React = require('react');

let params = {};
let activeTab = 'index';
let ActiveScreen = () => null;
const calls = [];

const routerObj = {
  push: (href) => { calls.push(['push', href]); },
  replace: (href) => { calls.push(['replace', href]); },
  navigate: (href) => { calls.push(['navigate', href]); },
  back: () => { calls.push(['back']); },
  setParams: (p) => { calls.push(['setParams', p]); },
  canGoBack: () => false,
  canDismiss: () => false,
};

function useRouter() { return routerObj; }
function useLocalSearchParams() { return params; }
function useGlobalSearchParams() { return params; }
function useSegments() { return []; }
function usePathname() { return '/'; }
function useFocusEffect() { /* noop in shots */ }
function Redirect() { return null; }
function Link({ children }) { return React.createElement(React.Fragment, null, children); }

function Screen() { return null; }

function Tabs({ children, screenOptions = {} }) {
  const RN = require('react-native');
  const { useTheme } = require('@/theme/ThemeProvider');
  const { palette } = useTheme();
  const defs = React.Children.toArray(children)
    .filter((c) => c && c.props && c.props.name)
    .map((c) => ({ name: c.props.name, options: c.props.options || {} }));
  const active = defs.find((d) => d.name === activeTab) || defs[0] || { name: '', options: {} };
  const so = { ...(screenOptions || {}), ...(active.options || {}) };
  return React.createElement(
    RN.View,
    { style: { flex: 1, backgroundColor: palette.background } },
    React.createElement(ActiveScreen, null),
    React.createElement(
      RN.View,
      { style: [{ flexDirection: 'row', borderTopWidth: 1 }, so.tabBarStyle || {}] },
      defs.map((d) => {
        const focused = d.name === active.name;
        const color = focused ? so.tabBarActiveTintColor : so.tabBarInactiveTintColor;
        const icon = d.options.tabBarIcon
          ? d.options.tabBarIcon({ color, focused, size: 24 })
          : null;
        return React.createElement(
          RN.Pressable,
          {
            key: d.name,
            onPress: () => { calls.push(['tab', d.name]); },
            accessibilityRole: 'tab',
            accessibilityLabel: d.options.title || d.name,
            accessibilityState: { selected: focused },
            style: { flex: 1, alignItems: 'center', justifyContent: 'center' },
          },
          icon,
          React.createElement(
            RN.Text,
            { style: [so.tabBarLabelStyle || {}, { color }] },
            d.options.title || d.name,
          ),
        );
      }),
    ),
  );
}
Tabs.Screen = Screen;

function Stack({ children }) { return React.createElement(React.Fragment, null, children); }
Stack.Screen = Screen;
function Slot() { return null; }

module.exports = {
  useRouter,
  router: routerObj,
  useLocalSearchParams,
  useGlobalSearchParams,
  useSegments,
  usePathname,
  useFocusEffect,
  Redirect,
  Link,
  Tabs,
  Stack,
  Slot,
  Screen,
  __setParams: (p) => { params = p || {}; },
  __setActiveTab: (t) => { activeTab = t; },
  __setScreen: (s) => { ActiveScreen = s; },
  __calls: calls,
};
