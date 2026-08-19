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
  salesForce: number;
  managementForce: number;
  explorationForce: number;
  developmentForce: number;
  laborCost: number;
}

interface PenaltyRule {
  threshold: number;
  condition: 'over' | 'under';
  factor: number;
}

const calculateMatchScore = (employee: any, department: any): number => {
  let score = 0;
  const employeeScore = employee.score || 0;

  if (employeeScore >= (department.requiredScore || 0)) {
    score += 50;
  } else {
    score += Math.max(0, (employeeScore / (department.requiredScore || 1)) * 50);
  }

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

// 充足率に基づいて不足補正ファクターを計算（shortageRate < 100%時）
const calculateShortagePenaltyFactor = (fulfillmentRate: number, shortagePenaltyRules: any[]): number => {
  if (!Array.isArray(shortagePenaltyRules) || shortagePenaltyRules.length === 0) {
    return 1.0;
  }

  for (const rule of shortagePenaltyRules) {
    if (rule.condition === 'under' && fulfillmentRate < rule.threshold) {
      return rule.factor;
    }
  }

  return 1.0;
};

// 充足率に基づいて過剰補正ファクターを計算（fulfillmentRate > 100%時）
const calculateOverallocationPenaltyFactor = (fulfillmentRate: number, overallocationPenaltyRules: any[]): number => {
  if (!Array.isArray(overallocationPenaltyRules) || overallocationPenaltyRules.length === 0) {
    return 1.0;
  }

  for (const rule of overallocationPenaltyRules) {
    if (rule.condition === 'over' && fulfillmentRate > rule.threshold) {
      return rule.factor;
    }
  }

  return 1.0;
};

// 部署の現在の状態（能力値、売上、コスト、利益など）を計算
const calculateDepartmentState = (
  department: any,
  allocatedEmployees: any[]
): {
  allocatedCount: number;
  departmentCapability: number;
  baseRevenue: number;
  fulfillmentRate: number;
  shortagePenaltyFactor: number;
  overallocationPenaltyFactor: number;
  finalRevenue: number;
  totalCost: number;
  profit: number;
} => {
  const allocatedCount = allocatedEmployees.length;

  // 【式1,2】社員貢献度と事業部能力値の計算
  const employeeContributions = allocatedEmployees.map((emp: any) => ({
    employeeContribution:
      (emp.salesForce || 0) * (department.weightSales ?? 0) +
      (emp.managementForce || 0) * (department.weightManagement ?? 0) +
      (emp.explorationForce || 0) * (department.weightExploration ?? 0) +
      (emp.developmentForce || 0) * (department.weightDevelopment ?? 0),
    laborCost: emp.laborCost || 0,
  }));

  // 【式2】事業部能力値 = Σ社員貢献度
  const departmentCapability = employeeContributions.reduce(
    (sum, ec) => sum + ec.employeeContribution,
    0
  );

  // 【式3】基本売上 = 基準売上 × (1 + 事業部能力値÷100 × 成長係数)
  const baseRevenue =
    (department.baseRevenue ?? 0) *
    (1 + (departmentCapability / 100) * (department.growthFactor ?? 0));

  // 【式4】充足率 = 配置人数÷適正人数
  const optimalHeadcountValue = Math.max(department.optimalHeadcount ?? 0, 1);
  const fulfillmentRate = (allocatedCount / optimalHeadcountValue) * 100;

  // 【式5】最終売上 = 基本売上 × 不足補正 × 過剰補正
  const penaltyRules = Array.isArray(department.shortagePenalty)
    ? (department.shortagePenalty as unknown as PenaltyRule[])
    : [];
  const shortagePenaltyFactor = calculateShortagePenaltyFactor(
    fulfillmentRate,
    penaltyRules
  );
  const overallocationPenaltyFactor =
    calculateOverallocationPenaltyFactor(fulfillmentRate, penaltyRules);

  const finalRevenue =
    baseRevenue * shortagePenaltyFactor * overallocationPenaltyFactor;

  // 【式7】コスト計算 = 配置された各社員の人件費の合計 × 3
  const totalCost = employeeContributions.reduce(
    (sum, ec) => sum + ec.laborCost * 3,
    0
  );

  // 【式8】利益 = 最終売上 − コスト
  const profit = finalRevenue - totalCost;

  return {
    allocatedCount,
    departmentCapability,
    baseRevenue,
    fulfillmentRate,
    shortagePenaltyFactor,
    overallocationPenaltyFactor,
    finalRevenue,
    totalCost,
    profit,
  };
};

// 社員を部署に追加した場合の利益変化（Delta Profit）を計算
const calculateDeltaProfit = (
  department: any,
  currentAllocatedEmployees: any[],
  employeeToAdd: any
): number => {
  const currentState = calculateDepartmentState(
    department,
    currentAllocatedEmployees
  );
  const newAllocatedEmployees = [...currentAllocatedEmployees, employeeToAdd];
  const newState = calculateDepartmentState(department, newAllocatedEmployees);

  return newState.profit - currentState.profit;
};

router.post('/simulate', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { departmentId, employees } = req.body;

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) return res.status(404).json({ error: 'Department not found' });

    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ error: 'Employees array is required' });
    }

    const optimalHeadcountValue = Math.max(department.optimalHeadcount ?? 0, 1);

    // 利益最大化アルゴリズム：各候補者を部署に追加した場合のDelta Profitを計算
    const candidatesWithDeltaProfit: Array<{
      employee: any;
      matchScore: number;
      deltaProfit: number;
    }> = [];

    for (const emp of employees) {
      const matchScore = calculateMatchScore(emp, department);
      const deltaProfit = calculateDeltaProfit(department, [], emp);

      // Delta Profit > 0の候補者のみを対象
      if (deltaProfit > 0) {
        candidatesWithDeltaProfit.push({
          employee: emp,
          matchScore,
          deltaProfit
        });
      }
    }

    // Delta Profitが大きい順にソート
    candidatesWithDeltaProfit.sort((a, b) => b.deltaProfit - a.deltaProfit);

    // 定員分だけ選択
    const selectedCandidates = candidatesWithDeltaProfit.slice(0, optimalHeadcountValue);

    // 選択された候補者を配置して、部署の状態を計算
    const allocatedEmployees = selectedCandidates.map(c => c.employee);
    const state = calculateDepartmentState(department, allocatedEmployees);

    res.json({
      department,
      allocatedCount: state.allocatedCount,
      optimalHeadcount: department.optimalHeadcount ?? 0,
      fulfillmentRate: Math.round(state.fulfillmentRate),
      departmentCapability: Math.round(state.departmentCapability),
      baseRevenue: Math.round(state.baseRevenue),
      shortagePenaltyFactor: state.shortagePenaltyFactor,
      overallocationPenaltyFactor: state.overallocationPenaltyFactor,
      finalRevenue: Math.round(state.finalRevenue),
      totalCost: Math.round(state.totalCost),
      profit: Math.round(state.profit),
      candidates: selectedCandidates.map((c: any) => ({
        employeeId: c.employee.id,
        employeeName: c.employee.user?.name || c.employee.name || 'Unknown',
        score: c.employee.score || 0,
        matchScore: c.matchScore,
        skills: c.employee.skills,
        desiredDept: c.employee.desiredDept,
      }))
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/simulate-multi', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { departmentIds } = req.body;

    if (!Array.isArray(departmentIds) || departmentIds.length === 0) {
      return res.status(400).json({ error: 'Invalid request: provide departmentIds array' });
    }

    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds } }
    });

    if (departments.length === 0) {
      return res.status(404).json({ error: 'No departments found' });
    }

    const allEmployees = await prisma.employee.findMany({
      include: { user: true }
    });

    if (allEmployees.length === 0) {
      return res.status(404).json({ error: 'No employees found' });
    }

    // 全従業員と全部署のマッチスコアを計算
    const employeesWithScores = allEmployees.map((emp: any) => ({
      employee: emp,
      scores: departments.map(dept => ({
        departmentId: dept.id,
        matchScore: calculateMatchScore(emp, dept)
      }))
    }));

    // (従業員, 部署, スコア) タプルを生成してスコア降順でソート
    const candidatePairs: Array<{
      employee: any;
      department: any;
      matchScore: number;
    }> = [];

    for (const empData of employeesWithScores) {
      for (const scoreData of empData.scores) {
        candidatePairs.push({
          employee: empData.employee,
          department: departments.find(d => d.id === scoreData.departmentId)!,
          matchScore: scoreData.matchScore
        });
      }
    }

    // 利益最大化のGreedy法アルゴリズム
    // 割り当て結果を管理
    const allocations = new Map<string, any[]>();
    const allocatedEmployeeIds = new Set<number>();

    departments.forEach(dept => allocations.set(dept.id, []));

    // ループ: 利益が最も増加するペアを見つけて割り当てることを繰り返す
    let improved = true;
    while (improved) {
      improved = false;
      let bestDeltaProfit = 0;
      let bestEmployeeId: number | null = null;
      let bestDepartmentId: string | null = null;

      // すべての未割当社員と定員に空きのある部署の組み合わせについて、Delta Profitを計算
      for (const empData of employeesWithScores) {
        if (allocatedEmployeeIds.has(empData.employee.id)) continue;

        for (const dept of departments) {
          const optimalHeadcount = dept.optimalHeadcount ?? 0;
          const currentAllocations = allocations.get(dept.id) || [];

          // 定員に達していなければ、Delta Profitを計算
          if (currentAllocations.length < optimalHeadcount) {
            const deltaProfit = calculateDeltaProfit(dept, currentAllocations, empData.employee);

            // 最大のDelta Profitを持つペアを見つける
            if (deltaProfit > bestDeltaProfit) {
              bestDeltaProfit = deltaProfit;
              bestEmployeeId = empData.employee.id;
              bestDepartmentId = dept.id;
            }
          }
        }
      }

      // 最良のペアが見つかり、かつ利益増加がプラスの場合、確定させる
      if (bestDeltaProfit > 0 && bestEmployeeId && bestDepartmentId) {
        const emp = employeesWithScores.find(e => e.employee.id === bestEmployeeId);
        const deptAllocations = allocations.get(bestDepartmentId) || [];
        deptAllocations.push(emp!.employee);
        allocations.set(bestDepartmentId, deptAllocations);
        allocatedEmployeeIds.add(bestEmployeeId);
        improved = true;
      }
    }

    // 結果の作成
    const results = [];
    let totalCompanyRevenue = 0;
    let totalCompanyCost = 0;
    let totalCompanyProfit = 0;

    for (const department of departments) {
      const allocatedEmployees = allocations.get(department.id) || [];
      const state = calculateDepartmentState(department, allocatedEmployees);

      const resultObj = {
        departmentId: department.id,
        departmentName: department.name,
        allocatedCount: state.allocatedCount,
        minHeadcount: department.minHeadcount ?? 0,
        optimalHeadcount: department.optimalHeadcount ?? 0,
        fulfillmentRate: Math.round(state.fulfillmentRate),
        departmentCapability: Math.round(state.departmentCapability),
        baseRevenue: Math.round(state.baseRevenue),
        shortagePenaltyFactor: state.shortagePenaltyFactor,
        overallocationPenaltyFactor: state.overallocationPenaltyFactor,
        finalRevenue: Math.round(state.finalRevenue),
        totalCost: Math.round(state.totalCost),
        profit: Math.round(state.profit),
        candidates: allocatedEmployees.map((emp: any) => {
          const scoreData = employeesWithScores.find(e => e.employee.id === emp.id);
          const matchScoreForDept = scoreData?.scores.find((s: any) => s.departmentId === department.id)?.matchScore || 0;
          return {
            employeeId: emp.id,
            employeeName: emp.user.name,
            score: emp.score || 0,
            matchScore: matchScoreForDept,
            skills: emp.skills,
            desiredDept: emp.desiredDept,
          };
        })
      };

      results.push(resultObj);
      totalCompanyRevenue += Math.round(resultObj.finalRevenue);
      totalCompanyCost += resultObj.totalCost;
      totalCompanyProfit += resultObj.profit;
    }

    // 【式6】全社売上 = 各事業部の最終売上の合計
    res.json({
      results,
      totalCompanyRevenue,
      totalCompanyCost,
      totalCompanyProfit
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/simulate-batch', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    let departmentIds: string[] = [];
    let employees: any[] = [];

    // リクエスト形式を判定（構造化形式か配列形式か）
    if (Array.isArray(req.body)) {
      // フロントエンドが直接配列を送信した場合（従業員配列のみ）
      employees = req.body;
      // 全部署を使用
      const allDepts = await prisma.department.findMany();
      departmentIds = allDepts.map(d => d.id);
    } else if (req.body.departmentIds && req.body.employees) {
      // 構造化形式: { departmentIds, employees }
      departmentIds = req.body.departmentIds;
      employees = req.body.employees;
    } else if (req.body.departmentIds && Array.isArray(req.body.departmentIds)) {
      // departmentIds のみが指定された場合（全社員を使用）
      departmentIds = req.body.departmentIds;
      const allEmps = await prisma.employee.findMany({ include: { user: true } });
      employees = allEmps;
    } else {
      return res.status(400).json({ error: 'Invalid request format' });
    }

    if (departmentIds.length === 0 || employees.length === 0) {
      return res.status(400).json({ error: 'Departments and employees are required' });
    }

    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds } }
    });

    if (departments.length === 0) {
      return res.status(404).json({ error: 'No departments found' });
    }

    // 全従業員と全部署のマッチスコアを計算し、(従業員, 部署, スコア) タプルを生成
    const candidatePairs: Array<{
      employee: any;
      department: any;
      matchScore: number;
      contribution: number;
    }> = [];

    // 利益最大化のGreedy法アルゴリズム
    // 各部署の割り当て結果を管理
    const allocations = new Map<string, any[]>();
    const allocatedEmployeeIds = new Set<number | string>();

    departments.forEach(dept => allocations.set(dept.id, []));

    // ループ: 利益が最も増加するペアを見つけて割り当てることを繰り返す
    let improved = true;
    while (improved) {
      improved = false;
      let bestDeltaProfit = 0;
      let bestEmployeeId: string | null = null;
      let bestDepartmentId: string | null = null;

      // すべての未割当社員と定員に空きのある部署の組み合わせについて、Delta Profitを計算
      for (const emp of employees) {
        const empId = emp.id || emp.employeeId;
        if (allocatedEmployeeIds.has(empId)) continue;

        for (const dept of departments) {
          const optimalHeadcount = dept.optimalHeadcount ?? 0;
          const currentAllocations = allocations.get(dept.id) || [];

          // 定員に達していなければ、Delta Profitを計算
          if (currentAllocations.length < optimalHeadcount) {
            const deltaProfit = calculateDeltaProfit(dept, currentAllocations, emp);

            // 最大のDelta Profitを持つペアを見つける
            if (deltaProfit > bestDeltaProfit) {
              bestDeltaProfit = deltaProfit;
              bestEmployeeId = empId;
              bestDepartmentId = dept.id;
            }
          }
        }
      }

      // 最良のペアが見つかり、かつ利益増加がプラスの場合、確定させる
      if (bestDeltaProfit > 0 && bestEmployeeId && bestDepartmentId) {
        const emp = employees.find(e => (e.id || e.employeeId) === bestEmployeeId);
        const deptAllocations = allocations.get(bestDepartmentId) || [];
        deptAllocations.push(emp);
        allocations.set(bestDepartmentId, deptAllocations);
        allocatedEmployeeIds.add(bestEmployeeId);
        improved = true;
      }
    }

    // 結果の作成
    const results = departments.map((department) => {
      const allocatedEmployees = allocations.get(department.id) || [];
      const state = calculateDepartmentState(department, allocatedEmployees);

      return {
        departmentId: department.id,
        departmentName: department.name,
        allocatedCount: state.allocatedCount,
        optimalHeadcount: department.optimalHeadcount ?? 0,
        fulfillmentRate: Math.round(state.fulfillmentRate),
        departmentCapability: Math.round(state.departmentCapability),
        baseRevenue: Math.round(state.baseRevenue),
        shortagePenaltyFactor: state.shortagePenaltyFactor,
        overallocationPenaltyFactor: state.overallocationPenaltyFactor,
        finalRevenue: Math.round(state.finalRevenue),
        totalCost: Math.round(state.totalCost),
        profit: Math.round(state.profit),
        candidates: allocatedEmployees.map((emp: any) => ({
          employeeId: emp.id || emp.employeeId,
          employeeName: emp.name || emp.user?.name || 'Unknown',
          score: emp.score || 0,
          skills: emp.skills,
          desiredDept: emp.desiredDept,
        }))
      };
    });

    // 【式6】全社売上 = 各事業部の最終売上の合計
    const totalCompanyRevenue = results.reduce((sum, result) => sum + Math.round(results.find(r => r.departmentId === result.departmentId)?.finalRevenue ?? 0), 0);
    // より効率的な計算
    const totalCompanyRevenue_Optimized = results.reduce((sum, result) => sum + (Math.round(result.finalRevenue)), 0);

    res.json({
      results,
      totalCompanyRevenue: totalCompanyRevenue_Optimized,
      totalCompanyCost: results.reduce((sum, result) => sum + result.totalCost, 0),
      totalCompanyProfit: results.reduce((sum, result) => sum + result.profit, 0)
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

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
