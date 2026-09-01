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
  profile = signal<any>(null);
  allocations = signal<any[]>([]);
  consultations = signal<any[]>([]);
  activeTab = signal('profile');
  editing = signal(false);
  loading = signal(false);
  error = signal('');
  success = signal('');

  score = signal(0);
  desiredDept = signal('');
  workLifeBalance = signal('');

  consultationTitle = signal('');
  consultationDescription = signal('');
  showConsultationForm = signal(false);

  allocationSkillGapData = signal<any>(null);
  Math = Math;

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
        this.desiredDept.set(data.desiredDept || data.careerDesire || '');
        this.workLifeBalance.set(data.workLifeBalance || '');
      },
      error: (err) => this.error.set(err.error?.error || 'プロフィールの読み込みに失敗しました')
    });
  }

  loadAllocations() {
    this.apiService.getMyAllocations().subscribe({
      next: (data) => {
        this.allocations.set(data);
        this.calculateAllocationSkillGap();
      },
      error: (err) => this.error.set(err.error?.error || '配置情報の読み込みに失敗しました')
    });
  }

  loadConsultations() {
    this.apiService.getMyConsultations().subscribe({
      next: (data) => this.consultations.set(data),
      error: (err) => this.error.set(err.error?.error || '相談履歴の読み込みに失敗しました')
    });
  }

  saveProfile() {
    this.loading.set(true);
    this.apiService.updateMyProfile({
      score: this.score(),
      desiredDept: this.desiredDept(),
      workLifeBalance: this.workLifeBalance()
    }).subscribe({
      next: () => {
        this.success.set('プロフィールを更新しました');
        this.editing.set(false);
        this.loading.set(false);
        this.loadProfile();
        setTimeout(() => this.success.set(''), 3000);
      },
      error: (err) => {
        this.error.set(err.error?.error || '更新に失敗しました');
        this.loading.set(false);
        setTimeout(() => this.error.set(''), 3000);
      }
    });
  }

  submitConsultation() {
    if (!this.consultationTitle().trim() || !this.consultationDescription().trim()) {
      this.error.set('タイトルと内容を入力してください');
      setTimeout(() => this.error.set(''), 3000);
      return;
    }

    this.loading.set(true);
    this.apiService.createConsultation(
      this.consultationTitle(),
      this.consultationDescription()
    ).subscribe({
      next: () => {
        this.success.set('人事相談を送信しました');
        this.consultationTitle.set('');
        this.consultationDescription.set('');
        this.showConsultationForm.set(false);
        this.loading.set(false);
        this.loadConsultations();
        setTimeout(() => this.success.set(''), 3000);
      },
      error: (err) => {
        this.error.set(err.error?.error || '送信に失敗しました');
        this.loading.set(false);
        setTimeout(() => this.error.set(''), 3000);
      }
    });
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  calculateAllocationSkillGap() {
    this.allocationSkillGapData.set(this.getAllocationSkillGapData());
  }

  getAverageGap(gapData: any): number {
    if (!gapData) return 0;
    const gaps = [
      Math.abs(gapData.ideal.salesForce - gapData.actual.salesForce),
      Math.abs(gapData.ideal.managementForce - gapData.actual.managementForce),
      Math.abs(gapData.ideal.explorationForce - gapData.actual.explorationForce),
      Math.abs(gapData.ideal.developmentForce - gapData.actual.developmentForce)
    ];
    return Math.round(gaps.reduce((a: number, b: number) => a + b, 0) / gaps.length);
  }

  getAllocationSkillGapData(): any {
    const allocationsList = this.allocations();
    if (!allocationsList || allocationsList.length === 0) return null;

    const allocation = allocationsList[0];
    const dept = allocation.department;
    if (!dept) return null;

    let wS = Number(dept.weightSales) || 0;
    let wM = Number(dept.weightManagement) || 0;
    let wE = Number(dept.weightExploration) || 0;
    let wD = Number(dept.weightDevelopment) || 0;

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

    const emp = this.profile() || {};
    const empSkills = emp.skills || emp.user?.skills || {};

    let aS = 0, aM = 0, aE = 0, aD = 0;

    if (typeof empSkills === 'string') {
      try {
        const parsed = JSON.parse(empSkills);
        aS = Number(parsed.salesForce) || 0;
        aM = Number(parsed.managementForce) || 0;
        aE = Number(parsed.explorationForce) || 0;
        aD = Number(parsed.developmentForce) || 0;
      } catch (e) {}
    } else if (typeof empSkills === 'object') {
      aS = Number(empSkills.salesForce) || 0;
      aM = Number(empSkills.managementForce) || 0;
      aE = Number(empSkills.explorationForce) || 0;
      aD = Number(empSkills.developmentForce) || 0;
    }

    if (aS === 0 && aM === 0 && aE === 0 && aD === 0) {
      aS = Number(emp.salesForce) || 0;
      aM = Number(emp.managementForce) || 0;
      aE = Number(emp.explorationForce) || 0;
      aD = Number(emp.developmentForce) || 0;
    }

    const totalActual = aS + aM + aE + aD;
    const actual = {
      salesForce: totalActual > 0 ? Math.round((aS / totalActual) * 100) : 0,
      managementForce: totalActual > 0 ? Math.round((aM / totalActual) * 100) : 0,
      explorationForce: totalActual > 0 ? Math.round((aE / totalActual) * 100) : 0,
      developmentForce: totalActual > 0 ? Math.round((aD / totalActual) * 100) : 0
    };

    return { deptName: dept.name, ideal, actual };
  }
}
