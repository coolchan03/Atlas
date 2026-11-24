/** Money the converter knows by name. Rates come from the European Central Bank's daily list (31 of these); the others need a rate typed in. */
export interface Currency { code: string; name: string }

export const CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US dollar' }, { code: 'EUR', name: 'Euro' }, { code: 'GBP', name: 'British pound' }, { code: 'JPY', name: 'Japanese yen' },
  { code: 'CAD', name: 'Canadian dollar' }, { code: 'AUD', name: 'Australian dollar' }, { code: 'NZD', name: 'New Zealand dollar' }, { code: 'CHF', name: 'Swiss franc' },
  { code: 'CNY', name: 'Chinese yuan' }, { code: 'HKD', name: 'Hong Kong dollar' }, { code: 'SGD', name: 'Singapore dollar' }, { code: 'KRW', name: 'South Korean won' },
  { code: 'INR', name: 'Indian rupee' }, { code: 'IDR', name: 'Indonesian rupiah' }, { code: 'MYR', name: 'Malaysian ringgit' }, { code: 'PHP', name: 'Philippine peso' },
  { code: 'THB', name: 'Thai baht' }, { code: 'MXN', name: 'Mexican peso' }, { code: 'BRL', name: 'Brazilian real' }, { code: 'ZAR', name: 'South African rand' },
  { code: 'TRY', name: 'Turkish lira' }, { code: 'ILS', name: 'Israeli shekel' }, { code: 'SEK', name: 'Swedish krona' }, { code: 'NOK', name: 'Norwegian krone' },
  { code: 'DKK', name: 'Danish krone' }, { code: 'ISK', name: 'Icelandic krona' }, { code: 'PLN', name: 'Polish zloty' }, { code: 'CZK', name: 'Czech koruna' },
  { code: 'HUF', name: 'Hungarian forint' }, { code: 'RON', name: 'Romanian leu' }, { code: 'BGN', name: 'Bulgarian lev' },
  { code: 'AED', name: 'UAE dirham' }, { code: 'SAR', name: 'Saudi riyal' }, { code: 'EGP', name: 'Egyptian pound' }, { code: 'NGN', name: 'Nigerian naira' },
  { code: 'KES', name: 'Kenyan shilling' }, { code: 'ARS', name: 'Argentine peso' }, { code: 'COP', name: 'Colombian peso' }, { code: 'CLP', name: 'Chilean peso' },
  { code: 'VND', name: 'Vietnamese dong' }, { code: 'PKR', name: 'Pakistani rupee' }, { code: 'UAH', name: 'Ukrainian hryvnia' },
];
