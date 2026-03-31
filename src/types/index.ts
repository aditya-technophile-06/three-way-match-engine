export type DocumentType = 'po' | 'grn' | 'invoice';

export type MatchStatus =
  | 'matched'
  | 'partially_matched'
  | 'mismatch'
  | 'insufficient_documents';

export type MismatchReason =
  | 'grn_qty_exceeds_po_qty'
  | 'invoice_qty_exceeds_po_qty'
  | 'invoice_qty_exceeds_grn_qty'
  | 'invoice_date_after_po_date'
  | 'item_missing_in_po'
  | 'duplicate_po';

export interface POItem {
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface GRNItem {
  sku: string;
  description: string;
  expectedQuantity: number;
  receivedQuantity: number;
}

export interface InvoiceItem {
  sku: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface ParsedPO {
  poNumber: string;
  poDate: string | null;
  vendorName: string | null;
  buyerName: string | null;
  items: POItem[];
}

export interface ParsedGRN {
  grnNumber: string | null;
  poNumber: string;
  grnDate: string | null;
  vendorName: string | null;
  items: GRNItem[];
}

export interface ParsedInvoice {
  invoiceNumber: string | null;
  poNumber: string;
  invoiceDate: string | null;
  vendorName: string | null;
  items: InvoiceItem[];
}

export type ParsedData = ParsedPO | ParsedGRN | ParsedInvoice;

export interface ItemResult {
  sku: string;
  description: string;
  poQty: number;
  grnQty: number;
  invoiceQty: number;
  status: 'matched' | 'mismatch';
  reasons: MismatchReason[];
}

export interface LinkedDocuments {
  po: string | null;
  grns: string[];
  invoices: string[];
}
