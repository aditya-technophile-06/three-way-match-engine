import { Schema, model, Document, Types } from 'mongoose';
import { DocumentType } from '../types';

export interface IDocument extends Document {
  _id: Types.ObjectId;
  documentType: DocumentType;
  originalFileName: string;
  poNumber: string;
  parsedData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    documentType: {
      type: String,
      enum: ['po', 'grn', 'invoice'],
      required: true,
    },
    originalFileName: { type: String, default: '' },
    poNumber: { type: String, required: true, index: true },
    parsedData: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const DocumentModel = model<IDocument>('Document', documentSchema);
