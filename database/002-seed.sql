-- Initial warehouse data lives in SQL, never in either running microservice.
-- Existing rows keep edits made in the database when this script runs again.
INSERT INTO ITEM
  (ITEM_NUMBER, SLUG, NAME, DESCRIPTION, AVAILABLE_QUANTITY, UNIT_PRICE, CATEGORY, IMAGE, COLOR, TAG, FEATURED)
VALUES
  (1001, 'ridge-daypack', 'Ridge 28L Daypack', 'Room for the essentials. Ready for the detour.', 12, 89.00, 'Packs', '/images/daypack.svg', 'Moss green', 'THE EVERYDAY EXPLORER', TRUE),
  (1002, 'summit-tent', 'Summit 2P Tent', 'A little home, a long way from home.', 8, 189.00, 'Shelter', '/images/tent.svg', 'Burnt orange', 'ROOM FOR TWO', TRUE),
  (1003, 'alpine-shell', 'Alpine Shell Jacket', 'Pack a layer. Chase a change in the weather.', 20, 129.00, 'Apparel', '/images/jacket.svg', 'Sand · Unisex M', 'THE EXTRA LAYER', FALSE),
  (1004, 'trail-poles', 'Trail Trekking Poles', 'A steady companion for the ups and downs.', 15, 59.00, 'Essentials', '/images/poles.svg', 'Graphite · Pair', 'FIND YOUR FOOTING', FALSE),
  (1005, 'camp-bottle', 'Camp Insulated Bottle', 'Take a sip. Take in the view.', 30, 29.00, 'Essentials', '/images/bottle.svg', 'Ochre · 750 ml', 'REFILL & ROAM', TRUE)
ON DUPLICATE KEY UPDATE ID = ID;
