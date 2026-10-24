import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  CART_STORAGE_KEY, RECEIPT_STORAGE_KEY, MAX_QUANTITY, normalizeCart, normalizeReceipt,
  readStoredValue, writeStoredValue, getCartItems, getTotals, changeQuantity,
} from '../lib/shop.js';
import { emptyPayment, emptyShipping } from '../lib/validation.js';
import { ApiError, loadInventory, postOrder } from '../lib/api.js';

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState('');
  const inventoryRequest = useRef(0);
  const [cart, setCart] = useState(() => normalizeCart(readStoredValue(CART_STORAGE_KEY)));
  const [payment, setPayment] = useState({ ...emptyPayment });
  const [shipping, setShipping] = useState({ ...emptyShipping });
  const [receipt, setReceipt] = useState(() => normalizeReceipt(readStoredValue(RECEIPT_STORAGE_KEY)));
  const [cartOpen, setCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  const retryInventory = useCallback(async () => {
    const sequence = ++inventoryRequest.current;
    setInventoryLoading(true);
    setInventoryError('');
    try {
      const items = await loadInventory();
      if (sequence !== inventoryRequest.current) return;
      setProducts(items);
      setCart((current) => normalizeCart(current, items));
    } catch (error) {
      if (sequence === inventoryRequest.current) setInventoryError(error.message);
    } finally {
      if (sequence === inventoryRequest.current) setInventoryLoading(false);
    }
  }, []);

  useEffect(() => { retryInventory(); return () => { inventoryRequest.current += 1; }; }, [retryInventory]);
  useEffect(() => writeStoredValue(CART_STORAGE_KEY, cart), [cart]);
  useEffect(() => writeStoredValue(RECEIPT_STORAGE_KEY, receipt), [receipt]);

  function addItem(productId, quantity) {
    if (submitting.current) return;
    setCart((current) => {
      const existing = current.find((line) => line.productId === productId)?.quantity || 0;
      return changeQuantity(current, productId, Math.min(MAX_QUANTITY, existing + quantity), products);
    });
  }
  function updateQuantity(productId, quantity) {
    if (!submitting.current) setCart((current) => changeQuantity(current, productId, quantity, products));
  }

  async function submitOrder() {
    if (submitting.current || !cart.length) return null;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      const response = await postOrder({ items: cart, payment, shipping });
      const nextReceipt = normalizeReceipt({ ...response, number: response.confirmationNumber });
      if (!nextReceipt) throw new ApiError('We could not read the order confirmation. Please try again.');
      return nextReceipt;
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  // Called together with navigation, only after the order API has succeeded.
  function completeOrder(nextReceipt) {
    setReceipt(nextReceipt);
    setCart([]);
    setPayment({ ...emptyPayment });
    setShipping({ ...emptyShipping });
  }

  return (
    <ShopContext.Provider value={{
      products, inventoryLoading, inventoryError, retryInventory,
      cart, items: getCartItems(cart, products), totals: getTotals(cart, products),
      payment, setPayment, shipping, setShipping, receipt, isSubmitting,
      cartOpen, setCartOpen, addItem, updateQuantity, submitOrder, completeOrder,
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
