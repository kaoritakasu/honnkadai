import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Get dashboard metrics
router.get('/dashboard', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const totalEmployees = await prisma.employee.count();
    const allocations = await prisma.allocation.findMany({
      include: { department: true },
    });

    const totalRevenue = allocations.reduce((sum, alloc) => {
      return sum + (alloc.department.expectedRevenue || 0);
    }, 0);

    const allocationsByStatus = {
      PENDING: allocations.filter((a) => a.status === 'PENDING').length,
      ASSIGNED: allocations.filter((a) => a.status === 'ASSIGNED').length,
      REJECTED: allocations.filter((a) => a.status === 'REJECTED').length,
    };

    const departments = await prisma.department.findMany();

    const simulationHistory = await prisma.simulationResult.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    res.json({
      totalEmployees,
      totalAllocations: allocations.length,
      totalRevenue,
      allocationsByStatus,
      departments: departments.map((d) => ({
        ...d,
        allocatedCount: allocations.filter((a) => a.departmentId === d.id).length,
      })),
      simulationHistory
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Send feedback to employee
router.post('/send-feedback/:allocationId', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { allocationId } = req.params;

    const feedback = await prisma.feedback.update({
      where: { allocationId },
      data: {
        viewedAt: new Date(),
      },
      include: { allocation: { include: { employee: { include: { user: true } } } } },
    });

    res.json(feedback);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
