import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
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
      '/': 'Home',
      '/about': 'About us',
      '/contact': 'Contact us',
      '/purchase': 'Outdoor essentials',
      '/purchase/paymentEntry': 'Payment',
      '/purchase/shippingEntry': 'Shipping',
      '/purchase/viewOrder': 'Review your order',
      '/purchase/viewConfirmation': 'Order confirmed',
    };
    document.title = `${titles[pathname] || 'Page not found'} | Adventure Beyond`;
    if (hash) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' });
    }
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
          <Link className="brand" to="/" aria-label="Adventure Beyond home">
            <MountainMark /><span>ADVENTURE<span>BEYOND</span></span>
          </Link>
          <nav aria-label="Main navigation">
            <NavLink className={({ isActive }) => isActive ? 'nav-active' : ''} to="/" end>Home</NavLink>
            <NavLink className={({ isActive }) => isActive ? 'nav-active' : ''} to="/purchase">Shop gear</NavLink>
            <NavLink className={({ isActive }) => isActive ? 'nav-active' : ''} to="/about">About us</NavLink>
            <NavLink className={({ isActive }) => isActive ? 'nav-active' : ''} to="/contact">Contact us</NavLink>
          </nav>
          <button type="button" className="cart-trigger" onClick={() => setCartOpen(true)} aria-haspopup="dialog" aria-label={`Open shopping cart, ${totals.itemCount} items`}>
            <FiShoppingBag aria-hidden="true" /><span>Your bag</span><span className="cart-count">{totals.itemCount}</span>
          </button>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex="-1"><Outlet /></main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-story">
            <Link className="footer-brand" to="/">ADVENTURE BEYOND <FiArrowUpRight aria-hidden="true" /></Link>
            <p>Less indoors. More out there.<br />Find a little room for your next adventure.</p>
          </div>
          <nav aria-label="Explore the website">
            <h2>Explore</h2>
            <Link to="/">Home</Link>
            <Link to="/purchase">Shop gear</Link>
            <Link to="/about">About us</Link>
          </nav>
          <nav aria-label="Customer support">
            <h2>Here to help</h2>
            <Link to="/contact">Contact us</Link>
            <Link to="/contact#returns">Returns & support</Link>
            <Link to="/contact#faq">Frequently asked questions</Link>
          </nav>
          <div className="footer-location">
            <p className="eyebrow">ROOTED IN CURIOSITY</p>
            <p>Columbus, Ohio<br />40.0017° N · 83.0197° W</p>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Adventure Beyond</span>
          <p>A student storefront. Orders and support requests are demonstrations only.</p>
        </div>
      </footer>
      <CartDrawer />
    </>
  );
}
