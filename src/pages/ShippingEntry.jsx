import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiMapPin } from 'react-icons/fi';
import CheckoutLayout from '../components/CheckoutLayout.jsx';
import FormField from '../components/FormField.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { states, validateShipping } from '../lib/validation.js';

export default function ShippingEntry() {
  const { shipping, setShipping } = useShop();
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  function update(event) {
    const { name, value } = event.target;
    setShipping((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }
  function submit(event) {
    event.preventDefault();
    const nextErrors = validateShipping(shipping);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    setShipping(Object.fromEntries(Object.entries(shipping).map(([key, value]) => [key, value.trim()])));
    navigate('/purchase/viewOrder');
  }
  const field = (name) => ({ value: shipping[name], onChange: update, error: errors[name] });
  return (
    <CheckoutLayout step={2} eyebrow="PICK A STARTING POINT" title="Where’s base camp?" description="Tell us where your gear would be heading. This demo supports US addresses.">
      <form noValidate onSubmit={submit} className="checkout-form">
        <div className="form-section-title"><FiMapPin aria-hidden="true" /><h2>Shipping details</h2><span className="card-types">UNITED STATES</span></div>
        <FormField name="name" label="Full name" {...field('name')} autoComplete="shipping name" placeholder="Alex Taylor" maxLength={100} />
        <FormField name="addressLine1" label="Address line 1" {...field('addressLine1')} autoComplete="shipping address-line1" placeholder="123 Trailhead Lane" maxLength={150} />
        <FormField name="addressLine2" label="Address line 2" {...field('addressLine2')} optional autoComplete="shipping address-line2" placeholder="Apartment, suite, etc." maxLength={150} />
        <FormField name="city" label="City" {...field('city')} autoComplete="shipping address-level2" placeholder="Columbus" maxLength={100} />
        <div className="form-row">
          <FormField name="state" label="State" {...field('state')} autoComplete="shipping address-level1"><option value="">Select a state</option>{states.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</FormField>
          <FormField name="zip" label="ZIP code" {...field('zip')} autoComplete="shipping postal-code" placeholder="43210" maxLength={10} />
        </div>
        <button type="submit" className="button button-primary full-width">Review your order <FiArrowRight aria-hidden="true" /></button>
      </form>
    </CheckoutLayout>
  );
}
