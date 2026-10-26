import { inventoryRoute } from './handler.js';
import { listen } from '../shared/http.js';

listen(inventoryRoute, Number(process.env.INVENTORY_PORT || 3001), 'Inventory service');
