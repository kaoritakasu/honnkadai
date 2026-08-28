import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-employee-mypage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-mypage.component.html',
  styleUrl: './employee-mypage.component.scss'
})
export class EmployeeMyPageComponent implements OnInit {
  private toLocalDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  profile = signal<any>(null);
  allocations = signal<any[]>([]);
  consultations = signal<any[]>([]);
  activeTab = signal('profile');
  editing = signal(false);
  loading = signal(false);
  error = signal('');
  success = signal('');

  // Form data
  score = signal(0);
  desiredDept = signal('');
  skills = signal<string[]>([]);
  careerGoals = signal('');
  skillInput = signal('');

  // Consultation form
  consultationTitle = signal('');
  consultationDescription = signal('');
  showConsultationForm = signal(false);
  // カレンダー・面談予約用
  availabilityRules = signal<any[]>([]);
  myReservations = signal<any[]>([]);
  calendarDays = signal<any[]>([]);
  currentMonth = signal(new Date());
  selectedDate = signal<Date | null>(null);
  reservationTimeSlot = signal('');
  reservationReason = signal('');
  showReservationModal = signal(false);

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadProfile();
    this.loadAllocations();
    this.loadConsultations();
  }

  loadProfile() {
    this.apiService.getMyProfile().subscribe({
      next: (data) => {
        this.profile.set(data);
        this.score.set(data.score || 0);
        this.desiredDept.set(data.desiredDept || '');
        this.skills.set(data.skills || []);
        this.careerGoals.set(data.careerGoals || '');
      },
      error: (error) => this.error.set(error.error?.error || 'Failed to load profile')
    });
  }

  loadAllocations() {
    this.apiService.getMyAllocations().subscribe({
      next: (data) => this.allocations.set(data),
      error: (error) => this.error.set(error.error?.error || 'Failed to load allocations')
    });
  }

  loadConsultations() {
    this.apiService.getMyConsultations().subscribe({
      next: (data) => this.consultations.set(data),
      error: (error) => this.error.set(error.error?.error || 'Failed to load consultations')
    });
  }

  saveProfile() {
    this.loading.set(true);
    this.apiService.updateMyProfile({
      score: this.score(),
      desiredDept: this.desiredDept(),
      skills: this.skills(),
      careerGoals: this.careerGoals()
    }).subscribe({
      next: () => {
        this.success.set('Profile updated successfully');
        this.editing.set(false);
        this.loading.set(false);
        this.loadProfile();
        setTimeout(() => this.success.set(''), 3000);
      },
      error: (error) => {
        this.error.set(error.error?.error || 'Failed to update profile');
        this.loading.set(false);
      }
    });
  }

  addSkill() {
    if (this.skillInput().trim()) {
      const newSkills = [...this.skills(), this.skillInput().trim()];
      this.skills.set(newSkills);
      this.skillInput.set('');
    }
  }

  removeSkill(skill: string) {
    this.skills.set(this.skills().filter(s => s !== skill));
  }

  submitConsultation() {
    if (!this.consultationTitle().trim() || !this.consultationDescription().trim()) {
      this.error.set('Please fill in all fields');
      return;
    }

    this.loading.set(true);
    this.apiService.createConsultation(
      this.consultationTitle(),
      this.consultationDescription()
    ).subscribe({
      next: () => {
        this.success.set('Consultation request submitted');
        this.consultationTitle.set('');
        this.consultationDescription.set('');
        this.showConsultationForm.set(false);
        this.loading.set(false);
        this.loadConsultations();
        setTimeout(() => this.success.set(''), 3000);
      },
      error: (error) => {
        this.error.set(error.error?.error || 'Failed to submit consultation');
        this.loading.set(false);
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
