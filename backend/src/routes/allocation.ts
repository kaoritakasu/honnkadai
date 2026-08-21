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
const calculateOverallocationPenaltyFactor = (fulfillmentRate: number): number => {
  if (fulfillmentRate >= 160) {
    return 0.80;
  } else if (fulfillmentRate >= 140) {
    return 0.90;
  } else if (fulfillmentRate >= 120) {
    return 0.95;
  } else {
    return 1.00;
  }
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
    calculateOverallocationPenaltyFactor(fulfillmentRate);

  const finalRevenue =
    baseRevenue * shortagePenaltyFactor * overallocationPenaltyFactor;

  // 【式7】コスト計算 = 配置された各社員の人件費の合計 × 3 (※単位が100万のため × 3000000)
  const totalCost = employeeContributions.reduce(
    (sum, ec) => sum + (ec.laborCost * 3000000),
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

// タグ計算ロジック
const calculateTags = (emp: any): string[] => {
  const tags: string[] = [];

  // 4つの能力で最も高いものをタグ付け
  const abilities = {
    '営業力': emp.salesForce || 0,
    '管理力': emp.managementForce || 0,
    '開拓力': emp.explorationForce || 0,
    '育成力': emp.developmentForce || 0
  };

  let maxAbility = '';
  let maxValue = 0;

  for (const [name, value] of Object.entries(abilities)) {
    if (value > maxValue) {
      maxValue = value;
      maxAbility = name;
    }
  }

  if (maxAbility && maxValue > 0) {
    tags.push(maxAbility);
  }

  return tags;
};

// バリデーション関数：employeeNumber をサポート
const validateSimulateBatchPayload = (data: any): boolean => {
  if (Array.isArray(data)) {
    return data.every((emp: any) => {
      return (
        (emp.id !== undefined || emp.employeeId !== undefined || emp.employeeNumber !== undefined) &&
        typeof emp === 'object' &&
        emp !== null
      );
    });
  }
  return (
    data &&
    typeof data === 'object' &&
    (data.departmentIds || data.departmentIds === undefined) &&
    (Array.isArray(data.employees) || Array.isArray(data.departmentIds))
  );
};

// =========================================
// Routes
// =========================================

router.post('/simulate', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const isAdminUser = req.user?.role === 'ADMIN';
    const { departmentId, employees } = req.body;

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) return res.status(404).json({ error: 'Department not found' });

    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ error: 'Employees array is required' });
    }

    const optimalHeadcountValue = Math.max(department.optimalHeadcount ?? 0, 1);

    const candidatesWithDeltaProfit: Array<{
      employee: any;
      matchScore: number;
      deltaProfit: number;
    }> = [];

    for (const emp of employees) {
      const safeEmp = {
        ...emp,
        salesForce: emp.salesForce ?? 0,
        managementForce: emp.managementForce ?? 0,
        explorationForce: emp.explorationForce ?? 0,
        developmentForce: emp.developmentForce ?? 0,
        laborCost: emp.laborCost ?? 0,
        score: emp.score ?? 0,
        skills: emp.skills || []
      };
      const matchScore = calculateMatchScore(safeEmp, department);
      const deltaProfit = calculateDeltaProfit(department, [], safeEmp);

      if (deltaProfit > 0) {
        candidatesWithDeltaProfit.push({
          employee: safeEmp,
          matchScore,
          deltaProfit
        });
      }
    }

    candidatesWithDeltaProfit.sort((a, b) => b.deltaProfit - a.deltaProfit);
    const selectedCandidates = candidatesWithDeltaProfit.slice(0, optimalHeadcountValue);
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
        employeeNumber: c.employee.employeeNumber,
        employeeName: c.employee.employeeName || c.employee.name || c.employee.id,
        score: c.employee.score || 0,
        matchScore: c.matchScore,
        skills: c.employee.skills,
        desiredDept: c.employee.desiredDept,
        laborCost: c.employee.laborCost,
        salesForce: c.employee.salesForce,
        managementForce: c.employee.managementForce,
        explorationForce: c.employee.explorationForce,
        developmentForce: c.employee.developmentForce,
        tags: calculateTags(c.employee),
        isExecutiveCandidate: isAdminUser ? ((c.employee.managementForce || 0) >= 70 && (c.employee.developmentForce || 0) >= 70) : false
      })).sort((a: any, b: any) => (a.employeeId || 0) - (b.employeeId || 0))
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/simulate-multi', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const isAdminUser = req.user?.role === 'ADMIN';
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

    const employeesWithScores = allEmployees.map((emp: any) => ({
      employee: emp,
      scores: departments.map(dept => ({
        departmentId: dept.id,
        matchScore: calculateMatchScore(emp, dept)
      }))
    }));

    const allocations = new Map<string, any[]>();
    const allocatedEmployeeIds = new Set<number>();
    departments.forEach(dept => allocations.set(dept.id, []));

    let improved = true;
    while (improved) {
      improved = false;
      let bestDeltaProfit = 0;
      let bestEmployeeId: number | null = null;
      let bestDepartmentId: string | null = null;

      for (const empData of employeesWithScores) {
        if (allocatedEmployeeIds.has(empData.employee.id)) continue;
        for (const dept of departments) {
          const optimalHeadcount = dept.optimalHeadcount ?? 0;
          const currentAllocations = allocations.get(dept.id) || [];
          if (currentAllocations.length < optimalHeadcount) {
            const deltaProfit = calculateDeltaProfit(dept, currentAllocations, empData.employee);
            if (deltaProfit > bestDeltaProfit) {
              bestDeltaProfit = deltaProfit;
              bestEmployeeId = empData.employee.id;
              bestDepartmentId = dept.id;
            }
          }
        }
      }

      if (bestDeltaProfit > 0 && bestEmployeeId && bestDepartmentId) {
        const emp = employeesWithScores.find(e => e.employee.id === bestEmployeeId);
        const deptAllocations = allocations.get(bestDepartmentId) || [];
        deptAllocations.push(emp!.employee);
        allocations.set(bestDepartmentId, deptAllocations);
        allocatedEmployeeIds.add(bestEmployeeId);
        improved = true;
      }
    }

    // フォールバック処理: 未配置の社員を全員割り当て
    for (const empData of employeesWithScores) {
      if (allocatedEmployeeIds.has(empData.employee.id)) continue;

      let bestDept: string | null = null;
      let bestDeltaProfit = -Infinity;

      for (const dept of departments) {
        const currentAllocations = allocations.get(dept.id) || [];
        const deltaProfit = calculateDeltaProfit(dept, currentAllocations, empData.employee);
        if (deltaProfit > bestDeltaProfit) {
          bestDeltaProfit = deltaProfit;
          bestDept = dept.id;
        }
      }

      if (bestDept) {
        const deptAllocations = allocations.get(bestDept) || [];
        deptAllocations.push(empData.employee);
        allocations.set(bestDept, deptAllocations);
        allocatedEmployeeIds.add(empData.employee.id);
      }
    }

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
            employeeNumber: emp.employeeNumber,
            employeeName: emp.user?.name || emp.id,
            score: emp.score || 0,
            matchScore: matchScoreForDept,
            skills: emp.skills,
            desiredDept: emp.desiredDept,
            laborCost: emp.laborCost,
            salesForce: emp.salesForce,
            managementForce: emp.managementForce,
            explorationForce: emp.explorationForce,
            developmentForce: emp.developmentForce,
            tags: calculateTags(emp),
            isExecutiveCandidate: isAdminUser ? ((emp.managementForce || 0) >= 70 && (emp.developmentForce || 0) >= 70) : false
          };
        }).sort((a, b) => (a.employeeId || 0) - (b.employeeId || 0))
      };
      results.push(resultObj);
      totalCompanyRevenue += Math.round(resultObj.finalRevenue);
      totalCompanyCost += resultObj.totalCost;
      totalCompanyProfit += resultObj.profit;
    }

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
    const isAdminUser = req.user?.role === 'ADMIN';
    let departmentIds: string[] = [];
    let employees: any[] = [];

    if (Array.isArray(req.body)) {
      employees = req.body;
      const allDepts = await prisma.department.findMany();
      departmentIds = allDepts.map(d => d.id);
    } else if (req.body.departmentIds && req.body.employees) {
      departmentIds = req.body.departmentIds;
      employees = req.body.employees;
    } else if (req.body.departmentIds && Array.isArray(req.body.departmentIds)) {
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

    const dbEmployees = await prisma.employee.findMany({ include: { user: true } });
    const enrichedEmployees = employees.map((emp: any) => {
      let dbEmp: any = null;

      if (emp.employeeNumber) {
        dbEmp = dbEmployees.find((e: any) => e.employeeNumber === emp.employeeNumber);
      }
      if (!dbEmp) {
        const empId = emp.id || emp.employeeId;
        dbEmp = dbEmployees.find((e: any) => e.id === empId);
      }

      const result = {
        ...emp,
        id: emp.id || emp.employeeId,
        employeeNumber: emp.employeeNumber,
        employeeName: emp.name || emp.employeeName,
        desiredDept: emp.desiredDept,
        tags: emp.tags || [],
        salesForce: emp.salesForce ?? 0,
        managementForce: emp.managementForce ?? 0,
        explorationForce: emp.explorationForce ?? 0,
        developmentForce: emp.developmentForce ?? 0,
        laborCost: emp.laborCost ?? 0,
        score: emp.score ?? 0,
        skills: emp.skills || [],
        isExecutiveCandidate: ((emp.managementForce || 0) >= 70 && (emp.developmentForce || 0) >= 70)
      };
      return result;
    });

    const allocations = new Map<string, any[]>();
    const allocatedEmployeeIds = new Set<number | string>();
    departments.forEach(dept => allocations.set(dept.id, []));

    let improved = true;
    while (improved) {
      improved = false;
      let bestDeltaProfit = 0;
      let bestEmployeeId: string | null = null;
      let bestDepartmentId: string | null = null;

      for (const emp of enrichedEmployees) {
        const empId = emp.id || emp.employeeId;
        if (allocatedEmployeeIds.has(empId)) continue;

        for (const dept of departments) {
          const optimalHeadcount = dept.optimalHeadcount ?? 0;
          const currentAllocations = allocations.get(dept.id) || [];

          if (currentAllocations.length < optimalHeadcount) {
            const deltaProfit = calculateDeltaProfit(dept, currentAllocations, emp);
            if (deltaProfit > bestDeltaProfit) {
              bestDeltaProfit = deltaProfit;
              bestEmployeeId = empId;
              bestDepartmentId = dept.id;
            }
          }
        }
      }

      if (bestDeltaProfit > 0 && bestEmployeeId && bestDepartmentId) {
        const emp = employees.find(e => (e.id || e.employeeId) === bestEmployeeId);
        const deptAllocations = allocations.get(bestDepartmentId) || [];
        deptAllocations.push(emp);
        allocations.set(bestDepartmentId, deptAllocations);
        allocatedEmployeeIds.add(bestEmployeeId);
        improved = true;
      }
    }

    // フォールバック処理: 未配置の社員を全員割り当て
    for (const emp of enrichedEmployees) {
      const empId = emp.id || emp.employeeId;
      if (allocatedEmployeeIds.has(empId)) continue;

      let bestDept: string | null = null;
      let bestDeltaProfit = -Infinity;

      for (const dept of departments) {
        const currentAllocations = allocations.get(dept.id) || [];
        const deltaProfit = calculateDeltaProfit(dept, currentAllocations, emp);
        if (deltaProfit > bestDeltaProfit) {
          bestDeltaProfit = deltaProfit;
          bestDept = dept.id;
        }
      }

      if (bestDept) {
        const deptAllocations = allocations.get(bestDept) || [];
        deptAllocations.push(emp);
        allocations.set(bestDept, deptAllocations);
        allocatedEmployeeIds.add(empId);
      }
    }

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
          employeeNumber: emp.employeeNumber,
          employeeName: emp.employeeName || emp.name || emp.id || emp.employeeId || 'Unknown',
          score: emp.score || 0,
          skills: emp.skills,
          desiredDept: emp.desiredDept,
          laborCost: emp.laborCost,
          salesForce: emp.salesForce,
          managementForce: emp.managementForce,
          explorationForce: emp.explorationForce,
          developmentForce: emp.developmentForce,
          tags: emp.tags || calculateTags(emp),
          isExecutiveCandidate: isAdminUser ? ((emp.managementForce || 0) >= 70 && (emp.developmentForce || 0) >= 70) : false
        })).sort((a, b) => (Number(a.employeeId) || 0) - (Number(b.employeeId) || 0))
      };
    });

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

