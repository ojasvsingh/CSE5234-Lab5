import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowDown, FiArrowRight, FiArrowUpRight, FiCheck, FiPlus } from 'react-icons/fi';
import { products } from '../data/products.js';
import { useShop } from '../context/ShopContext.jsx';
import { formatMoney, MAX_QUANTITY } from '../lib/shop.js';
import QuantityInput from '../components/QuantityInput.jsx';

function ProductCard({ product, index, onAdded }) {
  const { cart, addItem } = useShop();
  const [quantity, setQuantity] = useState(1);
  const inBag = cart.find((line) => line.productId === product.id)?.quantity || 0;
  const remaining = MAX_QUANTITY - inBag;
  const atLimit = remaining === 0;
  function add() {
    const amount = Math.min(quantity, remaining);
    addItem(product.id, amount);
    onAdded(`${amount} × ${product.name} added to your bag.`);
    setQuantity(1);
  }
  return (
    <article className="product-card">
      <div className={`product-image product-image-${product.id}`}>
        <span className="product-index">0{index + 1} / {product.category.toUpperCase()}</span>
        <img src={product.image} alt={`${product.name} in ${product.color.toLowerCase()}`} width="400" height="400" />
        <span className="product-tag">{product.tag}</span>
        {inBag > 0 && <span className="in-bag"><FiCheck aria-hidden="true" />{inBag} in bag</span>}
      </div>
      <div className="product-title-row"><h3>{product.name}</h3><strong>{formatMoney(product.priceCents)}</strong></div>
      <p className="product-description">{product.description}</p>
      <p className="product-color"><span />{product.color}</p>
      <div className="product-buy">
        <QuantityInput label={product.name} value={Math.min(quantity, Math.max(1, remaining))} max={Math.max(1, remaining)} onChange={setQuantity} />
        <button type="button" className="add-button" aria-label={`Add ${product.name} to bag`} disabled={atLimit} onClick={add}>{atLimit ? 'Bag limit reached' : 'Add to bag'}<FiPlus aria-hidden="true" /></button>
      </div>
    </article>
  );
}

export default function Purchase() {
  const [category, setCategory] = useState('All gear');
  const [notice, setNotice] = useState('');
  const { totals, setCartOpen } = useShop();
  const filtered = products.filter((product) => category === 'All gear' || product.category === category);
  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="small-dash" /> FOR THE WAY OUT THERE</p>
          <h1>Good gear.<br /><em>Great outdoors.</em></h1>
          <p>For early starts, quiet trails, and the long way home.<br className="desktop-break" /> Find your essentials. Go a little beyond.</p>
          <a className="button button-primary" href="#gear">Find your next essential <FiArrowDown aria-hidden="true" /></a>
          <div className="hero-note"><span className="compass">✳</span><span>LESS TO PACK.<br /><strong>MORE TO EXPLORE.</strong></span></div>
        </div>
        <div className="hero-art">
          <img src="/images/landscape.svg" alt="Illustrated mountain campsite with a rust-orange tent, pine trees, and a winding trail" width="720" height="520" />
          <span className="hero-art-label">THE OUTSIDE IS CALLING.</span>
          <span className="hero-art-index">FIELD NOTES / 001</span>
          <div className="hero-stamp">TAKE THE<br /><strong>SCENIC</strong><br />ROUTE <FiArrowUpRight aria-hidden="true" /></div>
        </div>
      </section>
      <section className="container catalog" id="gear" aria-labelledby="gear-heading">
        <div className="catalog-heading"><div><p className="eyebrow">A SMALL COLLECTION. A BIG OUTSIDE.</p><h2 id="gear-heading">Meet your trail companions.</h2></div><span className="collection-count">05 thoughtfully chosen essentials <FiArrowDown aria-hidden="true" /></span></div>
        <div className="catalog-toolbar">
          <div className="category-filters" role="group" aria-label="Filter gear by category">
            {['All gear', 'Packs', 'Shelter', 'Apparel', 'Essentials'].map((name) => <button key={name} type="button" aria-pressed={category === name} className={category === name ? 'selected' : ''} onClick={() => setCategory(name)}>{name}{name === 'All gear' && <span>5</span>}</button>)}
          </div>
          <span className="result-count">{filtered.length} {filtered.length === 1 ? 'essential' : 'essentials'}</span>
        </div>
        <div className="catalog-notice" role="status">{notice && <><FiCheck aria-hidden="true" /><span>{notice}</span><button type="button" onClick={() => setCartOpen(true)}>View bag <FiArrowRight aria-hidden="true" /></button></>}</div>
        <div className="product-grid">
          {filtered.map((product) => <ProductCard key={product.id} product={product} index={products.indexOf(product)} onAdded={setNotice} />)}
        </div>
        {totals.itemCount > 0 && <div className="catalog-checkout"><span><strong>{totals.itemCount} {totals.itemCount === 1 ? 'essential' : 'essentials'}</strong> packed for your next chapter.</span><Link className="button button-primary" to="/purchase/paymentEntry">Let’s get going · {formatMoney(totals.totalCents)} <FiArrowRight aria-hidden="true" /></Link></div>}
      </section>
      <section className="journey-band" id="how-it-works" aria-labelledby="journey-heading"><div className="container journey-inner">
        <div><p className="eyebrow">FROM YOUR BAG TO THE TRAIL</p><h2 id="journey-heading">Keep it simple.<br />Get out there.</h2></div>
        <div className="journey-step"><span>01</span><h3>Find your essentials</h3><p>Five trail companions. Choose your gear and make room in your bag.</p></div>
        <div className="journey-step"><span>02</span><h3>Make it yours</h3><p>Add your payment and shipping details, then give your order a final look.</p></div>
        <div className="journey-step"><span>03</span><h3>See you out there</h3><p>Confirm your demo order and get your adventure’s confirmation number.</p></div>
      </div></section>
    </>
  );
}
