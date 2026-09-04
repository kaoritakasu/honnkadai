import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-reservations-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reservations-list.component.html',
  styleUrl: './reservations-list.component.scss'
})
export class ReservationsListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // --- カレンダー・予約管理用 ---
  currentDate = signal(new Date());
  calendarWeeks = signal<(any | null)[][]>([]);
  allReservations = signal<any[]>([]);
  filterReservationStatus: string = 'all';

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

  // --- 予約詳細モーダル用 ---
  selectedReservationDetail: any = null;
  showReservationDetailModal = false;

  constructor(
    private router: Router,
    private apiService: ApiService
  ) {}

  ngOnInit() {
    this.loadAllReservations();
    this.generateCalendarDays();
    this.loadAvailabilityRules();
    this.loadAvailabilityExceptions();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  // --- カレンダー関連メソッド ---
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

  getMonthYearDisplay(): string {
    const date = this.currentDate();
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
  }

  getReservationsForDate(date: Date): any[] {
    const dateStr = this.toLocalDateString(date);
    return this.allReservations().filter(r => this.toLocalDateString(new Date(r.date)) === dateStr);
  }

  // --- ルール管理メソッド ---
  loadAvailabilityRules() {
    this.apiService.getAvailabilityRules()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
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
    this.apiService.saveAvailabilityRule(this.newRule)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
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
    this.apiService.deleteAvailabilityRule(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadAvailabilityRules(),
        error: () => alert('削除に失敗しました')
      });
  }

  getDayOfWeekLabel(dayOfWeek: number): string {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[dayOfWeek] || '不明';
  }

  // --- 予約関連メソッド ---
  loadAllReservations() {
    this.apiService.getAllReservations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => this.allReservations.set(data),
        error: (err: any) => {
          console.error('Error loading reservations:', err);
          this.allReservations.set([]);
        }
      });
  }

  getFilteredReservations(): any[] {
    let filtered = this.allReservations();
    if (this.filterReservationStatus !== 'all') {
      filtered = filtered.filter(r => r.status === this.filterReservationStatus);
    }
    return filtered.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  openReservationDetail(reservation: any) {
    this.selectedReservationDetail = reservation;
    this.showReservationDetailModal = true;
  }

  closeReservationDetail() {
    this.showReservationDetailModal = false;
    this.selectedReservationDetail = null;
  }

  updateReservationStatus(reservationId: string, status: string) {
    this.apiService.updateReservationStatus(reservationId, status)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
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

  // --- 例外設定メソッド ---
  loadAvailabilityExceptions() {
    this.apiService.getAvailabilityExceptions()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
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

    this.apiService.createAvailabilityException(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
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
    this.apiService.deleteAvailabilityException(exception.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
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
}
