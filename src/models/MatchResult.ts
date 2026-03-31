import { Schema, model, Document, Types } from 'mongoose';
import { MatchStatus, MismatchReason, ItemResult } from '../types';

export interface IMatchResult extends Document {
  _id: Types.ObjectId;
  poNumber: string;
  status: MatchStatus;
  reasons: MismatchReason[];
  itemResults: ItemResult[];
  linkedDocuments: {
    po: Types.ObjectId | null;
    grns: Types.ObjectId[];
    invoices: Types.ObjectId[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const itemResultSchema = new Schema<ItemResult>(
  {
    sku: { type: String },
    description: { type: String },
    poQty: { type: Number },
    grnQty: { type: Number },
    invoiceQty: { type: Number },
    status: { type: String },
    reasons: [{ type: String }],
  },
  { _id: false }
);

const matchResultSchema = new Schema<IMatchResult>(
  {
    poNumber: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['matched', 'partially_matched', 'mismatch', 'insufficient_documents'],
      default: 'insufficient_documents',
    },
    reasons: [{ type: String }],
    itemResults: [itemResultSchema],
    linkedDocuments: {
      po: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
      grns: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
      invoices: [{ type: Schema.Types.ObjectId, ref: 'Document' }],
    },
  },
  { timestamps: true }
);

export const MatchResultModel = model<IMatchResult>('MatchResult', matchResultSchema);
