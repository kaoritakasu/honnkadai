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

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(u => this.user = u);
    this.loadAssignmentDetails();
    this.loadDepartments();
    this.loadMyAllocations();
    this.loadMyReservations();
    this.loadAvailabilityRules();
    this.generateCalendarDays();
  }

  loadAssignmentDetails() {
    if (this.user?.id) {
      this.apiService.getAssignmentDetails(this.user.id).subscribe(
        (data: any) => {
          this.assignmentDetails = data;
          this.cdr.detectChanges();
        },
        () => {
          this.assignmentDetails = null;
          this.cdr.detectChanges();
        }
      );

      // DBから「希望部署」「WLB」のデータを取得して画面に復元する
      this.apiService.getPreferences(this.user.id).subscribe(
        (data: any) => {
          if (data) {
            this.desiredDept = data.desiredDept || data.careerDesire || data.careerGoals || '';
            this.workLifeBalance = data.workLifeBalance || '';
            this.cdr.detectChanges();
          }
        },
        (err) => console.error('Error loading preferences:', err)
      );
    }
  }

  loadDepartments() {
    this.apiService.getDepartments().subscribe({
      next: (data: any[]) => this.departments = data,
      error: (err) => console.error('部署データの取得に失敗しました', err)
    });
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
      next: (res) => {
        alert('希望条件を更新しました');
        this.isEditing = false;
        this.isSaving = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
        alert('更新に失敗しました');
        this.isSaving = false;
        this.cdr.detectChanges();
      }
    });
  }

  submitConsultation() {
    if (!this.inquiry.trim()) {
      alert('相談内容を入力してください');
      return;
    }

    if (!this.user?.id) {
      alert('ユーザー情報が見つかりません。もう一度ログインしてください');
      return;
    }

    this.isSubmittingConsultation = true;
    this.apiService.submitConsultation(this.user.id, this.inquiry).subscribe({
      next: () => {
        alert('人事へ相談を送信しました');
        this.inquiry = '';
        this.isSubmittingConsultation = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error submitting consultation:', err);
        alert(err.error?.error || '相談の送信に失敗しました');
        this.isSubmittingConsultation = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadMyAllocations() {
    this.apiService.getMyAllocations().subscribe({
      next: (data: any[]) => {
        this.allocations.set(data);
        this.cdr.detectChanges();
      },
      error: (err) => {
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
      error: (err) => {
        console.error('Error loading available slots:', err);
        this.availableSlots = [];
        this.isLoadingSlots = false;
        this.cdr.detectChanges();
      }
    });
  }

  bookReservation() {
    if (!this.selectedDate || !this.selectedTimeSlot) {
      alert('日付と時間枠を選択してください');
      return;
    }
    this.isBookingReservation = true;
    const payload = {
      date: this.selectedDate,
      timeSlot: this.selectedTimeSlot,
      reason: this.interviewReason || null
    };
    this.apiService.createReservation(payload).subscribe({
      next: (data: any) => {
        alert('面談を予約しました');
        this.resetReservationForm();
        this.loadMyReservations();
        this.isBookingReservation = false;
        this.showReservationForm = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error booking reservation:', err);
        alert(err.error?.error || '予約に失敗しました');
        this.isBookingReservation = false;
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
      error: (err) => {
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
        error: (err) => {
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
      error: (err) => {
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
      error: (err) => {
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
      error: (err) => {
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
    this.modalTimeSlot = '';
    this.modalReason = '';
    this.modalAvailableSlots = [];
  }
}