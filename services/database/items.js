import { databaseUnavailable, execute, getDatabasePool } from './pool.js';

// MySQL returns DECIMAL as text. Keep money exact when converting to API cents.
export function priceToCents(value) {
  const match = String(value).match(/^(\d+)\.(\d{2})$/);
  if (!match) throw new Error('Invalid database price.');
  const cents = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(cents)) throw new Error('Database price is too large.');
  return cents;
}

export function itemFromRow(row) {
  return {
    id: row.SLUG, name: row.NAME, description: row.DESCRIPTION,
    category: row.CATEGORY, priceCents: priceToCents(row.UNIT_PRICE),
    availableQuantity: row.AVAILABLE_QUANTITY, featured: Boolean(row.FEATURED),
    image: row.IMAGE, color: row.COLOR, tag: row.TAG,
  };
}

export function createItemRepository(poolProvider = getDatabasePool) {
  return {
    async find({ id, name } = {}) {
      const clauses = [];
      const values = [];
      if (id) { clauses.push('SLUG = ?'); values.push(id); }
      // LOCATE treats %, _ and quotes literally instead of as SQL wildcards.
      if (name) { clauses.push('LOCATE(LOWER(?), LOWER(NAME)) > 0'); values.push(name); }
      try {
        const [rows] = await execute(poolProvider(),
          `SELECT * FROM ITEM${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ITEM_NUMBER`, values);
        return rows.map(itemFromRow);
      } catch {
        throw databaseUnavailable();
      }
    },
  };
}
