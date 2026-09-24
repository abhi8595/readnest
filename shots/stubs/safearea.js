/** react-native-safe-area-context stub: fixed phone insets (no native). */
const React = require('react');

const Ctx = React.createContext({ top: 28, bottom: 24, left: 0, right: 0 });

function SafeAreaProvider({ children, initialMetrics }) {
  const insets = (initialMetrics && initialMetrics.insets) || {
    top: 28, bottom: 24, left: 0, right: 0,
  };
  return React.createElement(Ctx.Provider, { value: insets }, children);
}

function useSafeAreaInsets() {
  return React.useContext(Ctx);
}

function useSafeAreaFrame() {
  return { x: 0, y: 0, width: 412, height: 915 };
}

const SafeAreaView = React.forwardRef((props, ref) => {
  const RN = require('react-native');
  return React.createElement(RN.View, { ...props, ref });
});

module.exports = {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
  useSafeAreaFrame,
  initialWindowMetrics: { insets: { top: 28, bottom: 24, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 412, height: 915 } },
};
