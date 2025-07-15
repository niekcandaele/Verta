import { Router, Request, Response } from 'express';

export const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Verta API',
    version: '1.0.0',
  });
});

router.get('/users', (_req: Request, res: Response) => {
  res.json({
    users: [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
    ],
  });
});

router.post('/users', (req: Request, res: Response) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  res.status(201).json({
    id: Date.now(),
    name,
    email,
  });
});