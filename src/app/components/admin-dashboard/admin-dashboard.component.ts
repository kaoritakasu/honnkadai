import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CdkDragDrop, moveItemInArray, transferArrayItem, DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  private toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

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
  lastYearTotalRevenue: number = 0;
  adjustedAllocations: Map<string, string> = new Map();
  newCandidates: any[] = [];
  dropListIds: string[] = [];
  filterInputs: { [key: string]: string } = {};
  activeFilters: { [key: string]: string } = {};
  draggedEmployee: any = null;
  currentUserRole: string = '';
  employeeSearchText: string = '';
  employeeSortKey: string = 'employeeNumber';
  simulationSortKey: string = 'employeeNumber';
  simulationMode: 'balanced' | 'sales_focus' | 'tech_focus' | 'management_focus' = 'balanced';
  
  // 人事権限判定
  isHRUser: boolean = false;

  // --- 面談予約管理・カレンダー用 ---
  showReservationCalendar: boolean = false;
  allReservations = signal<any[]>([]);
  filterReservationStatus: string = 'all';
  currentDate = signal(new Date());
  calendarWeeks = signal<(any | null)[][]>([]);

  // --- 人事相談一覧用 ---
  showConsultations: boolean = false;
  allConsultations = signal<any[]>([]);
  expandedConsultationId: string | null = null;
  consultationReplyText: { [key: string]: string } = {};
  consultationStatus: { [key: string]: string } = {};
  isReplyingConsultation: { [key: string]: boolean } = {};

  // --- 予約詳細モーダル用 ---
  selectedReservationDetail: any = null;
  showReservationDetailModal = false;

  // --- 予約枠ルール設定用 ---
  availabilityRules = signal<any[]>([]);
  showAvailabilityForm = signal(false);
  newRule = { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' };
  isSavingRule = signal(false);
  ruleError = signal('');

  // --- 例外設定用 ---
  showExceptionModal = false;
  selectedExceptionDate: Date | null = null;
  availabilityExceptions = signal<any[]>([]);
  exceptionType: string = 'none';
  exceptionStartTime: string = '10:00';
  exceptionEndTime: string = '18:00';
  isSavingException = signal(false);
  exceptionError = signal('');

  // --- ポップアップ用ステート ---
  selectedEmployeeForModal: any = null;
  showEmployeeModal = false;

  // --- 通知ドロップダウン ---
  showNotificationMenu = false;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const userStr = localStorage.getItem('currentUser');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        this.currentUserRole = user.role || 'EMPLOYEE';
        this.isHRUser = this.checkIsHRUser(user);
      } catch (e) {
        this.currentUserRole = 'EMPLOYEE';
        this.isHRUser = false;
      }
    }

    this.loadDashboard();
    this.loadDepartments();
    this.loadEmployees();
    
    if (this.isHRUser) {
      this.loadAllReservations();
      this.generateCalendarDays();
      this.loadAvailabilityRules();
      this.loadAvailabilityExceptions();
      this.loadConsultations();
    }
  }

  private checkIsHRUser(user: any): boolean {
    if (!user) return false;
    const role = user.role?.toUpperCase() || '';
    const department = user.department || '';
    if (role === 'HR') return true;
    if (department.includes('人事部') || department.includes('人事課')) return true;
    return false;
  }

  // --- カレンダー・面談予約関連のメソッド ---
  toggleReservationCalendar() {
    this.showReservationCalendar = !this.showReservationCalendar;
  }

  toggleConsultations() {
    this.showConsultations = !this.showConsultations;
  }

  loadAllReservations() {
    this.apiService.getAllReservations().subscribe({
      next: (data: any[]) => this.allReservations.set(data),
      error: (err: any) => {
        console.error('Error loading reservations:', err);
        this.allReservations.set([]);
      }
    });
  }

  loadConsultations() {
    this.apiService.getAllConsultations().subscribe({
      next: (data: any[]) => {
        const sorted = this.sortConsultations(data);
        this.allConsultations.set(sorted);
      },
      error: (err: any) => {
        console.error('Error loading consultations:', err);
        this.allConsultations.set([]);
      }
    });
  }

  private sortConsultations(consultations: any[]): any[] {
    return consultations.sort((a, b) => {
      // 返信ステータスの判定: 未返信か返信済みか
      const aIsPending = !a.response || a.status === 'pending';
      const bIsPending = !b.response || b.status === 'pending';

      // 未返信が優先（未返信は -1, 返信済みは 1 を返す）
      if (aIsPending !== bIsPending) {
        return aIsPending ? -1 : 1;
      }

      // 同じステータス内では createdAt の新しい順（降順）
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return bDate - aDate;
    });
  }

  getFilteredReservations(): any[] {
    let filtered = this.allReservations();
    if (this.filterReservationStatus !== 'all') {
      filtered = filtered.filter(r => r.status === this.filterReservationStatus);
    }
    return filtered.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  updateReservationStatus(reservationId: string, status: string) {
    this.apiService.updateReservationStatus(reservationId, status).subscribe({
      next: () => {
        alert('ステータスを更新しました');
        this.loadAllReservations();
        this.closeReservationDetail();
      },
      error: (err: any) => {
        console.error('Error updating reservation:', err);
        alert('更新に失敗しました');
      }
    });
  }

  formatReservationDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  generateCalendarDays() {
    const year = this.currentDate().getFullYear();
    const month = this.currentDate().getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const weeks: (any | null)[][] = [];
    let currentDate = new Date(startDate);

    for (let week = 0; week < 6; week++) {
      if (week > 0 && currentDate.getMonth() !== month) break; // 空の週を作らない修正
      const weekDays: (any | null)[] = [];
      for (let day = 0; day < 7; day++) {
        if (currentDate.getMonth() === month) {
          weekDays.push({ date: new Date(currentDate), dayOfMonth: currentDate.getDate() });
        } else {
          weekDays.push(null);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeks.push(weekDays);
    }
    this.calendarWeeks.set(weeks);
  }

  previousMonth() {
    const date = new Date(this.currentDate());
    date.setMonth(date.getMonth() - 1);
    this.currentDate.set(date);
    this.generateCalendarDays();
  }

  nextMonth() {
    const date = new Date(this.currentDate());
    date.setMonth(date.getMonth() + 1);
    this.currentDate.set(date);
    this.generateCalendarDays();
  }

  getReservationsForDate(date: Date): any[] {
    const dateStr = this.toLocalDateString(date);
    return this.allReservations().filter(r => this.toLocalDateString(new Date(r.date)) === dateStr);
  }

  getMonthYearDisplay(): string {
    const date = this.currentDate();
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
  }

  openReservationDetail(reservation: any) {
    this.selectedReservationDetail = reservation;
    this.showReservationDetailModal = true;
  }

  closeReservationDetail() {
    this.showReservationDetailModal = false;
    this.selectedReservationDetail = null;
  }

  loadAvailabilityRules() {
    this.apiService.getAvailabilityRules().subscribe({
      next: (data: any[]) => this.availabilityRules.set(data),
      error: (err: any) => {
        console.error('Error loading availability rules:', err);
        this.availabilityRules.set([]);
      }
    });
  }

  toggleAvailabilityForm() {
    this.showAvailabilityForm.set(!this.showAvailabilityForm());
    if (!this.showAvailabilityForm()) {
      this.newRule = { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' };
      this.ruleError.set('');
    }
  }

  saveAvailabilityRule() {
    if (this.newRule.dayOfWeek === undefined || !this.newRule.startTime || !this.newRule.endTime) {
      this.ruleError.set('すべてのフィールドを入力してください');
      return;
    }
    this.isSavingRule.set(true);
    this.apiService.saveAvailabilityRule(this.newRule).subscribe({
      next: () => {
        this.ruleError.set('');
        this.newRule = { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' };
        this.showAvailabilityForm.set(false);
        this.loadAvailabilityRules();
        this.isSavingRule.set(false);
      },
      error: (err: any) => {
        this.ruleError.set(err.error?.error || 'ルールの保存に失敗しました');
        this.isSavingRule.set(false);
      }
    });
  }

  deleteAvailabilityRule(id: string) {
    if (!confirm('このルールを削除してもよろしいですか？')) return;
    this.apiService.deleteAvailabilityRule(id).subscribe({
      next: () => this.loadAvailabilityRules(),
      error: () => alert('削除に失敗しました')
    });
  }

  getDayOfWeekLabel(dayOfWeek: number): string {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[dayOfWeek] || '不明';
  }

  // --- 既存のダッシュボード・シミュレーション関連メソッド（変更なし） ---
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
        employeesArray = employeesArray.map((emp: any) => {
          if (emp.employeeNumber && emp.employeeNumber.includes('Z')) {
            return { ...emp, currentDept: '人事部' };
          }
          return emp;
        });
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
    this.apiService.simulateMultiDepartment(this.selectedDepartments(), this.lastYearTotalRevenue, this.simulationMode).subscribe({
      next: (data: any) => {
        if (data && data.results && Array.isArray(data.results)) {
          const enrichedResults = this.enrichWithMyPageData(data.results);
          const sortedResults = this.sortResultsByEmployeeNumber(enrichedResults.map((result: any) => ({
            ...result,
            cost: result.totalCost
          })));
          this.simulationResults.set(sortedResults);
          this.simulationSummary.set({
            totalCompanyRevenue: data.totalCompanyRevenue,
            totalCompanyCost: data.totalCompanyCost,
            totalCompanyProfit: data.totalCompanyProfit
          });
        } else {
          const enrichedData = this.enrichWithMyPageData(data);
          const sortedData = this.sortResultsByEmployeeNumber(enrichedData);
          this.simulationResults.set(sortedData);
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
        const sortedData = this.sortResultsByEmployeeNumber(mappedData);
        this.simulationResults.set(sortedData);
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
          const sortedResults = this.sortResultsByEmployeeNumber(enrichedResults.map((result: any) => ({
            ...result,
            cost: result.totalCost
          })));
          this.simulationResults.set(sortedResults);
        } else {
          const enrichedData = this.enrichWithMyPageData(data);
          const sortedData = this.sortResultsByEmployeeNumber(enrichedData);
          this.simulationResults.set(sortedData);
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
  private parsePastedData(): any[] {
    const text = this.pasteDataText.trim();
    if (!text) return [];

    let rawData: any[] = [];

    try {
      // 1. JSON形式としての読み込みを試みる
      const parsedJson = JSON.parse(text);
      rawData = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
    } catch (e) {
      // 2. JSONでなければ、表計算データ（TSV / CSV）として処理
      // タブ区切り（Excelやスプレッドシートからのコピペ）が含まれているかを優先判定
      const isTsv = text.includes('\t');
      const delimiter = isTsv ? '\t' : ',';
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

      if (lines.length > 1) {
        // ヘッダー行を取得し、扱いやすいように小文字に統一
        const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(delimiter).map(v => v.trim());
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] !== undefined ? values[index] : '';
          });
          rawData.push(obj);
        }
      }
    }

    // 3. アプリケーションで必要なプロパティ名にマッピング（日本語・英語ヘッダー両対応）
    return rawData.map(item => ({
      employeeId: item['社員id'] || item.employeeid || item.employeeId || '',
      employeeNumber: item['社員番号'] || item.employeenumber || item.employeeNumber || undefined,
      salesForce: Number(item['営業力'] || item.salesforce || item.salesForce) || 0,
      managementForce: Number(item['管理力'] || item.managementforce || item.managementForce) || 0,
      explorationForce: Number(item['開拓力'] || item.explorationforce || item.explorationForce) || 0,
      developmentForce: Number(item['育成力'] || item.developmentforce || item.developmentForce) || 0,
      laborCost: Number(item['人件費'] || item.laborcost || item.laborCost) || 0,
    })).filter(emp => emp.employeeId || emp.employeeNumber); // 空行などを除外
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
    this.apiService.simulateBatchAllocation(convertedData, this.lastYearTotalRevenue, this.simulationMode).subscribe({
      next: (data: any) => {
        if (data && data.results && Array.isArray(data.results)) {
          const enrichedResults = this.enrichWithMyPageData(data.results);
          const sortedResults = this.sortResultsByEmployeeNumber(enrichedResults.map((result: any) => ({
            ...result,
            cost: result.totalCost
          })));
          this.simulationResults.set(sortedResults);
          this.simulationSummary.set({
            totalCompanyRevenue: data.totalCompanyRevenue,
            totalCompanyCost: data.totalCompanyCost,
            totalCompanyProfit: data.totalCompanyProfit
          });
        } else {
          const enrichedData = this.enrichWithMyPageData(data);
          const sortedData = this.sortResultsByEmployeeNumber(enrichedData);
          this.simulationResults.set(sortedData);
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

  dragStart(event: DragEvent, employee: any) {
    this.draggedEmployee = employee;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  dragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  drop(event: CdkDragDrop<any[]>, targetIndex?: number) {
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

    if (this.simulationResults()) {
      this.apiService.recalculate({ data: this.simulationResults(), lastYearTotalRevenue: this.lastYearTotalRevenue }).subscribe({
        next: (data: any) => {
          if (data && data.results) {
            const enrichedResults = this.enrichWithMyPageData(data.results);
            this.simulationResults.set(enrichedResults.map((result: any) => ({
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
        },
        error: (err: any) => {
          this.error.set('再計算に失敗しました');
        }
      });
    }
  }

  updateDropListIds() {
    if (Array.isArray(this.simulationResults())) {
      this.dropListIds = this.simulationResults().map((_: any, i: number) => `dropList_${i}`);
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
      desiredDept: '',
      isOldData: false
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
    if (!this.simulationResults() || !Array.isArray(this.simulationResults())) return;

    this.loading.set(true);
    this.apiService.recalculateSimulation({ results: this.simulationResults(), lastYearTotalRevenue: this.lastYearTotalRevenue }).subscribe({
      next: (data: any) => {
        if (data && data.results && Array.isArray(data.results)) {
          const enrichedResults = this.enrichWithMyPageData(data.results);
          this.simulationResults.set(enrichedResults.map((result: any) => ({
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

    if ((lowerFilter === '幹部候補' || lowerFilter === '幹部') && this.currentUserRole === 'ADMIN') {
      return !!emp.isExecutiveCandidate;
    }

    if (lowerFilter === 'wlb' && emp.workLifeBalance) return true;

    const tags = Array.isArray(emp.tags) ? emp.tags : [];
    if (tags.some((tag: string) => typeof tag === 'string' && tag.toLowerCase().includes(lowerFilter))) {
      return true;
    }

    const desiredDept = String(emp.desiredDept || '');
    if (desiredDept.toLowerCase().includes(lowerFilter)) return true;

    const wlb = String(emp.workLifeBalance || '');
    if (wlb.toLowerCase().includes(lowerFilter)) return true;

    const empName = String(emp.employeeName || '');
    if (empName.toLowerCase().includes(lowerFilter)) return true;

    try {
      const displayName = String(this.getDisplayName(emp) || '').toLowerCase();
      if (displayName.includes(lowerFilter)) return true;
    } catch (e) {}

    const empNum = String(emp.employeeNumber || '');
    if (empNum.toLowerCase().includes(lowerFilter)) return true;

    return false;
  }

  applyFilter(deptId: string) {
    const filterValue = this.filterInputs[deptId] || '';
    this.activeFilters = { ...this.activeFilters, [deptId]: filterValue };
  }

  sortCandidates(candidates: any[], event: any) {
    const sortKey = event.target.value;
    if (!sortKey) return;

    candidates.sort((a: any, b: any) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (sortKey === 'employeeNumber') {
        return String(aVal || '').localeCompare(String(bVal || ''));
      }

      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return bNum - aNum;
    });
  }

  hasUnassignedCandidates(): boolean {
    return this.newCandidates.some((cand: any) => !cand.departmentId || cand.departmentId.trim() === '');
  }

  private enrichWithMyPageData(results: any): any {
    const dbEmployees = this.employees();
    const isArray = Array.isArray(results);
    const resultsArray = isArray ? results : [results];

    const enrichedResults = resultsArray.map((result: any) => ({
      ...result,
      candidates: (result.candidates || []).map((cand: any) => {
        const dbEmp = dbEmployees.find((e: any) =>
          (cand.employeeId && e.employeeId === cand.employeeId) ||
          (cand.employeeNumber && e.employeeNumber === cand.employeeNumber)
        );

        const s = Number(cand.salesForce) || 0;
        const m = Number(cand.managementForce) || 0;
        const e = Number(cand.explorationForce) || 0;
        const d = Number(cand.developmentForce) || 0;
        const maxVal = Math.max(s, m, e, d);

        let topSkill = '';
        if (maxVal > 0) {
          if (maxVal === s) topSkill = '営業力';
          else if (maxVal === m) topSkill = '管理力';
          else if (maxVal === e) topSkill = '開拓力';
          else if (maxVal === d) topSkill = '育成力';
        }

        let currentTags = dbEmp?.tags || cand.tags || [];
        if (!Array.isArray(currentTags)) currentTags = [];

        const abilityTypes = ['営業力', '管理力', '開拓力', '育成力'];
        let newTags = currentTags.filter((t: string) => !abilityTypes.includes(t));

        if (topSkill) {
          newTags.unshift(topSkill);
        }

        return {
          ...cand,
          employeeName: cand.employeeName || dbEmp?.employeeName || dbEmp?.name || dbEmp?.user?.name || cand.employeeNumber || '名前未設定',
          desiredDept: dbEmp?.desiredDept || cand.desiredDept || '',
          workLifeBalance: dbEmp?.workLifeBalance || cand.workLifeBalance || '',
          tags: newTags
        };
      })
    }));

    return isArray ? enrichedResults : enrichedResults[0];
  }

  private sortResultsByEmployeeNumber(results: any): any {
    const isArray = Array.isArray(results);
    const resultsArray = isArray ? results : [results];

    resultsArray.forEach((result: any) => {
      if (Array.isArray(result.candidates)) {
        result.candidates.sort((a: any, b: any) => {
          return String(a.employeeNumber || '').localeCompare(String(b.employeeNumber || ''));
        });
      }
    });

    return isArray ? resultsArray : resultsArray[0];
  }

  getDisplayName(emp: any): string {
    const dbEmployees = this.employees();
    const match = dbEmployees.find((e: any) => e.employeeNumber && e.employeeNumber === String(emp.employeeNumber));
    if (match && (match.employeeName || match.name || match.user?.name)) {
      return match.employeeName || match.name || match.user?.name;
    }
    if (emp.employeeName && emp.employeeName !== '名前未設定') {
      return emp.employeeName;
    }
    return emp.employeeNumber || '名前未設定';
  }

  openEmployeeModal(emp: any) {
    this.selectedEmployeeForModal = emp;
    this.showEmployeeModal = true;
  }

  closeEmployeeModal() {
    this.showEmployeeModal = false;
    this.selectedEmployeeForModal = null;
  }

  saveSimulation() {
    if (!confirm('現在の配置案を確定し、社員のマイページに通知します。よろしいですか？')) return;

    const summary = this.simulationSummary();
    const totalCompanyCost = Array.isArray(this.simulationResults())
      ? this.simulationResults().reduce((sum: number, result: any) => sum + (result.cost || 0), 0)
      : (this.simulationResults().cost || 0);

    const payload = {
      results: this.simulationResults(),
      totalCompanyRevenue: summary ? summary.totalCompanyRevenue : 0,
      totalCompanyCost: totalCompanyCost,
      totalCompanyProfit: summary ? summary.totalCompanyProfit : 0
    };

    this.apiService.saveSimulation(payload).subscribe({
      next: () => alert('配置案を保存し、社員への通知が完了しました！'),
      error: (err: any) => {
        console.error(err);
        alert('保存に失敗しました。サーバーが立ち上がっているか確認してください。');
      }
    });
  }

  loadHistoryDetail(history: any) {
    try {
      const results = typeof history.results === 'string' ? JSON.parse(history.results) : history.results;
      this.simulationResults.set(results);
      this.simulationSummary.set({
        totalCompanyRevenue: history.totalRevenue,
        totalCompanyCost: history.totalCost,
        totalCompanyProfit: history.totalProfit
      });
      this.activeTab.set('simulation');
    } catch (e) {
      alert('履歴データの読み込みに失敗しました');
    }
  }

  getFilteredAndSortedEmployees(): any[] {
    const allEmployees = this.employees();
    const searchText = this.employeeSearchText.toLowerCase().trim();

    let filtered = allEmployees.filter((emp: any) => {
      if (!searchText) return true;
      const name = String(emp.user?.name || emp.name || emp.employeeName || '').toLowerCase();
      if (name.includes(searchText)) return true;
      const empNumber = String(emp.employeeNumber || '').toLowerCase();
      if (empNumber.includes(searchText)) return true;
      const desiredDept = String(emp.desiredDept || emp.careerDesire || emp.careerGoals || '').toLowerCase();
      if (desiredDept.includes(searchText)) return true;
      const currentDept = String(emp.currentDept || '').toLowerCase();
      if (currentDept.includes(searchText)) return true;
      const status = String(emp.status || '').toLowerCase();
      if (status.includes(searchText)) return true;
      return false;
    });

    if (this.employeeSortKey) {
      filtered.sort((a: any, b: any) => {
        const aVal = a[this.employeeSortKey] || '';
        const bVal = b[this.employeeSortKey] || '';
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return aVal - bVal;
        }
        return String(aVal).localeCompare(String(bVal));
      });
    }

    return filtered;
  }

  // --- 人事相談返信関連メソッド ---
  toggleConsultationDetail(consultationId: string) {
    this.expandedConsultationId = this.expandedConsultationId === consultationId ? null : consultationId;
  }

  submitConsultationReply(consultationId: string) {
    const replyText = this.consultationReplyText[consultationId] || '';
    const status = this.consultationStatus[consultationId] || 'replied';

    if (!replyText.trim()) {
      alert('返信内容を入力してください');
      return;
    }

    this.isReplyingConsultation[consultationId] = true;
    this.apiService.respondToConsultation(consultationId, replyText, status).subscribe({
      next: () => {
        alert('返信を送信しました。社員にメール通知が届きます。');
        this.consultationReplyText[consultationId] = '';
        this.expandedConsultationId = null;
        this.isReplyingConsultation[consultationId] = false;
        this.loadConsultations();
      },
      error: (err: any) => {
        console.error('Error submitting reply:', err);
        alert('返信の送信に失敗しました');
        this.isReplyingConsultation[consultationId] = false;
      }
    });
  }

  getConsultationStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': '未返信',
      'replied': '返信済み'
    };
    return statusMap[status?.toLowerCase()] || status || '不明';
  }

  // --- 例外設定関連メソッド ---
  loadAvailabilityExceptions() {
    this.apiService.getAvailabilityExceptions().subscribe({
      next: (data: any[]) => this.availabilityExceptions.set(data),
      error: (err: any) => {
        console.error('Error loading availability exceptions:', err);
        this.availabilityExceptions.set([]);
      }
    });
  }

  getExceptionForDate(date: Date | null): any {
    if (!date) return null;
    const dateStr = this.toLocalDateString(date);
    return this.availabilityExceptions().find(exc => this.toLocalDateString(new Date(exc.date)) === dateStr);
  }

  isDateUnavailable(date: Date | null): boolean {
    if (!date) return false;
    const exception = this.getExceptionForDate(date);
    return exception && exception.type === 'UNAVAILABLE';
  }

  openExceptionModal(date: Date) {
    this.selectedExceptionDate = new Date(date);
    this.selectedExceptionDate.setHours(0, 0, 0, 0);
    const exception = this.getExceptionForDate(this.selectedExceptionDate);

    if (exception) {
      if (exception.type === 'UNAVAILABLE') {
        this.exceptionType = 'unavailable';
      } else if (exception.type === 'CUSTOM') {
        this.exceptionType = 'custom';
        this.exceptionStartTime = exception.startTime || '10:00';
        this.exceptionEndTime = exception.endTime || '18:00';
      }
    } else {
      this.exceptionType = 'none';
      this.exceptionStartTime = '10:00';
      this.exceptionEndTime = '18:00';
    }

    this.exceptionError.set('');
    this.showExceptionModal = true;
  }

  closeExceptionModal() {
    this.showExceptionModal = false;
    this.selectedExceptionDate = null;
    this.exceptionType = 'none';
    this.exceptionError.set('');
  }

  onExceptionTypeChange() {
    this.exceptionError.set('');
  }

  saveException() {
    if (!this.selectedExceptionDate) return;

    if (this.exceptionType === 'none') {
      // 既存の例外を削除
      const exception = this.getExceptionForDate(this.selectedExceptionDate);
      if (exception) {
        this.deleteException();
      } else {
        this.closeExceptionModal();
      }
      return;
    }

    if (this.exceptionType === 'custom') {
      if (!this.exceptionStartTime || !this.exceptionEndTime) {
        this.exceptionError.set('時短対応の場合、開始時間と終了時間を指定してください');
        return;
      }
    }

    this.isSavingException.set(true);
    const payload = {
      date: this.selectedExceptionDate.toISOString(),
      type: this.exceptionType === 'unavailable' ? 'UNAVAILABLE' : 'CUSTOM',
      startTime: this.exceptionType === 'custom' ? this.exceptionStartTime : null,
      endTime: this.exceptionType === 'custom' ? this.exceptionEndTime : null
    };

    this.apiService.createAvailabilityException(payload).subscribe({
      next: () => {
        this.loadAvailabilityExceptions();
        this.closeExceptionModal();
        this.isSavingException.set(false);
      },
      error: (err: any) => {
        this.exceptionError.set(err.error?.error || '保存に失敗しました');
        this.isSavingException.set(false);
      }
    });
  }

  deleteException() {
    const exception = this.getExceptionForDate(this.selectedExceptionDate);
    if (!exception) {
      this.closeExceptionModal();
      return;
    }

    if (!confirm('この例外設定を削除してもよろしいですか？')) return;

    this.isSavingException.set(true);
    this.apiService.deleteAvailabilityException(exception.id).subscribe({
      next: () => {
        this.loadAvailabilityExceptions();
        this.closeExceptionModal();
        this.isSavingException.set(false);
      },
      error: (err: any) => {
        this.exceptionError.set(err.error?.error || '削除に失敗しました');
        this.isSavingException.set(false);
      }
    });
  }

  formatExceptionDate(date: Date): string {
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  }

  get pendingNotificationCount(): number {
    const pendingConsultations = this.allConsultations().filter(c => !c.response || c.status === 'pending').length;
    const upcomingReservations = this.allReservations().filter(r => r.status !== 'COMPLETED' && r.status !== 'CANCELLED').length;
    return pendingConsultations + upcomingReservations;
  }

  get pendingConsultationsCount(): number {
    return this.allConsultations().filter(c => !c.response || c.status === 'pending').length;
  }

  get upcomingReservationsCount(): number {
    return this.allReservations().filter(r => r.status !== 'COMPLETED' && r.status !== 'CANCELLED').length;
  }

  toggleNotificationMenu() {
    this.showNotificationMenu = !this.showNotificationMenu;
  }

  openNotificationConsultations() {
    this.activeTab.set('hr-management');
    this.showNotificationMenu = false;
    this.showConsultations = true;
  }

  openNotificationReservations() {
    this.activeTab.set('hr-management');
    this.showNotificationMenu = false;
    this.showReservationCalendar = true;
  }

  getDepartmentSkillAverages(deptName: string): any {
    const employees = this.employees();
    const matchingEmployees = employees.filter((emp: any) => emp.currentDept === deptName);

    if (matchingEmployees.length === 0) {
      return {
        salesForce: 0,
        managementForce: 0,
        explorationForce: 0,
        developmentForce: 0,
        employeeCount: 0,
        averageSkill: 0,
        maxSkill: 0
      };
    }

    const sum = matchingEmployees.reduce((acc: any, emp: any) => ({
      salesForce: acc.salesForce + (Number(emp.salesForce) || 0),
      managementForce: acc.managementForce + (Number(emp.managementForce) || 0),
      explorationForce: acc.explorationForce + (Number(emp.explorationForce) || 0),
      developmentForce: acc.developmentForce + (Number(emp.developmentForce) || 0)
    }), { salesForce: 0, managementForce: 0, explorationForce: 0, developmentForce: 0 });

    const averages = {
      salesForce: Math.round(sum.salesForce / matchingEmployees.length),
      managementForce: Math.round(sum.managementForce / matchingEmployees.length),
      explorationForce: Math.round(sum.explorationForce / matchingEmployees.length),
      developmentForce: Math.round(sum.developmentForce / matchingEmployees.length)
    };

    const maxSkill = Math.max(
      averages.salesForce,
      averages.managementForce,
      averages.explorationForce,
      averages.developmentForce
    );

    const averageSkill = Math.round(
      (averages.salesForce + averages.managementForce + averages.explorationForce + averages.developmentForce) / 4
    );

    return {
      ...averages,
      employeeCount: matchingEmployees.length,
      averageSkill,
      maxSkill
    };
  }
}