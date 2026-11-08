import { closeShippingPool } from '../database/shipments.js';
import { createShippingRoute } from './handler.js';
import { listen } from '../shared/http.js';

listen(createShippingRoute(), Number(process.env.SHIPPING_PORT || 3004), 'Shipping service', closeShippingPool);
