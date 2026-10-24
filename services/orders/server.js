import { createOrderRoute } from './handler.js';
import { listen } from '../shared/http.js';

listen(createOrderRoute(), Number(process.env.ORDER_PORT || 3002), 'Order service');
