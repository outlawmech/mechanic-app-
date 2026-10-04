import { num, round2 } from './format.ts';

export interface ShowroomPriceInput {
  cost_price: number | string;
  msrp_price: number | string;
  sale_price: number | string;
}

export interface ShowroomPriceFields {
  base_cost_price: number;
  cost_price: number;
  msrp_price: number;
  sale_price: number;
}

export interface PersistedShowroomPriceFields {
  base_cost_price?: number | string;
  cost_price: number | string;
  msrp_price: number | string;
  sale_price: number | string;
}

export function buildShowroomPriceFields(
  input: ShowroomPriceInput,
  internalCostTotal: number | string | null | undefined = 0,
): ShowroomPriceFields {
  const baseCost = round2(num(input.cost_price));
  const msrp = round2(num(input.msrp_price));
  const enteredSalePrice = round2(num(input.sale_price));

  return {
    base_cost_price: baseCost,
    cost_price: round2(baseCost + num(internalCostTotal)),
    msrp_price: msrp,
    sale_price: enteredSalePrice || msrp,
  };
}

export function showroomPricesMatch(
  persisted: PersistedShowroomPriceFields,
  expected: ShowroomPriceFields,
): boolean {
  return round2(num(persisted.msrp_price)) === expected.msrp_price
    && round2(num(persisted.sale_price)) === expected.sale_price
    && round2(num(persisted.base_cost_price)) === expected.base_cost_price
    && round2(num(persisted.cost_price)) === expected.cost_price;
}
