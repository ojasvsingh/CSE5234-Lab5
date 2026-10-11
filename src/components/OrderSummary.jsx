import { FiShoppingBag } from 'react-icons/fi';
import { useShop } from '../context/ShopContext.jsx';
import { formatMoney } from '../lib/shop.js';

export default function OrderSummary() {
  const { items, totals, setCartOpen } = useShop();
  return (
    <aside className="order-summary" aria-label="Order summary">
      <div className="summary-heading"><h2>Along for the journey</h2><FiShoppingBag aria-hidden="true" /></div>
      <span className="eyebrow">{totals.itemCount} {totals.itemCount === 1 ? 'ITEM' : 'ITEMS'} IN YOUR BAG</span>
      <ul className="summary-items">
        {items.map((item) => (
          <li key={item.id}>
            <img src={item.image} alt="" width="64" height="72" />
            <div><h3>{item.name}</h3><p>Qty {item.quantity} · {formatMoney(item.priceCents)} each</p></div>
            <strong>{formatMoney(item.lineTotalCents)}</strong>
          </li>
        ))}
      </ul>
      <button className="text-button edit-bag" type="button" onClick={() => setCartOpen(true)}>Edit your bag</button>
      <dl className="summary-totals">
        <div><dt>Subtotal</dt><dd>{formatMoney(totals.subtotalCents)}</dd></div>
        <div><dt>Shipping & tax</dt><dd>Not charged</dd></div>
        <div className="grand-total"><dt>Total <span>USD</span></dt><dd>{formatMoney(totals.totalCents)}</dd></div>
      </dl>
      <p className="summary-footnote">Just the essentials, ready for your next adventure.</p>
    </aside>
  );
}
