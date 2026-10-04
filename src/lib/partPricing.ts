import { num, round2 } from './format.ts';

export interface PartPriceFields {
  cost_price: number;
  sell_price: number;
}

export function buildPartPriceFields(input: {
  cost_price: number | string;
  sell_price: number | string;
}): PartPriceFields {
  return {
    cost_price: round2(num(input.cost_price)),
    sell_price: round2(num(input.sell_price)),
  };
}

export function partPricesMatch(
  saved: { cost_price: number | string; sell_price: number | string },
  expected: PartPriceFields,
): boolean {
  return round2(num(saved.cost_price)) === expected.cost_price
    && round2(num(saved.sell_price)) === expected.sell_price;
}
