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

export type Vehicle = {
  id: string;
  customer_id: string;
  year: number | string | null;
  make: string;
  model: string;
  trim: string;
  vin: string;
  plate: string;
  created_at: string;
};

export type CustomerWithVehicles = Customer & { vehicles: Vehicle[] };

export type WorkOrderStatus = 'open' | 'in_progress' | 'completed' | 'invoiced';

export type WorkOrder = {
  id: string;
  number: string;
  customer_id: string;
  vehicle_id: string | null;
  status: WorkOrderStatus;
  scheduled_at: string | null;
  notes: string;
  created_at: string;
  completed_at: string | null;
};

export type WorkItem = {
  id: string;
  work_order_id: string;
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
};

export type InvoiceStatus = 'unpaid' | 'paid' | 'void';

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
};

export type InvoiceFull = Invoice & { customer: Customer };

export type InvoiceSummary = Pick<Invoice, 'id' | 'number' | 'total' | 'status'>;
