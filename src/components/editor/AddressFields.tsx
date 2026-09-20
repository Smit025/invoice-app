"use client";

import { COUNTRIES, getAddressLabels, regionOptions } from "@/lib/countries";
import type { Address } from "@/lib/types";
import { Field, Input, Select } from "@/components/ui/Field";

export function AddressFields({
  idPrefix,
  value,
  onChange,
  includePhone = false,
}: {
  idPrefix: string;
  value: Address;
  onChange: (next: Address) => void;
  includePhone?: boolean;
}) {
  const labels = getAddressLabels(value.country);
  const regions = regionOptions(value.country);
  const patch = (partial: Partial<Address>) => onChange({ ...value, ...partial });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Name" htmlFor={`${idPrefix}-name`}>
          <Input
            id={`${idPrefix}-name`}
            autoComplete="organization"
            value={value.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Company or person"
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Address line 1" htmlFor={`${idPrefix}-a1`}>
          <Input
            id={`${idPrefix}-a1`}
            value={value.address1}
            onChange={(e) => patch({ address1: e.target.value })}
            placeholder="Street address"
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Address line 2" htmlFor={`${idPrefix}-a2`}>
          <Input
            id={`${idPrefix}-a2`}
            value={value.address2 ?? ""}
            onChange={(e) => patch({ address2: e.target.value })}
            placeholder="Apt, suite (optional)"
          />
        </Field>
      </div>
      <Field label="City" htmlFor={`${idPrefix}-city`}>
        <Input
          id={`${idPrefix}-city`}
          value={value.city}
          onChange={(e) => patch({ city: e.target.value })}
        />
      </Field>
      <Field label={labels.region} htmlFor={`${idPrefix}-region`}>
        {regions ? (
          <Select
            id={`${idPrefix}-region`}
            value={value.region}
            onChange={(e) => patch({ region: e.target.value })}
          >
            <option value="">Select {labels.region.toLowerCase()}</option>
            {regions.map((region) => (
              <option key={region.code} value={region.name}>
                {region.name}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            id={`${idPrefix}-region`}
            value={value.region}
            onChange={(e) => patch({ region: e.target.value })}
          />
        )}
      </Field>
      <Field label={labels.postal} htmlFor={`${idPrefix}-postal`}>
        <Input
          id={`${idPrefix}-postal`}
          value={value.postal}
          onChange={(e) => patch({ postal: e.target.value })}
        />
      </Field>
      <Field label="Country" htmlFor={`${idPrefix}-country`}>
        <Select
          id={`${idPrefix}-country`}
          value={value.country}
          onChange={(e) => patch({ country: e.target.value, region: "" })}
        >
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={labels.taxId} htmlFor={`${idPrefix}-tax`}>
        <Input
          id={`${idPrefix}-tax`}
          value={value.taxId ?? ""}
          onChange={(e) => patch({ taxId: e.target.value })}
          placeholder="Optional"
        />
      </Field>
      <Field label="Email" htmlFor={`${idPrefix}-email`}>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          value={value.email ?? ""}
          onChange={(e) => patch({ email: e.target.value })}
          placeholder="Optional"
        />
      </Field>
      {includePhone ? (
        <Field label="Phone" htmlFor={`${idPrefix}-phone`}>
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            value={value.phone ?? ""}
            onChange={(e) => patch({ phone: e.target.value })}
            placeholder="Optional"
          />
        </Field>
      ) : null}
    </div>
  );
}
