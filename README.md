# Three-Way Match Engine

A TypeScript/Node.js backend that accepts PO, GRN, and Invoice PDFs, extracts structured data using the Gemini AI API, stores it in MongoDB, and runs item-level three-way matching with full out-of-order document support.

---

## What It Does

When a business buys goods, three documents are involved:
- **PO** — the buyer says "I want to buy X units of item Y at price Z"
- **GRN** — the warehouse says "I received N units of item Y"
- **Invoice** — the vendor says "please pay me for N units of item Y"

A **three-way match** checks that these three documents are consistent with each other before approving payment.

---

## Tech Stack

- **TypeScript** + Node.js + Express
- **MongoDB** (Mongoose)
- **Google Gemini API** `gemini-2.5-flash` (PDF parsing)
- **Multer** (file uploads)
- **Swagger UI** (interactive API docs at `/api-docs`)

---

## Setup

### 1. Install MongoDB locally

```bash
brew tap mongodb/brew
brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

### 2. Clone and install dependencies

```bash
cd three-way-match-engine
npm install
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```
MONGODB_URI=mongodb://localhost:27017/match-engine
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Start the server

```bash
# Development 
npm run dev

# Production 
npm run build
npm start
```

Server: `http://localhost:3000`  
Swagger UI: `http://localhost:3000/api-docs`  
OpenAPI JSON: `http://localhost:3000/api-docs.json`

---

## API Reference

Full interactive documentation is available at `http://localhost:3000/api-docs` once the server is running.

### Upload a Document

```
POST /documents/upload
Content-Type: multipart/form-data
```

| Field | Type | Description |
|---|---|---|
| `file` | File | The PDF document |
| `documentType` | String | `po`, `grn`, or `invoice` |

**Response:**
```json
{
  "document": {
    "id": "67f1a2b3c4d5e6f7a8b9c0d1",
    "documentType": "po",
    "poNumber": "CI4PO05788",
    "createdAt": "2026-03-31T10:00:00.000Z"
  },
  "matchStatus": "insufficient_documents",
  "matchId": "67f1a2b3c4d5e6f7a8b9c0d2"
}
```

---

### Get a Parsed Document

```
GET /documents/:id
```

Returns the full stored document including the parsed JSON extracted by Gemini.

---

### Get Match Result by PO Number

```
GET /match/:poNumber
```

**Response:**
```json
{
  "poNumber": "CI4PO05788",
  "status": "matched",
  "reasons": [],
  "itemResults": [
    {
      "sku": "4459",
      "description": "Original Chicken Momos 24.0 Pieces",
      "poQty": 475,
      "grnQty": 475,
      "invoiceQty": 475,
      "status": "matched",
      "reasons": []
    }
  ],
  "linkedDocuments": {
    "po": "67f1a2b3...",
    "grns": ["67f1a2b4..."],
    "invoices": ["67f1a2b5..."]
  }
}
```

---

### List All Documents

```
GET /documents?poNumber=CI4PO05788&documentType=po
```

Both query params are optional. Returns all stored documents with optional filtering.

---

### Health Check

```
GET /health
```

---

## Match Status Values

| Status | Meaning |
|---|---|
| `matched` | All items match across PO, GRN, and Invoice |
| `partially_matched` | Some items match, some have discrepancies |
| `mismatch` | One or more critical validation failures |
| `insufficient_documents` | Not all three document types have been uploaded yet |

---

## Mismatch Reason Codes

| Reason | Description |
|---|---|
| `grn_qty_exceeds_po_qty` | GRN received more than the PO ordered for an item |
| `invoice_qty_exceeds_po_qty` | Invoice billed more than the PO ordered |
| `invoice_qty_exceeds_grn_qty` | Invoice billed more than what was actually received |
| `invoice_date_after_po_date` | Invoice was dated after the PO date |
| `item_missing_in_po` | GRN or Invoice references a SKU not found in the PO |
| `duplicate_po` | More than one PO uploaded for the same PO number |

---

## Approach

### Parsing Flow

