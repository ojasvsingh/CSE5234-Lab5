import { startTransition, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowRight, FiCreditCard, FiMapPin, FiCheck } from 'react-icons/fi';
import CheckoutLayout from '../components/CheckoutLayout.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { cardLastFour } from '../lib/validation.js';
import { formatMoney } from '../lib/shop.js';

export default function ViewOrder() {
  const { cart, payment, shipping, totals, submitOrder } = useShop();
  const [confirmedCart, setConfirmedCart] = useState(null);
  const cartSignature = JSON.stringify(cart);
  const confirmed = confirmedCart === cartSignature;
  const navigate = useNavigate();
  function placeOrder(event) {
    event.preventDefault();
    if (!confirmed) return;
    // Commit the receipt, clear checkout data, and navigate in the same transition.
    // Otherwise the empty-cart guard can run before the router changes pages.
    startTransition(() => {
      submitOrder();
      navigate('/purchase/viewConfirmation', { replace: true });
    });
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
        <label className="confirmation-checkbox"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmedCart(event.target.checked ? cartSignature : null)} required /><span>I’ve checked my items, payment, and shipping details.</span></label>
        <button type="submit" className="button button-primary full-width" disabled={!confirmed}>Place demo order · {formatMoney(totals.totalCents)} <FiArrowRight aria-hidden="true" /></button>
        <p className="form-footnote centered"><FiCheck aria-hidden="true" />This is a demo order. You won’t be charged.</p>
      </form>
    </CheckoutLayout>
  );
}
