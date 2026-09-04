import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-my-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-page.component.html',
  styleUrl: './my-page.component.scss'
})
export class MyPageComponent implements OnInit {
  Math = Math;

  private toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  user: any = null;
  desiredDept = '';
  workLifeBalance = '';
  inquiry = '';
  assignmentDetails: any = null;
  departments: any[] = [];
  isEditing: boolean = false;
  isSaving: boolean = false;
  isSubmittingConsultation: boolean = false;
  allocations = signal<any[]>([]);
  skillGapData = signal<any>(null);
  profileData: any = null;
  simulationSkillGapData: any = null;
  desiredDeptData: any = null;

  // Tab and notice reveal
  activeTab = signal<'profile' | 'allocations' | 'consultation'>('profile');
  isNoticeRevealed = false;

  private noticeRevealedKey = 'noticeRevealed';

  // Consultation form
  showConsultationForm = false;
  consultationTitle = '';
  consultationDescription = '';
  success = signal('');
  error = signal('');

  // Reservation form
  reservationReason = '';

  // Interview reservation fields
  selectedDate: string = '';
  selectedTimeSlot: string = '';
  interviewReason: string = '';
  availableSlots: any[] = [];
  myReservations: any[] = [];
  isLoadingSlots: boolean = false;
  isBookingReservation: boolean = false;
  showReservationForm: boolean = false;
  showReservationModal: boolean = false;
  modalDate: string = '';
  modalTimeSlot: string = '';
  modalReason: string = '';
  modalAvailableSlots: any[] = [];
  isLoadingModalSlots: boolean = false;

  // Calendar logic
  currentCalendarDate = signal(new Date());
  calendarWeeks = signal<(any | null)[][]>([]);
  availabilityRules = signal<any[]>([]);
  availabilityExceptions = signal<any[]>([]);

  // Consultation history
  myConsultations = signal<any[]>([]);
  consultationFilterStatus: string = 'all';

