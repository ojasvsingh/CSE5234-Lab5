import { Link } from 'react-router-dom';
import { FiArrowRight, FiCheck, FiCompass } from 'react-icons/fi';
import { useShop } from '../context/ShopContext.jsx';
import { getCartItems, getTotals, formatMoney } from '../lib/shop.js';

export default function Confirmation() {
  const { receipt } = useShop();
  const items = getCartItems(receipt.cart);
  const totals = getTotals(receipt.cart);
  return (
    <div className="container confirmation-page">
      <div className="confirmation-symbol"><FiCheck aria-hidden="true" /></div>
      <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
      <h1>Adventure, confirmed.</h1>
      <p className="page-intro">Thanks for choosing Adventure Beyond.<br />Your demo order is complete. The outside is calling.</p>
      <div className="confirmation-receipt">
        <div className="receipt-heading"><div><p className="eyebrow">CONFIRMATION NUMBER</p><strong className="confirmation-number">{receipt.number}</strong></div><FiCompass aria-hidden="true" /></div>
        <h2>Your trail companions</h2>
        <ul className="receipt-items">
          {items.map((item) => <li key={item.id}><img src={item.image} alt="" width="60" height="64" /><div><h3>{item.name}</h3><p>Qty {item.quantity} · {formatMoney(item.priceCents)} each</p></div><strong>{formatMoney(item.lineTotalCents)}</strong></li>)}
        </ul>
        <div className="total-row"><span>Total <small>USD</small></span><strong>{formatMoney(totals.totalCents)}</strong></div>
        <p className="receipt-note">No payment was processed and no shipment will be made.<br />Keep this confirmation number for your demo records.</p>
      </div>
      <Link className="button button-primary" to="/purchase">Back to exploring <FiArrowRight aria-hidden="true" /></Link>
      <p className="confirmation-signoff">See you on the scenic route.</p>
    </div>
  );
}
