import express, { Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest, isAdmin } from '../middleware/auth';


const router: Router = express.Router();
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
  // CSVから読み込んだ4つの能力値
  const sales = employee.salesForce || 0;
  const management = employee.managementForce || 0;
  const exploration = employee.explorationForce || 0;
  const development = employee.developmentForce || 0;

  // 事業部側に設定されている各能力の重み（未設定の場合は0）
  const weightSales = department.weightSales || 0;
  const weightManagement = department.weightManagement || 0;
  const weightExploration = department.weightExploration || 0;
  const weightDevelopment = department.weightDevelopment || 0;

  // 【課題仕様】社員貢献度 = 営業力×w + 管理力×w + 開拓力×w + 育成力×w
  const score =
    (sales * weightSales) +
    (management * weightManagement) +
    (exploration * weightExploration) +
    (development * weightDevelopment);

  return score;
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

// 社員を部署に追加した場合の売上変化（Delta Revenue）を計算
const calculateDeltaRevenue = (
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

  return newState.finalRevenue - currentState.finalRevenue;
};

// 【新】2段階配置アルゴリズム
const calculateTwoPhaseAllocation = (
  allEmployees: any[],
  departments: any[],
  simulationMode?: string
): Map<string, any[]> => {
  const allocations = new Map<string, any[]>();
  departments.forEach(dept => allocations.set(dept.id, []));
  const allocatedEmployeeKeys = new Set<string>();

  // フェーズ1: 最低配置人数の確実な確保
  const employeesByDepartment: { [deptId: string]: any[] } = {};

  for (const dept of departments) {
    const deptId = dept.id;
    const minHeadcount = dept.minHeadcount ?? 0;

    // この部門への適性スコアでソート
    const empScores = allEmployees
      .filter(emp => !allocatedEmployeeKeys.has(emp.employeeNumber || String(emp.id)))
      .map(emp => ({
        employee: emp,
        matchScore: calculateMatchScore(emp, dept)
      }))
      .sort((a, b) => b.matchScore - a.matchScore);

    // 最低配置人数を割り当て
    for (let i = 0; i < minHeadcount && i < empScores.length; i++) {
      const deptAllocations = allocations.get(deptId) || [];
      deptAllocations.push(empScores[i].employee);
      allocations.set(deptId, deptAllocations);
      allocatedEmployeeKeys.add(empScores[i].employee.employeeNumber || String(empScores[i].employee.id));
    }
  }

  // フェーズ2: 残り人員の戦略的最適化（限界効用で配置）
  let improved = true;
  while (improved && allocatedEmployeeKeys.size < allEmployees.length) {
    improved = false;
    let bestDeltaScore = -Infinity;
    let bestEmployeeKey: string | null = null;
    let bestDepartmentId: string | null = null;

    // 未配置の全社員を検討
    for (const emp of allEmployees) {
      if (allocatedEmployeeKeys.has(emp.employeeNumber || String(emp.id))) continue;

      // 各部門への追加配置での限界効用を計算
      for (const dept of departments) {
        const currentAllocations = allocations.get(dept.id) || [];
        const optimalHeadcount = dept.optimalHeadcount ?? 0;

        // 最適人数未満の場合のみ候補として検討
        if (currentAllocations.length >= optimalHeadcount) continue;

       // シミュレーションモードに応じた限界効用（スコア）計算
        let deltaScore = -999999;
        const deptName = dept.name || '';

        if (simulationMode === 'task1' || simulationMode === 'additional') {
          // 課題1・追加課題：全社売上最大化
          deltaScore = calculateDeltaRevenue(dept, currentAllocations, emp);
          
        } else if (simulationMode === 'task2') {
          // 課題2：A事業部（飽和）の利益最大化
          if (deptName.includes('A') || deptName.includes('飽和')) {
            deltaScore = calculateDeltaProfit(dept, currentAllocations, emp);
          }
          
        } else if (simulationMode === 'task3') {
          // 課題3：B事業部（成長）の売上最大化
          if (deptName.includes('B') || deptName.includes('成長')) {
            deltaScore = calculateDeltaRevenue(dept, currentAllocations, emp);
          }
          
        } else if (simulationMode === 'task4') {
          // 課題4：C事業部（新規）の売上最大化
          if (deptName.includes('C') || deptName.includes('新規')) {
            deltaScore = calculateDeltaRevenue(dept, currentAllocations, emp);
          }
          
        } else {
          // デフォルト（全社バランス）：利益への貢献度
          deltaScore = calculateDeltaProfit(dept, currentAllocations, emp);
        }

        // 部門の重み付けを考慮
        const deptWeight = (dept.weightSales ?? 0) + (dept.weightManagement ?? 0) +
                          (dept.weightExploration ?? 0) + (dept.weightDevelopment ?? 0);
        deltaScore = deltaScore * Math.max(1, deptWeight);

        if (deltaScore > bestDeltaScore) {
          bestDeltaScore = deltaScore;
          bestEmployeeKey = emp.employeeNumber || String(emp.id);
          bestDepartmentId = dept.id;
        }
      }
    }

    if (bestEmployeeKey && bestDepartmentId) {
      const emp = allEmployees.find(e => (e.employeeNumber || String(e.id)) === bestEmployeeKey);
      const deptAllocations = allocations.get(bestDepartmentId) || [];
      deptAllocations.push(emp!);
      allocations.set(bestDepartmentId, deptAllocations);
      allocatedEmployeeKeys.add(bestEmployeeKey);
      improved = true;
    }
  }

  // 強制割り当てフェーズ: 残りの未配置社員を配置
  for (const emp of allEmployees) {
    if (!allocatedEmployeeKeys.has(emp.employeeNumber || String(emp.id))) {
      // 最低配置人数に達していない部門へ優先割り当て
      let targetDept: string | null = null;
      for (const dept of departments) {
        const currentAllocations = allocations.get(dept.id) || [];
        const minHeadcount = dept.minHeadcount ?? 0;
        if (currentAllocations.length < minHeadcount) {
          targetDept = dept.id;
          break;
        }
      }

      // 最低配置人数に達している場合は最も人員が少ない部門へ
      if (!targetDept) {
        let minAllocations = Infinity;
        for (const dept of departments) {
          const currentAllocations = allocations.get(dept.id) || [];
          if (currentAllocations.length < minAllocations) {
            minAllocations = currentAllocations.length;
            targetDept = dept.id;
          }
        }
      }

      if (targetDept) {
        const deptAllocations = allocations.get(targetDept) || [];
        deptAllocations.push(emp);
        allocations.set(targetDept, deptAllocations);
        allocatedEmployeeKeys.add(emp.employeeNumber || String(emp.id));
      }
    }
  }

  return allocations;
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
        laborCost: emp.laborCost !== undefined && emp.laborCost !== null ? emp.laborCost : (emp.isNew ? 5.0 : 0),
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

    const minHeadcountValue = Math.max(department.minHeadcount ?? 0, 1);

    // minHeadcount未満の候補者はスコア順、minHeadcount以上の候補者は利益順でソート
    const belowMinCandidates = candidatesWithDeltaProfit.slice(0, minHeadcountValue);
    belowMinCandidates.sort((a, b) => b.matchScore - a.matchScore);

    const aboveMinCandidates = candidatesWithDeltaProfit.slice(minHeadcountValue);
    aboveMinCandidates.sort((a, b) => b.deltaProfit - a.deltaProfit);

    const allSortedCandidates = [...belowMinCandidates, ...aboveMinCandidates];
    const selectedCandidates = allSortedCandidates.slice(0, optimalHeadcountValue);
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
    const lastYearTotalRevenue = req.body.lastYearTotalRevenue || 0;

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

    // 配置前の基準となる全社売上を計算
    let baselineCompanyRevenue = departments.reduce(
      (sum, dept) => sum + (dept.baseRevenue ?? 0),
      0
    );
    if (lastYearTotalRevenue && lastYearTotalRevenue > 0) {
      baselineCompanyRevenue = lastYearTotalRevenue;
    }

    // 2段階配置アルゴリズムを使用
    const simulationMode = req.body.simulationMode;
    const allocations = calculateTwoPhaseAllocation(allEmployees, departments, simulationMode);

    // 最終チェック：最低配置人数の制約を満たしているか検証
    for (const dept of departments) {
      const allocatedEmployees = allocations.get(dept.id) || [];
      const minHeadcount = dept.minHeadcount ?? 0;
      if (allocatedEmployees.length < minHeadcount) {
        console.warn(`WARNING: Department ${dept.name} has ${allocatedEmployees.length} employees but requires minimum ${minHeadcount}`);
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
          const matchScoreForDept = calculateMatchScore(emp, department);
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

    let constraintViolation = false;
    if (lastYearTotalRevenue && lastYearTotalRevenue > 0 && totalCompanyRevenue < lastYearTotalRevenue) {
      constraintViolation = true;
    }

    res.json({
      results: results.map((r: any) => ({
        ...r,
        cost: r.cost || r.totalCost
      })),
      totalCompanyRevenue,
      totalCompanyCost,
      totalCompanyProfit,
      baselineCompanyRevenue: Math.round(baselineCompanyRevenue),
      lastYearTotalRevenue: lastYearTotalRevenue || null,
      constraintViolation
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
    let lastYearTotalRevenue: number = 0;

    if (Array.isArray(req.body)) {
      employees = req.body;
      const allDepts = await prisma.department.findMany();
      departmentIds = allDepts.map(d => d.id);
    } else if (req.body.departmentIds && req.body.employees) {
      departmentIds = req.body.departmentIds;
      employees = req.body.employees;
      lastYearTotalRevenue = req.body.lastYearTotalRevenue || 0;
    } else if (req.body.departmentIds && Array.isArray(req.body.departmentIds)) {
      departmentIds = req.body.departmentIds;
      const allEmps = await prisma.employee.findMany({ include: { user: true } });
      employees = allEmps;
      lastYearTotalRevenue = req.body.lastYearTotalRevenue || 0;
    } else if (Array.isArray(req.body) || (req.body.employees && Array.isArray(req.body.employees))) {
      employees = Array.isArray(req.body) ? req.body : req.body.employees;
      lastYearTotalRevenue = req.body.lastYearTotalRevenue || 0;
      const allDepts = await prisma.department.findMany();
      departmentIds = allDepts.map(d => d.id);
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

    // 配置前の基準となる全社売上を計算（lastYearTotalRevenueが指定されている場合はそちらを使用）
    let baselineCompanyRevenue = departments.reduce(
      (sum, dept) => sum + (dept.baseRevenue ?? 0),
      0
    );
    if (lastYearTotalRevenue && lastYearTotalRevenue > 0) {
      baselineCompanyRevenue = lastYearTotalRevenue;
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
        laborCost: emp.laborCost !== undefined && emp.laborCost !== null ? emp.laborCost : (emp.isNew ? 5.0 : 0),
        score: emp.score ?? 0,
        skills: emp.skills || [],
        isExecutiveCandidate: ((emp.managementForce || 0) >= 70 && (emp.developmentForce || 0) >= 70)
      };
      return result;
    });

    // 2段階配置アルゴリズムを使用
    const simulationMode = req.body.simulationMode;
    const allocations = calculateTwoPhaseAllocation(enrichedEmployees, departments, simulationMode);

    // 最終チェック：最低配置人数の制約を満たしているか検証
    for (const dept of departments) {
      const allocatedEmployees = allocations.get(dept.id) || [];
      const minHeadcount = dept.minHeadcount ?? 0;
      if (allocatedEmployees.length < minHeadcount) {
        console.warn(`WARNING: Department ${dept.name} has ${allocatedEmployees.length} employees but requires minimum ${minHeadcount}`);
      }
    }

    const results = departments.map((department) => {
      const allocatedEmployees = allocations.get(department.id) || [];
      const state = calculateDepartmentState(department, allocatedEmployees);

      return {
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
        cost: Math.round(state.totalCost),
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
    let constraintViolation = false;
    if (lastYearTotalRevenue && lastYearTotalRevenue > 0 && totalCompanyRevenue_Optimized < lastYearTotalRevenue) {
      constraintViolation = true;
    }

    res.json({
      results,
      totalCompanyRevenue: totalCompanyRevenue_Optimized,
      totalCompanyCost: results.reduce((sum, result) => sum + result.totalCost, 0),
      totalCompanyProfit: results.reduce((sum, result) => sum + result.profit, 0),
      baselineCompanyRevenue: Math.round(baselineCompanyRevenue),
      lastYearTotalRevenue: lastYearTotalRevenue || null,
      constraintViolation
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/recalculate', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const isAdminUser = req.user?.role === 'ADMIN';
    let requestedData = req.body.results || req.body.departments || req.body;
    const lastYearTotalRevenue = req.body.lastYearTotalRevenue || 0;

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
    let constraintViolation = false;

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
          laborCost: c.laborCost !== undefined && c.laborCost !== null ? c.laborCost : (c.isNew ? 5.0 : 0),
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
        cost: Math.round(state.totalCost),
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

    // 昨年の全社売上が指定されている場合、制約チェック
    if (lastYearTotalRevenue && lastYearTotalRevenue > 0 && totalCompanyRevenue < lastYearTotalRevenue) {
      constraintViolation = true;
    }

    res.json({
      results,
      totalCompanyRevenue,
      totalCompanyCost,
      totalCompanyProfit,
      lastYearTotalRevenue: lastYearTotalRevenue || null,
      constraintViolation
    });
  } catch (error) {
    console.error('--- RECALCULATE ERROR ---', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/save', authenticate, isAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { results, totalCompanyRevenue, totalCompanyCost, totalCompanyProfit } = req.body;
    const executedBy = req.user?.email || 'Unknown';

    // 1. 会社全体のシミュレーション履歴を保存
    const simResult = await prisma.simulationResult.create({
      data: {
        totalRevenue: totalCompanyRevenue || 0,
        totalCost: totalCompanyCost || 0,
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
            data: {
              currentDept: dept.departmentName,
              laborCost: cand.laborCost !== undefined && cand.laborCost !== null ? cand.laborCost : (dbEmp.laborCost ?? 0)
            }
          });
        } else if (cand.isNew) {
          const newEmp = await prisma.employee.create({
            data: {
              employeeNumber: cand.employeeNumber || `NEW_${Date.now()}`,
              user: {
                create: {
                  email: `new_${Date.now()}@temp.local`,
                  password: '',
                  name: cand.employeeName || 'New Employee',
                  role: 'EMPLOYEE'
                }
              },
              salesForce: cand.salesForce ?? 0,
              managementForce: cand.managementForce ?? 0,
              explorationForce: cand.explorationForce ?? 0,
              developmentForce: cand.developmentForce ?? 0,
              laborCost: cand.laborCost !== undefined && cand.laborCost !== null ? cand.laborCost : 0,
              currentDept: dept.departmentName
            }
          });

          const topSkill = cand.tags?.[0] || '総合的な能力';
          const reason = `${dept.departmentName}の求める要件に対し、あなたの「${topSkill}」が高く評価されました。事業部の利益への高い貢献が期待されています。`;

          await prisma.allocation.create({
            data: {
              employeeId: newEmp.id,
              departmentId: dept.departmentId,
              status: 'ASSIGNED',
              reason: reason,
            }
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

router.get('/my-latest-simulation', authenticate, async (req: AuthRequest, res: Response) => {
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

    console.log('=== /my-latest-simulation DEBUG LOG ===');
    console.log('Employee found:', { id: employee.id, employeeNumber: employee.employeeNumber });

    // Get the latest simulation result
    const latestSimulation = await prisma.simulationResult.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        details: true,
        totalRevenue: true,
        totalCost: true,
        totalProfit: true,
        createdAt: true,
      }
    });

    if (!latestSimulation) {
      return res.status(404).json({ error: 'No simulation history found' });
    }

    // Parse details and find current employee's data
    let results: any = latestSimulation.details;
    if (typeof results === 'string') {
      results = JSON.parse(results);
    }

    console.log('Latest simulation created at:', latestSimulation.createdAt);

    // Find employee in the simulation results
    let employeeData = null;
    let departmentInfo: any = null;
    if (Array.isArray(results)) {
      for (const dept of results) {
        if (dept && typeof dept === 'object' && dept.candidates && Array.isArray(dept.candidates)) {
          console.log(`Checking department: ${dept.departmentName}, candidates count: ${dept.candidates.length}`);

          // Try to find by employeeNumber first, then by id, with normalization
          let found = dept.candidates.find((c: any) => {
            const dbNum = String(employee.employeeNumber || '').trim();
            const candNum = String(c.employeeNumber || '').trim();
            return dbNum && candNum && dbNum === candNum;
          });

          // If not found by employeeNumber, try by id
          if (!found) {
            found = dept.candidates.find((c: any) => {
              return (c.employeeId && c.employeeId === employee.id) ||
                     (c.id && c.id === employee.id);
            });
          }

          // If still not found and we have only one candidate, use it (fallback for single allocation)
          if (!found && dept.candidates.length === 1) {
            found = dept.candidates[0];
          }

          console.log(`Found employee in ${dept.departmentName}:`, found ? 'YES' : 'NO');

          if (found) {
            // Try to get department info from database for complete data
            const deptId = (dept as any).departmentId;
            if (deptId) {
              departmentInfo = await prisma.department.findUnique({
                where: { id: deptId },
                select: {
                  id: true,
                  name: true,
                  weightSales: true,
                  weightManagement: true,
                  weightExploration: true,
                  weightDevelopment: true
                }
              });
            }

            employeeData = {
              ...found,
              department: {
                name: (dept as any).departmentName,
                id: (dept as any).departmentId,
                weightSales: departmentInfo?.weightSales || (dept as any).weightSales,
                weightManagement: departmentInfo?.weightManagement || (dept as any).weightManagement,
                weightExploration: departmentInfo?.weightExploration || (dept as any).weightExploration,
                weightDevelopment: departmentInfo?.weightDevelopment || (dept as any).weightDevelopment
              }
            };
            break;
          }
        }
      }
    }

    res.json({
      simulationId: latestSimulation.id,
      createdAt: latestSimulation.createdAt,
      employeeData: employeeData,
      totalCompanyRevenue: latestSimulation.totalRevenue,
      totalCompanyCost: latestSimulation.totalCost,
      totalCompanyProfit: latestSimulation.totalProfit
    });
  } catch (error) {
    console.error('Error fetching latest simulation:', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;