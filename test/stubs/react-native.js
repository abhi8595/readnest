/** Minimal react-native stub: Platform only (what lib code touches). */
const Platform = {
  OS: 'android',
  select: (opts) => opts.android ?? opts.native ?? opts.default,
};
module.exports = { Platform };
