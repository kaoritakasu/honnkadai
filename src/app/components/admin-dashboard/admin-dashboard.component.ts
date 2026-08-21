import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  Array = Array;
  dashboard = signal<any>(null);
  departments = signal<any[]>([]);
  employees = signal<any[]>([]);
  simulationResults = signal<any>(null);
  simulationSummary = signal<any>(null);
  selectedDepartments = signal<string[]>([]);
  pasteDataText = '';
  loading = signal(false);
  activeTab = signal('dashboard');
  error = signal('');
  newDepartmentName: string = '';
  editingDeptId: string | null = null;
  placementSimulationResults: any[] = [];
  selectedDepartment: string = '';
  pastedExcelData: string = '';

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadDashboard();
    this.loadDepartments();
    this.loadEmployees();
  }

  loadDashboard() {
    this.apiService.getDashboard().subscribe({
      next: (data: any) => this.dashboard.set(data),
      error: (error: any) => this.error.set(error.error?.error || 'Failed to load dashboard')
    });
  }

  loadDepartments() {
    this.apiService.getDepartments().subscribe({
      next: (data: any[]) => {
        const deptWithPenalty = data.map((dept: any) => ({
          ...dept,
          shortagePenalty: dept.shortagePenalty && Array.isArray(dept.shortagePenalty) ? dept.shortagePenalty : []
        }));
        this.departments.set(deptWithPenalty);
        this.selectedDepartments.set(deptWithPenalty.map((dept: any) => dept.id));
      },
      error: (error: any) => this.error.set(error.error?.error || 'Failed to load departments')
    });
  }

  loadEmployees() {
    this.apiService.getAllEmployees().subscribe({
      next: (data: any) => {
        let employeesArray: any[] = [];
        if (Array.isArray(data)) {
          employeesArray = data;
        } else if (data && typeof data === 'object' && data.employees && Array.isArray(data.employees)) {
          employeesArray = data.employees;
        } else if (data && typeof data === 'object' && data.data && Array.isArray(data.data)) {
          employeesArray = data.data;
        }
        this.employees.set(employeesArray);
      },
      error: (error: any) => this.error.set(error.error?.error || 'Failed to load employees')
    });
  }

  toggleDepartment(deptId: string) {
    const current = this.selectedDepartments();
    if (current.includes(deptId)) {
      this.selectedDepartments.set(current.filter(id => id !== deptId));
    } else {
      this.selectedDepartments.set([...current, deptId]);
    }
  }

  runMultiDepartmentSimulation() {
    if (!this.selectedDepartments() || this.selectedDepartments().length === 0) {
      this.error.set('Please select at least one department');
      return;
    }

    this.loading.set(true);
    this.apiService.simulateMultiDepartment(this.selectedDepartments()).subscribe({
      next: (data: any) => {
        if (data && data.results && Array.isArray(data.results)) {
          const enrichedResults = this.enrichWithMyPageData(data.results);
          this.simulationResults.set(enrichedResults.map((result: any) => ({
            ...result,
            cost: result.totalCost
          })));
          this.simulationSummary.set({
            totalCompanyRevenue: data.totalCompanyRevenue,
            totalCompanyCost: data.totalCompanyCost,
            totalCompanyProfit: data.totalCompanyProfit
          });
        } else {
          this.simulationResults.set(data);
          this.simulationSummary.set(null);
        }
        this.loading.set(false);
      },
      error: (error: any) => {
        this.error.set(error.error?.error || 'Multi-department simulation failed');
        this.loading.set(false);
      }
    });
  }

  runSimulation() {
    if (!this.selectedDepartments() || this.selectedDepartments().length === 0) {
      this.error.set('Please select at least one department');
      return;
    }

    this.loading.set(true);
    this.apiService.simulateAllocation(this.selectedDepartments()[0], 1).subscribe({
      next: (data: any) => {
        const enrichedData = this.enrichWithMyPageData(data);
        const mappedData = {
          ...enrichedData,
          allocatedCount: enrichedData.candidates ? enrichedData.candidates.length : 0,
          cost: enrichedData.totalCost || 0
        };
        this.simulationResults.set(mappedData);
        this.simulationSummary.set(null);
        this.loading.set(false);
      },
      error: (error: any) => {
        this.error.set(error.error?.error || 'Simulation failed');
        this.loading.set(false);
      }
    });
  }

  runBatchSimulation() {
    if (!this.pasteDataText.trim()) {
      this.error.set('Please paste data');
      return;
    }

    const parsed = this.parseTsvData(this.pasteDataText);
    if (!parsed || parsed.length === 0) {
      this.error.set('Invalid data format');
      return;
    }

    this.loading.set(true);
    this.apiService.simulateBatchAllocation(parsed).subscribe({
      next: (data: any) => {
        if (data && data.results && Array.isArray(data.results)) {
          const enrichedResults = this.enrichWithMyPageData(data.results);
          this.simulationResults.set(enrichedResults.map((result: any) => ({
            ...result,
            cost: result.totalCost
          })));
        } else {
          this.simulationResults.set(data);
        }
        this.loading.set(false);
        this.pasteDataText = '';
      },
      error: (error: any) => {
        this.error.set(error.error?.error || 'Batch simulation failed');
        this.loading.set(false);
      }
    });
  }

  private parseTsvData(text: string): Array<{ employeeId: number; score: number; desiredDept: string }> {
    const lines = text.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split('\t').map(h => h.toLowerCase().trim());
    const employeeIdIdx = headers.indexOf('employeeid');
    const scoreIdx = headers.indexOf('score');
    const deptIdx = headers.indexOf('desireddept');

    if (employeeIdIdx === -1 || scoreIdx === -1 || deptIdx === -1) {
      return [];
    }

    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      if (cols.length > Math.max(employeeIdIdx, scoreIdx, deptIdx)) {
        data.push({
          employeeId: parseInt(cols[employeeIdIdx].trim(), 10),
          score: parseInt(cols[scoreIdx].trim(), 10),
          desiredDept: cols[deptIdx].trim()
        });
      }
    }
    return data;
  }

  private parsePastedData(): Array<{
    employeeId: string;
    employeeNumber?: string;
    salesForce: number;
    managementForce: number;
    explorationForce: number;
    developmentForce: number;
    laborCost: number;
  }> {
    const lines = this.pasteDataText.trim().split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) {
      return [];
    }

    const headers = lines[0].split(/[,\t]+/).map(h => h.toLowerCase().trim());
    const employeeNumberIdx = headers.indexOf('社員番号');
    const employeeIdIdx = headers.indexOf('社員id') >= 0 ? headers.indexOf('社員id') : 0;
    const salesForceIdx = headers.indexOf('営業力') >= 0 ? headers.indexOf('営業力') : 1;
    const managementForceIdx = headers.indexOf('管理力') >= 0 ? headers.indexOf('管理力') : 2;
    const explorationForceIdx = headers.indexOf('開拓力') >= 0 ? headers.indexOf('開拓力') : 3;
    const developmentForceIdx = headers.indexOf('育成力') >= 0 ? headers.indexOf('育成力') : 4;
    const laborCostIdx = headers.indexOf('人件費') >= 0 ? headers.indexOf('人件費') : 5;

    const parsedEmployees: Array<{
      employeeId: string;
      employeeNumber?: string;
      salesForce: number;
      managementForce: number;
      explorationForce: number;
      developmentForce: number;
      laborCost: number;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,\t]+/).map(v => v.trim());

      if (values.length >= Math.max(employeeIdIdx, salesForceIdx, managementForceIdx, explorationForceIdx, developmentForceIdx, laborCostIdx)) {
        const employeeId = values[employeeIdIdx];
        const employeeNumber = employeeNumberIdx >= 0 ? values[employeeNumberIdx] : undefined;
        const salesForce = Number(values[salesForceIdx]) || 0;
        const managementForce = Number(values[managementForceIdx]) || 0;
        const explorationForce = Number(values[explorationForceIdx]) || 0;
        const developmentForce = Number(values[developmentForceIdx]) || 0;
        const laborCost = Number(values[laborCostIdx]) || 0;

        const emp: any = {
          employeeId,
          salesForce,
          managementForce,
          explorationForce,
          developmentForce,
          laborCost
        };

        if (employeeNumber) {
          emp.employeeNumber = employeeNumber;
        }

        parsedEmployees.push(emp);
      }
    }
    return parsedEmployees;
  }

  runPastedDataSimulation() {
    if (!this.pasteDataText.trim()) {
      this.error.set('Please paste data');
      return;
    }

    const parsed = this.parsePastedData();
    if (!parsed || parsed.length === 0) {
      this.error.set('Invalid data format');
      return;
    }

    const convertedData = parsed.map((emp: any) => {
      const data: any = {
        employeeId: typeof emp.employeeId === 'string' ? parseInt(emp.employeeId.replace(/\D/g, '')) || 0 : emp.employeeId,
        salesForce: emp.salesForce,
        managementForce: emp.managementForce,
        explorationForce: emp.explorationForce,
        developmentForce: emp.developmentForce,
        laborCost: emp.laborCost
      };
      if (emp.employeeNumber) {
        data.employeeNumber = emp.employeeNumber;
      }
      return data;
    });

    this.loading.set(true);
    this.apiService.simulateBatchAllocation(convertedData).subscribe({
      next: (data: any) => {
        if (data && data.results && Array.isArray(data.results)) {
          const enrichedResults = this.enrichWithMyPageData(data.results);
          this.simulationResults.set(enrichedResults.map((result: any) => ({
            ...result,
            cost: result.totalCost
          })));
          this.simulationSummary.set({
            totalCompanyRevenue: data.totalCompanyRevenue,
            totalCompanyCost: data.totalCompanyCost,
            totalCompanyProfit: data.totalCompanyProfit
          });
        } else {
          this.simulationResults.set(data);
          this.simulationSummary.set(null);
        }
        this.loading.set(false);
        this.pasteDataText = '';
      },
      error: (error: any) => {
        this.error.set(error.error?.error || 'Simulation failed');
        this.loading.set(false);
      }
    });
  }

  addDepartment() {
    if (!this.newDepartmentName.trim()) {
      this.error.set('部署名を入力してください');
      return;
    }

    this.apiService.createDepartment({
      name: this.newDepartmentName,
      requiredSkills: '',
      requiredScore: 0,
      expectedRevenue: 0
    }).subscribe({
      next: (data: any) => {
        const currentDepts = this.departments();
        this.departments.set([...currentDepts, { ...data, shortagePenalty: [] }]);
        this.newDepartmentName = '';
        this.error.set('');
        this.loadDashboard();
      },
      error: (error: any) => {
        this.error.set(error.error?.error || 'Failed to create department');
      }
    });
  }

  addPenaltyRule(department: any) {
    if (!Array.isArray(department.shortagePenalty)) {
      department.shortagePenalty = [];
    }
    department.shortagePenalty.push({ threshold: 100, condition: 'over', factor: 1.0 });
  }

  removePenaltyRule(department: any, index: number) {
    if (Array.isArray(department.shortagePenalty)) {
      department.shortagePenalty.splice(index, 1);
    }
  }

  startEdit(deptId: string) {
    this.editingDeptId = deptId;
  }

  cancelEdit() {
    this.editingDeptId = null;
  }

  updateDepartment(department: any) {
    this.apiService.updateDepartment(department.id, {
      name: department.name || null,
      status: department.status || null,
      description: department.description || null,
      optimalHeadcount: department.optimalHeadcount ? Number(department.optimalHeadcount) : null,
      minHeadcount: department.minHeadcount ? Number(department.minHeadcount) : null,
      weightSales: department.weightSales ? Number(department.weightSales) : null,
      weightManagement: department.weightManagement ? Number(department.weightManagement) : null,
      weightExploration: department.weightExploration ? Number(department.weightExploration) : null,
      weightDevelopment: department.weightDevelopment ? Number(department.weightDevelopment) : null,
      baseRevenue: department.baseRevenue ? Number(department.baseRevenue) : null,
      growthFactor: department.growthFactor ? Number(department.growthFactor) : null,
      shortagePenalty: Array.isArray(department.shortagePenalty) ? department.shortagePenalty : null
    }).subscribe({
      next: () => {
        alert('部署を更新しました');
        this.error.set('');
        this.editingDeptId = null;
        this.loadDepartments();
      },
      error: (err: any) => {
        this.error.set('部署の更新に失敗しました');
      }
    });
  }

  allocateCandidate(employeeId: string, departmentId: string, reason: string) {
    this.apiService.createAllocation(
      employeeId,
      departmentId,
      reason || 'Allocated based on skill match and performance score',
      'Continue developing technical skills and soft skills for better team collaboration'
    ).subscribe({
      next: () => {
        this.error.set('Allocation created successfully');
        setTimeout(() => {
          this.loadDashboard();
          this.simulationResults.set(null);
        }, 1000);
      },
      error: (error: any) => {
        this.error.set(error.error?.error || 'Failed to create allocation');
      }
    });
  }

  deleteDepartment(deptId: string) {
    if (!confirm('本当にこの部署を削除してよろしいですか？')) return;
    this.loading.set(true);
    this.apiService.deleteDepartment(deptId).subscribe({
      next: () => {
        this.error.set('部署を削除しました');
        this.loading.set(false);
        this.loadDepartments();
        this.loadDashboard();
      },
      error: (error: any) => {
        this.error.set(error.error?.error || '部署の削除に失敗しました');
        this.loading.set(false);
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }


  private enrichWithMyPageData(results: any): any {
    const dbEmployees = this.employees(); // 取得済みの全社員データ

    const enrich = (candidates: any[]) => {
      if (!candidates) return;
      candidates.forEach(cand => {
        // データ側の社員番号をキーにしてマイページのデータを検索
        const match = dbEmployees.find(e => e.employeeNumber && e.employeeNumber === cand.employeeNumber);

        if (match) {
          // 氏名はマイページ（DB）のものを優先して上書き
          cand.employeeName = match.user?.name || match.name || cand.employeeName;
          
          // ★修正：どれかの名前でデータが入っていれば確実にキャッチする
          cand.desiredDept = match.desiredDept || match.careerDesire || match.careerGoals;
          cand.isExecutiveCandidate = match.isExecutiveCandidate;
        }
      });
    };

    if (Array.isArray(results)) {
      results.forEach(r => enrich(r.candidates));
    } else if (results && results.candidates) {
      enrich(results.candidates);
    }
    return results;
  }

  parseExcelData() {
    if (!this.pastedExcelData.trim()) {
      this.error.set('データを貼り付けてください');
      return;
    }

    const lines = this.pastedExcelData.trim().split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      this.error.set('最低でもヘッダー行とデータ行が必要です');
      return;
    }

    const headers = lines[0].split(/[,\t]+/).map(h => h.toLowerCase().trim());
    const employeeNumberIdx = headers.findIndex(h => h.includes('社員番号') || h.includes('employee'));
    const salesForceIdx = headers.findIndex(h => h.includes('営業力') || h.includes('sales'));
    const managementForceIdx = headers.findIndex(h => h.includes('管理力') || h.includes('management'));
    const explorationForceIdx = headers.findIndex(h => h.includes('開拓力') || h.includes('exploration'));
    const developmentForceIdx = headers.findIndex(h => h.includes('育成力') || h.includes('development'));
    const laborCostIdx = headers.findIndex(h => h.includes('人件費') || h.includes('cost'));

    const results: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,\t]+/).map(v => v.trim());

      const employeeNumber = employeeNumberIdx >= 0 ? values[employeeNumberIdx] : '';
      const salesForce = Number(values[salesForceIdx] || 0);
      const managementForce = Number(values[managementForceIdx] || 0);
      const explorationForce = Number(values[explorationForceIdx] || 0);
      const developmentForce = Number(values[developmentForceIdx] || 0);
      const laborCost = Number(values[laborCostIdx] || 0);

      const matchScore = (salesForce + managementForce + explorationForce + developmentForce) / 4;

      results.push({
        employeeNumber,
        salesForce,
        managementForce,
        explorationForce,
        developmentForce,
        laborCost,
        matchScore
      });
    }

    this.placementSimulationResults = results;
    this.error.set('');
  }

  confirmPlacement() {
    if (!this.selectedDepartment) {
      this.error.set('部署を選択してください');
      return;
    }

    if (!this.placementSimulationResults || this.placementSimulationResults.length === 0) {
      this.error.set('配置データが存在しません');
      return;
    }

    this.loading.set(true);
    const placementData = {
      departmentId: this.selectedDepartment,
      employees: this.placementSimulationResults.map(r => ({
        employeeNumber: r.employeeNumber,
        salesForce: r.salesForce,
        managementForce: r.managementForce,
        explorationForce: r.explorationForce,
        developmentForce: r.developmentForce,
        laborCost: r.laborCost
      }))
    };

    this.apiService.confirmPlacement(placementData).subscribe({
      next: () => {
        alert('配置を確定しました');
        this.placementSimulationResults = [];
        this.selectedDepartment = '';
        this.pastedExcelData = '';
        this.error.set('');
        this.loading.set(false);
        this.loadDashboard();
      },
      error: (error: any) => {
        this.error.set(error.error?.error || '配置の確定に失敗しました');
        this.loading.set(false);
      }
    });
  }
}