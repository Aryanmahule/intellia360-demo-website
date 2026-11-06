/**
 * Countries a buyer can pick on the pricing page, each with its own currency.
 *
 * Which currencies a buyer may pay in is decided here, once, for the picker,
 * the API and the tests:
 *
 *   • India pays in INR only (domestic methods, GST and RBI e-mandate rules).
 *   • Elsewhere: the country's own currency when the price book has prices in
 *     it, and always USD.
 *   • INR is never offered outside India.
 */
import { FALLBACK_CURRENCY } from "./currencies";

export interface CountryInfo {
  code: string;
  name: string;
  /** ISO 4217 code of the country's own currency. */
  currency: string;
}

const TABLE: [string, string, string][] = [
  ["AF", "Afghanistan", "AFN"], ["AX", "Åland Islands", "EUR"], ["AL", "Albania", "ALL"],
  ["DZ", "Algeria", "DZD"], ["AS", "American Samoa", "USD"], ["AD", "Andorra", "EUR"],
  ["AO", "Angola", "AOA"], ["AI", "Anguilla", "XCD"], ["AG", "Antigua and Barbuda", "XCD"],
  ["AR", "Argentina", "ARS"], ["AM", "Armenia", "AMD"], ["AW", "Aruba", "AWG"],
  ["AU", "Australia", "AUD"], ["AT", "Austria", "EUR"], ["AZ", "Azerbaijan", "AZN"],
  ["BS", "Bahamas", "BSD"], ["BH", "Bahrain", "BHD"], ["BD", "Bangladesh", "BDT"],
  ["BB", "Barbados", "BBD"], ["BY", "Belarus", "BYN"], ["BE", "Belgium", "EUR"],
  ["BZ", "Belize", "BZD"], ["BJ", "Benin", "XOF"], ["BM", "Bermuda", "BMD"],
  ["BT", "Bhutan", "BTN"], ["BO", "Bolivia", "BOB"], ["BA", "Bosnia and Herzegovina", "BAM"],
  ["BW", "Botswana", "BWP"], ["BR", "Brazil", "BRL"], ["IO", "British Indian Ocean Territory", "USD"],
  ["VG", "British Virgin Islands", "USD"], ["BN", "Brunei", "BND"], ["BG", "Bulgaria", "BGN"],
  ["BF", "Burkina Faso", "XOF"], ["BI", "Burundi", "BIF"], ["CV", "Cabo Verde", "CVE"],
  ["KH", "Cambodia", "KHR"], ["CM", "Cameroon", "XAF"], ["CA", "Canada", "CAD"],
  ["KY", "Cayman Islands", "KYD"], ["CF", "Central African Republic", "XAF"], ["TD", "Chad", "XAF"],
  ["CL", "Chile", "CLP"], ["CN", "China", "CNY"], ["CX", "Christmas Island", "AUD"],
  ["CC", "Cocos (Keeling) Islands", "AUD"], ["CO", "Colombia", "COP"], ["KM", "Comoros", "KMF"],
  ["CG", "Congo", "XAF"], ["CD", "Congo (DRC)", "CDF"], ["CK", "Cook Islands", "NZD"],
  ["CR", "Costa Rica", "CRC"], ["CI", "Côte d’Ivoire", "XOF"], ["HR", "Croatia", "EUR"],
  ["CU", "Cuba", "CUP"], ["CW", "Curaçao", "ANG"], ["CY", "Cyprus", "EUR"],
  ["CZ", "Czechia", "CZK"], ["DK", "Denmark", "DKK"], ["DJ", "Djibouti", "DJF"],
  ["DM", "Dominica", "XCD"], ["DO", "Dominican Republic", "DOP"], ["EC", "Ecuador", "USD"],
  ["EG", "Egypt", "EGP"], ["SV", "El Salvador", "USD"], ["GQ", "Equatorial Guinea", "XAF"],
  ["ER", "Eritrea", "ERN"], ["EE", "Estonia", "EUR"], ["SZ", "Eswatini", "SZL"],
  ["ET", "Ethiopia", "ETB"], ["FK", "Falkland Islands", "FKP"], ["FO", "Faroe Islands", "DKK"],
  ["FJ", "Fiji", "FJD"], ["FI", "Finland", "EUR"], ["FR", "France", "EUR"],
  ["GF", "French Guiana", "EUR"], ["PF", "French Polynesia", "XPF"], ["GA", "Gabon", "XAF"],
  ["GM", "Gambia", "GMD"], ["GE", "Georgia", "GEL"], ["DE", "Germany", "EUR"],
  ["GH", "Ghana", "GHS"], ["GI", "Gibraltar", "GIP"], ["GR", "Greece", "EUR"],
  ["GL", "Greenland", "DKK"], ["GD", "Grenada", "XCD"], ["GP", "Guadeloupe", "EUR"],
  ["GU", "Guam", "USD"], ["GT", "Guatemala", "GTQ"], ["GG", "Guernsey", "GBP"],
  ["GN", "Guinea", "GNF"], ["GW", "Guinea-Bissau", "XOF"], ["GY", "Guyana", "GYD"],
  ["HT", "Haiti", "HTG"], ["HN", "Honduras", "HNL"], ["HK", "Hong Kong", "HKD"],
  ["HU", "Hungary", "HUF"], ["IS", "Iceland", "ISK"], ["IN", "India", "INR"],
  ["ID", "Indonesia", "IDR"], ["IR", "Iran", "IRR"], ["IQ", "Iraq", "IQD"],
  ["IE", "Ireland", "EUR"], ["IM", "Isle of Man", "GBP"], ["IL", "Israel", "ILS"],
  ["IT", "Italy", "EUR"], ["JM", "Jamaica", "JMD"], ["JP", "Japan", "JPY"],
  ["JE", "Jersey", "GBP"], ["JO", "Jordan", "JOD"], ["KZ", "Kazakhstan", "KZT"],
  ["KE", "Kenya", "KES"], ["KI", "Kiribati", "AUD"], ["XK", "Kosovo", "EUR"],
  ["KW", "Kuwait", "KWD"], ["KG", "Kyrgyzstan", "KGS"], ["LA", "Laos", "LAK"],
  ["LV", "Latvia", "EUR"], ["LB", "Lebanon", "LBP"], ["LS", "Lesotho", "LSL"],
  ["LR", "Liberia", "LRD"], ["LY", "Libya", "LYD"], ["LI", "Liechtenstein", "CHF"],
  ["LT", "Lithuania", "EUR"], ["LU", "Luxembourg", "EUR"], ["MO", "Macao", "MOP"],
  ["MG", "Madagascar", "MGA"], ["MW", "Malawi", "MWK"], ["MY", "Malaysia", "MYR"],
  ["MV", "Maldives", "MVR"], ["ML", "Mali", "XOF"], ["MT", "Malta", "EUR"],
  ["MH", "Marshall Islands", "USD"], ["MQ", "Martinique", "EUR"], ["MR", "Mauritania", "MRU"],
  ["MU", "Mauritius", "MUR"], ["YT", "Mayotte", "EUR"], ["MX", "Mexico", "MXN"],
  ["FM", "Micronesia", "USD"], ["MD", "Moldova", "MDL"], ["MC", "Monaco", "EUR"],
  ["MN", "Mongolia", "MNT"], ["ME", "Montenegro", "EUR"], ["MS", "Montserrat", "XCD"],
  ["MA", "Morocco", "MAD"], ["MZ", "Mozambique", "MZN"], ["MM", "Myanmar", "MMK"],
  ["NA", "Namibia", "NAD"], ["NR", "Nauru", "AUD"], ["NP", "Nepal", "NPR"],
  ["NL", "Netherlands", "EUR"], ["NC", "New Caledonia", "XPF"], ["NZ", "New Zealand", "NZD"],
  ["NI", "Nicaragua", "NIO"], ["NE", "Niger", "XOF"], ["NG", "Nigeria", "NGN"],
  ["NU", "Niue", "NZD"], ["NF", "Norfolk Island", "AUD"], ["KP", "North Korea", "KPW"],
  ["MK", "North Macedonia", "MKD"], ["MP", "Northern Mariana Islands", "USD"], ["NO", "Norway", "NOK"],
  ["OM", "Oman", "OMR"], ["PK", "Pakistan", "PKR"], ["PW", "Palau", "USD"],
  ["PS", "Palestine", "ILS"], ["PA", "Panama", "PAB"], ["PG", "Papua New Guinea", "PGK"],
  ["PY", "Paraguay", "PYG"], ["PE", "Peru", "PEN"], ["PH", "Philippines", "PHP"],
  ["PN", "Pitcairn Islands", "NZD"], ["PL", "Poland", "PLN"], ["PT", "Portugal", "EUR"],
  ["PR", "Puerto Rico", "USD"], ["QA", "Qatar", "QAR"], ["RE", "Réunion", "EUR"],
  ["RO", "Romania", "RON"], ["RU", "Russia", "RUB"], ["RW", "Rwanda", "RWF"],
  ["BL", "Saint Barthélemy", "EUR"], ["SH", "Saint Helena", "SHP"], ["KN", "Saint Kitts and Nevis", "XCD"],
  ["LC", "Saint Lucia", "XCD"], ["MF", "Saint Martin", "EUR"], ["PM", "Saint Pierre and Miquelon", "EUR"],
  ["VC", "Saint Vincent and the Grenadines", "XCD"], ["WS", "Samoa", "WST"], ["SM", "San Marino", "EUR"],
  ["ST", "São Tomé and Príncipe", "STN"], ["SA", "Saudi Arabia", "SAR"], ["SN", "Senegal", "XOF"],
  ["RS", "Serbia", "RSD"], ["SC", "Seychelles", "SCR"], ["SL", "Sierra Leone", "SLL"],
  ["SG", "Singapore", "SGD"], ["SX", "Sint Maarten", "ANG"], ["SK", "Slovakia", "EUR"],
  ["SI", "Slovenia", "EUR"], ["SB", "Solomon Islands", "SBD"], ["SO", "Somalia", "SOS"],
  ["ZA", "South Africa", "ZAR"], ["KR", "South Korea", "KRW"], ["SS", "South Sudan", "SSP"],
  ["ES", "Spain", "EUR"], ["LK", "Sri Lanka", "LKR"], ["SD", "Sudan", "SDG"],
  ["SR", "Suriname", "SRD"], ["SE", "Sweden", "SEK"], ["CH", "Switzerland", "CHF"],
  ["SY", "Syria", "SYP"], ["TW", "Taiwan", "TWD"], ["TJ", "Tajikistan", "TJS"],
  ["TZ", "Tanzania", "TZS"], ["TH", "Thailand", "THB"], ["TL", "Timor-Leste", "USD"],
  ["TG", "Togo", "XOF"], ["TK", "Tokelau", "NZD"], ["TO", "Tonga", "TOP"],
  ["TT", "Trinidad and Tobago", "TTD"], ["TN", "Tunisia", "TND"], ["TR", "Türkiye", "TRY"],
  ["TM", "Turkmenistan", "TMT"], ["TC", "Turks and Caicos Islands", "USD"], ["TV", "Tuvalu", "AUD"],
  ["UG", "Uganda", "UGX"], ["UA", "Ukraine", "UAH"], ["AE", "United Arab Emirates", "AED"],
  ["GB", "United Kingdom", "GBP"], ["US", "United States", "USD"], ["UM", "U.S. Outlying Islands", "USD"],
  ["VI", "U.S. Virgin Islands", "USD"], ["UY", "Uruguay", "UYU"], ["UZ", "Uzbekistan", "UZS"],
  ["VU", "Vanuatu", "VUV"], ["VA", "Vatican City", "EUR"], ["VE", "Venezuela", "VES"],
  ["VN", "Vietnam", "VND"], ["WF", "Wallis and Futuna", "XPF"], ["EH", "Western Sahara", "MAD"],
  ["YE", "Yemen", "YER"], ["ZM", "Zambia", "ZMW"], ["ZW", "Zimbabwe", "USD"],
];

