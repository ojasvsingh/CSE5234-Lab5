import { Link } from 'react-router-dom';
import { FiCheck, FiArrowLeft } from 'react-icons/fi';
import OrderSummary from './OrderSummary.jsx';

const steps = [
  ['Gear', '/purchase'], ['Payment', '/purchase/paymentEntry'],
  ['Shipping', '/purchase/shippingEntry'], ['Review', '/purchase/viewOrder'],
];

export default function CheckoutLayout({ step, eyebrow, title, description, children }) {
  return (
    <div className="container checkout-page">
      <Link className="back-link" to={steps[Math.max(0, step - 1)][1]}><FiArrowLeft aria-hidden="true" />{step === 1 ? 'Back to the gear' : `Back to ${steps[step - 1][0].toLowerCase()}`}</Link>
      <ol className="checkout-steps" aria-label="Checkout progress">
        {steps.map(([name, path], index) => (
          <li key={name} className={index === step ? 'current' : index < step ? 'complete' : ''} aria-current={index === step ? 'step' : undefined}>
            <span className="step-number">{index < step ? <FiCheck aria-hidden="true" /> : `0${index + 1}`}</span>
            {index < step ? <Link to={path}>{name}</Link> : <span>{name}</span>}
          </li>
        ))}
      </ol>
      <div className="checkout-grid">
        <section className="checkout-content">
          <p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-intro">{description}</p>
          {children}
        </section>
        <OrderSummary />
      </div>
    </div>
  );
}
