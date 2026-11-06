"use client";

/**
 * Country and currency pickers. The country decides which currencies are on
 * offer (India: INR only; elsewhere the local currency when priced, and USD);
 * the API enforces the same rule at checkout.
 */
import React from "react";
import { COUNTRIES } from "@intellia360/shared/billing/countries";
import { CURRENCIES } from "@intellia360/shared/billing/currencies";

interface RegionPickerProps {
  country: string;
  currency: string | null;
  allowedCurrencies: string[];
  onCountryChange: (country: string) => void;
  onCurrencyChange: (currency: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export default function RegionPicker({
  country,
  currency,
  allowedCurrencies,
  onCountryChange,
  onCurrencyChange,
  disabled,
  idPrefix = "billing",
}: RegionPickerProps) {
  return (
    <div className="billing-region">
      <label className="billing-region-field" htmlFor={`${idPrefix}-country`}>
        <span>Country</span>
        <select
          id={`${idPrefix}-country`}
          value={country}
          disabled={disabled}
          onChange={(e) => onCountryChange(e.target.value)}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="billing-region-field" htmlFor={`${idPrefix}-currency`}>
        <span>Currency</span>
        <select
          id={`${idPrefix}-currency`}
          value={currency ?? ""}
          disabled={disabled || allowedCurrencies.length < 2}
          onChange={(e) => onCurrencyChange(e.target.value)}
        >
          {allowedCurrencies.length === 0 && <option value="">Not available</option>}
          {allowedCurrencies.map((code) => (
            <option key={code} value={code}>
              {code} — {CURRENCIES[code]?.name ?? code}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
