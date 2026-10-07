import { Navigate, Route, Routes, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useShop } from './context/ShopContext.jsx';
import { validatePayment, validateShipping } from './lib/validation.js';
import Purchase from './pages/Purchase.jsx';
import PaymentEntry from './pages/PaymentEntry.jsx';
import ShippingEntry from './pages/ShippingEntry.jsx';
import ViewOrder from './pages/ViewOrder.jsx';
import Confirmation from './pages/Confirmation.jsx';

function CheckoutGuard({ stage, children }) {
  const { cart, payment, shipping, receipt } = useShop();
  if (stage === 'confirmation') return receipt ? children : <Navigate to="/purchase" replace />;
  if (!cart.length) return <Navigate to="/purchase" replace />;
  if (stage > 1 && Object.keys(validatePayment(payment)).length) return <Navigate to="/purchase/paymentEntry" replace />;
  if (stage > 2 && Object.keys(validateShipping(shipping)).length) return <Navigate to="/purchase/shippingEntry" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/purchase" replace />} />
        <Route path="/purchase" element={<Purchase />} />
        <Route path="/purchase/paymentEntry" element={<CheckoutGuard stage={1}><PaymentEntry /></CheckoutGuard>} />
        <Route path="/purchase/shippingEntry" element={<CheckoutGuard stage={2}><ShippingEntry /></CheckoutGuard>} />
        <Route path="/purchase/viewOrder" element={<CheckoutGuard stage={3}><ViewOrder /></CheckoutGuard>} />
        <Route path="/purchase/viewConfirmation" element={<CheckoutGuard stage="confirmation"><Confirmation /></CheckoutGuard>} />
        <Route path="*" element={<div className="container not-found"><p className="eyebrow">A SMALL DETOUR</p><h1>This trail ends here.</h1><p>We couldn’t find that page. Let’s head back to the gear.</p><Link className="button button-primary" to="/purchase">Back to the shop</Link></div>} />
      </Route>
    </Routes>
  );
}
