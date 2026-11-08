// One packet per line, with the weight of every unit on that line.
export const ITEM_WEIGHT_POUNDS = 1;

export function buildShipmentEvent({ shipping, receipt, requestId, businessId = process.env.STORE_BUSINESS_ID || 'AB-STORE-1001' }) {
  return {
    schemaVersion: 1,
    requestId,
    orderId: receipt.orderId,
    businessId,
    address: {
      name: shipping.name,
      email: shipping.email,
      country: shipping.country,
      addressLine1: shipping.addressLine1,
      addressLine2: shipping.addressLine2,
      city: shipping.city,
      state: shipping.state,
      zip: shipping.zip,
    },
    packetCount: receipt.items.length,
    packetWeightsPounds: receipt.items.map(item => item.quantity * ITEM_WEIGHT_POUNDS),
  };
}
