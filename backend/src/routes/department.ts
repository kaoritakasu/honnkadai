import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get all departments
router.get('/', async (req: Request, res: Response) => {
  try {
    const departments = await prisma.department.findMany();
    res.json(departments);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Create department
router.post('/', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, requiredSkills, requiredScore, expectedRevenue } = req.body;

    const department = await prisma.department.create({
      data: {
        name,
        requiredSkills: requiredSkills || [],
        requiredScore: requiredScore || 0,
        expectedRevenue: expectedRevenue || 0,
      },
    });

    res.json(department);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Update department
router.put('/:id', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, requiredSkills, requiredScore, expectedRevenue } = req.body;

    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: {
        name: name !== undefined ? name : undefined,
        requiredSkills: requiredSkills !== undefined ? requiredSkills : undefined,
        requiredScore: requiredScore !== undefined ? requiredScore : undefined,
        expectedRevenue: expectedRevenue !== undefined ? expectedRevenue : undefined,
      },
    });

    res.json(department);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
