import { Component, signal, OnInit, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CdkDragDrop, moveItemInArray, transferArrayItem, DragDropModule } from '@angular/cdk/drag-drop';
import { filter, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  Array = Array;
  Math = Math;
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
  lastYearTotalRevenueOku: number = 58; // 入力用のプロパティ（単位：億円）

  // API送信や計算用には、自動的に1億を掛けた数値を返す
  get lastYearTotalRevenue(): number {
    return this.lastYearTotalRevenueOku * 100000000;
  }
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
  viewingHistoryDetail: boolean = false;

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

  // --- 配置シミュレーション適用（予約）用 ---
  showApplyModal = false;
  applyDate = '';
  applyMemo = '';

  // 異動候補（未公開）のリスト（初期ダミーデータあり）
  pendingTransfers = signal<any[]>([
    { id: 1, employeeNumber: 'E015', employeeName: '佐藤健太', fromDept: 'C事業部', toDept: 'A事業部', applyDate: '2026-10-01', status: 'pending', memo: '本人のキャリア希望（営業への挑戦）を反映。15日の面談で合意予定。' }
  ]);

  // --- ポップアップ用ステート ---
  selectedEmployeeNode = signal<any>(null);

  // --- 通知ドロップダウン ---
  showNotificationMenu = false;

  // --- 部署アコーディオン ---
  expandedDeptIds: { [key: string]: boolean } = {};

  // --- 追加採用シミュレーション用 ---
  autoHireCount: number = 10;
  isSimulatingHiring: boolean = false;
  hiringSimulationResult: any = null;
  pendingNewHires: any[] | null = null;
  lastSimulationId: string | null = null;

  // --- ペルソナ別採用候補生成用 ---
  newGradCount: number = 0;
  midCareerCount: number = 0;
  executiveCandidateCount: number = 0;

  // --- シミュレーション比較用 ---
  currentBaseline: any = null;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router,
    private activatedRoute: ActivatedRoute
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

    this.setupRouteListener();
    this.handleInitialRoute();

    this.activeTab.set('dashboard');
  }

  private setupRouteListener() {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.handleRouteChange();
      });
  }

  private handleInitialRoute() {
    this.handleRouteChange();
  }

  private handleRouteChange() {
    const currentPath = this.router.url;
    this.activeTab.set('hr-management');
    this.showReservationCalendar = false;
    this.showConsultations = false;

    if (currentPath.includes('/admin/reservations')) {
      this.showReservationCalendar = true;
    } else if (currentPath.includes('/admin/consultations')) {
      this.showConsultations = true;
    } else if (currentPath.includes('/admin/naiji')) {
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // トラックパッドやマウスホイールでの意図しない数値変更を防ぐ
  @HostListener('wheel', ['$event'])
  onWheel(event: Event) {
    if (event.target instanceof HTMLInputElement && event.target.type === 'number') {
      event.target.blur(); // スクロール時にフォーカスを外して値の変動を防止
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

  toggleReservationCalendar() {
    this.showReservationCalendar = !this.showReservationCalendar;
  }

  toggleConsultations() {
    this.showConsultations = !this.showConsultations;
  }

  navigateToReservations() {
    this.router.navigate(['/admin/reservations']);
  }

  navigateToConsultations() {
    this.router.navigate(['/admin/consultations']);
  }

  navigateToNaiji() {
    this.router.navigate(['/admin/naiji']);
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
    console.log('[AdminDashboard] Loading consultations...');
    console.log('[AdminDashboard] API URL:', this.apiService.getConfiguredApiUrl());
    this.apiService.getAllConsultations().subscribe({
      next: (data: any[]) => {
        console.log('[AdminDashboard] Consultations loaded:', data?.length || 0, 'items');
        const sorted = this.sortConsultations(data);
        this.allConsultations.set(sorted);
      },
      error: (err: any) => {
        console.error('[AdminDashboard] Error loading consultations:', err);
        console.error('[AdminDashboard] Error details:', {
          status: err.status,
          statusText: err.statusText,
          message: err.error?.error || err.message
        });
        this.allConsultations.set([]);
      }
    });
  }

  private sortConsultations(consultations: any[]): any[] {
    return consultations.sort((a, b) => {
      const aIsPending = !a.response || a.status === 'pending';
      const bIsPending = !b.response || b.status === 'pending';
      if (aIsPending !== bIsPending) return aIsPending ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
      if (week > 0 && currentDate.getMonth() !== month) break;
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

  loadDashboard() {
    this.apiService.getDashboard().subscribe({
      next: (data: any) => {
        // simulationHistory に executorName を追加
        if (data && Array.isArray(data.simulationHistory)) {
          data.simulationHistory = data.simulationHistory.map((history: any) => ({
            ...history,
            executorName: history.executedBy ? this.convertEmailToName(history.executedBy) : '-'
          }));
        }
        this.dashboard.set(data);
      },
      error: (error: any) => this.error.set(error.error?.error || 'Failed to load dashboard')
    });
  }

  private convertEmailToName(email: string): string {
    if (!email || typeof email !== 'string') return '-';
    const beforeAt = email.split('@')[0];
    if (!beforeAt) return '-';
    const parts = beforeAt.split('.');
    return parts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
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

  toggleDepartmentAccordion(deptId: string) {
    this.expandedDeptIds[deptId] = !this.expandedDeptIds[deptId];
  }

  runMultiDepartmentSimulation() {
    if (!this.selectedDepartments() || this.selectedDepartments().length === 0) {
      this.error.set('Please select at least one department');
      return;
    }

    // 初回実行時はベースラインを設定
    if (!this.currentBaseline) {
      this.updateBaseline();
    }

    this.loading.set(true);

    // 新規採用候補者だけを送信（前回の配置を維持）
    let payload: any = {
      employees: this.newCandidates,
      lastYearTotalRevenue: this.lastYearTotalRevenue,
      simulationMode: this.simulationMode,
      addOnlyMode: true  // 前回の配置に追加する形での配置を指示
    };

    // 前回のシミュレーション結果が存在する場合は、それを基準に配置
    if (this.simulationResults() && Array.isArray(this.simulationResults())) {
      const currentResults = this.simulationResults();
      payload.previousAllocations = currentResults.map((result: any) => ({
        departmentId: result.departmentId,
        departmentName: result.departmentName,
        currentCount: result.allocatedCount || result.candidates?.length || 0,
        candidates: result.candidates || []
      }));
      payload.previousSimulationId = this.lastSimulationId;
    } else {
      // シミュレーション結果がない場合は通常モード
      const existingEmployees = this.employees() || [];
      payload.employees = [...existingEmployees, ...this.newCandidates];
      payload.addOnlyMode = false;
    }

    this.apiService.simulateBatchAllocation(
      payload,
      this.lastYearTotalRevenue,
      this.simulationMode,
      this.lastSimulationId || undefined
    ).subscribe({
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
        this.newCandidates = [];
      },
      error: (error: any) => {
        this.error.set(error.error?.error || 'Multi-department simulation failed');
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
    // 💡 修正箇所：引数を3つに増やしました
    this.apiService.simulateBatchAllocation(parsed, this.lastYearTotalRevenue, this.simulationMode).subscribe({
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
        this.newCandidates = [];
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

  runPastedDataSimulation() {
    if (!this.pasteDataText || this.pasteDataText.trim() === '') {
      alert('データを入力してください。');
      return;
    }

    // 初回実行時はベースラインを設定
    if (!this.currentBaseline) {
      this.updateBaseline();
    }

    const lines = this.pasteDataText.trim().split(/\r?\n/);
    const parsedEmployees = [];
    let headerMap: { [key: string]: number } = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // カンマまたはタブで分割して前後の空白を除去
      const cols = line.split(/[\t,]/).map(c => c.trim());

      // ヘッダーマップが空で、文字（社員、営業など）が含まれる行があればヘッダーとして解析
      if (Object.keys(headerMap).length === 0 && cols.some(c => isNaN(Number(c)) && (c.includes('社員') || c.includes('営業') || c.includes('人件費')))) {
        cols.forEach((col, index) => {
          if (col.includes('社員')) headerMap['社員番号'] = index;
          else if (col.includes('営業')) headerMap['営業力'] = index;
          else if (col.includes('管理')) headerMap['管理力'] = index;
          else if (col.includes('開拓')) headerMap['開拓力'] = index;
          else if (col.includes('育成')) headerMap['育成力'] = index;
          else if (col.includes('人件費') || col.includes('コスト')) headerMap['人件費'] = index;
        });
        continue; // ヘッダー行はデータとして読み込まない
      }

      // ヘッダーが見つからなかった場合（いきなり数値から始まった場合）のデフォルト順
      if (Object.keys(headerMap).length === 0) {
        headerMap = { '社員番号': 0, '営業力': 1, '管理力': 2, '開拓力': 3, '育成力': 4, '人件費': 5 };
      }

      // データ行の処理（空行や列不足をスキップ）
      const empNoIdx = headerMap['社員番号'];
      if (empNoIdx !== undefined && cols[empNoIdx] && cols.length > 1) {
        const laborCostIdx = headerMap['人件費'];
        const laborCostValue = laborCostIdx !== undefined ? Number(cols[laborCostIdx]) : 0;
        const empNum = cols[empNoIdx].trim();

        // 既存の社員データに存在するかチェック
        const existsInDb = this.employees().some((e: any) => e.employeeNumber === empNum);

        parsedEmployees.push({
          employeeNumber: empNum,
          salesForce: Number(cols[headerMap['営業力']]) || 0,
          managementForce: Number(cols[headerMap['管理力']]) || 0,
          explorationForce: Number(cols[headerMap['開拓力']]) || 0,
          developmentForce: Number(cols[headerMap['育成力']]) || 0,
          laborCost: !isNaN(laborCostValue) ? laborCostValue : 0,
          isNew: !existsInDb // DBにいなければ新規（isNew: true）として扱い、保存時にDBへ自動登録させる
        });
      }
    }

    if (parsedEmployees.length === 0) {
      alert('有効なデータが読み込めませんでした。フォーマットを確認してください。');
      return;
    }

    console.log('送信するデータ件数:', parsedEmployees.length, parsedEmployees[0]);

    this.loading.set(true);

    // テキストデータから直接実行する場合は、テキストデータのみを使用（既存データは無視）
    const payload = {
      departmentIds: this.selectedDepartments().length > 0 ? this.selectedDepartments() : this.departments().map(d => d.id),
      employees: parsedEmployees,
      lastYearTotalRevenue: this.lastYearTotalRevenue,
      simulationMode: this.simulationMode
    };

    this.apiService.simulateBatchAllocation(
      payload,
      this.lastYearTotalRevenue,
      this.simulationMode
    ).subscribe({
      next: (res: any) => {
        if (res && res.results && Array.isArray(res.results)) {
          const enrichedResults = this.enrichWithMyPageData(res.results);
          const sortedResults = this.sortResultsByEmployeeNumber(enrichedResults.map((result: any) => ({
            ...result,
            cost: result.totalCost
          })));
          this.simulationResults.set(sortedResults);
          this.simulationSummary.set({
            totalCompanyRevenue: res.totalCompanyRevenue,
            totalCompanyCost: res.totalCompanyCost,
            totalCompanyProfit: res.totalCompanyProfit
          });
        } else {
          const enrichedData = this.enrichWithMyPageData(res);
          const sortedData = this.sortResultsByEmployeeNumber(enrichedData);
          this.simulationResults.set(sortedData);
          this.simulationSummary.set(null);
        }
        this.loading.set(false);
        this.pasteDataText = '';
        this.newCandidates = [];
      },
      error: (err: any) => {
        console.error('API Error:', err);
        this.loading.set(false);
        alert('シミュレーションの実行に失敗しました。');
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

  onDrop(event: CdkDragDrop<any[]>) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
    }
  }

  updateDropListIds() {
    if (Array.isArray(this.simulationResults())) {
      this.dropListIds = this.simulationResults().map((_: any, i: number) => `dropList_${i}`);
    }
  }

  addNewCandidate() {
    this.newCandidates.push({
      employeeId: 'NEW_' + Date.now(),
      employeeNumber: `NEW${String(Date.now() + this.newCandidates.length).slice(-4)}`,
      employeeName: '',
      salesForce: 50,
      managementForce: 50,
      explorationForce: 50,
      developmentForce: 50,
      laborCost: 5.0,
      isNew: true
    });
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


  private recalculateResults() {
    if (!this.simulationResults() || !Array.isArray(this.simulationResults())) return;

    this.loading.set(true);

    // 採用候補者をシミュレーション結果に追加
    const resultsWithNewCandidates = this.simulationResults().map((result: any) => {
      const newCandsInDept = this.newCandidates.filter((cand: any) => cand.departmentId === result.departmentId);
      return {
        ...result,
        candidates: [...(result.candidates || []), ...newCandsInDept]
      };
    });

    this.apiService.recalculateSimulation({ results: resultsWithNewCandidates, lastYearTotalRevenue: this.lastYearTotalRevenue }).subscribe({
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


  private enrichWithMyPageData(results: any): any {
    const isArray = Array.isArray(results);
    const resultsArray = isArray ? results : [results];

    // 社員一覧は補助データとして使用（employeeNameなどの表示用のみ）
    const dbEmployees = this.employees();

    const enrichedResults = resultsArray.map((result: any) => ({
      ...result,
      candidates: (result.candidates || []).map((cand: any) => {
        const candEmpNumber = String(cand.employeeNumber || cand.employeeId || '').trim();
        const dbEmp = dbEmployees.find((e: any) => {
          const dbEmpNumber = String(e.employeeNumber || e.employeeId || '').trim();
          return candEmpNumber && dbEmpNumber && candEmpNumber === dbEmpNumber;
        });

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

        // APIから返されたtagsを100%優先（ローカルデータで上書きしない）
        let currentTags = Array.isArray(cand.tags) ? cand.tags : [];

        const abilityTypes = ['営業力', '管理力', '開拓力', '育成力'];
        let newTags = currentTags.filter((t: string) => !abilityTypes.includes(t));

        if (topSkill) {
          newTags.unshift(topSkill);
        }

        // employeeNameなどの表示用情報はローカルデータから補助的に取得
        const empName = cand.employeeName || dbEmp?.employeeName || dbEmp?.name || dbEmp?.user?.name || cand.employeeNumber || '名前未設定';
        const desiredDept = cand.desiredDept || dbEmp?.desiredDept || '';
        const workLifeBalance = cand.workLifeBalance || dbEmp?.workLifeBalance || '';

        return {
          ...cand,
          salesForce: cand.salesForce,
          managementForce: cand.managementForce,
          explorationForce: cand.explorationForce,
          developmentForce: cand.developmentForce,
          laborCost: cand.laborCost,
          score: cand.score,
          tags: newTags,
          isExecutiveCandidate: cand.isExecutiveCandidate,
          employeeName: empName,
          desiredDept: desiredDept,
          workLifeBalance: workLifeBalance
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
    this.selectedEmployeeNode.set(emp);
  }

  closeEmployeeModal() {
    this.selectedEmployeeNode.set(null);
  }

  private ensureIsNewFlag(results: any): any {
    if (!results) return results;
    const isArray = Array.isArray(results);
    const resultsArray = isArray ? results : [results];

    const processedArray = resultsArray.map((dept: any) => ({
      ...dept,
      candidates: (dept.candidates || []).map((cand: any) => ({
        ...cand,
        isNew: cand.isNew || (typeof cand.employeeId === 'string' && cand.employeeId.startsWith('NEW_'))
      }))
    }));

    return isArray ? processedArray : processedArray[0];
  }

  saveSimulation() {
    if (!confirm('現在の配置案を確定し、社員のマイページに通知します。よろしいですか？')) return;

    const summary = this.simulationSummary();
    const totalCompanyCost = Array.isArray(this.simulationResults())
      ? this.simulationResults().reduce((sum: number, result: any) => sum + (result.cost || 0), 0)
      : (this.simulationResults().cost || 0);

    const currentUser = this.getCurrentUserName();

    const payload = {
      results: this.ensureIsNewFlag(this.simulationResults()),
      totalCompanyRevenue: summary ? summary.totalCompanyRevenue : 0,
      totalCompanyCost: totalCompanyCost,
      totalCompanyProfit: summary ? summary.totalCompanyProfit : 0,
      executorName: currentUser
    };

    // 送信するペイロードの構造を確認
    console.log('【saveSimulation】送信ペイロード確認');
    console.log('  results型:', Array.isArray(payload.results) ? 'array' : typeof payload.results);
    console.log('  results件数:', Array.isArray(payload.results) ? payload.results.length : 'N/A');
    if (Array.isArray(payload.results) && payload.results.length > 0) {
      payload.results.forEach((dept: any, idx: number) => {
        console.log(`  [${idx}] ${dept.departmentName}: candidates=${Array.isArray(dept.candidates) ? dept.candidates.length : 'null'}件`);
      });
    }
    console.log('  totalCompanyRevenue:', payload.totalCompanyRevenue);
    console.log('  totalCompanyCost:', payload.totalCompanyCost);
    console.log('  totalCompanyProfit:', payload.totalCompanyProfit);

    this.apiService.saveSimulation(payload).subscribe({
      next: (res: any) => {
        this.lastSimulationId = res?.id || null;
        console.log('【saveSimulation】保存成功:', {
          id: res?.id,
          savedCount: res?.savedCount,
          skippedCount: res?.skippedCount
        });
        alert('配置案を保存し、社員への通知が完了しました！');
      },
      error: (error: any) => {
        console.error('【配置案保存エラー】');
        console.error('ステータスコード:', error?.status);
        console.error('エラー内容:', error?.error);
        console.error('詳細:', error?.message || error);
        console.error('リクエストURL:', `${this.apiService.getConfiguredApiUrl()}/allocation/save`);
        alert('保存に失敗しました。コンソール（F12）のエラーを確認してください。');
      }
    });
  }

  saveSimulationHistory() {
    const summary = this.simulationSummary();
    const totalCompanyCost = Array.isArray(this.simulationResults())
      ? this.simulationResults().reduce((sum: number, result: any) => sum + (result.cost || 0), 0)
      : (this.simulationResults().cost || 0);

    const currentUser = this.getCurrentUserName();

    const payload = {
      results: this.ensureIsNewFlag(this.simulationResults()),
      totalCompanyRevenue: summary ? summary.totalCompanyRevenue : 0,
      totalCompanyCost: totalCompanyCost,
      totalCompanyProfit: summary ? summary.totalCompanyProfit : 0,
      executorName: currentUser
    };

    // 送信するペイロードの構造を確認
    console.log('【saveSimulationHistory】送信ペイロード確認');
    console.log('  results型:', Array.isArray(payload.results) ? 'array' : typeof payload.results);
    console.log('  results件数:', Array.isArray(payload.results) ? payload.results.length : 'N/A');

    this.apiService.saveSimulation(payload).subscribe({
      next: (res: any) => {
        this.lastSimulationId = res?.id || null;
        console.log('【saveSimulationHistory】保存成功:', {
          id: res?.id,
          savedCount: res?.savedCount,
          skippedCount: res?.skippedCount
        });
        alert('配置案を履歴に保存しました（社員への通知はありません）');
        this.resetSimulation();
      },
      error: (error: any) => {
        console.error('【配置案履歴保存エラー】');
        console.error('ステータスコード:', error?.status);
        console.error('エラー内容:', error?.error);
        console.error('詳細:', error?.message || error);
        console.error('リクエストURL:', `${this.apiService.getConfiguredApiUrl()}/allocation/save`);
        alert('保存に失敗しました。コンソール（F12）のエラーを確認してください。');
      }
    });
  }

  openApplyModal() {
    this.showApplyModal = true;
    // デフォルトで翌月1日をセット
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    this.applyDate = nextMonth.toISOString().split('T')[0];
  }

  closeApplyModal() {
    this.showApplyModal = false;
    this.applyDate = '';
    this.applyMemo = '';
  }

  confirmApplySimulation() {
    if (!this.applyDate) {
      alert('発令日（適用日）を入力してください。');
      return;
    }

    const summary = this.simulationSummary();
    const totalCompanyCost = Array.isArray(this.simulationResults())
      ? this.simulationResults().reduce((sum: number, result: any) => sum + (result.cost || 0), 0)
      : (this.simulationResults().cost || 0);

    const currentUser = this.getCurrentUserName();

    const payload = {
      results: this.ensureIsNewFlag(this.simulationResults()),
      totalCompanyRevenue: summary ? summary.totalCompanyRevenue : 0,
      totalCompanyCost: totalCompanyCost,
      totalCompanyProfit: summary ? summary.totalCompanyProfit : 0,
      executorName: currentUser
    };

    // 送信するペイロードの構造を確認
    console.log('【confirmApplySimulation】送信ペイロード確認');
    console.log('  results型:', Array.isArray(payload.results) ? 'array' : typeof payload.results);
    console.log('  results件数:', Array.isArray(payload.results) ? payload.results.length : 'N/A');
    console.log('  適用日:', this.applyDate);

    this.apiService.saveSimulation(payload).subscribe({
      next: (res: any) => {
        this.lastSimulationId = res?.id || null;
        console.log('【confirmApplySimulation】保存成功:', {
          id: res?.id,
          savedCount: res?.savedCount,
          skippedCount: res?.skippedCount
        });
        alert('本番環境に反映（保存）しました！');
        this.closeApplyModal();
        this.viewingHistoryDetail = false;
        this.loadDashboard();
        // 内示候補データをローカルストレージに保存
        this.apiService.getAllAllocations().subscribe({
          next: (allocations: any) => {
            console.log('【confirmApplySimulation】内示データをローカルストレージに保存:', allocations?.length || 0, '件');
            localStorage.setItem('allocations', JSON.stringify(allocations));
          },
          error: (err) => console.error('【confirmApplySimulation】Failed to load allocations:', err)
        });
      },
      error: (error: any) => {
        console.error('【配置案本番反映エラー（発令予約）】');
        console.error('ステータスコード:', error?.status);
        console.error('エラー内容:', error?.error);
        console.error('詳細:', error?.message || error);
        console.error('リクエストURL:', `${this.apiService.getConfiguredApiUrl()}/allocation/save`);
        console.error('適用日:', this.applyDate);
        alert('保存に失敗しました。コンソール（F12）のエラーを確認してください。');
      }
    });
  }

  approveTransfer(transfer: any) {
    if (confirm(`${transfer.employeeName} さんの異動を「確定（公開）」にしますか？\n※確定すると、対象者のマイページに新しい配属先が正式に表示されます。`)) {
      const updated = this.pendingTransfers().map(t =>
        t.id === transfer.id ? { ...t, status: 'approved' } : t
      );
      this.pendingTransfers.set(updated);
      alert('異動を確定（公開）しました。対象者に通知が送信されました。');
    }
  }

  rejectTransfer(transfer: any) {
    if (confirm(`${transfer.employeeName} さんの異動案を「見送り（白紙）」にしますか？`)) {
      const updated = this.pendingTransfers().filter(t => t.id !== transfer.id);
      this.pendingTransfers.set(updated);
    }
  }

  applySimulation() {
    if (!confirm('この過去の配置案を本番環境に反映し、社員のマイページに通知します。よろしいですか？')) return;

    const summary = this.simulationSummary();
    const totalCompanyCost = Array.isArray(this.simulationResults())
      ? this.simulationResults().reduce((sum: number, result: any) => sum + (result.cost || 0), 0)
      : (this.simulationResults().cost || 0);

    const currentUser = this.getCurrentUserName();

    const payload = {
      results: this.ensureIsNewFlag(this.simulationResults()),
      totalCompanyRevenue: summary ? summary.totalCompanyRevenue : 0,
      totalCompanyCost: totalCompanyCost,
      totalCompanyProfit: summary ? summary.totalCompanyProfit : 0,
      executorName: currentUser
    };

    // 送信するペイロードの構造を確認
    console.log('【applySimulation】送信ペイロード確認');
    console.log('  results型:', Array.isArray(payload.results) ? 'array' : typeof payload.results);
    console.log('  results件数:', Array.isArray(payload.results) ? payload.results.length : 'N/A');

    this.apiService.saveSimulation(payload).subscribe({
      next: (res: any) => {
        this.lastSimulationId = res?.id || null;
        console.log('【applySimulation】保存成功:', {
          id: res?.id,
          savedCount: res?.savedCount,
          skippedCount: res?.skippedCount
        });
        alert('配置案を本番環境に反映し、社員への通知が完了しました！');
        this.resetSimulation();
        this.loadDashboard();
      },
      error: (error: any) => {
        console.error('【過去配置案本番反映エラー】');
        console.error('ステータスコード:', error?.status);
        console.error('エラー内容:', error?.error);
        console.error('詳細:', error?.message || error);
        console.error('リクエストURL:', `${this.apiService.getConfiguredApiUrl()}/allocation/save`);
        alert('反映に失敗しました。コンソール（F12）のエラーを確認してください。');
      }
    });
  }

  loadHistoryDetail(history: any) {
    try {
      console.log('取得した履歴データ:', history);

      // バックエンドからのプロパティ名が異なるケースに対応
      let rawData = history.results || history.data || history.details || history.allocations;

      if (!rawData) {
        alert(`【データ取得エラー】\n詳細な配置データが含まれていません。\n(現在取得できている項目: ${Object.keys(history).join(', ')})\n\n💡 バックエンドのダッシュボード取得API（Prisma等）で、履歴の「results（配置情報のJSONカラム）」も一緒に取得（select）するように修正してください。`);
        return;
      }

      let parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

      // 万が一 { results: [...] } のようにラップされている場合
      if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.results)) {
        parsed = parsed.results;
      } else if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.data)) {
        parsed = parsed.data;
      }

      // 確実に配列にする
      if (!Array.isArray(parsed)) {
        parsed = [parsed];
      }

      this.simulationResults.set(parsed);
      this.updateDropListIds(); // ドラッグ＆ドロップを機能させるための初期化

      this.simulationSummary.set({
        totalCompanyRevenue: history.totalCompanyRevenue || history.totalRevenue || 0,
        totalCompanyCost: history.totalCompanyCost || history.totalCost || 0,
        totalCompanyProfit: history.totalCompanyProfit || history.totalProfit || 0
      });

      this.activeTab.set('simulation');
      this.viewingHistoryDetail = true; // 履歴詳細表示モード有効化
    } catch (e) {
      console.error('History parse error:', e);
      alert('履歴データの読み込みに失敗しました。データ形式が不正です。');
    }
  }

  closeHistoryDetail() {
    this.viewingHistoryDetail = false;
    this.simulationResults.set(null);
    this.simulationSummary.set(null);
  }

  resetSimulation() {
    // 履歴を見ている状態から戻る場合は、ホームタブへジャンプする
    if (this.viewingHistoryDetail) {
      this.activeTab.set('dashboard');
    }

    // 画面の表示データをクリア
    this.simulationResults.set(null);
    this.simulationSummary.set(null);
    this.viewingHistoryDetail = false;
  }

  updateBaseline() {
    if (this.simulationSummary()) {
      // 既にシミュレーション結果が出ている場合のみ、それを次回の比較元にする
      this.currentBaseline = {
        revenue: this.simulationSummary().totalCompanyRevenue,
        cost: this.simulationSummary().totalCompanyCost,
        profit: this.simulationSummary().totalCompanyProfit
      };
    } else {
      // 初回実行時は比較しない（差分表示なし）
      this.currentBaseline = null;
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
    this.showNotificationMenu = false;
    this.router.navigate(['/admin/consultations']);
  }

  openNotificationReservations() {
    this.activeTab.set('hr-management');
    this.showNotificationMenu = false;
    this.showReservationCalendar = true;
  }

  getDepartmentSkillAverages(deptInput: any): any {
    const deptName = typeof deptInput === 'string' ? String(deptInput).trim() : String(deptInput?.name || '').trim();
    const matchedDept = this.departments().find(d => String(d.name).trim() === deptName);
    const deptId = matchedDept ? String(matchedDept.id) : '';

    let targetEmployees: any[] = [];
    let currentData: any = null;

    // 1. 現在のシミュレーション結果を最優先で使用
    if (this.simulationResults()) {
      currentData = this.simulationResults();
    }
    // 2. シミュレーション履歴を次優先で使用
    else if (this.dashboard()?.simulationHistory?.length > 0) {
      const latestHistory = this.dashboard().simulationHistory[0];
      try {
        const historyResults = latestHistory.results || latestHistory.data || latestHistory.details;
        currentData = typeof historyResults === 'string' ? JSON.parse(historyResults) : historyResults;
      } catch (e) {
        console.warn('Failed to parse simulation history results:', e);
        currentData = null;
      }
    }

    // シミュレーションデータから抽出
    if (currentData) {
      const resultsArray = Array.isArray(currentData) ? currentData : (Array.isArray(currentData.results) ? currentData.results : [currentData]);
      const deptResult = resultsArray.find((r: any) => {
        const rId = String(r.departmentId || r.department?.id || '').trim();
        const rName = String(r.departmentName || r.department?.name || '').trim();
        if (deptId && rId === deptId) return true;
        if (deptName && rName) {
          const nameMatch = rName === deptName || rName.includes(deptName) || deptName.includes(rName);
          const partialMatch = rName.replace(/部|課|室|グループ|チーム/g, '') === deptName.replace(/部|課|室|グループ|チーム/g, '');
          return nameMatch || partialMatch;
        }
        return false;
      });
      if (deptResult && Array.isArray(deptResult.candidates)) {
        targetEmployees = deptResult.candidates;
      }
    }

    if (targetEmployees.length === 0) {
      return { salesForce: 0, managementForce: 0, explorationForce: 0, developmentForce: 0, employeeCount: 0, averageSkill: 0, maxSkill: 0 };
    }

    const extractScore = (obj: any, keys: string[]): number => {
      if (!obj) return 0;
      let maxScore = 0;
      for (const key of keys) {
        const val = Number(obj[key]);
        if (!isNaN(val) && val > maxScore) maxScore = val;
      }
      for (const val of Object.values(obj)) {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          for (const key of keys) {
            const nVal = Number((val as any)[key]);
            if (!isNaN(nVal) && nVal > maxScore) maxScore = nVal;
          }
        }
      }
      return maxScore;
    };

    const sum = targetEmployees.reduce((acc: any, emp: any) => {
      let parsedSkills: any = {};
      if (typeof emp.skills === 'string') {
        try { parsedSkills = JSON.parse(emp.skills); } catch (e) {}
      } else if (emp.skills && typeof emp.skills === 'object') {
        parsedSkills = emp.skills;
      }

      const s = Math.max(extractScore(emp, ['salesForce', 'salesforce', 'sales', '営業力']), extractScore(parsedSkills, ['salesForce', 'salesforce', 'sales', '営業力']));
      const m = Math.max(extractScore(emp, ['managementForce', 'managementforce', 'management', '管理力']), extractScore(parsedSkills, ['managementForce', 'managementforce', 'management', '管理力']));
      const e = Math.max(extractScore(emp, ['explorationForce', 'explorationforce', 'exploration', '開拓力']), extractScore(parsedSkills, ['explorationForce', 'explorationforce', 'exploration', '開拓力']));
      const d = Math.max(extractScore(emp, ['developmentForce', 'developmentforce', 'development', '育成力']), extractScore(parsedSkills, ['developmentForce', 'developmentforce', 'development', '育成力']));

      return {
        salesForce: acc.salesForce + s,
        managementForce: acc.managementForce + m,
        explorationForce: acc.explorationForce + e,
        developmentForce: acc.developmentForce + d
      };
    }, { salesForce: 0, managementForce: 0, explorationForce: 0, developmentForce: 0 });

    const count = targetEmployees.length;
    const averages = {
      salesForce: Math.round(sum.salesForce / count),
      managementForce: Math.round(sum.managementForce / count),
      explorationForce: Math.round(sum.explorationForce / count),
      developmentForce: Math.round(sum.developmentForce / count)
    };

    const maxSkill = Math.max(averages.salesForce, averages.managementForce, averages.explorationForce, averages.developmentForce);
    const averageSkill = Math.round((averages.salesForce + averages.managementForce + averages.explorationForce + averages.developmentForce) / 4);

    return { ...averages, employeeCount: count, averageSkill, maxSkill };
  }


  getSkillGapData(dept: any): any {
    const averages = this.getDepartmentSkillAverages(dept.name);

    let wS = Number(dept.weightSales) || 0;
    let wM = Number(dept.weightManagement) || 0;
    let wE = Number(dept.weightExploration) || 0;
    let wD = Number(dept.weightDevelopment) || 0;

    // 全て0の場合は均等とみなす
    if (wS + wM + wE + wD === 0) {
      wS = wM = wE = wD = 1;
    }
    const totalWeight = wS + wM + wE + wD;

    const ideal = {
      salesForce: Math.round((wS / totalWeight) * 100),
      managementForce: Math.round((wM / totalWeight) * 100),
      explorationForce: Math.round((wE / totalWeight) * 100),
      developmentForce: Math.round((wD / totalWeight) * 100)
    };

    const aS = averages.salesForce || 0;
    const aM = averages.managementForce || 0;
    const aE = averages.explorationForce || 0;
    const aD = averages.developmentForce || 0;
    const totalActual = aS + aM + aE + aD;

    const actual = {
      salesForce: totalActual > 0 ? Math.round((aS / totalActual) * 100) : 0,
      managementForce: totalActual > 0 ? Math.round((aM / totalActual) * 100) : 0,
      explorationForce: totalActual > 0 ? Math.round((aE / totalActual) * 100) : 0,
      developmentForce: totalActual > 0 ? Math.round((aD / totalActual) * 100) : 0
    };

    return { ideal, actual, employeeCount: averages.employeeCount };
  }

  generateOptimalCandidates(count: number) {
    const mode = this.simulationMode;
    const newCandidates = [];
    for (let i = 0; i < count; i++) {
      // モード（経営戦略）に合わせて、システムが最適なベース値を算出
      let s = 70, m = 70, e = 70, d = 70, c = 8.0;
      if (mode === 'balanced') { s = 85; m = 85; e = 85; d = 85; c = 10.0; }
      else if (mode === 'management_focus') { s = 90; m = 90; e = 30; d = 30; c = 9.0; }
      else if (mode === 'sales_focus') { s = 95; m = 40; e = 85; d = 20; c = 10.0; }
      else if (mode === 'tech_focus') { s = 40; m = 50; e = 95; d = 90; c = 9.5; }

      // 完全に同じ数値にならないよう、±5の揺らぎ（乱数）を持たせる
      const randomize = (val: number) => Math.min(100, Math.max(0, val + Math.floor(Math.random() * 11) - 5));

      newCandidates.push({
        employeeId: `NEW_${Date.now()}_${i}`,
        employeeNumber: `NEW${String(Date.now() + i).slice(-4)}`,
        employeeName: `新規採用候補${i + 1}`,
        salesForce: randomize(s),
        managementForce: randomize(m),
        explorationForce: randomize(e),
        developmentForce: randomize(d),
        laborCost: c,
        isNew: true,
        tags: [],
        desiredDept: '',
        workLifeBalance: ''
      });
    }
    return newCandidates;
  }

  generateAndReviewCandidates() {
    if (this.autoHireCount < 1) return;
    this.pendingNewHires = this.generateOptimalCandidates(this.autoHireCount);
    this.hiringSimulationResult = null;
  }

  runAutoHiringSimulation() {
    if (!this.pendingNewHires || this.pendingNewHires.length === 0) return;
    this.isSimulatingHiring = true;

    let baseData: any[] = [];
    const currentResults = this.simulationResults();

    if (currentResults && currentResults.length > 0) {
      baseData = currentResults.flatMap((dept: any) => dept.candidates);
    } else if (this.employees && this.employees().length > 0) {
      baseData = [...this.employees()];
    } else {
      alert('ベースとなる社員データがありません。先に通常シミュレーションを実行してください。');
      this.isSimulatingHiring = false;
      return;
    }

    const combinedData = [...baseData, ...this.pendingNewHires];

    this.apiService.simulateBatchAllocation(combinedData, this.getTotalCompanyRevenue(), this.simulationMode, this.lastSimulationId || undefined).subscribe({
      next: (data: any) => {
        this.isSimulatingHiring = false;
        if (data && data.results) {
          this.hiringSimulationResult = {
            before: {
              revenue: this.getTotalCompanyRevenue(),
              cost: this.getTotalCompanyCost(),
              profit: this.getTotalCompanyProfit()
            },
            after: {
              revenue: data.totalCompanyRevenue,
              cost: data.totalCompanyCost,
              profit: data.totalCompanyProfit
            },
            results: data.results
          };
        }
      },
      error: (err: any) => {
        console.error(err);
        this.isSimulatingHiring = false;
        alert('自動採用シミュレーションに失敗しました。');
      }
    });
  }

  private getTotalCompanyRevenue(): number {
    if (this.simulationSummary()?.totalCompanyRevenue) {
      return this.simulationSummary().totalCompanyRevenue;
    }
    if (Array.isArray(this.simulationResults())) {
      return this.simulationResults().reduce((sum: number, r: any) => sum + (r.finalRevenue || 0), 0);
    }
    return 0;
  }

  private getTotalCompanyCost(): number {
    if (this.simulationSummary()?.totalCompanyCost) {
      return this.simulationSummary().totalCompanyCost;
    }
    if (Array.isArray(this.simulationResults())) {
      return this.simulationResults().reduce((sum: number, r: any) => sum + (r.cost || r.totalCost || 0), 0);
    }
    return 0;
  }

  private getTotalCompanyProfit(): number {
    if (this.simulationSummary()?.totalCompanyProfit) {
      return this.simulationSummary().totalCompanyProfit;
    }
    return this.getTotalCompanyRevenue() - this.getTotalCompanyCost();
  }

  applyHiringSimulationResult() {
    if (!this.hiringSimulationResult) return;
    const res = this.hiringSimulationResult.results;
    const enrichedResults = this.enrichWithMyPageData(res);
    const sortedResults = this.sortResultsByEmployeeNumber(
      enrichedResults.map((r: any) => ({
        ...r,
        candidates: (r.candidates || []).sort((a: any, b: any) => {
          return String(a.employeeNumber || '').localeCompare(String(b.employeeNumber || ''));
        })
      }))
    );

    this.simulationResults.set(sortedResults);
    this.simulationSummary.set({
      totalCompanyRevenue: this.hiringSimulationResult.after.revenue,
      totalCompanyCost: this.hiringSimulationResult.after.cost,
      totalCompanyProfit: this.hiringSimulationResult.after.profit
    });
    this.updateDropListIds();

    alert('新しい配置案を反映しました！「新規採用候補」がどの部署に最適配置されたか確認できます。');
    this.hiringSimulationResult = null;
    this.pendingNewHires = null;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getStrategyBonus(): { sales: number; management: number; exploration: number; development: number } {
    switch (this.simulationMode) {
      case 'sales_focus':
        return { sales: 15, management: -10, exploration: 15, development: -10 };
      case 'management_focus':
        return { sales: -10, management: 20, exploration: -10, development: -5 };
      case 'tech_focus':
        return { sales: -5, management: -5, exploration: 15, development: 15 };
      case 'balanced':
      default:
        return { sales: 5, management: 5, exploration: 5, development: 5 };
    }
  }

  private getPreferredSpecializationTypes(): string[] {
    switch (this.simulationMode) {
      case 'sales_focus':
        return ['sales', 'exploration'];
      case 'management_focus':
        return ['management'];
      case 'tech_focus':
        return ['exploration', 'development'];
      case 'balanced':
      default:
        return [];
    }
  }

  private generateNewGradCandidates(count: number): any[] {
    const candidates = [];
    const strategyBonus = this.getStrategyBonus();
    for (let i = 0; i < count; i++) {
      const baseForce = this.randomInt(10, 30);
      const randomize = (val: number, bonus: number) => Math.min(100, Math.max(0, val + this.randomInt(-5, 5) + bonus));

      candidates.push({
        employeeId: `NEW_GRAD_${Date.now()}_${i}`,
        employeeNumber: `GRAD${String(Date.now() + i).slice(-4)}`,
        employeeName: `新卒採用候補${i + 1}`,
        salesForce: randomize(baseForce, strategyBonus.sales),
        managementForce: randomize(baseForce, strategyBonus.management),
        explorationForce: randomize(baseForce, strategyBonus.exploration),
        developmentForce: randomize(baseForce, strategyBonus.development),
        laborCost: Number((Math.random() * (3.0 - 2.0) + 2.0).toFixed(1)),
        isNew: true,
        tags: ['新卒'],
        desiredDept: '',
        workLifeBalance: ''
      });
    }
    return candidates;
  }

  private generateMidCareerCandidates(count: number): any[] {
    const candidates = [];
    const allTypes = ['sales', 'management', 'exploration', 'development'];
    const strategyBonus = this.getStrategyBonus();
    const preferredTypes = this.getPreferredSpecializationTypes();

    for (let i = 0; i < count; i++) {
      let specializedType: string;
      if (preferredTypes.length > 0 && Math.random() < 0.7) {
        specializedType = preferredTypes[this.randomInt(0, preferredTypes.length - 1)];
      } else {
        specializedType = allTypes[this.randomInt(0, allTypes.length - 1)];
      }
      const highForce = this.randomInt(60, 80);
      const lowForce = this.randomInt(20, 40);

      const forces = {
        salesForce: specializedType === 'sales' ? highForce : lowForce,
        managementForce: specializedType === 'management' ? highForce : lowForce,
        explorationForce: specializedType === 'exploration' ? highForce : lowForce,
        developmentForce: specializedType === 'development' ? highForce : lowForce
      };

      const randomize = (val: number, bonus: number) => Math.min(100, Math.max(0, val + this.randomInt(-3, 3) + bonus));

      candidates.push({
        employeeId: `NEW_MID_${Date.now()}_${i}`,
        employeeNumber: `MID${String(Date.now() + i).slice(-4)}`,
        employeeName: `中途採用候補${i + 1}`,
        salesForce: randomize(forces.salesForce, strategyBonus.sales),
        managementForce: randomize(forces.managementForce, strategyBonus.management),
        explorationForce: randomize(forces.explorationForce, strategyBonus.exploration),
        developmentForce: randomize(forces.developmentForce, strategyBonus.development),
        laborCost: Number((Math.random() * (7.0 - 5.0) + 5.0).toFixed(1)),
        isNew: true,
        tags: ['中途'],
        desiredDept: '',
        workLifeBalance: ''
      });
    }
    return candidates;
  }

  private generateExecutiveCandidates(count: number): any[] {
    const candidates = [];
    const strategyBonus = this.getStrategyBonus();
    for (let i = 0; i < count; i++) {
      const highForce = this.randomInt(70, 90);
      const managementForce = this.randomInt(80, 95);
      const randomize = (val: number, bonus: number) => Math.min(100, Math.max(0, val + this.randomInt(-2, 2) + bonus));

      candidates.push({
        employeeId: `NEW_EXEC_${Date.now()}_${i}`,
        employeeNumber: `EXEC${String(Date.now() + i).slice(-4)}`,
        employeeName: `幹部候補${i + 1}`,
        salesForce: randomize(highForce, strategyBonus.sales),
        managementForce: randomize(managementForce, strategyBonus.management),
        explorationForce: randomize(highForce, strategyBonus.exploration),
        developmentForce: randomize(highForce, strategyBonus.development),
        laborCost: Number((Math.random() * (10.0 - 8.0) + 8.0).toFixed(1)),
        isNew: true,
        tags: ['幹部候補'],
        desiredDept: '',
        workLifeBalance: ''
      });
    }
    return candidates;
  }

  generateCandidatesByPersona() {
    if (this.currentUserRole !== 'ADMIN' && this.executiveCandidateCount > 0) {
      this.executiveCandidateCount = 0;
    }

    if (this.newGradCount === 0 && this.midCareerCount === 0 && this.executiveCandidateCount === 0) {
      alert('最低でも1つのペルソナで1名以上を指定してください');
      return;
    }

    const generatedCandidates = [
      ...this.generateNewGradCandidates(this.newGradCount),
      ...this.generateMidCareerCandidates(this.midCareerCount),
      ...this.generateExecutiveCandidates(this.executiveCandidateCount)
    ];

    // newCandidatesに直接セット
    this.newCandidates = [...this.newCandidates, ...generatedCandidates];

    alert(`合計 ${generatedCandidates.length} 名の採用候補データを生成しました。\n新卒: ${this.newGradCount}名、中途: ${this.midCareerCount}名、幹部候補: ${this.executiveCandidateCount}名\n\nプレビューで内容を確認・修正したら、画面上部の「シミュレーション実行」ボタンでシミュレーションを実行してください。`);

    this.newGradCount = 0;
    this.midCareerCount = 0;
    this.executiveCandidateCount = 0;
  }

  private generateTsvFromCandidates(candidates: any[]): string {
    const header = '社員番号\t営業力\t管理力\t開拓力\t育成力\t人件費';
    const rows = candidates.map(c =>
      `${c.employeeNumber}\t${c.salesForce}\t${c.managementForce}\t${c.explorationForce}\t${c.developmentForce}\t${c.laborCost}`
    );
    return [header, ...rows].join('\n');
  }

  private getCurrentUserName(): string {
    try {
      const userStr = localStorage.getItem('currentUser');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.name || user.email || 'システム';
      }
    } catch (e) {
      console.error('Error getting current user name:', e);
    }
    return 'システム';
  }

  getInitials(name: string): string {
    if (!name) return '-';
    const parts = name.split(' ').filter(p => p);
    return parts.map(p => p.charAt(0).toUpperCase()).join('').slice(0, 2);
  }

  getInitialColor(name: string): string {
    if (!name) return '#999';
    const colors = ['#667eea', '#764ba2', '#f39c12', '#27ae60', '#3498db', '#e74c3c'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  runSimulation() {
    if (!this.newCandidates || this.newCandidates.length === 0) {
      alert('シミュレーション対象の採用候補者がいません');
      return;
    }

    // 初回実行時はベースラインを設定
    if (!this.currentBaseline) {
      this.updateBaseline();
    }

    this.loading.set(true);

    let baseEmployees = [];
    if (this.simulationResults() && Array.isArray(this.simulationResults())) {
      baseEmployees = this.simulationResults().flatMap((dept: any) => dept.candidates);
    } else {
      baseEmployees = this.employees().filter((emp: any) => emp.user?.role !== 'ADMIN');
    }
    const employeesWithNewCandidates = [...baseEmployees, ...this.newCandidates];

    const payload = {
      departmentIds: this.selectedDepartments().length > 0 ? this.selectedDepartments() : this.departments().map(d => d.id),
      employees: employeesWithNewCandidates,
      lastYearTotalRevenue: this.lastYearTotalRevenue,
      simulationMode: this.simulationMode
    };

    this.apiService.simulateBatchAllocation(
      payload,
      this.lastYearTotalRevenue,
      this.simulationMode
    ).subscribe({
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
        this.newCandidates = [];
      },
      error: (error: any) => {
        this.error.set(error.error?.error || 'シミュレーション実行に失敗しました');
        this.loading.set(false);
      }
    });
  }

}