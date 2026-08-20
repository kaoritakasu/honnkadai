import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CdkDragDrop, moveItemInArray, transferArrayItem, DragDropModule } from '@angular/cdk/drag-drop';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
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
  adjustedAllocations: Map<string, string> = new Map();
  newCandidates: any[] = [];
  dropListIds: string[] = [];
  filterTexts: { [key: string]: string } = {};
  filterInputs: { [key: string]: string } = {};
  activeFilters: { [key: string]: string } = {};

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
          this.simulationResults.set(data.results.map((result: any) => ({
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
        this.updateDropListIds();
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
        const mappedData = {
          ...data,
          allocatedCount: data.candidates ? data.candidates.length : 0,
          cost: data.totalCost || 0
        };
        this.simulationResults.set(mappedData);
        this.simulationSummary.set(null);
        this.updateDropListIds();
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
          this.simulationResults.set(data.results.map((result: any) => ({
            ...result,
            cost: result.totalCost
          })));
        } else {
          this.simulationResults.set(data);
        }
        this.updateDropListIds();
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

    const convertedData = parsed.map((emp: any) => ({
      employeeId: typeof emp.employeeId === 'string' ? parseInt(emp.employeeId.replace(/\D/g, '')) || 0 : emp.employeeId,
      salesForce: emp.salesForce,
      managementForce: emp.managementForce,
      explorationForce: emp.explorationForce,
      developmentForce: emp.developmentForce,
      laborCost: emp.laborCost
    }));

    this.loading.set(true);
    this.apiService.simulateBatchAllocation(convertedData).subscribe({
      next: (data: any) => {
        if (data && data.results && Array.isArray(data.results)) {
          this.simulationResults.set(data.results.map((result: any) => ({
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
        this.updateDropListIds();
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

  drop(event: CdkDragDrop<any[]>) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }

    const currentResults = this.simulationResults();
    if (currentResults && Array.isArray(currentResults)) {
      // オプティミスティックUI更新：移動した社員のコストを計算
     const movedEmployee = event.container.data[event.currentIndex];
console.log('🎯 移動した社員:', movedEmployee); // ← これを追加！
const empCost = (Number(movedEmployee?.laborCost) || 0) * 1000000;

      // シグナルの値を複製して更新
      const updatedResults = currentResults.map((r: any) => ({ ...r }));

      // 移動元部署を特定
      const previousContainerIndex = currentResults.findIndex((r: any) => r.candidates === event.previousContainer.data);
      // 移動先部署を特定
      const currentContainerIndex = currentResults.findIndex((r: any) => r.candidates === event.container.data);

      // コストと利益をリアルタイム更新
      if (previousContainerIndex >= 0) {
        updatedResults[previousContainerIndex].cost = (updatedResults[previousContainerIndex].cost || 0) - empCost;
        updatedResults[previousContainerIndex].profit = (updatedResults[previousContainerIndex].profit || 0) + empCost;
      }
      if (currentContainerIndex >= 0 && previousContainerIndex !== currentContainerIndex) {
        updatedResults[currentContainerIndex].cost = (updatedResults[currentContainerIndex].cost || 0) + empCost;
        updatedResults[currentContainerIndex].profit = (updatedResults[currentContainerIndex].profit || 0) - empCost;
      }

      // シグナルを更新して画面に反映
      this.simulationResults.set(updatedResults);

      // APIで正確な値を取得
      this.apiService.recalculate({ data: currentResults }).subscribe({
        next: (data: any) => {
          if (data && data.results) {
            const finalResults = data.results.map((result: any) => ({
              ...result,
              cost: result.totalCost
            }));
            this.simulationResults.set(finalResults);

            if (data.totalCompanyRevenue !== undefined) {
              this.simulationSummary.set({
                totalCompanyRevenue: data.totalCompanyRevenue,
                totalCompanyCost: data.totalCompanyCost,
                totalCompanyProfit: data.totalCompanyProfit
              });
            }
            this.updateDropListIds();
          }
        },
        error: (err: any) => {
          console.error('再計算エラー:', err);
          this.error.set('再計算に失敗しました');
        }
      });
    }
  }

  updateDropListIds() {
    const results = this.simulationResults();
    if (Array.isArray(results)) {
      this.dropListIds = results.map((_, i) => `dropList_${i}`);
    }
  }

  addNewCandidate() {
    const newEmployee = {
      employeeId: 'NEW_' + Date.now(),
      employeeName: '新規人材',
      score: 50,
      matchScore: 0,
      departmentId: '',
      departmentName: '',
      isNew: true,
      skills: [],
      desiredDept: ''
    };
    this.newCandidates.push(newEmployee);
  }

  removeCandidate(index: number) {
    this.newCandidates.splice(index, 1);
    this.recalculateResults();
  }

  reassignCandidate(candidate: any, toDept: string) {
    if (candidate.isNew) {
      candidate.departmentId = toDept;
      const deptName = this.departments().find((d: any) => d.id === toDept)?.name || '';
      candidate.departmentName = deptName;
    } else {
      this.adjustedAllocations.set(candidate.employeeId, toDept);
      candidate.departmentId = toDept;
      const deptName = this.departments().find((d: any) => d.id === toDept)?.name || '';
      candidate.departmentName = deptName;
    }
    this.recalculateResults();
  }

  updateCandidateDepartment(candidate: any, deptId: string) {
    candidate.departmentId = deptId;
    const deptName = this.departments().find((d: any) => d.id === deptId)?.name || '';
    candidate.departmentName = deptName;
  }

  private recalculateResults() {
    const currentResults = this.simulationResults();
    if (!currentResults || !Array.isArray(currentResults)) return;

    this.loading.set(true);
    this.apiService.recalculateSimulation({ results: currentResults }).subscribe({
      next: (data: any) => {
        if (data && data.results && Array.isArray(data.results)) {
          this.simulationResults.set(data.results.map((result: any) => ({
            ...result,
            cost: result.totalCost
          })));
          if (data.totalCompanyRevenue !== undefined) {
            this.simulationSummary.set({
              totalCompanyRevenue: data.totalCompanyRevenue,
              totalCompanyCost: data.totalCompanyCost,
              totalCompanyProfit: data.totalCompanyProfit
            });
          }
          this.updateDropListIds();
        }
        this.loading.set(false);
      },
      error: (error: any) => {
        this.error.set(error.error?.error || 'Failed to recalculate results');
        this.loading.set(false);
      }
    });
  }

  resetAdjustments() {
    this.adjustedAllocations.clear();
    this.newCandidates = [];
    this.loadDashboard();
  }

  isMatch(emp: any, filterText?: string): boolean {
    if (!filterText) return true;
    const lowerFilter = String(filterText).toLowerCase().trim();

    if (lowerFilter === '幹部候補') return !!emp.isExecutiveCandidate;

    const tags = Array.isArray(emp.tags) ? emp.tags : [];
    if (tags.some((tag: string) => typeof tag === 'string' && tag.toLowerCase().includes(lowerFilter))) {
      return true;
    }

    const empName = String(emp.employeeName || '');
    return empName.toLowerCase().includes(lowerFilter);
  }

  updateFilter(deptId: string, value: string) {
    this.filterInputs = { ...this.filterInputs, [deptId]: value };
  }

  applyFilter(deptId: string) {
    const filterValue = this.filterInputs[deptId] || '';
    this.activeFilters = { ...this.activeFilters, [deptId]: filterValue };
  }

  sortCandidates(candidates: any[], event: any) {
    const sortKey = event.target.value;
    if (!sortKey) return;

    candidates.sort((a: any, b: any) => {
      const aVal = a[sortKey] || 0;
      const bVal = b[sortKey] || 0;
      return bVal - aVal;
    });
  }
}