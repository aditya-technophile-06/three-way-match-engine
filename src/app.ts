import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import connectDB from './config/db';
import documentRoutes from './routes/documents';
import matchRoutes from './routes/match';
import { setupSwagger } from './swagger';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

setupSwagger(app);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/documents', documentRoutes);
app.use('/match', matchRoutes);

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' });
});

const start = async (): Promise<void> => {
  await connectDB();
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
};

start().catch(console.error);
