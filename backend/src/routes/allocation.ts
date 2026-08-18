import express, { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

interface SimulationRequest {
  departmentId: string;
  numPositions: number;
}

interface BatchSimulationRequest {
  employeeId: number;
  score: number;
  desiredDept: string;
}

// Simulation logic
const calculateMatchScore = (employee: any, department: any): number => {
  let score = 0;
  const employeeScore = employee.score || 0;

  // Score requirement matching
  if (employeeScore >= (department.requiredScore || 0)) {
    score += 50;
  } else {
    score += Math.max(0, (employeeScore / (department.requiredScore || 1)) * 50);
  }

  // Skills matching
  const requiredSkills = department.requiredSkills || [];
  const employeeSkills = employee.skills || [];
  if (requiredSkills.length > 0) {
    const matchedSkills = requiredSkills.filter((skill: string) =>
      employeeSkills.includes(skill)
    ).length;
    score += (matchedSkills / requiredSkills.length) * 50;
  } else {
    score += 50;
  }

  return Math.round(score);
};

// Admin: Run simulation
router.post('/simulate', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { departmentId, numPositions } = req.body as SimulationRequest;

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) return res.status(404).json({ error: 'Department not found' });

    const employees = await prisma.employee.findMany({
      include: { user: true },
    });

    const candidates = employees
      .map((emp) => ({
        employee: emp,
        matchScore: calculateMatchScore(emp, department),
      }))
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.employee.score || 0) - (a.employee.score || 0);
      })
      .slice(0, numPositions);

    const totalExpectedRevenue = department.expectedRevenue * numPositions;

    res.json({
      department,
      candidates: candidates.map((c) => ({
        employeeId: c.employee.id,
        employeeName: c.employee.user.name,
        score: c.employee.score || 0,
        matchScore: c.matchScore,
        skills: c.employee.skills,
        desiredDept: c.employee.desiredDept,
      })),
      totalExpectedRevenue,
      growthRate: (candidates.length / employees.length) * 100,
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Run batch simulation
router.post('/simulate-batch', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const batchData = req.body as BatchSimulationRequest[];

    if (!Array.isArray(batchData) || batchData.length === 0) {
      return res.status(400).json({ error: 'Invalid batch data' });
    }

    const departments = await prisma.department.findMany();
    if (departments.length === 0) {
      return res.status(404).json({ error: 'No departments found' });
    }

    const targetDept = departments[0];
    const employees = await prisma.employee.findMany({
      include: { user: true },
    });

    const batchDataMap = new Map(batchData.map(d => [d.employeeId, d]));
    const filteredEmployees = employees.filter(emp => batchDataMap.has(parseInt(emp.id, 10)));

    const candidates = filteredEmployees
      .map((emp) => ({
        employee: emp,
        matchScore: calculateMatchScore(emp, targetDept),
      }))
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.employee.score || 0) - (a.employee.score || 0);
      });

    const totalExpectedRevenue = targetDept.expectedRevenue * candidates.length;

    res.json({
      department: targetDept,
      candidates: candidates.map((c) => ({
        employeeId: c.employee.id,
        employeeName: c.employee.user.name,
        score: c.employee.score || 0,
        matchScore: c.matchScore,
        skills: c.employee.skills,
        desiredDept: c.employee.desiredDept,
      })),
      totalExpectedRevenue,
      growthRate: (candidates.length / employees.length) * 100,
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Create allocation
router.post('/', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, departmentId, reason, recommendedLearning } = req.body;

    const allocation = await prisma.allocation.create({
      data: {
        employeeId,
        departmentId,
        status: 'ASSIGNED',
        reason,
        recommendedLearning,
      },
      include: { employee: { include: { user: true } }, department: true },
    });

    // Create feedback entry
    await prisma.feedback.create({
      data: {
        employeeId,
        allocationId: allocation.id,
      },
    });

    res.json(allocation);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Get own allocations
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user!.id },
    });

    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const allocations = await prisma.allocation.findMany({
      where: { employeeId: employee.id },
      include: { department: true, feedback: true },
    });

    res.json(allocations);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: Get all allocations
router.get('/', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const allocations = await prisma.allocation.findMany({
      include: {
        employee: { include: { user: true } },
        department: true,
        feedback: true,
      },
    });

    res.json(allocations);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
