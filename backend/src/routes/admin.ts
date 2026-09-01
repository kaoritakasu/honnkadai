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
      include: { department: true, employee: true },
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

    // 部署ごとのスキルバランス情報を計算
    const departmentSkillStats = departments.map((dept) => {
      const deptAllocations = allocations.filter((a) => a.departmentId === dept.id);

      if (deptAllocations.length === 0) {
        return {
          departmentId: dept.id,
          departmentName: dept.name,
          employeeCount: 0,
          averageSkills: { salesForce: 0, managementForce: 0, explorationForce: 0, developmentForce: 0 }
        };
      }

      const skillStats = {
        salesForce: 0,
        managementForce: 0,
        explorationForce: 0,
        developmentForce: 0
      };

      for (const alloc of deptAllocations) {
        const emp = alloc.employee;
        if (emp) {
          skillStats.salesForce += Number(emp.salesForce) || 0;
          skillStats.managementForce += Number(emp.managementForce) || 0;
          skillStats.explorationForce += Number(emp.explorationForce) || 0;
          skillStats.developmentForce += Number(emp.developmentForce) || 0;
        }
      }

      const count = deptAllocations.length;
      return {
        departmentId: dept.id,
        departmentName: dept.name,
        employeeCount: count,
        averageSkills: {
          salesForce: Math.round(skillStats.salesForce / count),
          managementForce: Math.round(skillStats.managementForce / count),
          explorationForce: Math.round(skillStats.explorationForce / count),
          developmentForce: Math.round(skillStats.developmentForce / count)
        }
      };
    });

    const simulationHistory = await prisma.simulationResult.findMany({
      select: {
        id: true,
        totalRevenue: true,
        totalCost: true,
        totalProfit: true,
        executedBy: true,
        details: true,
        createdAt: true,
      },
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
      departmentSkillStats,
      simulationHistory
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Get all consultations
router.get('/consultations', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const consultations = await prisma.consultation.findMany({
      include: {
        employee: {
          include: { user: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(consultations);
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
