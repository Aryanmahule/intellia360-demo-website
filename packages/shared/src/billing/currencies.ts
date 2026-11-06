/**
 * Currencies Intellia360 can price in, and the money helpers every layer uses.
 *
 * The list is Razorpay's supported-currency table (docs: international
 * payments → supported currencies). `exponent` is the number of decimal places
 * in the minor unit: Razorpay takes every amount as an integer in minor units,
 * so 1,799.00 INR is 179900, 99 JPY is 99 and 99.999 KWD is 99999.
 *
 * Money is always carried as { amountMinor, currency } — never as a float.
 */

export interface CurrencyInfo {
  code: string;
  name: string;
  exponent: 0 | 2 | 3;
}

const TABLE: [string, string, 0 | 2 | 3][] = [
  ["AED", "UAE dirham", 2], ["ALL", "Albanian lek", 2], ["AMD", "Armenian dram", 2],
  ["AUD", "Australian dollar", 2], ["AWG", "Aruban florin", 2], ["AZN", "Azerbaijani manat", 2],
  ["BAM", "Convertible mark", 2], ["BBD", "Barbadian dollar", 2], ["BDT", "Bangladeshi taka", 2],
  ["BGN", "Bulgarian lev", 2], ["BHD", "Bahraini dinar", 3], ["BIF", "Burundian franc", 0],
  ["BMD", "Bermudian dollar", 2], ["BND", "Brunei dollar", 2], ["BOB", "Bolivian boliviano", 2],
  ["BRL", "Brazilian real", 2], ["BSD", "Bahamian dollar", 2], ["BTN", "Bhutanese ngultrum", 2],
  ["BWP", "Botswana pula", 2], ["BZD", "Belize dollar", 2], ["CAD", "Canadian dollar", 2],
  ["CHF", "Swiss franc", 2], ["CLP", "Chilean peso", 0], ["CNY", "Chinese yuan", 2],
  ["COP", "Colombian peso", 2], ["CRC", "Costa Rican colón", 2], ["CUP", "Cuban peso", 2],
  ["CVE", "Cape Verdean escudo", 2], ["CZK", "Czech koruna", 2], ["DJF", "Djiboutian franc", 0],
  ["DKK", "Danish krone", 2], ["DOP", "Dominican peso", 2], ["DZD", "Algerian dinar", 2],
  ["EGP", "Egyptian pound", 2], ["ETB", "Ethiopian birr", 2], ["EUR", "Euro", 2],
  ["FJD", "Fijian dollar", 2], ["GBP", "Pound sterling", 2], ["GHS", "Ghanaian cedi", 2],
  ["GIP", "Gibraltar pound", 2], ["GMD", "Gambian dalasi", 2], ["GNF", "Guinean franc", 0],
  ["GTQ", "Guatemalan quetzal", 2], ["GYD", "Guyanese dollar", 2], ["HKD", "Hong Kong dollar", 2],
  ["HNL", "Honduran lempira", 2], ["HTG", "Haitian gourde", 2], ["HUF", "Hungarian forint", 2],
  ["IDR", "Indonesian rupiah", 2], ["ILS", "Israeli new shekel", 2], ["INR", "Indian rupee", 2],
  ["IQD", "Iraqi dinar", 3], ["ISK", "Icelandic króna", 0], ["JMD", "Jamaican dollar", 2],
  ["JOD", "Jordanian dinar", 3], ["JPY", "Japanese yen", 0], ["KES", "Kenyan shilling", 2],
  ["KGS", "Kyrgyzstani som", 2], ["KHR", "Cambodian riel", 2], ["KMF", "Comorian franc", 0],
  ["KRW", "South Korean won", 0], ["KWD", "Kuwaiti dinar", 3], ["KYD", "Cayman Islands dollar", 2],
  ["KZT", "Kazakhstani tenge", 2], ["LAK", "Lao kip", 2], ["LKR", "Sri Lankan rupee", 2],
  ["LRD", "Liberian dollar", 2], ["LSL", "Lesotho loti", 2], ["MAD", "Moroccan dirham", 2],
  ["MDL", "Moldovan leu", 2], ["MGA", "Malagasy ariary", 2], ["MKD", "Macedonian denar", 2],
  ["MMK", "Myanmar kyat", 2], ["MNT", "Mongolian tögrög", 2], ["MOP", "Macanese pataca", 2],
  ["MUR", "Mauritian rupee", 2], ["MVR", "Maldivian rufiyaa", 2], ["MWK", "Malawian kwacha", 2],
  ["MXN", "Mexican peso", 2], ["MYR", "Malaysian ringgit", 2], ["MZN", "Mozambican metical", 2],
  ["NAD", "Namibian dollar", 2], ["NGN", "Nigerian naira", 2], ["NIO", "Nicaraguan córdoba", 2],
  ["NOK", "Norwegian krone", 2], ["NPR", "Nepalese rupee", 2], ["NZD", "New Zealand dollar", 2],
  ["OMR", "Omani rial", 3], ["PEN", "Peruvian sol", 2], ["PGK", "Papua New Guinean kina", 2],
  ["PHP", "Philippine peso", 2], ["PKR", "Pakistani rupee", 2], ["PLN", "Polish złoty", 2],
  ["PYG", "Paraguayan guaraní", 0], ["QAR", "Qatari riyal", 2], ["RON", "Romanian leu", 2],
  ["RSD", "Serbian dinar", 2], ["RUB", "Russian ruble", 2], ["RWF", "Rwandan franc", 0],
  ["SAR", "Saudi riyal", 2], ["SCR", "Seychellois rupee", 2], ["SEK", "Swedish krona", 2],
  ["SGD", "Singapore dollar", 2], ["SLL", "Sierra Leonean leone", 2], ["SOS", "Somali shilling", 2],
  ["SVC", "Salvadoran colón", 2], ["SZL", "Swazi lilangeni", 2], ["THB", "Thai baht", 2],
  ["TND", "Tunisian dinar", 3], ["TRY", "Turkish lira", 2], ["TTD", "Trinidad and Tobago dollar", 2],
  ["TWD", "New Taiwan dollar", 2], ["TZS", "Tanzanian shilling", 2], ["UAH", "Ukrainian hryvnia", 2],
  ["UGX", "Ugandan shilling", 0], ["USD", "US dollar", 2], ["UYU", "Uruguayan peso", 2],
  ["UZS", "Uzbekistani soʻm", 2], ["VND", "Vietnamese đồng", 0], ["VUV", "Vanuatu vatu", 0],
  ["XAF", "Central African CFA franc", 0], ["XCD", "East Caribbean dollar", 2],
  ["XOF", "West African CFA franc", 0], ["XPF", "CFP franc", 0], ["YER", "Yemeni rial", 2],
  ["ZAR", "South African rand", 2], ["ZMW", "Zambian kwacha", 2],
];

