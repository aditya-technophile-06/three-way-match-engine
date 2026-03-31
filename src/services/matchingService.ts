import { Types } from 'mongoose';
import { DocumentModel } from '../models/Document';
import { MatchResultModel } from '../models/MatchResult';
import {
  MismatchReason,
  MatchStatus,
  ItemResult,
  ParsedPO,
  ParsedGRN,
  ParsedInvoice,
  POItem,
} from '../types';

const parseDate = (dateStr: unknown): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

interface LinkedDocuments {
  po: Types.ObjectId | null;
  grns: Types.ObjectId[];
  invoices: Types.ObjectId[];
}

const upsertInsufficient = async (poNumber: string, linkedDocuments: LinkedDocuments) => {
  return MatchResultModel.findOneAndUpdate(
    { poNumber },
    {
      poNumber,
      status: 'insufficient_documents' as MatchStatus,
      reasons: [],
      itemResults: [],
      linkedDocuments,
    },
    { upsert: true, new: true }
  );
};

export const runMatch = async (poNumber: string) => {
  const docs = await DocumentModel.find({ poNumber });

  const poDocs = docs.filter((d) => d.documentType === 'po');
  const grnDocs = docs.filter((d) => d.documentType === 'grn');
  const invoiceDocs = docs.filter((d) => d.documentType === 'invoice');

  const linkedDocuments: LinkedDocuments = {
    po: poDocs.length > 0 ? poDocs[0]._id : null,
    grns: grnDocs.map((d) => d._id),
    invoices: invoiceDocs.map((d) => d._id),
  };

  if (poDocs.length === 0 || grnDocs.length === 0 || invoiceDocs.length === 0) {
    return upsertInsufficient(poNumber, linkedDocuments);
  }

  const poDoc = poDocs[0];
  const globalReasons: MismatchReason[] = [];

  if (poDocs.length > 1) {
    globalReasons.push('duplicate_po');
  }

  const parsedPO = poDoc.parsedData as unknown as ParsedPO;
  const poItems: POItem[] = Array.isArray(parsedPO.items) ? parsedPO.items : [];
  const poDate = parseDate(parsedPO.poDate);

  const poSkuMap: Record<string, POItem> = {};
  for (const item of poItems) {
    if (!item.sku) continue;
    const sku = String(item.sku).trim();
    poSkuMap[sku] = { ...item, sku };
  }

  const grnSkuMap: Record<string, number> = {};
  for (const grnDoc of grnDocs) {
    const parsedGRN = grnDoc.parsedData as unknown as ParsedGRN;
    for (const item of parsedGRN.items ?? []) {
      if (!item.sku) continue;
      const sku = String(item.sku).trim();
      grnSkuMap[sku] = (grnSkuMap[sku] ?? 0) + (Number(item.receivedQuantity) || 0);
    }
  }

  const invoiceSkuMap: Record<string, number> = {};
  for (const invDoc of invoiceDocs) {
    const parsedInvoice = invDoc.parsedData as unknown as ParsedInvoice;
    for (const item of parsedInvoice.items ?? []) {
      if (!item.sku) continue;
      const sku = String(item.sku).trim();
      invoiceSkuMap[sku] = (invoiceSkuMap[sku] ?? 0) + (Number(item.quantity) || 0);
    }
  }

  for (const invDoc of invoiceDocs) {
    const parsedInvoice = invDoc.parsedData as unknown as ParsedInvoice;
    const invDate = parseDate(parsedInvoice.invoiceDate);
    if (invDate && poDate && invDate > poDate) {
      if (!globalReasons.includes('invoice_date_after_po_date')) {
        globalReasons.push('invoice_date_after_po_date');
      }
    }
  }

  const allReferencedSkus = new Set([
    ...Object.keys(grnSkuMap),
    ...Object.keys(invoiceSkuMap),
  ]);
  for (const sku of allReferencedSkus) {
    if (!poSkuMap[sku]) {
      if (!globalReasons.includes('item_missing_in_po')) {
        globalReasons.push('item_missing_in_po');
      }
    }
  }

  const itemResults: ItemResult[] = [];
  let hasMatch = false;
  let hasMismatch = false;

  for (const sku of Object.keys(poSkuMap)) {
    const poItem = poSkuMap[sku];
    const poQty = Number(poItem.quantity) || 0;
    const grnQty = grnSkuMap[sku] ?? 0;
    const invoiceQty = invoiceSkuMap[sku] ?? 0;

    const itemReasons: MismatchReason[] = [];
    if (grnQty > poQty) itemReasons.push('grn_qty_exceeds_po_qty');
    if (invoiceQty > poQty) itemReasons.push('invoice_qty_exceeds_po_qty');
    if (invoiceQty > grnQty) itemReasons.push('invoice_qty_exceeds_grn_qty');

    const itemStatus: 'matched' | 'mismatch' = itemReasons.length === 0 ? 'matched' : 'mismatch';
    if (itemStatus === 'matched') hasMatch = true;
    else hasMismatch = true;

    itemResults.push({
      sku,
      description: poItem.description ?? '',
      poQty,
      grnQty,
      invoiceQty,
      status: itemStatus,
      reasons: itemReasons,
    });
  }

  const allReasons: MismatchReason[] = [...globalReasons];
  for (const item of itemResults) {
    for (const reason of item.reasons) {
      if (!allReasons.includes(reason)) allReasons.push(reason);
    }
  }

  let status: MatchStatus;
  if (globalReasons.includes('duplicate_po')) {
    status = 'mismatch';
  } else if (hasMismatch && hasMatch) {
    status = 'partially_matched';
  } else if (hasMismatch && !hasMatch) {
    status = 'mismatch';
  } else if (globalReasons.length > 0) {
    status = 'mismatch';
  } else {
    status = 'matched';
  }

  return MatchResultModel.findOneAndUpdate(
    { poNumber },
    { poNumber, status, reasons: allReasons, itemResults, linkedDocuments },
    { upsert: true, new: true }
  );
};
