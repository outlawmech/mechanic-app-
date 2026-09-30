export type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  created_at: string;
};

export type VehicleType =
  | 'auto'
  | 'marine'
  | 'atv'
  | 'snowmobile'
  | 'motorcycle'
  | 'equipment'
  | 'other';

export type Vehicle = {
  id: string;
  customer_id: string;
  type?: VehicleType;
  year: number | string | null;
  make: string;
  model: string;
  trim: string;
  vin: string;
  plate: string;
  engine_hours?: number | string | null;
  engine_info?: string;
  engine_serial?: string;
  engine2_info?: string;
  engine2_serial?: string;
  engine2_hours?: number | string | null;
  created_at: string;
};

export type CustomerWithVehicles = Customer & { vehicles: Vehicle[] };

export type WorkOrderStatus = 'open' | 'in_progress' | 'completed' | 'invoiced';

export type PhotoCategory =
  | 'pre_inspection'
  | 'damaged_part'
  | 'completed_work'
  | 'diagnostic'
  | 'general';

export type WorkOrderPhoto = {
  id: string;
  work_order_id: string;
  photo_url: string;
  category: PhotoCategory;
  caption?: string;
  created_at: string;
};

export type WorkOrder = {
  id: string;
  number: string;
  customer_id: string;
  vehicle_id: string | null;
  status: WorkOrderStatus;
  scheduled_at: string | null;
  mileage_or_hours?: string;
  notes: string;
  signature_url?: string | null;
  signed_by_name?: string | null;
  signed_at?: string | null;
  created_at: string;
  completed_at: string | null;
  internal_type?: 'pdi' | 'rigging' | null;
  unit_id?: string | null;
  buyer_order_id?: string | null;
  internal_closed_at?: string | null;
};

export type WorkItem = {
  id: string;
  user_id?: string;
  work_order_id: string;
  part_id?: string | null;
  kind: 'labor' | 'part' | 'fee';
  description: string;
  quantity: number | string;
  unit_price: number | string;
  sort_order: number;
  created_at: string;
  special_order?: SpecialOrder | null;
};

export type WorkOrderFull = WorkOrder & {
  customer: Customer;
  vehicle: Vehicle | null;
  unit?: DealershipUnit | null;
  items: WorkItem[];
  photos?: WorkOrderPhoto[];
};

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'void';

export type PaymentMethod =
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'check'
  | 'zelle'
  | 'venmo'
  | 'cash_app'
  | 'bank_transfer'
  | 'other';

export type InvoicePayment = {
  id: string;
  invoice_id: string;
  amount: number | string;
  method: PaymentMethod;
  reference_note?: string;
  created_at: string;
  cashier_user_id?: string;
  cashier_name?: string;
};

export type Invoice = {
  id: string;
  number: string;
  work_order_id: string | null;
  customer_id: string;
  subtotal: number | string;
  tax_rate: number | string;
  tax: number | string;
  total: number | string;
  status: InvoiceStatus;
  due_date: string | null;
  issued_at: string;
  paid_at: string | null;
  notes: string;
  payments?: InvoicePayment[];
};

export type InvoiceFull = Invoice & {
  customer: Customer;
  work_order?: WorkOrder | null;
  payments: InvoicePayment[];
};

export type InvoiceSummary = Pick<Invoice, 'id' | 'number' | 'subtotal' | 'total' | 'status'>;

export type ShopSettings = {
  id: string;
  user_id?: string;
  shop_name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  default_labor_rate: number | string;
  internal_labor_cost_rate?: number | string;
  default_tax_rate: number | string;
  invoice_notes: string;
  logo_url?: string;
  zelle_info?: string;
  venmo_handle?: string;
  cash_app_tag?: string;
  custom_pay_link?: string;
  subscription_status?: 'trialing' | 'active' | 'lifetime' | 'canceled' | 'past_due';
  trial_ends_at?: string | null;
  enable_dealership_mode?: boolean;
  dealership_doc_fee?: number | string;
  dealership_prep_fee?: number | string;
  dealership_freight_fee?: number | string;
  updated_at?: string;
};

export type UnitCondition = 'new' | 'used' | 'consignment';
export type UnitStatus = 'in_stock' | 'sale_pending' | 'sold' | 'consignment';

