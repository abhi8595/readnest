/**
 * DOM shim for react-native-svg (fallback when SHOT_SVG=stub).
 * Lucide icons are pure vector paths — this renders the identical
 * path data through real <svg> elements.
 */
const React = require('react');

function el(tag) {
  const C = React.forwardRef((props, ref) => {
    const { children, accessibilityLabel, accessibilityRole, size, ...rest } = props;
    return React.createElement(
      tag,
      { ...rest, ref, ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}) },
      children,
    );
  });
  C.displayName = `ShotSvg(${tag})`;
  return C;
}

module.exports = {
  __esModule: true,
  default: el('svg'),
  Svg: el('svg'),
  Path: el('path'),
  Circle: el('circle'),
  Rect: el('rect'),
  Line: el('line'),
  Polyline: el('polyline'),
  Polygon: el('polygon'),
  Ellipse: el('ellipse'),
  G: el('g'),
  Defs: el('defs'),
  Stop: el('stop'),
  LinearGradient: el('linearGradient'),
  RadialGradient: el('radialGradient'),
  ClipPath: el('clipPath'),
  Text: el('text'),
  TSpan: el('tspan'),
  Use: el('use'),
  Symbol: el('symbol'),
  Mask: el('mask'),
  Pattern: el('pattern'),
  Marker: el('marker'),
};
