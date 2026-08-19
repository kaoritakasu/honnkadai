import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get own profile
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user!.id },
      include: { user: true, allocations: { include: { department: true } }, feedback: true },
    });

    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Update own profile
router.put('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { score, desiredDept, skills, careerGoals } = req.body;

    const employee = await prisma.employee.update({
      where: { userId: req.user!.id },
      data: {
        score: score !== undefined ? score : undefined,
        desiredDept: desiredDept !== undefined ? desiredDept : undefined,
        skills: skills !== undefined ? skills : undefined,
        careerGoals: careerGoals !== undefined ? careerGoals : undefined,
      },
      include: { user: true },
    });

    res.json(employee);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Get all employees
router.get('/', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      include: { user: true, allocations: { include: { department: true } } },
    });
    // Ensure response is always an array
    res.json(Array.isArray(employees) ? employees : []);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Get specific employee
router.get('/:id', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { user: true, allocations: { include: { department: true } }, feedback: true },
    });

    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
