import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  CART_STORAGE_KEY, RECEIPT_STORAGE_KEY, MAX_QUANTITY, normalizeCart, normalizeReceipt,
  readStoredValue, writeStoredValue, getCartItems, getTotals, changeQuantity,
} from '../lib/shop.js';
import { emptyPayment, emptyShipping } from '../lib/validation.js';

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [cart, setCart] = useState(() => normalizeCart(readStoredValue(CART_STORAGE_KEY)));
  // Payment and address data stay in memory and are cleared after an order or reload.
  const [payment, setPayment] = useState({ ...emptyPayment });
  const [shipping, setShipping] = useState({ ...emptyShipping });
  const [receipt, setReceipt] = useState(() => normalizeReceipt(readStoredValue(RECEIPT_STORAGE_KEY)));
  const [cartOpen, setCartOpen] = useState(false);
  const submitted = useRef(false);

  useEffect(() => writeStoredValue(CART_STORAGE_KEY, cart), [cart]);
  useEffect(() => writeStoredValue(RECEIPT_STORAGE_KEY, receipt), [receipt]);

  function addItem(productId, quantity) {
    submitted.current = false;
    setCart((current) => {
      const existing = current.find((line) => line.productId === productId)?.quantity || 0;
      return changeQuantity(current, productId, Math.min(MAX_QUANTITY, existing + quantity));
    });
  }

  function updateQuantity(productId, quantity) {
    setCart((current) => changeQuantity(current, productId, quantity));
  }

  function submitOrder() {
    if (submitted.current || !cart.length) return;
    submitted.current = true;
    const number = `AB-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    setReceipt({ number, cart: cart.map((line) => ({ ...line })) });
    setCart([]);
    setPayment({ ...emptyPayment });
    setShipping({ ...emptyShipping });
  }

  return (
    <ShopContext.Provider value={{
      cart, items: getCartItems(cart), totals: getTotals(cart),
      payment, setPayment, shipping, setShipping, receipt,
      cartOpen, setCartOpen, addItem, updateQuantity, submitOrder,
    }}>
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error('useShop must be used inside ShopProvider.');
  return value;
}
