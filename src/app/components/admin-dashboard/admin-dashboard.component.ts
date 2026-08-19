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
  dashboard = signal<any>(null);
  departments = signal<any[]>([]);
  employees = signal<any[]>([]);
  simulationResults = signal<any>(null);
  selectedDepartment = signal('');
  numPositions = signal(1);
  pasteDataText = '';
  loading = signal(false);
  activeTab = signal('dashboard');
  error = signal('');
  newDepartmentName: string = '';
  editingDeptId: string | null = null;

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
      next: (data) => this.dashboard.set(data),
      error: (error) => this.error.set(error.error?.error || 'Failed to load dashboard')
    });
  }

  loadDepartments() {
    this.apiService.getDepartments().subscribe({
      next: (data) => {
        const deptWithPenalty = data.map((dept: any) => ({
          ...dept,
          shortagePenalty: dept.shortagePenalty && Array.isArray(dept.shortagePenalty) ? dept.shortagePenalty : []
        }));
        this.departments.set(deptWithPenalty);
      },
      error: (error) => this.error.set(error.error?.error || 'Failed to load departments')
    });
  }

  loadEmployees() {
    this.apiService.getAllEmployees().subscribe({
      next: (data) => this.employees.set(data),
      error: (error) => this.error.set(error.error?.error || 'Failed to load employees')
    });
  }

  runSimulation() {
    if (!this.selectedDepartment() || !this.numPositions()) {
      this.error.set('Please select a department and number of positions');
      return;
    }

    this.loading.set(true);
    this.apiService.simulateAllocation(this.selectedDepartment(), this.numPositions()).subscribe({
      next: (data) => {
        this.simulationResults.set(data);
        this.loading.set(false);
      },
      error: (error) => {
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
      next: (data) => {
        this.simulationResults.set(data);
        this.loading.set(false);
        this.pasteDataText = '';
      },
      error: (error) => {
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

    const parsedEmployees: Array<{
      employeeId: string;
      salesForce: number;
      managementForce: number;
      explorationForce: number;
      developmentForce: number;
      laborCost: number;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(/[,\t]+/).map(v => v.trim());

      if (values.length >= 6) {
        const employeeId = values[0];
        const salesForce = Number(values[1]) || 0;
        const managementForce = Number(values[2]) || 0;
        const explorationForce = Number(values[3]) || 0;
        const developmentForce = Number(values[4]) || 0;
        const laborCost = Number(values[5]) || 0;

        parsedEmployees.push({
          employeeId,
          salesForce,
          managementForce,
          explorationForce,
          developmentForce,
          laborCost
        });
      }
    }

    console.log('読み込み成功:', parsedEmployees);
    alert('読み込みました');

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

    const convertedData = parsed.map(emp => ({
      employeeId: typeof emp.employeeId === 'string' ? parseInt(emp.employeeId.replace(/\D/g, '')) || 0 : emp.employeeId,
      salesForce: emp.salesForce,
      managementForce: emp.managementForce,
      explorationForce: emp.explorationForce,
      developmentForce: emp.developmentForce,
      laborCost: emp.laborCost
    }));

    this.loading.set(true);
    this.apiService.simulateBatchAllocation(convertedData).subscribe({
      next: (data) => {
        this.simulationResults.set(data);
        this.loading.set(false);
        this.pasteDataText = '';
      },
      error: (error) => {
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
      next: (data) => {
        const currentDepts = this.departments();
        this.departments.set([...currentDepts, { ...data, shortagePenalty: [] }]);
        this.newDepartmentName = '';
        this.error.set('');
        this.loadDashboard();
      },
      error: (error) => {
        this.error.set(error.error?.error || 'Failed to create department');
      }
    });
  }

  addPenaltyRule(department: any) {
    if (!Array.isArray(department.shortagePenalty)) {
      department.shortagePenalty = [];
    }
    department.shortagePenalty.push({
      threshold: 100,
      condition: 'over',
      factor: 1.0
    });
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
      status: department.status || null,
      description: department.description || null,
      optimalHeadcount: department.optimalHeadcount || null,
      minHeadcount: department.minHeadcount || null,
      weightSales: department.weightSales || null,
      weightManagement: department.weightManagement || null,
      weightExploration: department.weightExploration || null,
      weightDevelopment: department.weightDevelopment || null,
      baseRevenue: department.baseRevenue || null,
      growthFactor: department.growthFactor || null,
      shortagePenalty: Array.isArray(department.shortagePenalty) ? department.shortagePenalty : null
    }).subscribe({
      next: () => {
        alert('部署を更新しました');
        this.error.set('');
        this.editingDeptId = null;
        this.loadDashboard();
        this.loadDepartments();
      },
      error: (error) => {
        this.error.set(error.error?.error || 'Failed to update department');
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
      error: (error) => {
        this.error.set(error.error?.error || 'Failed to create allocation');
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
