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
};

export type WorkItem = {
  id: string;
  work_order_id: string;
  part_id?: string | null;
  kind: 'labor' | 'part' | 'fee';
  description: string;
  quantity: number | string;
  unit_price: number | string;
  sort_order: number;
  created_at: string;
};

export type WorkOrderFull = WorkOrder & {
  customer: Customer;
  vehicle: Vehicle | null;
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

export type InvoiceSummary = Pick<Invoice, 'id' | 'number' | 'total' | 'status'>;

export type ShopSettings = {
  id: string;
  user_id?: string;
  shop_name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  default_labor_rate: number | string;
  default_tax_rate: number | string;
  invoice_notes: string;
  logo_url?: string;
  subscription_status?: 'trialing' | 'active' | 'lifetime' | 'canceled' | 'past_due';
  trial_ends_at?: string | null;
  updated_at?: string;
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
