import { closePaymentPool } from '../database/payments.js';
import { createPaymentRoute } from './handler.js';
import { listen } from '../shared/http.js';

listen(createPaymentRoute(), Number(process.env.PAYMENT_PORT || 3003), 'Payment service', closePaymentPool);
