import { products } from './catalogue.js';
import { HttpError, json } from '../shared/responses.js';
import { lambdaAdapter } from '../shared/lambda.js';

const base = '/inventory-management/inventory';

export function createInventoryRoute(catalogue = products) {
  return async ({ method, path, query }) => {
    if (path === '/health' && method === 'GET') return json(200, { service: 'inventory-management', status: 'ok' });
    const idMatch = path.match(/^\/inventory-management\/inventory\/items\/([^/]+)$/);
    if (path !== base && path !== `${base}/items` && !idMatch) throw new HttpError(404, 'NOT_FOUND', 'This inventory endpoint does not exist.');
    if (method !== 'GET') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for inventory.' } }, { Allow: 'GET, OPTIONS' });
    if (idMatch) {
      let id;
      try { id = decodeURIComponent(idMatch[1]); } catch { throw new HttpError(400, 'INVALID_ID', 'The item ID is invalid.'); }
      const item = catalogue.find((product) => product.id === id);
      if (!item) throw new HttpError(404, 'ITEM_NOT_FOUND', 'No inventory item has that ID.');
      return json(200, { item });
    }
    const id = query.get('id')?.trim();
    const name = query.get('name')?.trim().toLowerCase();
    return json(200, { items: catalogue.filter((item) => (!id || item.id === id) && (!name || item.name.toLowerCase().includes(name))) });
  };
}

export const inventoryRoute = createInventoryRoute();
export const handler = lambdaAdapter(inventoryRoute);
