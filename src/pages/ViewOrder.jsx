import { startTransition, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowRight, FiCreditCard, FiMapPin, FiCheck } from 'react-icons/fi';
import CheckoutLayout from '../components/CheckoutLayout.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { cardLastFour } from '../lib/validation.js';
import { formatMoney } from '../lib/shop.js';

export default function ViewOrder() {
  const { cart, items, payment, shipping, totals, submitOrder, completeOrder, isSubmitting, updateQuantity } = useShop();
  const [confirmedCart, setConfirmedCart] = useState(null);
  const [orderError, setOrderError] = useState(null);
  const cartSignature = JSON.stringify({ cart, prices: items.map((item) => item.priceCents) });
  const confirmed = confirmedCart === cartSignature;
  const navigate = useNavigate();
  async function placeOrder(event) {
    event.preventDefault();
    if (!confirmed || isSubmitting) return;
    setOrderError(null);
    try {
      const receipt = await submitOrder();
      if (!receipt) return;
      startTransition(() => {
        completeOrder(receipt);
        navigate('/purchase/viewConfirmation', { replace: true });
      });
    } catch (error) {
      setOrderError(error);
    }
  }
  function useAvailableQuantities() {
    for (const item of orderError.items) updateQuantity(item.productId, item.availableQuantity);
    setConfirmedCart(null);
    setOrderError(null);
  }
  return (
    <CheckoutLayout step={3} eyebrow="ONE LAST LOOK" title="Ready when you are." description="Your bag is packed. Check the details below before you make it official.">
      <div className="review-block">
        <div className="review-heading"><h2><FiCreditCard aria-hidden="true" />Payment</h2><Link to="/purchase/paymentEntry">Edit payment</Link></div>
        <p>{payment.cardHolderName}</p><p>Card ending in <strong>{cardLastFour(payment)}</strong></p><p className="muted">Expires {payment.expirationDate} · Security code provided</p>
      </div>
      <div className="review-block">
        <div className="review-heading"><h2><FiMapPin aria-hidden="true" />Ship to</h2><Link to="/purchase/shippingEntry">Edit shipping</Link></div>
        <address>{shipping.name}<br />{shipping.addressLine1}<br />{shipping.addressLine2 && <>{shipping.addressLine2}<br /></>}{shipping.city}, {shipping.state} {shipping.zip}<br />United States</address>
      </div>
      <form className="place-order-form" onSubmit={placeOrder}>
        {orderError && <div className="service-message service-error" role="alert">
          <p>{orderError.message}</p>
          {orderError.code === 'INSUFFICIENT_STOCK' && <>
            <ul>{orderError.items.map((item) => <li key={item.productId}>{item.name}: requested {item.requestedQuantity}, available {item.availableQuantity}.</li>)}</ul>
            <button type="button" className="text-button" onClick={useAvailableQuantities}>Use available quantities</button>
          </>}
          {orderError.fields && <p>Use “Edit payment” or “Edit shipping” above to correct the details.</p>}
        </div>}
        <label className="confirmation-checkbox"><input type="checkbox" checked={confirmed} disabled={isSubmitting} onChange={(event) => setConfirmedCart(event.target.checked ? cartSignature : null)} required /><span>I’ve checked my items, payment, and shipping details.</span></label>
        <button type="submit" className="button button-primary full-width" disabled={!confirmed || isSubmitting}>{isSubmitting ? 'Checking stock and placing order…' : <>Place demo order · {formatMoney(totals.totalCents)} <FiArrowRight aria-hidden="true" /></>}</button>
        <p className="form-footnote centered"><FiCheck aria-hidden="true" />This is a demo order. You won’t be charged.</p>
      </form>
    </CheckoutLayout>
  );
}