export type DealershipUnit = {
  id: string;
  user_id?: string;
  stock_number: string;
  condition: UnitCondition;
  type: VehicleType;
  year: number | string;
  make: string;
  model: string;
  trim: string;
  vin: string;
  color: string;
  mileage_or_hours?: string;
  engine_info?: string;
  engine_serial?: string;
  cost_price: number | string;
  base_cost_price?: number | string;
  internal_cost_total?: number | string;
  msrp_price: number | string;
  sale_price: number | string;
  status: UnitStatus;
  location?: string;
  notes?: string;
  // Floorplan & Flooring Financial Tracking
  is_floored?: boolean;
  floorplan_company?: string | null;
  floorplan_balance?: number | string | null;
  floorplan_curtailment_date?: string | null;
  floorplan_curtailment_amount?: number | string | null;
  floorplan_paid_off?: boolean;
  sold_at?: string | null;
  sold_to_customer_id?: string | null;
  created_at: string;
  updated_at?: string;
};

export type BuyersOrderStatus = 'quote' | 'pending' | 'completed' | 'canceled';

export type BuyersOrder = {
  id: string;
  user_id?: string;
  order_number: string;
  customer_id: string;
  unit_id: string | null;
  // Unit snapshot data
  unit_year: number | string;
  unit_make: string;
  unit_model: string;
  unit_vin: string;
  unit_color?: string;
  unit_condition: UnitCondition;
  // Financial breakdown
  unit_price: number | string;
  freight_fee: number | string;
  prep_fee: number | string;
  doc_fee: number | string;
  accessories_total: number | string;
  trade_in_allowance: number | string;
  trade_in_payoff: number | string;
  trade_in_info?: string;
  tax_rate: number | string;
  tax_amount: number | string;
  title_reg_fee: number | string;
  rebate_amount: number | string;
  down_payment: number | string;
  total_price: number | string;
  balance_due: number | string;
  payment_method: PaymentMethod;
  status: BuyersOrderStatus;
  notes?: string;
  signature_url?: string | null;
  signed_by_name?: string | null;
  signed_at?: string | null;
  created_at: string;
  updated_at?: string;
};

export type BuyersOrderFull = BuyersOrder & {
  customer: Customer;
  unit?: DealershipUnit | null;
};

export type Part = {
  id: string;
  user_id?: string;
  sku: string;
  name: string;
  category: string;
  cost_price: number | string;
  sell_price: number | string;
  qty_on_hand: number | string;
  reorder_point: number | string;
  location: string;
  supplier: string;
  notes: string;
  updated_at?: string;
  created_at?: string;
};

export type SpecialOrderStatus =
  | 'ordered'
  | 'in_transit'
  | 'received'
  | 'notified'
  | 'fulfilled'
  | 'canceled';

export type SpecialOrderPaymentStatus = 'unpaid' | 'deposit_paid' | 'paid_in_full';

export type SpecialOrder = {
  id: string;
  user_id?: string;
  order_number: string;
  work_item_id?: string | null;
  customer_id?: string | null;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  part_id?: string | null;
  part_number: string;
  description: string;
  quantity: number | string;
  cost_price: number | string;
  sell_price: number | string;
  vendor?: string;
  purchase_order_id?: string | null;
  purchase_order_number?: string;
  purchase_order?: { status: PurchaseOrderStatus; po_number: string } | null;
  quantity_received?: number | string;
  tracking_number?: string;
  holding_bin?: string;
  deposit_amount?: number | string;
  payment_status: SpecialOrderPaymentStatus;
  status: SpecialOrderStatus;
  work_order_id?: string | null;
  ordered_at?: string | null;
  received_at?: string | null;
  notified_at?: string | null;
  fulfilled_at?: string | null;
  notes?: string;
  created_at: string;
  updated_at?: string;
};

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'partially_received' | 'received';

export type PurchaseOrder = {
  id: string;
  user_id: string;
  po_number: string;
  supplier: string;
  status: PurchaseOrderStatus;
  created_at: string;
  ordered_at?: string | null;
  closed_at?: string | null;
  freight_total: number | string;
  notes?: string;
  lines: PurchaseOrderLine[];
  receipts?: PurchaseOrderReceipt[];
};

export type PurchaseOrderLine = {
  id: string;
  purchase_order_id: string;
  part_id: string | null;
  special_order_id: string | null;
  part_number: string;
  description: string;
  quantity_ordered: number | string;
  quantity_received: number | string;
  expected_unit_cost: number | string;
  special_order?: Pick<SpecialOrder, 'id' | 'order_number' | 'customer_name' | 'status' | 'quantity_received'> | null;
};

export type PurchaseOrderReceipt = {
  id: string;
  purchase_order_id: string;
  received_at: string;
  freight_cost: number | string;
  lines?: PurchaseOrderReceiptLine[];
};

export type PurchaseOrderReceiptLine = {
  id: string;
  purchase_order_line_id: string;
  quantity_received: number | string;
  expected_unit_cost: number | string;
  actual_unit_cost: number | string;
  po_line?: Pick<PurchaseOrderLine, 'part_number' | 'description'> | null;
};
