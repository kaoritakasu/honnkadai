import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

const normalizeRequiredSkills = (skills: any): string => {
  if (!skills) {
    return '';
  }
  if (Array.isArray(skills)) {
    const filtered = skills.filter((s: any) => s);
    return filtered.length > 0 ? filtered.join(',') : '';
  }
  if (typeof skills === 'string') {
    return skills.trim();
  }
  return '';
};

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
    const { name, requiredSkills, requiredScore, expectedRevenue, basicData, status, description, optimalHeadcount, minHeadcount } = req.body;

    const convertedSkills = normalizeRequiredSkills(requiredSkills);

    const department = await prisma.department.create({
      data: {
        name,
        requiredSkills: convertedSkills,
        requiredScore: requiredScore || 0,
        expectedRevenue: expectedRevenue || 0,
        basicData: basicData || null,
        status: status || null,
        description: description || null,
        optimalHeadcount: optimalHeadcount || null,
        minHeadcount: minHeadcount || null,
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
    const { name, requiredSkills, requiredScore, expectedRevenue, basicData, status, description, optimalHeadcount, minHeadcount } = req.body;

    const updateData: any = {};

    if (name !== undefined) {
      updateData.name = name;
    }
    if (requiredSkills !== undefined) {
      updateData.requiredSkills = normalizeRequiredSkills(requiredSkills);
    }
    if (requiredScore !== undefined) {
      updateData.requiredScore = requiredScore;
    }
    if (expectedRevenue !== undefined) {
      updateData.expectedRevenue = expectedRevenue;
    }
    if (basicData !== undefined) {
      updateData.basicData = basicData;
    }
    if (status !== undefined) {
      updateData.status = status;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (optimalHeadcount !== undefined) {
      updateData.optimalHeadcount = optimalHeadcount;
    }
    if (minHeadcount !== undefined) {
      updateData.minHeadcount = minHeadcount;
    }

    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(department);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
