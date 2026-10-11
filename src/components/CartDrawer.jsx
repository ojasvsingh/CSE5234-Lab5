import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiShoppingBag, FiTrash2, FiX } from 'react-icons/fi';
import { useShop } from '../context/ShopContext.jsx';
import { formatMoney } from '../lib/shop.js';
import QuantityInput from './QuantityInput.jsx';

export default function CartDrawer() {
  const { cartOpen, setCartOpen, items, totals, updateQuantity } = useShop();
  const dialogRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (cartOpen && !dialog.open) dialog.showModal();
    if (!cartOpen && dialog.open) dialog.close();
    if (!cartOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [cartOpen]);

  function close() { setCartOpen(false); }
  function checkout() { close(); navigate('/purchase/paymentEntry'); }

  return (
    <dialog
      className="cart-dialog" ref={dialogRef} aria-labelledby="cart-title"
      onCancel={close} onClose={close}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <section className="cart-panel">
        <div className="cart-heading"><div><p className="eyebrow">PACK FOR WHAT’S NEXT</p><h2 id="cart-title">Your bag <span>({totals.itemCount})</span></h2></div><button type="button" className="icon-button" aria-label="Close shopping cart" onClick={close}><FiX /></button></div>
        {items.length ? (
          <>
            <div className="cart-lines">
              {items.map((item) => (
                <article className="cart-line" key={item.id}>
                  <img src={item.image} alt="" width="88" height="102" />
                  <div className="cart-line-info">
                    <h3>{item.name}</h3><p>{item.color}</p>
                    <QuantityInput value={item.quantity} onChange={(value) => updateQuantity(item.id, value)} label={item.name} />
                  </div>
                  <div className="cart-line-actions"><strong>{formatMoney(item.lineTotalCents)}</strong><button type="button" className="remove-button" aria-label={`Remove ${item.name} from cart`} onClick={() => updateQuantity(item.id, 0)}><FiTrash2 aria-hidden="true" /><span>Remove</span></button></div>
                </article>
              ))}
            </div>
            <div className="cart-bottom">
              <div className="total-row"><span>Subtotal</span><strong aria-live="polite">{formatMoney(totals.subtotalCents)}</strong></div>
              <p className="muted">Demo total · No shipping or tax charges.</p>
              <button type="button" className="button button-primary full-width" onClick={checkout}>Continue to payment <FiArrowRight /></button>
              <button type="button" className="text-button full-width" onClick={close}>Keep exploring</button>
            </div>
          </>
        ) : (
          <div className="empty-cart"><FiShoppingBag aria-hidden="true" /><h3>A little room for adventure.</h3><p>Your bag is empty. Find a few essentials for your next trip.</p><button type="button" className="button button-primary" onClick={() => { close(); navigate('/purchase'); }}>Explore the gear <FiArrowRight /></button></div>
        )}
      </section>
    </dialog>
  );
}
