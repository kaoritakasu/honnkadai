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
        const emp = alloc.employee as any;
        if (emp) {
          // skills フィールドから値を抽出
          let empSkills: any = {};
          if (emp.skills && typeof emp.skills === 'string' && emp.skills.trim()) {
            try { empSkills = JSON.parse(emp.skills); } catch (e) {}
          } else if (emp.skills && typeof emp.skills === 'object') {
            empSkills = emp.skills;
          }

          // スキルが設定されていない場合は、スコアを4で割った値をデフォルトとして使用
          const defaultSkillValue = Number(emp.score) / 4 || 0;
          const s = empSkills.salesForce !== undefined ? Number(empSkills.salesForce) : defaultSkillValue;
          const m = empSkills.managementForce !== undefined ? Number(empSkills.managementForce) : defaultSkillValue;
          const e = empSkills.explorationForce !== undefined ? Number(empSkills.explorationForce) : defaultSkillValue;
          const d = empSkills.developmentForce !== undefined ? Number(empSkills.developmentForce) : defaultSkillValue;

          skillStats.salesForce += s;
          skillStats.managementForce += m;
          skillStats.explorationForce += e;
          skillStats.developmentForce += d;
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

    // シミュレーション履歴の最新データがある場合、そこからスキルバランスを計算
    let finalDepartmentSkillStats = departmentSkillStats;
    if (simulationHistory.length > 0 && simulationHistory[0].details) {
      try {
        const latestSimulation = simulationHistory[0];
        let simulationResults: any = latestSimulation.details;

        // details が JSON 文字列の場合はパース
        if (typeof simulationResults === 'string') {
          simulationResults = JSON.parse(simulationResults);
        }

        // results 配列を取得
        let resultsArray: any[] = [];
        if (Array.isArray(simulationResults)) {
          resultsArray = simulationResults;
        } else if (simulationResults && (simulationResults as any).results && Array.isArray((simulationResults as any).results)) {
          resultsArray = (simulationResults as any).results;
        }

        // シミュレーション結果からスキルバランスを計算
        if (resultsArray.length > 0) {
          finalDepartmentSkillStats = departments.map((dept) => {
            // シミュレーション結果から該当部署の配置データを取得
            const deptResult = resultsArray.find((r: any) => {
              const rId = String(r.departmentId || r.department?.id || '').trim();
              const rName = String(r.departmentName || r.department?.name || '').trim();
              const deptId = String(dept.id).trim();
              const deptName = String(dept.name).trim();
              return (deptId && rId === deptId) || (deptName && rName === deptName);
            });

            if (!deptResult || !Array.isArray(deptResult.candidates) || deptResult.candidates.length === 0) {
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

            for (const cand of deptResult.candidates) {
              const s = Number(cand.salesForce) || 0;
              const m = Number(cand.managementForce) || 0;
              const e = Number(cand.explorationForce) || 0;
              const d = Number(cand.developmentForce) || 0;

              skillStats.salesForce += s;
              skillStats.managementForce += m;
              skillStats.explorationForce += e;
              skillStats.developmentForce += d;
            }

            const count = deptResult.candidates.length;
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
        }
      } catch (e) {
        console.warn('Failed to parse latest simulation results:', e);
      }
    }

    res.json({
      totalEmployees,
      totalAllocations: allocations.length,
      totalRevenue,
      allocationsByStatus,
      departments: departments.map((d) => ({
        ...d,
        allocatedCount: allocations.filter((a) => a.departmentId === d.id).length,
      })),
      departmentSkillStats: finalDepartmentSkillStats,
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
