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

const normalizeShortagePenalty = (penalty: any): any => {
  if (!penalty) {
    return null;
  }
  if (Array.isArray(penalty)) {
    return penalty.length > 0 ? penalty : null;
  }
  return null;
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
    const { name, requiredSkills, requiredScore, expectedRevenue, basicData, status, description, optimalHeadcount, minHeadcount, weightSales, weightManagement, weightExploration, weightDevelopment, baseRevenue, growthFactor, shortagePenalty } = req.body;

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
        weightSales: weightSales || null,
        weightManagement: weightManagement || null,
        weightExploration: weightExploration || null,
        weightDevelopment: weightDevelopment || null,
        baseRevenue: baseRevenue || null,
        growthFactor: growthFactor || null,
        shortagePenalty: normalizeShortagePenalty(shortagePenalty),
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
    const { name, requiredSkills, requiredScore, expectedRevenue, basicData, status, description, optimalHeadcount, minHeadcount, weightSales, weightManagement, weightExploration, weightDevelopment, baseRevenue, growthFactor, shortagePenalty } = req.body;

    const updateData: any = {};

    // Update name (allow empty string or null, but not undefined)
    if (name !== undefined && name !== null && name.trim() !== '') {
      updateData.name = name.trim();
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
    if (weightSales !== undefined) {
      updateData.weightSales = weightSales;
    }
    if (weightManagement !== undefined) {
      updateData.weightManagement = weightManagement;
    }
    if (weightExploration !== undefined) {
      updateData.weightExploration = weightExploration;
    }
    if (weightDevelopment !== undefined) {
      updateData.weightDevelopment = weightDevelopment;
    }
    if (baseRevenue !== undefined) {
      updateData.baseRevenue = baseRevenue;
    }
    if (growthFactor !== undefined) {
      updateData.growthFactor = growthFactor;
    }
    if (shortagePenalty !== undefined) {
      updateData.shortagePenalty = normalizeShortagePenalty(shortagePenalty);
    }

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(department);
  } catch (error) {
    console.error('Department update error:', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Delete department
router.delete('/:id', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Delete related allocations first
    await prisma.allocation.deleteMany({
      where: { departmentId: id }
    });

    // Then delete the department
    const department = await prisma.department.delete({
      where: { id }
    });

    res.json({ message: 'Department deleted successfully', department });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
