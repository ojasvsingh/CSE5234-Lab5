import { useShop } from '../context/ShopContext.jsx';

export default function InventoryStatus() {
  const { inventoryLoading, inventoryError, retryInventory } = useShop();
  if (inventoryLoading) return <p className="service-message" role="status">Loading the latest gear…</p>;
  if (inventoryError) return (
    <div className="service-message service-error" role="alert">
      <p>{inventoryError}</p>
      <button className="text-button" type="button" onClick={retryInventory}>Try loading gear again</button>
    </div>
  );
  return null;
}
