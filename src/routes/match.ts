import { Router, Request, Response, NextFunction } from 'express';
import { DocumentModel } from '../models/Document';
import { MatchResultModel } from '../models/MatchResult';
import { runMatch } from '../services/matchingService';

const router = Router();

router.get('/:poNumber', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { poNumber } = req.params;

    const docs = await DocumentModel.find({ poNumber });
    if (docs.length === 0) {
      res.status(404).json({ error: `No documents found for PO number: ${poNumber}` });
      return;
    }

    let matchResult = await MatchResultModel.findOne({ poNumber });
    if (!matchResult) {
      matchResult = await runMatch(poNumber);
    }

    res.json(matchResult);
  } catch (err) {
    next(err);
  }
});

export default router;
