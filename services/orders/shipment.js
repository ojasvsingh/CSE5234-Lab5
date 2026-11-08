// One packet per line item, regardless of quantity. Each packet is 1.0 lb.
export const PACKET_WEIGHT_POUNDS = 1;

export function buildShipmentEvent({ shipping, receipt, businessId = process.env.STORE_BUSINESS_ID || 'AB-STORE-1001' }) {
  return {
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
    weightPounds: PACKET_WEIGHT_POUNDS,
  };
}
