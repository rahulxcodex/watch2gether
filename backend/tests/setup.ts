import { initDatabase, closeDatabase } from '../src/db/db';

export function setupTestDb() {
  const db = initDatabase(':memory:');
  return {
    db,
    cleanup: () => {
      closeDatabase();
    },
  };
}
