import express, { Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';

const router: Router = express.Router();
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
      select: {
        id: true,
        employeeNumber: true,
        userId: true,
        score: true,
        desiredDept: true,
        currentDept: true,
        status: true,
        lastUpdated: true,
        skills: true,
        careerGoals: true,
        workLifeBalance: true,
        createdAt: true,
        user: true,
        allocations: { include: { department: true } },
      },
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

router.get('/:id/assignment', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = req.params.id;
    // TODO: 実際のDBモデル（例: AssignmentやEmployee）に合わせて取得処理を実装してください
    // const assignment = await prisma.assignment.findUnique({ where: { employeeId } });
    
    // 仮のモックデータを返すか、データがない場合はnullを返す
    res.json(null); 
  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id/preferences', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = req.params.id;

    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { id: employeeId },
          { userId: employeeId }
        ]
      }
    });

    res.json(employee);
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 既存の router 定義部分に以下を追加します

router.post('/:id/preferences', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = req.params.id;
    // フロントから送られてきたデータを受け取る
   // 1. フロントから複数データが来るが、現在のDBに存在しないカラムは除外して取り出す
    const { desiredDept, workLifeBalance, careerDesire } = req.body;

    // 2. IDの不一致（UserのIDかEmployeeのIDか）による P2014/P2025 エラーを防ぐため、まずはレコードを探す
    const existingEmployee = await prisma.employee.findFirst({
      where: {
        OR: [
          { id: employeeId },
          { userId: employeeId }
        ]
      }
    });

    let updatedData;
    if (existingEmployee) {
      // 既存レコードがあれば更新
      updatedData = await prisma.employee.update({
        where: { id: existingEmployee.id },
        data: {
          desiredDept: desiredDept,
          workLifeBalance: workLifeBalance,
          // careerDesire: careerDesire,
        }
      });
    } else {
      // レコードがなければ新規作成（Userと紐づけ）
      updatedData = await prisma.employee.create({
        data: {
          desiredDept: desiredDept,
          workLifeBalance: workLifeBalance,
          laborCost: 0,
          // careerDesire: careerDesire,
          user: {
            connect: { id: employeeId }
          }
        }
      });
    }
    res.status(200).json({
      message: 'Preferences updated successfully',
      data: updatedData
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Submit consultation
router.post('/:id/consultation', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = req.params.id;
    const { inquiry } = req.body;
    const userId = req.user?.id;

    console.log('[Consultation API] Received submission:', {
      employeeId,
      inquiryLength: inquiry?.length,
      userId,
      timestamp: new Date().toISOString()
    });

    if (!inquiry || inquiry.trim() === '') {
      console.log('[Consultation API] Empty inquiry rejected');
      return res.status(400).json({ error: 'Inquiry cannot be empty' });
    }

    // Find employee by ID or userId
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { id: employeeId },
          { userId: employeeId }
        ]
      }
    });

    if (!employee) {
      console.log('[Consultation API] Employee not found for ID:', employeeId);
      return res.status(404).json({ error: 'Employee not found' });
    }

    console.log('[Consultation API] Found employee:', {
      id: employee.id,
      userId: employee.userId,
      employeeNumber: employee.employeeNumber
    });

    // Create consultation
    const consultation = await prisma.consultation.create({
      data: {
        employeeId: employee.id,
        title: '人事相談',
        description: inquiry,
        status: 'pending'
      }
    });

    console.log('[Consultation API] Consultation created:', {
      id: consultation.id,
      employeeId: consultation.employeeId,
      status: consultation.status,
      createdAt: consultation.createdAt
    });

    res.status(201).json(consultation);
  } catch (error) {
    console.error('[Consultation API] Error submitting consultation:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