export const COUNTRIES: CountryInfo[] = TABLE
  .map(([code, name, currency]) => ({ code, name, currency }))
  .sort((a, b) => a.name.localeCompare(b.name));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string | null | undefined): CountryInfo | undefined {
  return code ? BY_CODE.get(code.toUpperCase()) : undefined;
}

/** The only country that may pay in INR, and the only currency it may pay in. */
export const HOME_COUNTRY = "IN";
export const HOME_CURRENCY = "INR";

/**
 * Currencies a buyer in `country` may choose, given the currencies the price
 * book has prices for. The first entry is the default.
 */
export function allowedCurrencies(country: string, pricedCurrencies: readonly string[]): string[] {
  const priced = new Set(pricedCurrencies);
  if (country.toUpperCase() === HOME_COUNTRY) return priced.has(HOME_CURRENCY) ? [HOME_CURRENCY] : [];

  const own = getCountry(country)?.currency;
  const options: string[] = [];
  if (own && own !== HOME_CURRENCY && priced.has(own)) options.push(own);
  if (priced.has(FALLBACK_CURRENCY) && !options.includes(FALLBACK_CURRENCY)) options.push(FALLBACK_CURRENCY);
  return options;
}

/**
 * Buyers outside India must pay by card — for a trial and for any purchase.
 * In India, UPI Autopay, bank mandates and the other domestic methods work too.
 */
export function cardRequired(country: string): boolean {
  return country.toUpperCase() !== HOME_COUNTRY;
}

export function defaultCurrency(country: string, pricedCurrencies: readonly string[]): string | null {
  return allowedCurrencies(country, pricedCurrencies)[0] ?? null;
}

/** Shown first in the country picker; the buyer always chooses for themselves. */
export const POPULAR_COUNTRIES: readonly string[] = ["IN", "US", "GB", "AE", "SG", "AU", "CA"];

/** Countries whose name or code matches what the buyer typed. */
export function searchCountries(query: string): CountryInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q
  ).sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return aStarts - bStarts || a.name.localeCompare(b.name);
  });
}
