import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { DocumentModel } from '../models/Document';
import { parseDocument } from '../services/geminiService';
import { runMatch } from '../services/matchingService';
import upload from '../middleware/upload';
import { DocumentType } from '../types';

const router = Router();

const VALID_TYPES: DocumentType[] = ['po', 'grn', 'invoice'];

router.post(
  '/upload',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { documentType } = req.body as { documentType: string };

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      if (!documentType || !VALID_TYPES.includes(documentType as DocumentType)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        res.status(400).json({ error: 'documentType must be one of: po, grn, invoice' });
        return;
      }

      let parsedResult: Awaited<ReturnType<typeof parseDocument>>;
      try {
        parsedResult = await parseDocument(req.file.path, documentType as DocumentType);
      } catch (err) {
        res.status(422).json({
          error: 'Failed to parse document with Gemini',
          details: err instanceof Error ? err.message : String(err),
        });
        return;
      } finally {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }

      const { data: parsedData, poNumber } = parsedResult;

      const doc = await DocumentModel.create({
        documentType: documentType as DocumentType,
        originalFileName: req.file.originalname,
        poNumber,
        parsedData: parsedData as unknown as Record<string, unknown>,
      });

      const matchResult = await runMatch(poNumber);

      res.status(201).json({
        document: {
          id: doc._id,
          documentType: doc.documentType,
          poNumber: doc.poNumber,
          createdAt: doc.createdAt,
        },
        matchStatus: matchResult?.status ?? 'insufficient_documents',
        matchId: matchResult?._id ?? null,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { poNumber, documentType } = req.query as {
      poNumber?: string;
      documentType?: string;
    };

    const filter: Record<string, string> = {};
    if (poNumber) filter.poNumber = poNumber;
    if (documentType && VALID_TYPES.includes(documentType as DocumentType)) {
      filter.documentType = documentType;
    }

    const docs = await DocumentModel.find(filter).sort({ createdAt: -1 });
    res.json({ count: docs.length, documents: docs });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (err) {
    if ((err as { name?: string }).name === 'CastError') {
      res.status(400).json({ error: 'Invalid document ID format' });
      return;
    }
    next(err);
  }
});

export default router;
