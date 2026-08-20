import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-my-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-page.component.html',
  styleUrl: './my-page.component.scss'
})
export class MyPageComponent implements OnInit {
  user: any = null;
  desiredDept = '';
  workLifeBalance = '';
  inquiry = '';
  assignmentDetails: any = null;
  departments: any[] = [];

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(u => this.user = u);
    this.loadAssignmentDetails();
    this.loadDepartments();
  }

  loadAssignmentDetails() {
    if (this.user?.id) {
      this.apiService.getAssignmentDetails(this.user.id).subscribe(
        (data: any) => this.assignmentDetails = data,
        () => this.assignmentDetails = null
      );
    }
  }

  loadDepartments() {
    this.apiService.getDepartments().subscribe({
      next: (data: any[]) => this.departments = data,
      error: (err) => console.error('部署データの取得に失敗しました', err)
    });
  }

  savePreferences() {
    if (this.user?.id) {
      this.apiService.saveEmployeePreferences(this.user.id, {
        careerDesire: this.desiredDept,
        desiredDept: this.desiredDept,
        workLifeBalance: this.workLifeBalance
      }).subscribe(() => {
        alert('キャリア希望と働き方を保存しました');
      });
    }
  }

  submitConsultation() {
    if (!this.inquiry.trim()) return;
    if (this.user?.id) {
      this.apiService.submitConsultation(this.user.id, this.inquiry).subscribe(() => {
        alert('人事へ相談を送信しました');
        this.inquiry = '';
      });
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