export const CURRENCIES: Record<string, CurrencyInfo> = Object.fromEntries(
  TABLE.map(([code, name, exponent]) => [code, { code, name, exponent }])
);

export const SUPPORTED_CURRENCY_CODES = Object.keys(CURRENCIES).sort();

/** Currency charged where a country has no price of its own. */
export const FALLBACK_CURRENCY = "USD";

export function isSupportedCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

export function currencyExponent(code: string): number {
  return CURRENCIES[code]?.exponent ?? 2;
}

/**
 * Major units (what a person types: "1799", "47.99") to minor units.
 * Returns null for anything that is not a non-negative amount with at most
 * the currency's number of decimals.
 */
export function toMinorUnits(major: string | number, currency: string): number | null {
  const exp = currencyExponent(currency);
  const text = typeof major === "number" ? String(major) : major.trim().replace(/,/g, "");
  const pattern = exp === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${exp}})?$`);
  if (!pattern.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const minor = Number(whole) * 10 ** exp + Number(fraction.padEnd(exp, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Minor units to a plain decimal string ("179900" INR → "1799.00"). */
export function minorToMajorString(amountMinor: number, currency: string): string {
  const exp = currencyExponent(currency);
  if (exp === 0) return String(amountMinor);
  const sign = amountMinor < 0 ? "-" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / 10 ** exp);
  const fraction = String(abs % 10 ** exp).padStart(exp, "0");
  return `${sign}${whole}.${fraction}`;
}

/**
 * Locale-aware display: ₹1,799 · $47.99 · 44,99 €.
 * Whole amounts drop their decimals so price cards read cleanly.
 */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale?: string,
  { keepDecimals = false }: { keepDecimals?: boolean } = {}
): string {
  const exp = currencyExponent(currency);
  const value = amountMinor / 10 ** exp;
  const whole = exp > 0 && amountMinor % 10 ** exp === 0 && !keepDecimals;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: whole ? 0 : exp,
      maximumFractionDigits: exp,
    }).format(value);
  } catch {
    return `${currency} ${minorToMajorString(amountMinor, currency)}`;
  }
}
