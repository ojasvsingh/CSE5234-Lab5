import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiCreditCard, FiInfo } from 'react-icons/fi';
import CheckoutLayout from '../components/CheckoutLayout.jsx';
import FormField from '../components/FormField.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { validatePayment } from '../lib/validation.js';

export default function PaymentEntry() {
  const { payment, setPayment } = useShop();
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  function update(event) {
    const { name, value } = event.target;
    setPayment((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }
  function submit(event) {
    event.preventDefault();
    const nextErrors = validatePayment(payment);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    navigate('/purchase/shippingEntry');
  }
  return (
    <CheckoutLayout step={1} eyebrow="THE NEXT STEP" title="Make room for adventure." description="First, add your payment details. Your next trail is getting closer.">
      <div className="demo-note"><FiInfo aria-hidden="true" /><p>This is a demo checkout. Use sample card details; no payment will be processed.</p></div>
      <form noValidate onSubmit={submit} className="checkout-form">
        <div className="form-section-title"><FiCreditCard aria-hidden="true" /><h2>Payment details</h2><span className="card-types">CARD</span></div>
        <FormField name="cardHolderName" label="Cardholder name" value={payment.cardHolderName} onChange={update} error={errors.cardHolderName} autoComplete="cc-name" placeholder="Alex Taylor" maxLength={100} />
        <FormField name="cardNumber" label="Card number" value={payment.cardNumber} onChange={update} error={errors.cardNumber} autoComplete="off" inputMode="numeric" placeholder="4242 4242 4242 4242" maxLength={23} hint="For this demo, try 4242 4242 4242 4242." />
        <div className="form-row">
          <FormField name="expirationDate" label="Expiration date" value={payment.expirationDate} onChange={update} error={errors.expirationDate} autoComplete="off" placeholder="MM/YY" maxLength={5} />
          <FormField name="cvvCode" label="Security code (CVV)" type="password" value={payment.cvvCode} onChange={update} error={errors.cvvCode} autoComplete="off" inputMode="numeric" placeholder="123" maxLength={4} />
        </div>
        <p className="form-footnote">Payment details stay only in this open page session. After a refresh, enter them again to continue.</p>
        <button type="submit" className="button button-primary full-width">Continue to shipping <FiArrowRight aria-hidden="true" /></button>
      </form>
    </CheckoutLayout>
  );
}
