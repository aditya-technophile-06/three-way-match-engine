import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import { DocumentType, ParsedData, ParsedPO, ParsedGRN, ParsedInvoice } from '../types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const prompts: Record<DocumentType, string> = {
  po: `Extract structured data from this Purchase Order PDF.
Return ONLY a valid JSON object, no markdown, no code blocks, no extra text.
Use this exact structure:
{
  "poNumber": "string",
  "poDate": "YYYY-MM-DD",
  "vendorName": "string",
  "buyerName": "string",
  "items": [
    {
      "sku": "string",
      "description": "string",
      "quantity": number,
      "unitPrice": number
    }
  ]
}
Extract ALL line items. Use null for any field not found. SKU is the item code or SKU code column.`,

  grn: `Extract structured data from this Goods Receipt Note (GRN) PDF.
Return ONLY a valid JSON object, no markdown, no code blocks, no extra text.
Use this exact structure:
{
  "grnNumber": "string",
  "poNumber": "string",
  "grnDate": "YYYY-MM-DD",
  "vendorName": "string",
  "items": [
    {
      "sku": "string",
      "description": "string",
      "expectedQuantity": number,
      "receivedQuantity": number
    }
  ]
}
Extract ALL line items. Use null for any field not found. SKU is the SKU Code column.`,

  invoice: `Extract structured data from this Invoice PDF.
Return ONLY a valid JSON object, no markdown, no code blocks, no extra text.
Use this exact structure:
{
  "invoiceNumber": "string",
  "poNumber": "string",
  "invoiceDate": "YYYY-MM-DD",
  "vendorName": "string",
  "items": [
    {
      "sku": "string",
      "description": "string",
      "quantity": number,
      "unitPrice": number
    }
  ]
}
Extract ALL line items. Use null for any field not found. SKU is the item code column.`,
};

const extractJson = (text: string): ParsedData => {
  const cleaned = text.trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Gemini returned non-JSON response: ${cleaned.substring(0, 200)}`);
  }
  return JSON.parse(jsonMatch[0]) as ParsedData;
};

const validatePoNumber = (parsed: ParsedData, documentType: DocumentType): string => {
  const poNumber =
    documentType === 'po'
      ? (parsed as ParsedPO).poNumber
      : documentType === 'grn'
        ? (parsed as ParsedGRN).poNumber
        : (parsed as ParsedInvoice).poNumber;

  if (!poNumber || typeof poNumber !== 'string' || poNumber.trim() === '') {
    throw new Error('Could not extract a valid poNumber from the document');
  }
  return poNumber.trim();
};

export const parseDocument = async (
  filePath: string,
  documentType: DocumentType
): Promise<{ data: ParsedData; poNumber: string }> => {
  const fileData = fs.readFileSync(filePath);
  const base64Data = fileData.toString('base64');

  const result = await model.generateContent([
    { inlineData: { data: base64Data, mimeType: 'application/pdf' } },
    prompts[documentType],
  ]);

  const text = result.response.text();
  const data = extractJson(text);
  const poNumber = validatePoNumber(data, documentType);

  return { data, poNumber };
};
