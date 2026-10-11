import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { FiArrowUpRight, FiShoppingBag } from 'react-icons/fi';
import { useShop } from '../context/ShopContext.jsx';
import CartDrawer from './CartDrawer.jsx';

function MountainMark() {
  return <svg viewBox="0 0 44 38" aria-hidden="true"><path d="M1 34 18 4l12 22 5-9 10 17H1Z" fill="currentColor" /><path d="m13 13 5-9 7 13-7-4-5 0Z" fill="#c96d45" /></svg>;
}

export default function Layout() {
  const { totals, setCartOpen } = useShop();
  const { pathname, hash } = useLocation();
  const mainRef = useRef(null);
  useEffect(() => {
    const titles = {
      '/purchase': 'Outdoor essentials',
      '/purchase/paymentEntry': 'Payment',
      '/purchase/shippingEntry': 'Shipping',
      '/purchase/viewOrder': 'Review your order',
      '/purchase/viewConfirmation': 'Order confirmed',
    };
    document.title = `${titles[pathname] || 'Page not found'} | Adventure Beyond`;
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    else {
      window.scrollTo(0, 0);
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [pathname, hash]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="announcement"><span>A little further. A little wilder.</span><span>YOUR NEXT ADVENTURE STARTS HERE <FiArrowUpRight aria-hidden="true" /></span></div>
      <header className="site-header">
        <div className="container header-inner">
          <Link className="brand" to="/purchase" aria-label="Adventure Beyond home">
            <MountainMark /><span>ADVENTURE<span>BEYOND</span></span>
          </Link>
          <nav aria-label="Main navigation">
            <Link className={pathname === '/purchase' ? 'nav-active' : ''} to="/purchase">Shop gear</Link>
            <Link className="nav-secondary" to="/purchase#how-it-works">The journey</Link>
          </nav>
          <button type="button" className="cart-trigger" onClick={() => setCartOpen(true)} aria-haspopup="dialog" aria-label={`Open shopping cart, ${totals.itemCount} items`}>
            <FiShoppingBag aria-hidden="true" /><span>Your bag</span><span className="cart-count">{totals.itemCount}</span>
          </button>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex="-1"><Outlet /></main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div><Link className="footer-brand" to="/purchase">ADVENTURE BEYOND <FiArrowUpRight aria-hidden="true" /></Link><p>Less indoors. More out there.</p></div>
          <p>A student storefront.<br />Orders are for demonstration only.</p>
          <span className="footer-coordinate">40.0017° N · 83.0197° W<br /><span>COLUMBUS, OHIO</span></span>
        </div>
      </footer>
      <CartDrawer />
    </>
  );
}
