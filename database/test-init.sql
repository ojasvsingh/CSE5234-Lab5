-- Runs only when the Docker test database is created empty.
CREATE DATABASE IF NOT EXISTS adventure_payment_test;
CREATE DATABASE IF NOT EXISTS adventure_shipping_test;
GRANT ALL PRIVILEGES ON adventure_payment_test.* TO 'adventure_test'@'%';
GRANT ALL PRIVILEGES ON adventure_shipping_test.* TO 'adventure_test'@'%';
FLUSH PRIVILEGES;