  // Section toggle states
  showSkillGap: boolean = false;
  showReservation: boolean = false;

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe((u: any) => this.user = u);
    this.loadNoticeRevealedState();
    this.loadAssignmentDetails();
    this.loadDepartments();
    this.loadMyAllocations();
    this.loadMyReservations();
    this.loadAvailabilityRules();
    this.loadAvailabilityExceptions();
    this.loadMyConsultations();
    this.loadSimulationSkillGap();
    this.generateCalendarDays();
  }

  loadAssignmentDetails() {
    if (!this.user) return;
    this.apiService.getMyProfile().subscribe({
      next: (data: any) => {
        this.profileData = data;
        this.desiredDept = data.desiredDept || data.careerDesire || '';
        this.workLifeBalance = data.workLifeBalance || '';
        this.buildSkillGapData();
      },
      error: (err: any) => {
        console.error('Error loading profile:', err);
      }
    });
  }

  loadDepartments() {
    this.apiService.getDepartments().subscribe({
      next: (data: any[]) => {
        this.departments = data;
        this.buildSkillGapData();
      },
      error: (err: any) => console.error('部署データの取得に失敗しました', err)
    });
  }

  buildSkillGapData() {
    const allocs = this.allocations ? this.allocations() : [];

    if (!allocs || allocs.length === 0 || !this.departments || this.departments.length === 0) {
      this.skillGapData.set(null);
      return;
    }

    const currentAllocation = allocs[0];
    const dept = this.departments.find((d: any) => d.id === currentAllocation.departmentId);
    if (!dept) {
      this.skillGapData.set(null);
      return;
    }

    // 重みから目標値を計算（最高の重みを基準に100点）
    const wS = Number(dept.weightSales) || 0;
    const wM = Number(dept.weightManagement) || 0;
    const wE = Number(dept.weightExploration) || 0;
    const wD = Number(dept.weightDevelopment) || 0;
    const maxWeight = Math.max(wS, wM, wE, wD);

    const ideal = maxWeight > 0 ? {
      salesForce: Math.round((wS / maxWeight) * 100),
      managementForce: Math.round((wM / maxWeight) * 100),
      explorationForce: Math.round((wE / maxWeight) * 100),
      developmentForce: Math.round((wD / maxWeight) * 100)
    } : { salesForce: 0, managementForce: 0, explorationForce: 0, developmentForce: 0 };

    // 現在のスキル値：シミュレーション結果を優先、なければプロフィール
    let actual = { salesForce: 0, managementForce: 0, explorationForce: 0, developmentForce: 0 };

    if (this.simulationSkillGapData && this.simulationSkillGapData.actual) {
      actual = this.simulationSkillGapData.actual;
    } else if (this.profileData) {
      actual = {
        salesForce: Number(this.profileData.salesForce) || 0,
        managementForce: Number(this.profileData.managementForce) || 0,
        explorationForce: Number(this.profileData.explorationForce) || 0,
        developmentForce: Number(this.profileData.developmentForce) || 0
      };
    }

    this.skillGapData.set({
      deptName: dept.name,
      ideal,
      actual
    });
  }

  private getUserSkills(): any {
    if (!this.user) {
      return { salesForce: 0, managementForce: 0, explorationForce: 0, developmentForce: 0 };
    }

    return {
      salesForce: this.user.salesForce || 0,
      managementForce: this.user.managementForce || 0,
      explorationForce: this.user.explorationForce || 0,
      developmentForce: this.user.developmentForce || 0
    };
  }

  toggleEdit() {
    this.isEditing = !this.isEditing;
  }

  savePreferences() {
    if (!this.user?.id) return;
    this.isSaving = true;

    const payload = {
      desiredDept: this.desiredDept,
      workLifeBalance: this.workLifeBalance
    };

    this.apiService.updatePreferences(this.user.id, payload).subscribe({
      next: (res: any) => {
        alert('希望条件を更新しました');
        this.isEditing = false;
        this.isSaving = false;
        this.buildSkillGapData();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error(err);
        alert('更新に失敗しました');
        this.isSaving = false;
        this.cdr.detectChanges();
      }
    });
  }

  submitConsultation() {
    const description = this.consultationDescription || this.inquiry;
    if (!description.trim()) {
      alert('相談内容を入力してください');
      return;
    }

    if (!this.user?.id) {
      alert('ユーザー情報が見つかりません。もう一度ログインしてください');
      console.error('[MyPage] User ID missing:', this.user);
      return;
    }

    console.log('[MyPage] Submitting consultation:', {
      userId: this.user.id,
      descriptionLength: description.length,
      timestamp: new Date().toISOString(),
      apiUrl: this.apiService.getConfiguredApiUrl()
    });

    this.isSubmittingConsultation = true;
    this.apiService.submitConsultation(this.user.id, description).subscribe({
      next: () => {
        console.log('[MyPage] Consultation submitted successfully');
        this.success.set('人事へ相談を送信しました');
        this.consultationTitle = '';
        this.consultationDescription = '';
        this.inquiry = '';
        this.showConsultationForm = false;
        this.isSubmittingConsultation = false;
        setTimeout(() => this.success.set(''), 3000);
        this.loadMyConsultations();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('[MyPage] Consultation submission failed:', {
          status: err.status,
          statusText: err.statusText,
          message: err.message,
          errorDetail: err.error
        });
        this.error.set(err.error?.error || '相談の送信に失敗しました');
        this.isSubmittingConsultation = false;
        setTimeout(() => this.error.set(''), 3000);
        this.cdr.detectChanges();
      }
    });
  }

  loadMyAllocations() {
    this.apiService.getMyAllocations().subscribe({
      next: (data: any[]) => {
        this.allocations.set(data);
        this.buildSkillGapData();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading allocations:', err);
        this.allocations.set([]);
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  loadAvailableSlots() {
    if (!this.selectedDate) return;
    this.isLoadingSlots = true;
    this.apiService.getAvailableSlots(this.selectedDate).subscribe({
      next: (data: any[]) => {
        this.availableSlots = data;
        this.selectedTimeSlot = '';
        this.isLoadingSlots = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading available slots:', err);
        this.availableSlots = [];
        this.isLoadingSlots = false;
        this.cdr.detectChanges();
      }
    });
  }

  bookReservation() {
    if (!this.modalDate || !this.selectedTimeSlot) {
      alert('日付と時間枠を選択してください');
      return;
    }
    this.isBookingReservation = true;
    const payload = {
      date: this.modalDate,
      timeSlot: this.selectedTimeSlot,
      reason: this.reservationReason || null
    };
    this.apiService.createReservation(payload).subscribe({
      next: (data: any) => {
        this.success.set('面談を予約しました');
        this.closeReservationModal();
        this.loadMyReservations();
        this.generateCalendarDays();
        this.isBookingReservation = false;
        setTimeout(() => this.success.set(''), 3000);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error booking reservation:', err);
        this.error.set(err.error?.error || '予約に失敗しました');
        this.isBookingReservation = false;
        setTimeout(() => this.error.set(''), 3000);
        this.cdr.detectChanges();
      }
    });
  }

  loadMyReservations() {
    this.apiService.getMyReservations().subscribe({
      next: (data: any[]) => {
        this.myReservations = data;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading reservations:', err);
        this.myReservations = [];
      }
    });
  }

  cancelReservation(reservationId: string) {
    if (confirm('この予約をキャンセルしてもよろしいですか？')) {
      this.apiService.cancelReservation(reservationId).subscribe({
        next: () => {
          alert('予約をキャンセルしました');
          this.loadMyReservations();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          console.error('Error canceling reservation:', err);
          alert('キャンセルに失敗しました');
        }
      });
    }
  }

  resetReservationForm() {
    this.selectedDate = '';
    this.selectedTimeSlot = '';
    this.interviewReason = '';
    this.availableSlots = [];
  }

  getMinDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.toLocalDateString(tomorrow);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  generateCalendarDays() {
    const year = this.currentCalendarDate().getFullYear();
    const month = this.currentCalendarDate().getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const weeks: (any | null)[][] = [];
    let currentDate = new Date(startDate);

    for (let week = 0; week < 6; week++) {
      if (week > 0 && currentDate.getMonth() !== month) {
        break;
      }
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
    const date = new Date(this.currentCalendarDate());
    date.setMonth(date.getMonth() - 1);
    this.currentCalendarDate.set(date);
    this.generateCalendarDays();
  }

  nextMonth() {
    const date = new Date(this.currentCalendarDate());
    date.setMonth(date.getMonth() + 1);
    this.currentCalendarDate.set(date);
    this.generateCalendarDays();
  }

  getMonthYearDisplay(): string {
    const date = this.currentCalendarDate();
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
  }

  hasReservationOnDate(date: Date): boolean {
    const dateStr = this.toLocalDateString(date);
    return this.myReservations.some(r => this.toLocalDateString(new Date(r.date)) === dateStr && r.status !== 'CANCELLED');
  }

  getReservationsForDate(date: Date): any[] {
    const dateStr = this.toLocalDateString(date);
    return this.myReservations.filter(r => this.toLocalDateString(new Date(r.date)) === dateStr && r.status !== 'CANCELLED');
  }

  selectDateFromCalendar(date: Date) {
    this.selectedDate = this.toLocalDateString(date);
    this.loadAvailableSlots();
    this.showReservationForm = true;
  }

  isDateDisabledForSelection(date: Date): boolean {
    const dateStr = this.toLocalDateString(date);
    const today = this.toLocalDateString(new Date());
    if (dateStr < today) return true;

    // Check for unavailable exception
    const exception = this.getExceptionForDate(date);
    if (exception && exception.type === 'UNAVAILABLE') return true;

    // Check if the day of week has availability rules
    const dayOfWeek = date.getDay();
    const hasRule = this.availabilityRules().some(r => r.dayOfWeek === dayOfWeek);
    return !hasRule;
  }

  loadAvailabilityRules() {
    this.apiService.getAvailabilityRules().subscribe({
      next: (data: any[]) => {
        this.availabilityRules.set(data);
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading availability rules:', err);
        this.availabilityRules.set([]);
      }
    });
  }

  openReservationModal(date: Date) {
    const dateStr = this.toLocalDateString(date);
    const today = this.toLocalDateString(new Date());

    if (dateStr < today) {
      return;
    }

    this.modalDate = dateStr;
    this.modalTimeSlot = '';
    this.modalReason = '';
    this.modalAvailableSlots = [];
    this.showReservationModal = true;
    this.loadModalAvailableSlots();
  }

  loadModalAvailableSlots() {
    if (!this.modalDate) return;
    this.isLoadingModalSlots = true;
    this.apiService.getAvailableSlots(this.modalDate).subscribe({
      next: (data: any[]) => {
        this.modalAvailableSlots = data;
        this.isLoadingModalSlots = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading available slots:', err);
        this.modalAvailableSlots = [];
        this.isLoadingModalSlots = false;
        this.cdr.detectChanges();
      }
    });
  }

  submitReservation() {
    if (!this.modalDate || !this.modalTimeSlot) {
      alert('日付と時間枠を選択してください');
      return;
    }

    this.isBookingReservation = true;
    const payload = {
      date: this.modalDate,
      timeSlot: this.modalTimeSlot,
      reason: this.modalReason || null
    };

    this.apiService.createReservation(payload).subscribe({
      next: () => {
        alert('面談を予約しました');
        this.closeReservationModal();
        this.loadMyReservations();
        this.generateCalendarDays();
        this.isBookingReservation = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error booking reservation:', err);
        alert(err.error?.error || '予約に失敗しました');
        this.isBookingReservation = false;
        this.cdr.detectChanges();
      }
    });
  }

  closeReservationModal() {
    this.showReservationModal = false;
    this.modalDate = '';
    this.selectedTimeSlot = '';
    this.reservationReason = '';
    this.modalAvailableSlots = [];
  }

  loadMyConsultations() {
    this.apiService.getMyConsultations().subscribe({
      next: (data: any[]) => {
        this.myConsultations.set(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error loading consultations:', err);
        this.myConsultations.set([]);
      }
    });
  }

  getFilteredConsultations(): any[] {
    const consultations = this.myConsultations();
    if (this.consultationFilterStatus === 'all') {
      return consultations;
    }
    return consultations.filter(c => c.status === this.consultationFilterStatus);
  }

  formatConsultationStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
      'pending': '未返信',
      'replied': '返信済み'
    };
    return statusMap[status?.toLowerCase()] || status || '不明';
  }

  toggleSkillGap() {
    this.showSkillGap = !this.showSkillGap;
  }

  toggleReservation() {
    this.showReservation = !this.showReservation;
  }

  loadAvailabilityExceptions() {
    this.apiService.getAvailabilityExceptions().subscribe({
      next: (data: any[]) => {
        this.availabilityExceptions.set(data);
        this.cdr.detectChanges();
      },
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

  loadSimulationSkillGap() {
    this.apiService.getMyLatestSimulation().subscribe({
      next: (data) => {
        this.simulationSkillGapData = this.calculateSimulationSkillGap(data);
        this.buildSkillGapData();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.log('No simulation history available');
        this.simulationSkillGapData = null;
      }
    });
  }

  revealNotice() {
    if (confirm('次期異動の内示内容を確認しますか？\n※確認後、必ず人事との面談予約を行ってください。')) {
      this.isNoticeRevealed = true;
      this.saveNoticeRevealedState();
    }
  }

  private loadNoticeRevealedState() {
    const saved = localStorage.getItem(this.noticeRevealedKey);
    this.isNoticeRevealed = saved === 'true';
  }

  private saveNoticeRevealedState() {
    localStorage.setItem(this.noticeRevealedKey, String(this.isNoticeRevealed));
  }

  goToReservation() {
    this.activeTab.set('consultation');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updatePreferences() {
    this.savePreferences();
  }

  isDateUnavailable(date: Date | null): boolean {
    if (!date) return true;
    return this.isDateDisabledForSelection(date);
  }

  calculateSimulationSkillGap(simulationResult: any): any {
    if (!simulationResult || !simulationResult.employeeData) return null;

    const empData = simulationResult.employeeData;
    const deptName = empData.department?.name || '';

    const actual = {
      salesForce: Number(empData.salesForce) || 0,
      managementForce: Number(empData.managementForce) || 0,
      explorationForce: Number(empData.explorationForce) || 0,
      developmentForce: Number(empData.developmentForce) || 0
    };

    const dept = empData.department || {};
    const wS = Number(dept.weightSales) || 0;
    const wM = Number(dept.weightManagement) || 0;
    const wE = Number(dept.weightExploration) || 0;
    const wD = Number(dept.weightDevelopment) || 0;
    const maxWeight = Math.max(wS, wM, wE, wD);

    const ideal = maxWeight > 0 ? {
      salesForce: Math.round((wS / maxWeight) * 100),
      managementForce: Math.round((wM / maxWeight) * 100),
      explorationForce: Math.round((wE / maxWeight) * 100),
      developmentForce: Math.round((wD / maxWeight) * 100)
    } : { salesForce: 0, managementForce: 0, explorationForce: 0, developmentForce: 0 };

    return {
      deptName: deptName,
      ideal: ideal,
      actual: actual,
      isFromSimulation: true,
      simulationDate: simulationResult.createdAt
    };
  }

  getAverageGap(gapData: any): number {
    if (!gapData || !gapData.ideal) return 0;
    const gaps = [
      Math.abs(gapData.ideal.salesForce - gapData.actual.salesForce),
      Math.abs(gapData.ideal.managementForce - gapData.actual.managementForce),
      Math.abs(gapData.ideal.explorationForce - gapData.actual.explorationForce),
      Math.abs(gapData.ideal.developmentForce - gapData.actual.developmentForce)
    ];
    return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  getComprehensiveAchievementRate(gapData: any): number {
    if (!gapData || !gapData.ideal || !gapData.actual) return 0;
    const idealTotal = gapData.ideal.salesForce + gapData.ideal.managementForce +
                      gapData.ideal.explorationForce + gapData.ideal.developmentForce;
    const cappedActualTotal =
      Math.min(gapData.actual.salesForce, gapData.ideal.salesForce) +
      Math.min(gapData.actual.managementForce, gapData.ideal.managementForce) +
      Math.min(gapData.actual.explorationForce, gapData.ideal.explorationForce) +
      Math.min(gapData.actual.developmentForce, gapData.ideal.developmentForce);
    if (idealTotal === 0) return 0;
    return Math.round((cappedActualTotal / idealTotal) * 100);
  }

  getSkillBarColor(skillName: string, gapData: any): string {
    if (!gapData || !gapData.ideal || !gapData.actual) return '#667eea';
    const actual = gapData.actual[skillName] || 0;
    const ideal = gapData.ideal[skillName] || 0;
    return actual >= ideal ? '#10b981' : '#f97316';
  }

  getSkillBarWidth(skillValue: number): number {
    return Math.min(skillValue, 100);
  }
}