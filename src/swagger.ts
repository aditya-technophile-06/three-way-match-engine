import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const spec = {
  openapi: '3.0.0',
  info: {
    title: 'Three-Way Match Engine API',
    version: '1.0.0',
    description:
      'Backend service that parses PO, GRN, and Invoice PDFs using Gemini AI and performs item-level three-way matching.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development server' }],
  tags: [
    { name: 'Documents', description: 'Upload and retrieve parsed documents' },
    { name: 'Match', description: 'Three-way match results' },
    { name: 'Health', description: 'Server health check' },
  ],
  components: {
    schemas: {
      DocumentType: {
        type: 'string',
        enum: ['po', 'grn', 'invoice'],
        description: 'Type of procurement document',
      },
      MatchStatus: {
        type: 'string',
        enum: ['matched', 'partially_matched', 'mismatch', 'insufficient_documents'],
      },
      MismatchReason: {
        type: 'string',
        enum: [
          'grn_qty_exceeds_po_qty',
          'invoice_qty_exceeds_po_qty',
          'invoice_qty_exceeds_grn_qty',
          'invoice_date_after_po_date',
          'item_missing_in_po',
          'duplicate_po',
        ],
      },
      UploadResponse: {
        type: 'object',
        properties: {
          document: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '67f1a2b3c4d5e6f7a8b9c0d1' },
              documentType: { $ref: '#/components/schemas/DocumentType' },
              poNumber: { type: 'string', example: 'CI4PO05788' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          matchStatus: { $ref: '#/components/schemas/MatchStatus' },
          matchId: { type: 'string', example: '67f1a2b3c4d5e6f7a8b9c0d2' },
        },
      },
      Document: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '67f1a2b3c4d5e6f7a8b9c0d1' },
          documentType: { $ref: '#/components/schemas/DocumentType' },
          originalFileName: { type: 'string', example: 'PO-2026.pdf' },
          poNumber: { type: 'string', example: 'CI4PO05788' },
          parsedData: {
            type: 'object',
            description: 'Structured JSON extracted from the PDF by Gemini AI',
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      DocumentList: {
        type: 'object',
        properties: {
          count: { type: 'integer', example: 3 },
          documents: {
            type: 'array',
            items: { $ref: '#/components/schemas/Document' },
          },
        },
      },
      ItemResult: {
        type: 'object',
        properties: {
          sku: { type: 'string', example: '4459' },
          description: { type: 'string', example: 'Original Chicken Momos 24.0 Pieces' },
          poQty: { type: 'number', example: 475 },
          grnQty: { type: 'number', example: 475 },
          invoiceQty: { type: 'number', example: 475 },
          status: { type: 'string', enum: ['matched', 'mismatch'] },
          reasons: {
            type: 'array',
            items: { $ref: '#/components/schemas/MismatchReason' },
          },
        },
      },
      MatchResult: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          poNumber: { type: 'string', example: 'CI4PO05788' },
          status: { $ref: '#/components/schemas/MatchStatus' },
          reasons: {
            type: 'array',
            items: { $ref: '#/components/schemas/MismatchReason' },
            example: ['invoice_date_after_po_date'],
          },
          itemResults: {
            type: 'array',
            items: { $ref: '#/components/schemas/ItemResult' },
          },
          linkedDocuments: {
            type: 'object',
            properties: {
              po: { type: 'string', nullable: true },
              grns: { type: 'array', items: { type: 'string' } },
              invoices: { type: 'array', items: { type: 'string' } },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Check server health',
        responses: {
          200: {
            description: 'Server is running',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/documents/upload': {
      post: {
        tags: ['Documents'],
        summary: 'Upload and parse a document (PO, GRN, or Invoice)',
        description:
          'Uploads a PDF, parses it with Gemini AI to extract structured data, stores it in MongoDB, and immediately triggers three-way matching for the linked PO number.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'documentType'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'PDF file (max 10MB)',
                  },
                  documentType: { $ref: '#/components/schemas/DocumentType' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Document parsed and stored. Returns document info and current match status.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UploadResponse' },
              },
            },
          },
          400: {
            description: 'Missing file or invalid documentType',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
          422: {
            description: 'Gemini failed to parse the document or extract poNumber',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
        },
      },
    },
    '/documents': {
      get: {
        tags: ['Documents'],
        summary: 'List all documents',
        description: 'Returns all stored documents, optionally filtered by poNumber or documentType.',
        parameters: [
          {
            name: 'poNumber',
            in: 'query',
            schema: { type: 'string' },
            example: 'CI4PO05788',
            description: 'Filter by PO number',
          },
          {
            name: 'documentType',
            in: 'query',
            schema: { $ref: '#/components/schemas/DocumentType' },
            description: 'Filter by document type',
          },
        ],
        responses: {
          200: {
            description: 'List of documents',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DocumentList' },
              },
            },
          },
        },
      },
    },
    '/documents/{id}': {
      get: {
        tags: ['Documents'],
        summary: 'Get a parsed document by ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'MongoDB document ID',
          },
        ],
        responses: {
          200: {
            description: 'Parsed document',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Document' } },
            },
          },
          400: {
            description: 'Invalid ID format',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
          404: {
            description: 'Document not found',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
        },
      },
    },
    '/match/{poNumber}': {
      get: {
        tags: ['Match'],
        summary: 'Get three-way match result for a PO number',
        description:
          'Returns the current match state for the given PO number. Status reflects whatever documents have been uploaded so far — if not all three types exist yet, status is insufficient_documents.',
        parameters: [
          {
            name: 'poNumber',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'CI4PO05788',
            description: 'The PO number to look up',
          },
        ],
        responses: {
          200: {
            description: 'Match result',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/MatchResult' } },
            },
          },
          404: {
            description: 'No documents found for this PO number',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Error' } },
            },
          },
        },
      },
    },
  },
};

export const setupSwagger = (app: Express): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
  app.get('/api-docs.json', (_req, res) => res.json(spec));
};
