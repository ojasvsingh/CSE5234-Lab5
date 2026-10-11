export const emptyPayment = { cardHolderName: '', cardNumber: '', expirationDate: '', cvvCode: '' };
export const emptyShipping = {
  name: '', addressLine1: '', addressLine2: '', city: '', state: '', zip: '',
};

export const states = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'],
  ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
  ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
  ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

export function validatePayment(payment, now = new Date()) {
  const errors = {};
  if (!payment.cardHolderName.trim()) errors.cardHolderName = 'Enter the name on the card.';
  if (!/^[\d -]+$/.test(payment.cardNumber) || !/^\d{13,19}$/.test(payment.cardNumber.replace(/[ -]/g, ''))) {
    errors.cardNumber = 'Enter a card number with 13–19 digits.';
  }
  const match = payment.expirationDate.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (!match) {
    errors.expirationDate = 'Use MM/YY, for example 12/30.';
  } else {
    const year = 2000 + Number(match[2]);
    const month = Number(match[1]);
    if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
      errors.expirationDate = 'Enter an expiration date that has not passed.';
    }
  }
  if (!/^\d{3,4}$/.test(payment.cvvCode)) errors.cvvCode = 'Enter a 3- or 4-digit security code.';
  return errors;
}

export function validateShipping(shipping) {
  const errors = {};
  for (const key of ['name', 'addressLine1', 'city']) {
    if (!shipping[key].trim()) errors[key] = {
      name: 'Enter the recipient’s name.',
      addressLine1: 'Enter a street address.',
      city: 'Enter a city.',
    }[key];
  }
  if (!states.some(([code]) => code === shipping.state)) errors.state = 'Choose a state.';
  if (!/^\d{5}(-\d{4})?$/.test(shipping.zip.trim())) errors.zip = 'Enter a ZIP code, such as 43210 or 43210-1234.';
  return errors;
}

export function cardLastFour(payment) {
  return payment.cardNumber.replace(/\D/g, '').slice(-4);
}