1. User uploads a PDF with `documentType`
2. The PDF is temporarily saved to disk
3. The PDF is read, base64-encoded, and sent to Gemini `gemini-2.5-flash` as inline data along with a structured prompt
4. Gemini returns a JSON object with the extracted fields
5. The parsed data is stored in MongoDB under the `documents` collection
6. The temporary file is deleted
7. Matching is triggered immediately

### Data Model

MongoDB has two collections (no SQL tables — MongoDB uses collections of JSON documents):

**`documents` collection** — one record per upload, polymorphic by `documentType`:
```
{
  documentType: 'po' | 'grn' | 'invoice',
  originalFileName: string,
  poNumber: string,          ← used as the link key across all three types
  parsedData: object,        ← full JSON extracted by Gemini
  createdAt, updatedAt
}
```

**`matchresults` collection** — one record per `poNumber`, upserted on every upload:
```
{
  poNumber: string,
  status: 'matched' | 'partially_matched' | 'mismatch' | 'insufficient_documents',
  reasons: string[],
  itemResults: [{ sku, poQty, grnQty, invoiceQty, status, reasons }],
  linkedDocuments: { po, grns[], invoices[] },
  createdAt, updatedAt
}
```

Indexes: `poNumber` is indexed on both collections. `matchresults.poNumber` is unique.

### Item Matching Key

I use **SKU (item code)** as the matching key across PO, GRN, and Invoice.

This is the right choice because:
- All three document types in the real sample documents share the exact same numeric SKU codes (e.g., `4459`, `11797`, `18003`)
- SKU is a system-assigned identifier — it is unambiguous and stable
- Product descriptions can vary between vendor and buyer documents (e.g., "Meatigo Hot Wings 250g" vs "Meatigo RTC Meatigo Hot Wings 250g"), making description-based matching unreliable

### Matching Logic

Matching works at the item level, per `poNumber`:

1. Build a map of PO quantities per SKU
2. Sum up all GRN received quantities per SKU (across multiple GRNs)
3. Sum up all Invoice quantities per SKU (across multiple Invoices)
4. For each item in the PO, check:
   - GRN received qty ≤ PO qty
   - Invoice qty ≤ PO qty
   - Invoice qty ≤ total GRN received qty
5. Check that no Invoice is dated after the PO
6. Check that no GRN/Invoice item references a SKU not in the PO

### Out-of-Order Upload Handling

Every time a document is uploaded, the system immediately runs matching for that `poNumber`. If not all three document types are present yet, the match status is set to `insufficient_documents` and stored. As more documents arrive, the match result is updated (upserted) to reflect the current state.

This means:
- You can upload an Invoice before the PO exists — it will be stored and the match will say `insufficient_documents`
- Once the PO and GRN arrive, matching runs automatically and produces a real result
- The `GET /match/:poNumber` endpoint always returns the latest state

---

## Assumptions

- Each PO number uniquely identifies a purchase event; uploading more than one PO for the same `poNumber` is flagged as `duplicate_po`
- GRN quantities are compared to PO quantities per SKU. Partial delivery (GRN qty < PO qty) is allowed and does not cause a mismatch
- Multiple GRNs and multiple Invoices for the same PO are supported; quantities are summed
- Dates are parsed from the format returned by Gemini (ISO `YYYY-MM-DD`)
- The "Invoice date must not be after PO date" rule is enforced; invoice date equal to PO date is allowed
- Items present in GRN or Invoice but missing in PO are flagged with `item_missing_in_po`

---

## Live Deployment

**🚀 Live URL**: https://three-way-match-engine-production.up.railway.app  
**📚 Swagger UI**: https://three-way-match-engine-production.up.railway.app/api-docs  
**🔍 OpenAPI JSON**: https://three-way-match-engine-production.up.railway.app/api-docs.json  

**Deployment stack**:
- **Backend**: Railway (Node.js, auto-deploy from GitHub)
- **Database**: MongoDB Atlas M0 free cluster
- **API**: Gemini 2.5 Flash for PDF parsing
- **Infrastructure**: Fully serverless, auto-scaling

---