router.post('/recalculate', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const isAdminUser = req.user?.role === 'ADMIN';
    let requestedData = req.body.results || req.body.departments || req.body;

    if (req.body.adjustedAllocations) {
      requestedData = Object.entries(req.body.adjustedAllocations).map(([deptId, emps]) => ({
        departmentId: deptId,
        candidates: emps
      }));
    } else if (req.body.data && Array.isArray(req.body.data)) {
      requestedData = req.body.data;
    }

    if (!Array.isArray(requestedData)) {
      return res.status(400).json({ error: 'Invalid data format: Expected an array' });
    }

    const departmentIds = requestedData.map((d: any) => d.departmentId || d.id).filter(id => id);

    const dbDepartments = await prisma.department.findMany({
      where: { id: { in: departmentIds } }
    });

    const allEmployeesDB = await prisma.employee.findMany({
      include: { user: true }
    });

    const results = [];
    let totalCompanyRevenue = 0;
    let totalCompanyCost = 0;
    let totalCompanyProfit = 0;

    for (const reqDept of requestedData) {
      const deptId = reqDept.departmentId || reqDept.id;
      const dbDept = dbDepartments.find(d => d.id === deptId);
      if (!dbDept) continue;

      const candidates = reqDept.candidates || reqDept.employees || [];

      const allocatedEmployees = candidates.map((c: any) => {
        let dbEmp: any = null;

        if (c.employeeNumber) {
          dbEmp = allEmployeesDB.find((e: any) => e.employeeNumber === c.employeeNumber);
        }
        if (!dbEmp) {
          const empId = c.employeeId || c.id;
          dbEmp = allEmployeesDB.find((e: any) => e.id === empId);
        }

        const result = {
          ...c,
          id: c.id || c.employeeId,
          employeeNumber: c.employeeNumber,
          employeeName: c.employeeName || c.name || 'Unknown',
          desiredDept: c.desiredDept,
          tags: c.tags || [],
          salesForce: c.salesForce ?? 0,
          managementForce: c.managementForce ?? 0,
          explorationForce: c.explorationForce ?? 0,
          developmentForce: c.developmentForce ?? 0,
          laborCost: c.laborCost ?? 0,
          score: c.score ?? 0,
          skills: c.skills || [],
          isExecutiveCandidate: ((c.managementForce || 0) >= 70 && (c.developmentForce || 0) >= 70)
        };
        return result;
      });

      const state = calculateDepartmentState(dbDept, allocatedEmployees);

      const resultObj = {
        departmentId: dbDept.id,
        departmentName: dbDept.name,
        allocatedCount: state.allocatedCount,
        minHeadcount: dbDept.minHeadcount ?? 0,
        optimalHeadcount: dbDept.optimalHeadcount ?? 0,
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
          employeeNumber: emp.employeeNumber,
          employeeName: emp.employeeName || emp.name || emp.id || emp.employeeId || 'Unknown',
          score: emp.score || 0,
          skills: emp.skills,
          desiredDept: emp.desiredDept,
          salesForce: emp.salesForce,
          managementForce: emp.managementForce,
          explorationForce: emp.explorationForce,
          developmentForce: emp.developmentForce,
          laborCost: emp.laborCost,
          tags: emp.tags || calculateTags(emp),
          isExecutiveCandidate: isAdminUser ? ((emp.managementForce || 0) >= 70 && (emp.developmentForce || 0) >= 70) : false
        })).sort((a: any, b: any) => (Number(a.employeeId) || 0) - (Number(b.employeeId) || 0))
      };

      results.push(resultObj);
      totalCompanyRevenue += Math.round(resultObj.finalRevenue);
      totalCompanyCost += resultObj.totalCost;
      totalCompanyProfit += resultObj.profit;
    }

    res.json({
      results,
      totalCompanyRevenue,
      totalCompanyCost,
      totalCompanyProfit
    });
  } catch (error) {
    console.error('--- RECALCULATE ERROR ---', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/save', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { results, totalCompanyRevenue, totalCompanyProfit } = req.body;
    const executedBy = req.user?.email || 'Unknown';

    // 1. 会社全体のシミュレーション履歴を保存
    const simResult = await prisma.simulationResult.create({
      data: {
        totalRevenue: totalCompanyRevenue || 0,
        totalProfit: totalCompanyProfit || 0,
        executedBy: executedBy,
        details: results,
      }
    });

    // 2. req.body.results をループし、各 candidates について以下を実行
    for (const dept of results) {
      for (const cand of dept.candidates) {
        // 3. employeeNumber または id で Employee を検索
        let dbEmp = null;

        if (cand.employeeNumber) {
          dbEmp = await prisma.employee.findUnique({
            where: { employeeNumber: cand.employeeNumber }
          });
        }

        if (!dbEmp && cand.employeeId) {
          dbEmp = await prisma.employee.findUnique({
            where: { id: String(cand.employeeId) }
          });
        }

        // 見つかった場合、配置を処理
        if (dbEmp) {
          // 4. 重複エラー（P2002）を防ぐため、その社員の過去の Allocation をすべて削除してリセット
          await prisma.allocation.deleteMany({
            where: {
              employeeId: dbEmp.id
            }
          });

          // 5. prisma.allocation.create で新規作成
          const topSkill = cand.tags?.[0] || '総合的な能力';
          const reason = `${dept.departmentName}の求める要件に対し、あなたの「${topSkill}」が高く評価されました。事業部の利益への高い貢献が期待されています。`;

          await prisma.allocation.create({
            data: {
              employeeId: dbEmp.id,
              departmentId: dept.departmentId,
              status: 'ASSIGNED',
              reason: reason,
            }
          });

          // 社員の現在の所属テキストも更新しておく
          await prisma.employee.update({
            where: { id: dbEmp.id },
            data: { currentDept: dept.departmentName }
          });
        }
      }
    }

    res.json({ success: true, message: 'Simulation saved successfully', id: simResult.id });
  } catch (error) {
    console.error('--- SAVE ERROR ---', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: req.user.id }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const allocations = await prisma.allocation.findMany({
      where: { employeeId: employee.id },
      include: { department: true },
      orderBy: { createdAt: 'desc' }
    });

    res.json(allocations);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;