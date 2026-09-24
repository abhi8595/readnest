/** Minimal expo-sqlite stub — tests never open a real DB. */
async function openDatabaseAsync() {
  throw new Error('expo-sqlite is not available in node tests');
}

module.exports = { openDatabaseAsync };
